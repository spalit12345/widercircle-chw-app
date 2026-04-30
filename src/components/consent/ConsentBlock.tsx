// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Chip, Divider, Group, Stack, Switch, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Consent } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconCheck, IconLock, IconSignature } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  TELEHEALTH_CHI_CONSENT_CONFIG,
  type ConsentTypeConfig,
  consentMethod,
  evaluateConsentStatus,
  utf8ToBase64,
} from '../../pages/ConsentCapturePage';
import { emitAudit } from '../../utils/audit';

type CaptureMethod = 'esig' | 'verbal';

export interface ConsentBlockProps {
  patientId: string | undefined;
  /** Optional label for the patient — only used in attestation metadata. */
  patientLabel?: string;
  /**
   * Which consent type this block captures. Defaults to telehealth + CHI for
   * backwards-compat with existing call sites (visit workspace, member chart).
   */
  config?: ConsentTypeConfig;
  /**
   * Called once a new Consent record has been written and re-fetched.
   * Parents typically use this to flip a "blocked" → "ready" state.
   */
  onCaptured?: () => void;
  /**
   * When true, the small "Visit start: blocked / unblocked" footer alert
   * is hidden — useful when the parent surface (e.g. VisitWorkspacePage)
   * already shows phase state in its own header. Also hidden automatically
   * for non-telehealth consent types (the visit-start framing doesn't apply).
   */
  hideVisitStartFooter?: boolean;
}

export function ConsentBlock({
  patientId,
  patientLabel,
  config = TELEHEALTH_CHI_CONSENT_CONFIG,
  onCaptured,
  hideVisitStartFooter,
}: ConsentBlockProps): JSX.Element | null {
  const medplum = useMedplum();
  const profile = medplum.getProfile();
  const practitionerRef = profile ? `Practitioner/${profile.id}` : undefined;
  const practitionerLabel = profile
    ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
    : 'Clinician';

  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [method, setMethod] = useState<CaptureMethod>('verbal');
  const [scriptRead, setScriptRead] = useState(false);
  const [esigDate, setEsigDate] = useState<string>('');

  const status = useMemo(() => evaluateConsentStatus(consents), [consents]);

  const loadHistory = useCallback(
    async (id: string) => {
      if (!id) {
        setConsents([]);
        return;
      }
      setLoading(true);
      try {
        const results = await medplum.searchResources(
          'Consent',
          `patient=Patient/${id}&_sort=-_lastUpdated&_count=20`
        );
        setConsents(
          results.filter((c) =>
            c.category?.some((cat) =>
              cat.coding?.some((coding) => coding.code === config.categoryCode)
            )
          )
        );
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, config.categoryCode]
  );

  useEffect(() => {
    setScriptRead(false);
    setEsigDate('');
    if (patientId) {
      loadHistory(patientId).catch(console.error);
    } else {
      setConsents([]);
    }
  }, [patientId, loadHistory]);

  const captureConsent = useCallback(async () => {
    if (!patientId) return;
    if (method === 'verbal' && !scriptRead) return;
    if (method === 'esig' && !esigDate) return;

    setCapturing(true);
    try {
      const now = new Date();
      const signedAt = method === 'esig' ? new Date(esigDate).toISOString() : now.toISOString();

      const consent: Consent = {
        resourceType: 'Consent',
        status: 'active',
        scope: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'https://widercircle.com/fhir/CodeSystem/consent-category',
                code: config.categoryCode,
                display: config.shortLabel,
              },
            ],
          },
        ],
        patient: { reference: `Patient/${patientId}`, display: patientLabel },
        policyRule: {
          coding: [
            {
              system: 'https://widercircle.com/fhir/CodeSystem/consent-policy',
              code: config.categoryCode,
              display: config.policyDisplay,
            },
          ],
        },
        dateTime: signedAt,
        performer: practitionerRef
          ? [{ reference: practitionerRef, display: practitionerLabel }]
          : undefined,
        sourceAttachment:
          method === 'verbal'
            ? {
                contentType: 'text/plain',
                title: `Verbal attestation — ${config.scriptVersion}`,
                data: utf8ToBase64(
                  `Script version: ${config.scriptVersion}\nAttested by: ${practitionerLabel}\nTimestamp: ${signedAt}\nScript:\n${config.scriptText}`
                ),
              }
            : undefined,
        extension: [
          { url: 'https://widercircle.com/fhir/StructureDefinition/consent-method', valueString: method },
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/consent-script-version',
            valueString: config.scriptVersion,
          },
        ],
      };

      const saved = await medplum.createResource<Consent>(consent);
      // CD-05 AC-5 — DA-13 audit emission on every capture, with method + script version.
      void emitAudit(medplum, {
        action: 'consent.captured',
        patientRef: { reference: `Patient/${patientId}`, display: patientLabel },
        consentRef: saved.id ? { reference: `Consent/${saved.id}` } : undefined,
        meta: {
          method,
          scriptVersion: config.scriptVersion,
          category: config.categoryCode,
        },
      });
      showNotification({
        color: 'green',
        message: `Consent captured (${method === 'esig' ? 'e-sig' : 'verbal'})`,
      });
      setScriptRead(false);
      setEsigDate('');
      await loadHistory(patientId);
      onCaptured?.();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setCapturing(false);
    }
  }, [
    patientId,
    patientLabel,
    config,
    method,
    scriptRead,
    esigDate,
    practitionerRef,
    practitionerLabel,
    medplum,
    loadHistory,
    onCaptured,
  ]);

  if (!patientId) {
    return null;
  }

  const canStartVisit = status.state === 'on-file';

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <IconSignature size={18} />
            <Text fw={600}>{config.blockTitle}</Text>
          </Group>
          {loading ? (
            <Badge variant="light">Loading…</Badge>
          ) : status.state === 'on-file' ? (
            <Badge color="green" leftSection={<IconCheck size={12} />} variant="light">
              On file
            </Badge>
          ) : status.state === 'expired' ? (
            <Badge color="red" leftSection={<IconAlertTriangle size={12} />} variant="light">
              Expired
            </Badge>
          ) : (
            <Badge color="red" leftSection={<IconLock size={12} />} variant="light">
              Needed
            </Badge>
          )}
        </Group>

        {status.state === 'on-file' && status.latest && (
          <Alert color="green" variant="light" icon={<IconCheck size={18} />} title="Consent on file">
            <Text size="sm">
              Captured {status.latest.dateTime ? formatDateTime(status.latest.dateTime) : 'unknown'}
              {status.latest.performer?.[0]?.display && <> by {status.latest.performer[0].display}</>}{' '}
              via <span style={{ fontFamily: 'monospace' }}>{consentMethod(status.latest)}</span>.
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              Expires {status.expiresOn ? formatDate(status.expiresOn) : ''} · script version{' '}
              <span style={{ fontFamily: 'monospace' }}>{config.scriptVersion}</span>
            </Text>
          </Alert>
        )}

        {status.state === 'expired' && status.latest?.dateTime && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Consent expired">
            <Text size="sm">
              Last consent was captured {formatDate(status.latest.dateTime)} and has since expired. Capture a new
              one below before starting the visit.
            </Text>
          </Alert>
        )}

        {status.state === 'missing' && (
          <Alert color="red" variant="light" icon={<IconLock size={18} />} title="Consent needed">
            <Text size="sm">{config.missingBody}</Text>
          </Alert>
        )}

        {status.state !== 'on-file' && (
          <Stack gap="sm">
            <Divider label="Capture method" labelPosition="left" />
            <Chip.Group value={method} onChange={(v) => setMethod(v as CaptureMethod)}>
              <Group>
                <Chip value="verbal" color="grape">
                  Capture verbal consent now
                </Chip>
                <Chip value="esig" color="grape">
                  Member signed via portal
                </Chip>
              </Group>
            </Chip.Group>

            {method === 'verbal' && (
              <Card withBorder radius="md" padding="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Verbal attestation script ·{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{config.scriptVersion}</span>
                  </Text>
                  <Text size="sm">{config.scriptText}</Text>
                  <Switch
                    label="I read this script verbatim and the member consented verbally"
                    checked={scriptRead}
                    onChange={(e) => setScriptRead(e.currentTarget.checked)}
                    color="grape"
                  />
                </Stack>
              </Card>
            )}

            {method === 'esig' && (
              <Card withBorder radius="md" padding="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Record existing portal e-signature
                  </Text>
                  <Text size="xs" c="dimmed">
                    Enter the date the member signed the consent in the patient portal. In production this is
                    populated automatically from the portal webhook; this field is the manual-entry fallback for the
                    demo.
                  </Text>
                  <input
                    type="date"
                    value={esigDate}
                    onChange={(e) => setEsigDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--mantine-color-gray-4)',
                      borderRadius: 'var(--mantine-radius-sm)',
                      fontFamily: 'monospace',
                      width: 200,
                    }}
                    aria-label="Portal e-signature date"
                  />
                </Stack>
              </Card>
            )}

            <Group>
              <Button
                color="grape"
                loading={capturing}
                onClick={captureConsent}
                disabled={
                  capturing ||
                  (method === 'verbal' && !scriptRead) ||
                  (method === 'esig' && !esigDate)
                }
              >
                {method === 'verbal' ? 'Confirm & capture verbal consent' : 'Record portal signature'}
              </Button>
              <Text size="xs" c="dimmed">
                Consent records are immutable — revocation creates a separate record.
              </Text>
            </Group>
          </Stack>
        )}

        {!hideVisitStartFooter && config.visitFooterOk && config.visitFooterBlocked && (
          <Alert
            color={canStartVisit ? 'green' : 'red'}
            variant="light"
            icon={canStartVisit ? <IconCheck size={16} /> : <IconLock size={16} />}
            title={canStartVisit ? 'Visit start: unblocked' : 'Visit start: blocked'}
          >
            <Text size="xs">
              {canStartVisit ? config.visitFooterOk : config.visitFooterBlocked}
            </Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

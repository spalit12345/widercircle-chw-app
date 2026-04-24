// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Consent, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconCheck, IconLock, IconSignature } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type CaptureMethod = 'esig' | 'verbal';

export const CONSENT_SCRIPT_VERSION = 'telehealth-chi-v1';
export const CONSENT_SCRIPT_TEXT = `I'm going to confirm your consent for a telehealth visit and for Community Health Integration (CHI) services with Wider Circle. A telehealth visit is a video or phone visit — the same as an in-person visit for privacy, record-keeping, and billing purposes. CHI means a community health worker may contact you by phone, text, or home visit to help coordinate care and social needs. Your care is not contingent on consenting. You can revoke at any time. Do you consent to the telehealth visit and CHI outreach?`;
export const CONSENT_CATEGORY_CODE = 'telehealth-chi';
export const CONSENT_EXPIRATION_MONTHS = 12;

export interface ConsentStatus {
  state: 'on-file' | 'expired' | 'missing';
  latest?: Consent;
  expiresOn?: string;
}

export const evaluateConsentStatus = (consents: Consent[], now: number = Date.now()): ConsentStatus => {
  const active = consents
    .filter((c) => c.status === 'active')
    .sort((a, b) => (b.dateTime ?? '').localeCompare(a.dateTime ?? ''));
  const latest = active[0];
  if (!latest?.dateTime) {
    return { state: 'missing' };
  }
  const signedAt = new Date(latest.dateTime).getTime();
  const expiresAt = signedAt + CONSENT_EXPIRATION_MONTHS * 30 * 24 * 3600 * 1000;
  const expiresOn = new Date(expiresAt).toISOString();
  if (expiresAt < now) {
    return { state: 'expired', latest, expiresOn };
  }
  return { state: 'on-file', latest, expiresOn };
};

export const consentMethod = (consent: Consent | undefined): 'esig' | 'verbal' | 'unknown' => {
  const method = consent?.extension?.find(
    (e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/consent-method'
  )?.valueString;
  if (method === 'esig' || method === 'verbal') {
    return method;
  }
  return 'unknown';
};

export function ConsentCapturePage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();

  const [patients, setPatients] = useState<Array<{ value: string; label: string; planId?: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [method, setMethod] = useState<CaptureMethod>('verbal');
  const [scriptRead, setScriptRead] = useState(false);
  const [esigDate, setEsigDate] = useState<string>('');

  const status = useMemo(() => evaluateConsentStatus(consents), [consents]);
  const practitionerRef = profile ? `Practitioner/${profile.id}` : undefined;
  const practitionerLabel = profile
    ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
    : 'Clinician';

  const loadPatients = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated');
      setPatients(
        results.map((p: Patient) => ({
          value: p.id ?? '',
          label:
            `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum]);

  const loadHistory = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setConsents([]);
        return;
      }
      setLoadingHistory(true);
      try {
        const results = await medplum.searchResources(
          'Consent',
          `patient=Patient/${patientId}&_sort=-_lastUpdated&_count=20`
        );
        // Filter to only telehealth+CHI consents — other categories (TCPA, recording) are out of scope
        setConsents(
          results.filter((c) =>
            c.category?.some((cat) =>
              cat.coding?.some((coding) => coding.code === CONSENT_CATEGORY_CODE)
            )
          )
        );
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoadingHistory(false);
      }
    },
    [medplum]
  );

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    loadHistory(selectedPatient).catch(console.error);
    setScriptRead(false);
    setEsigDate('');
  }, [selectedPatient, loadHistory]);

  const captureConsent = useCallback(async () => {
    if (!selectedPatient) return;
    if (method === 'verbal' && !scriptRead) return;
    if (method === 'esig' && !esigDate) return;

    setCapturing(true);
    try {
      const patientLabel = patients.find((p) => p.value === selectedPatient)?.label ?? '';
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
            coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/consent-category', code: CONSENT_CATEGORY_CODE, display: 'Telehealth + CHI' }],
          },
        ],
        patient: { reference: `Patient/${selectedPatient}`, display: patientLabel },
        dateTime: signedAt,
        performer: practitionerRef
          ? [{ reference: practitionerRef, display: practitionerLabel }]
          : undefined,
        sourceAttachment:
          method === 'verbal'
            ? {
                contentType: 'text/plain',
                title: `Verbal attestation — ${CONSENT_SCRIPT_VERSION}`,
                data: btoa(
                  `Script version: ${CONSENT_SCRIPT_VERSION}\nAttested by: ${practitionerLabel}\nTimestamp: ${signedAt}\nScript:\n${CONSENT_SCRIPT_TEXT}`
                ),
              }
            : undefined,
        extension: [
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/consent-method',
            valueString: method,
          },
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/consent-script-version',
            valueString: CONSENT_SCRIPT_VERSION,
          },
        ],
      };

      await medplum.createResource<Consent>(consent);
      showNotification({ color: 'green', message: `Consent captured (${method === 'esig' ? 'e-sig' : 'verbal'})` });
      setScriptRead(false);
      setEsigDate('');
      await loadHistory(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setCapturing(false);
    }
  }, [selectedPatient, method, scriptRead, esigDate, patients, practitionerRef, practitionerLabel, medplum, loadHistory]);

  const statusBadge = (): JSX.Element => {
    if (!selectedPatient) {
      return <Badge variant="light">No member selected</Badge>;
    }
    if (loadingHistory) {
      return <Badge variant="light">Loading…</Badge>;
    }
    if (status.state === 'on-file') {
      return (
        <Badge color="green" leftSection={<IconCheck size={12} />} variant="light">
          Consent on file
        </Badge>
      );
    }
    if (status.state === 'expired') {
      return (
        <Badge color="red" leftSection={<IconAlertTriangle size={12} />} variant="light">
          Consent expired
        </Badge>
      );
    }
    return (
      <Badge color="red" leftSection={<IconLock size={12} />} variant="light">
        Consent needed
      </Badge>
    );
  };

  const canStartVisit = status.state === 'on-file';

  return (
    <Document>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2}>Telehealth + CHI consent</Title>
            <Text c="dimmed" size="sm">
              Capture or verify consent before launching a telehealth visit. Default validity {CONSENT_EXPIRATION_MONTHS} months from signing.
            </Text>
          </Stack>
          {statusBadge()}
        </Group>

        <Card withBorder radius="md" padding="md">
          <Stack gap="md">
            <Select
              label="Member"
              placeholder="Pick a member"
              data={patients}
              value={selectedPatient}
              onChange={(v) => setSelectedPatient(v ?? '')}
              searchable
              required
            />

            {selectedPatient && status.state === 'on-file' && status.latest && (
              <Alert color="green" variant="light" icon={<IconCheck size={18} />} title="Consent on file">
                <Text size="sm">
                  Captured {status.latest.dateTime ? formatDateTime(status.latest.dateTime) : 'unknown'}
                  {status.latest.performer?.[0]?.display && <> by {status.latest.performer[0].display}</>}
                  {` via `}
                  <span style={{ fontFamily: 'monospace' }}>{consentMethod(status.latest)}</span>.
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Expires {status.expiresOn ? formatDate(status.expiresOn) : ''} · script version{' '}
                  <span style={{ fontFamily: 'monospace' }}>{CONSENT_SCRIPT_VERSION}</span>
                </Text>
                <Text size="xs" c="dimmed" mt="xs">
                  Visit start is <b>unblocked</b>.
                </Text>
              </Alert>
            )}

            {selectedPatient && status.state === 'expired' && status.latest?.dateTime && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Consent expired">
                <Text size="sm">
                  Last consent was captured {formatDate(status.latest.dateTime)} and has since expired. Capture a new one below before starting any visit.
                </Text>
              </Alert>
            )}

            {selectedPatient && status.state === 'missing' && (
              <Alert color="red" variant="light" icon={<IconLock size={18} />} title="Consent needed">
                <Text size="sm">
                  No telehealth/CHI consent is on file for this member. Visit-start is <b>blocked</b> until a new consent is captured below.
                </Text>
              </Alert>
            )}

            {selectedPatient && status.state !== 'on-file' && (
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
                      <Group gap="xs">
                        <IconSignature size={16} />
                        <Text size="sm" fw={600}>
                          Verbal attestation script ·{' '}
                          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{CONSENT_SCRIPT_VERSION}</span>
                        </Text>
                      </Group>
                      <Text size="sm">{CONSENT_SCRIPT_TEXT}</Text>
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
                      <Group gap="xs">
                        <IconSignature size={16} />
                        <Text size="sm" fw={600}>
                          Record existing portal e-signature
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Enter the date the member signed the consent in the patient portal. In production, this is
                        populated automatically from the portal webhook; this field is the manual-entry fallback for
                        the demo.
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

            {selectedPatient && (
              <Alert
                color={canStartVisit ? 'green' : 'red'}
                variant="light"
                icon={canStartVisit ? <IconCheck size={16} /> : <IconLock size={16} />}
                title={canStartVisit ? 'Visit start: unblocked' : 'Visit start: blocked'}
              >
                <Text size="xs">
                  {canStartVisit
                    ? 'Clinician can launch the telehealth visit from the pre-visit chart.'
                    : 'CD-06 Launch visit button will refuse until a valid consent is captured.'}
                </Text>
              </Alert>
            )}
          </Stack>
        </Card>

        {selectedPatient && consents.length > 0 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Consent history</Title>
                <Badge variant="light">{consents.length}</Badge>
              </Group>
              <Stack gap="xs">
                {consents.slice(0, 10).map((c) => {
                  const m = consentMethod(c);
                  return (
                    <Group key={c.id} justify="space-between" p="xs" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap">
                        <Badge
                          color={c.status === 'active' ? 'green' : 'gray'}
                          variant="light"
                          size="sm"
                        >
                          {c.status}
                        </Badge>
                        <Text size="sm" ff="monospace">
                          {m}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {c.performer?.[0]?.display ?? '—'}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {c.dateTime ? formatDateTime(c.dateTime) : ''}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </Document>
  );
}

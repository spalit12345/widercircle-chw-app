// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CoverageEligibilityResponse, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconCheck, IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type EligibilityOutcome = 'active' | 'inactive' | 'error';

interface EligibilitySnapshot {
  outcome: EligibilityOutcome;
  planName: string;
  planId?: string;
  effectiveDate?: string;
  terminationDate?: string;
  copay?: string;
  deductible?: string;
  errorReason?: string;
}

const STALE_THRESHOLD_DAYS = 7;

// Demo-only Bridge simulator. Real implementation would POST to the Bridge
// eligibility endpoint (contract TBD per CD-11 §4) and map the 271 response
// onto CoverageEligibilityResponse. Kept deterministic per patient id so the
// demo shows a stable story rather than flicker between runs.
const simulateBridgeResponse = (patientId: string): EligibilitySnapshot => {
  const hash = Array.from(patientId).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
  const bucket = hash % 10;
  if (bucket === 0) {
    return {
      outcome: 'error',
      planName: 'Bridge timeout',
      errorReason: 'Payer did not respond within 5s. Retry recommended.',
    };
  }
  if (bucket === 1) {
    return {
      outcome: 'inactive',
      planName: 'Medicare Part B',
      errorReason: 'Coverage terminated 2026-02-28. Verify alternate plan.',
      terminationDate: '2026-02-28',
    };
  }
  const plan =
    bucket < 5 ? 'Medicare Advantage · Humana Gold Plus' : bucket < 8 ? 'Medicaid · Anthem HealthKeepers' : 'Aetna Better Health';
  return {
    outcome: 'active',
    planName: plan,
    planId: `MP${String(hash).padStart(9, '0').slice(0, 9)}`,
    effectiveDate: '2026-01-01',
    terminationDate: '2026-12-31',
    copay: bucket < 5 ? '$0 primary care' : '$5 primary care',
    deductible: bucket < 5 ? '$0 in-network' : '$250 in-network',
  };
};

const daysSince = (iso: string): number => {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (24 * 3600 * 1000));
};

const outcomeFromResponse = (resp: CoverageEligibilityResponse): EligibilityOutcome => {
  if (resp.outcome === 'error') {
    return 'error';
  }
  const active = resp.insurance?.some((ins) => ins.inforce);
  return active ? 'active' : 'inactive';
};

export function EligibilityCheckPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [history, setHistory] = useState<CoverageEligibilityResponse[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoadingPatients(true);
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
    } finally {
      setLoadingPatients(false);
    }
  }, [medplum]);

  const loadHistory = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setHistory([]);
        return;
      }
      setLoadingHistory(true);
      try {
        const results = await medplum.searchResources(
          'CoverageEligibilityResponse',
          `patient=Patient/${patientId}&_sort=-_lastUpdated&_count=10`
        );
        setHistory(results);
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
  }, [selectedPatient, loadHistory]);

  const runCheck = useCallback(async () => {
    if (!selectedPatient || !profile) {
      return;
    }
    setChecking(true);
    const started = performance.now();
    try {
      const snapshot = simulateBridgeResponse(selectedPatient);
      const latency = Math.round(performance.now() - started);
      const patientLabel = patients.find((p) => p.value === selectedPatient)?.label ?? '';

      const response: CoverageEligibilityResponse = {
        resourceType: 'CoverageEligibilityResponse',
        status: 'active',
        purpose: ['benefits'],
        created: new Date().toISOString(),
        outcome: snapshot.outcome === 'error' ? 'error' : 'complete',
        disposition:
          snapshot.outcome === 'error'
            ? snapshot.errorReason
            : snapshot.outcome === 'inactive'
              ? snapshot.errorReason
              : `Active · ${snapshot.planName}`,
        patient: { reference: `Patient/${selectedPatient}`, display: patientLabel },
        request: { display: 'Bridge-simulated CoverageEligibilityRequest (demo)' },
        requestor: {
          reference: `Practitioner/${profile.id}`,
          display:
            `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() ||
            'Clinician',
        },
        insurer: { display: snapshot.planName },
        insurance:
          snapshot.outcome === 'error'
            ? undefined
            : [
                {
                  coverage: { display: snapshot.planName },
                  inforce: snapshot.outcome === 'active',
                  benefitPeriod: snapshot.effectiveDate
                    ? { start: snapshot.effectiveDate, end: snapshot.terminationDate }
                    : undefined,
                  item:
                    snapshot.outcome === 'active'
                      ? [
                          {
                            category: { text: 'Primary care copay' },
                            description: snapshot.copay,
                          },
                          {
                            category: { text: 'Deductible (in-network)' },
                            description: snapshot.deductible,
                          },
                        ]
                      : undefined,
                },
              ],
        error:
          snapshot.outcome === 'error'
            ? [{ code: { coding: [{ code: 'BRIDGE_TIMEOUT', display: snapshot.errorReason ?? '' }] } }]
            : undefined,
        extension: [
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/eligibility-latency-ms',
            valueInteger: latency,
          },
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/eligibility-source',
            valueString: 'Bridge (simulated)',
          },
        ],
      };

      await medplum.createResource<CoverageEligibilityResponse>(response);
      showNotification({
        color:
          snapshot.outcome === 'active' ? 'green' : snapshot.outcome === 'inactive' ? 'yellow' : 'red',
        message: `Eligibility check complete: ${snapshot.outcome}`,
      });
      await loadHistory(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setChecking(false);
    }
  }, [selectedPatient, profile, patients, medplum, loadHistory]);

  const mostRecent = history[0];
  const outcome = useMemo(() => (mostRecent ? outcomeFromResponse(mostRecent) : undefined), [mostRecent]);
  const isStale =
    mostRecent?.created !== undefined && daysSince(mostRecent.created) >= STALE_THRESHOLD_DAYS;

  const renderResult = (resp: CoverageEligibilityResponse): JSX.Element => {
    const result = outcomeFromResponse(resp);
    const period = resp.insurance?.[0]?.benefitPeriod;
    const items = resp.insurance?.[0]?.item ?? [];
    const planDisplay = resp.insurer?.display ?? resp.insurance?.[0]?.coverage?.display ?? '—';

    if (result === 'error') {
      const errorMsg = resp.error?.[0]?.code?.coding?.[0]?.display ?? resp.disposition ?? 'Eligibility service unavailable';
      return (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Service error">
          <Text size="sm">{errorMsg}</Text>
          <Group mt="xs">
            <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={runCheck}>
              Retry
            </Button>
          </Group>
        </Alert>
      );
    }

    return (
      <Card
        withBorder
        radius="md"
        padding="md"
        style={{
          backgroundColor:
            result === 'active' ? 'var(--mantine-color-green-0)' : 'var(--mantine-color-red-0)',
          borderColor:
            result === 'active' ? 'var(--mantine-color-green-4)' : 'var(--mantine-color-red-4)',
        }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              {result === 'active' ? (
                <IconCheck size={20} color="var(--mantine-color-green-7)" />
              ) : (
                <IconAlertTriangle size={20} color="var(--mantine-color-red-7)" />
              )}
              <Text fw={600}>{result === 'active' ? 'Active' : 'Inactive'} · {planDisplay}</Text>
            </Group>
            <Badge variant="light" size="sm" color={result === 'active' ? 'green' : 'red'}>
              {resp.disposition ?? result}
            </Badge>
          </Group>
          {period?.start && (
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                Effective: <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(period.start)}</span>
              </Text>
              {period.end && (
                <Text size="sm" c="dimmed">
                  Through: <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(period.end)}</span>
                </Text>
              )}
            </Group>
          )}
          {items.length > 0 && (
            <Group gap="lg">
              {items.map((it, idx) => (
                <Text key={idx} size="sm" c="dimmed">
                  {it.category?.text}: <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{it.description}</span>
                </Text>
              ))}
            </Group>
          )}
          <Divider my={4} />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Checked {resp.created ? formatDateTime(resp.created) : 'unknown'}
              {resp.requestor?.display && <> · by {resp.requestor.display}</>}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              Bridge (simulated)
            </Text>
          </Group>
        </Stack>
      </Card>
    );
  };

  return (
    <Document>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2}>Eligibility</Title>
          <Text c="dimmed" size="sm">
            Real-time payer eligibility lookup via Bridge. Most-recent result is persisted on the member;
            full history is retained below.
          </Text>
        </Stack>

        <Card withBorder radius="md" padding="md">
          <Stack gap="md">
            <Group align="flex-end" gap="md" wrap="wrap">
              <Select
                label="Member"
                placeholder={loadingPatients ? 'Loading members…' : 'Pick a member to check'}
                data={patients}
                value={selectedPatient}
                onChange={(v) => setSelectedPatient(v ?? '')}
                searchable
                disabled={loadingPatients}
                style={{ flex: 1, minWidth: 280 }}
              />
              <Button
                leftSection={<IconShieldCheck size={16} />}
                onClick={runCheck}
                loading={checking}
                disabled={!selectedPatient || checking}
              >
                {isStale ? 'Re-check eligibility' : 'Check eligibility'}
              </Button>
            </Group>

            {isStale && mostRecent?.created && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title="Last check is stale">
                <Text size="sm">
                  Last eligibility check was {daysSince(mostRecent.created)} day
                  {daysSince(mostRecent.created) === 1 ? '' : 's'} ago. Re-check to refresh.
                </Text>
              </Alert>
            )}

            {loadingHistory ? (
              <Center py="md">
                <Loader size="sm" />
              </Center>
            ) : mostRecent ? (
              renderResult(mostRecent)
            ) : selectedPatient ? (
              <Text c="dimmed" size="sm">
                No eligibility check on file yet. Click <b>Check eligibility</b> to run one.
              </Text>
            ) : (
              <Text c="dimmed" size="sm">
                Pick a member to see their eligibility status.
              </Text>
            )}
          </Stack>
        </Card>

        {history.length > 1 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={4}>History</Title>
                <Badge variant="light">{history.length}</Badge>
              </Group>
              <Stack gap="xs">
                {history.slice(1).map((h) => {
                  const result = outcomeFromResponse(h);
                  return (
                    <Group
                      key={h.id}
                      justify="space-between"
                      p="xs"
                      wrap="nowrap"
                      style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                    >
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <Badge
                          color={result === 'active' ? 'green' : result === 'inactive' ? 'red' : 'gray'}
                          variant="light"
                          size="sm"
                        >
                          {result}
                        </Badge>
                        <Text size="sm" truncate>
                          {h.insurer?.display ?? h.disposition ?? '—'}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {h.created ? formatDateTime(h.created) : ''}
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

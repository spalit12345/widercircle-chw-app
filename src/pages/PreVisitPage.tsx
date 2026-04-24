// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  AllergyIntolerance,
  CarePlan,
  Condition,
  CoverageEligibilityResponse,
  Encounter,
  MedicationRequest,
  Patient,
} from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconCheck,
  IconFileText,
  IconPhone,
  IconShieldCheck,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

const MIN_BEFORE_LAUNCH = 30;
const STALE_DAYS = 7;

export interface PreVisitBundle {
  encounter: Encounter;
  patient?: Patient;
  carePlans: CarePlan[];
  medications: MedicationRequest[];
  allergies: AllergyIntolerance[];
  conditions: Condition[];
  recentEncounters: Encounter[];
  eligibility?: CoverageEligibilityResponse;
}

export const patientName = (patient: Patient | undefined): string => {
  if (!patient) {
    return '—';
  }
  const given = patient.name?.[0]?.given?.join(' ') ?? '';
  const family = patient.name?.[0]?.family ?? '';
  return `${given} ${family}`.trim() || 'Unnamed patient';
};

export const minutesUntil = (iso: string | undefined, now: number = Date.now()): number | undefined => {
  if (!iso) {
    return undefined;
  }
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) {
    return undefined;
  }
  return Math.round(ms / (60 * 1000));
};

export const isLaunchAllowed = (start: string | undefined, now: number = Date.now()): boolean => {
  const mins = minutesUntil(start, now);
  if (mins === undefined) {
    return true; // unscheduled: no gate
  }
  return mins <= MIN_BEFORE_LAUNCH;
};

export const eligibilityIsStale = (resp: CoverageEligibilityResponse | undefined, now: number = Date.now()): boolean => {
  if (!resp?.created) {
    return true;
  }
  const days = (now - new Date(resp.created).getTime()) / (24 * 3600 * 1000);
  return days >= STALE_DAYS;
};

export function PreVisitPage(): JSX.Element {
  const { encounterId } = useParams<{ encounterId: string }>();
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState<PreVisitBundle | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!encounterId) {
      setError('Missing encounter id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const encounter = await medplum.readResource('Encounter', encounterId);
      const patientRef = encounter.subject?.reference;
      const patientId = patientRef?.replace('Patient/', '');
      const patientSearch = `patient=Patient/${patientId}`;

      const [patient, carePlans, medications, allergies, conditions, recentEncounters, eligibility] = await Promise.all([
        patientId ? medplum.readResource('Patient', patientId).catch(() => undefined) : Promise.resolve(undefined),
        patientId
          ? medplum.searchResources('CarePlan', `${patientSearch}&status=active&_count=5&_sort=-_lastUpdated`)
          : Promise.resolve([]),
        patientId
          ? medplum.searchResources('MedicationRequest', `${patientSearch}&status=active&_count=10`)
          : Promise.resolve([]),
        patientId
          ? medplum.searchResources('AllergyIntolerance', `${patientSearch}&_count=10`)
          : Promise.resolve([]),
        patientId
          ? medplum.searchResources('Condition', `${patientSearch}&clinical-status=active&_count=10`)
          : Promise.resolve([]),
        patientId
          ? medplum.searchResources('Encounter', `${patientSearch}&_count=3&_sort=-date`)
          : Promise.resolve([]),
        patientId
          ? medplum.searchResources('CoverageEligibilityResponse', `${patientSearch}&_count=1&_sort=-_lastUpdated`)
          : Promise.resolve([]),
      ]);

      setBundle({
        encounter,
        patient,
        carePlans,
        medications,
        allergies,
        conditions,
        recentEncounters: recentEncounters.filter((e) => e.id !== encounter.id),
        eligibility: eligibility[0],
      });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [encounterId, medplum]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const start = bundle?.encounter.period?.start;
  const launchable = useMemo(() => isLaunchAllowed(start), [start]);
  const minsUntilStart = useMemo(() => minutesUntil(start), [start]);
  const encounterType = bundle?.encounter.type?.[0]?.text ?? bundle?.encounter.type?.[0]?.coding?.[0]?.display ?? 'Visit';
  const stale = useMemo(() => eligibilityIsStale(bundle?.eligibility), [bundle?.eligibility]);

  const onLaunch = (): void => {
    // CD-06 takes over from here. For this read-only view we navigate to the
    // existing encounter chart route where authoring is available.
    if (bundle) {
      navigate(`/Patient/${bundle.patient?.id ?? ''}/Encounter/${bundle.encounter.id ?? ''}`);
    }
  };

  if (loading) {
    return (
      <Document>
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Document>
    );
  }

  if (error || !bundle) {
    return (
      <Document>
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Couldn't load pre-visit chart">
          <Text size="sm">{error ?? 'Encounter not found.'}</Text>
        </Alert>
      </Document>
    );
  }

  const reason =
    bundle.encounter.reasonCode?.[0]?.text ??
    bundle.encounter.reasonCode?.[0]?.coding?.[0]?.display ??
    'No reason on file.';

  return (
    <Document>
      <Stack gap="lg">
        {/* Sticky quick-action bar */}
        <Card withBorder padding="md" radius="md" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <Group justify="space-between" wrap="nowrap" gap="md">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text fw={700} size="md" truncate>
                {encounterType} · {patientName(bundle.patient)}
              </Text>
              <Text size="xs" c="dimmed">
                {start ? formatDateTime(start) : 'Unscheduled'}
                {minsUntilStart !== undefined && minsUntilStart > 0 && <> · starts in {minsUntilStart}m</>}
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <Tooltip
                label={
                  launchable
                    ? 'Open encounter workspace'
                    : `Launch unlocks ${MIN_BEFORE_LAUNCH} minutes before start`
                }
                withArrow
              >
                <Button
                  leftSection={<IconPhone size={16} />}
                  disabled={!launchable}
                  onClick={onLaunch}
                  color="blue"
                  size="md"
                  aria-label="Launch visit"
                >
                  Launch visit
                </Button>
              </Tooltip>
              <Button variant="light" leftSection={<IconFileText size={16} />} disabled>
                Capture consent
              </Button>
              <Tooltip label="Edit Plan unlocks when the visit starts" withArrow>
                <Button variant="light" leftSection={<IconFileText size={16} />} disabled>
                  Edit plan
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Card>

        {/* 2-column grid on desktop, stack on mobile */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {/* Reason & chief complaint */}
          <Card withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Title order={5}>Reason for visit</Title>
              <Text size="sm">{reason}</Text>
              {bundle.recentEncounters.length > 0 && (
                <Stack gap={4} mt="xs">
                  <Text size="xs" c="dimmed" fw={600}>
                    Recent encounters
                  </Text>
                  {bundle.recentEncounters.slice(0, 3).map((e) => (
                    <Group key={e.id} gap="xs" justify="space-between">
                      <Text size="xs" truncate>
                        {e.type?.[0]?.text ?? e.type?.[0]?.coding?.[0]?.display ?? 'Visit'}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {e.period?.start ? formatDate(e.period.start) : ''}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          {/* Current Plan of Care */}
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between">
              <Title order={5}>Current plan of care</Title>
              <Badge variant="light">{bundle.carePlans.length}</Badge>
            </Group>
            {bundle.carePlans.length === 0 ? (
              <Text size="sm" c="dimmed" mt="xs">
                No active care plan on file.
              </Text>
            ) : (
              <Stack gap="xs" mt="xs">
                {bundle.carePlans.slice(0, 1).map((cp) => (
                  <Stack key={cp.id} gap={4}>
                    <Text size="sm" fw={500}>
                      {cp.title ?? cp.description ?? 'Care plan'}
                    </Text>
                    {cp.description && (
                      <Text size="xs" c="dimmed" lineClamp={4}>
                        {cp.description}
                      </Text>
                    )}
                    {cp.activity && cp.activity.length > 0 && (
                      <Stack gap={2} mt={4}>
                        {cp.activity.slice(0, 3).map((act, i) => (
                          <Text key={i} size="xs">
                            • {act.detail?.description ?? act.detail?.code?.text ?? 'Action'}
                          </Text>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}
          </Card>

          {/* Medications / Allergies / Active conditions */}
          <Card withBorder radius="md" padding="md">
            <Title order={5}>Meds · Allergies · Active conditions</Title>
            <Stack gap="sm" mt="xs">
              <Stack gap={2}>
                <Text size="xs" c="dimmed" fw={600}>
                  Medications ({bundle.medications.length})
                </Text>
                {bundle.medications.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    None on file.
                  </Text>
                ) : (
                  bundle.medications.slice(0, 4).map((m) => (
                    <Text key={m.id} size="xs">
                      {m.medicationCodeableConcept?.text ??
                        m.medicationCodeableConcept?.coding?.[0]?.display ??
                        'Medication'}
                    </Text>
                  ))
                )}
              </Stack>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" fw={600}>
                  Allergies ({bundle.allergies.length})
                </Text>
                {bundle.allergies.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    None on file.
                  </Text>
                ) : (
                  bundle.allergies.slice(0, 4).map((a) => (
                    <Text key={a.id} size="xs">
                      {a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Allergy'}
                    </Text>
                  ))
                )}
              </Stack>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" fw={600}>
                  Active conditions ({bundle.conditions.length})
                </Text>
                {bundle.conditions.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    None on file.
                  </Text>
                ) : (
                  bundle.conditions.slice(0, 4).map((c) => (
                    <Text key={c.id} size="xs">
                      {c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Condition'}
                    </Text>
                  ))
                )}
              </Stack>
            </Stack>
          </Card>

          {/* Eligibility status */}
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between">
              <Title order={5}>Eligibility</Title>
              {bundle.eligibility ? (
                <Badge
                  color={
                    bundle.eligibility.outcome === 'error'
                      ? 'gray'
                      : bundle.eligibility.insurance?.[0]?.inforce
                        ? 'green'
                        : 'red'
                  }
                  variant="light"
                  leftSection={<IconShieldCheck size={12} />}
                >
                  {bundle.eligibility.outcome === 'error'
                    ? 'Unavailable'
                    : bundle.eligibility.insurance?.[0]?.inforce
                      ? 'Active'
                      : 'Inactive'}
                </Badge>
              ) : (
                <Badge color="gray" variant="light">
                  Not checked
                </Badge>
              )}
            </Group>
            {bundle.eligibility ? (
              <Stack gap={4} mt="xs">
                <Text size="sm">
                  {bundle.eligibility.insurer?.display ??
                    bundle.eligibility.insurance?.[0]?.coverage?.display ??
                    'Coverage'}
                </Text>
                <Text size="xs" c="dimmed">
                  Checked {bundle.eligibility.created ? formatDateTime(bundle.eligibility.created) : 'unknown'}
                </Text>
                {stale && (
                  <Alert color="yellow" variant="light" p="xs" icon={<IconAlertTriangle size={14} />}>
                    <Text size="xs">Last check is {STALE_DAYS}+ days old — re-check before billing.</Text>
                  </Alert>
                )}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" mt="xs">
                No eligibility check on file. Run a check before billing.
              </Text>
            )}
          </Card>
        </SimpleGrid>

        <Group gap="xs">
          <IconCheck size={14} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            This chart is read-only. Authoring unlocks when you launch the visit (CD-08).
          </Text>
        </Group>
      </Stack>
    </Document>
  );
}

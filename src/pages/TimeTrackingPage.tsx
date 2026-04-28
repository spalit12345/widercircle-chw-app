// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Loader, NumberInput, Progress, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconClockEdit, IconPlayerPause, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const MANUAL_ENTRY_EXT = 'https://widercircle.com/fhir/StructureDefinition/manual-time-entry';
const MANUAL_JUSTIFICATION_EXT = 'https://widercircle.com/fhir/StructureDefinition/manual-time-justification';

// CMS CCM thresholds (CPT codes) — minutes of clinical staff time per calendar month
export const CCM_THRESHOLDS: Array<{ code: string; minutes: number; label: string }> = [
  { code: '99490', minutes: 20, label: 'CCM · initial 20 min' },
  { code: '99439', minutes: 40, label: 'CCM · +20 min' },
  { code: '99439', minutes: 60, label: 'CCM · +40 min' },
];

export const IDLE_AUTO_STOP_MS = 30 * 60 * 1000; // 30 min

export interface ThresholdProgress {
  currentThreshold?: { code: string; minutes: number; label: string };
  nextThreshold?: { code: string; minutes: number; label: string };
  percentToNext: number;
  minutesRemaining: number;
}

export const evaluateThresholdProgress = (totalMinutes: number): ThresholdProgress => {
  const passed = CCM_THRESHOLDS.filter((t) => totalMinutes >= t.minutes);
  const currentThreshold = passed[passed.length - 1];
  const nextThreshold = CCM_THRESHOLDS.find((t) => totalMinutes < t.minutes);
  if (!nextThreshold) {
    return { currentThreshold, percentToNext: 100, minutesRemaining: 0 };
  }
  const prevMinutes = currentThreshold?.minutes ?? 0;
  const span = nextThreshold.minutes - prevMinutes;
  const progress = totalMinutes - prevMinutes;
  const percentToNext = Math.max(0, Math.min(100, Math.round((progress / span) * 100)));
  return { currentThreshold, nextThreshold, percentToNext, minutesRemaining: nextThreshold.minutes - totalMinutes };
};

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const sumObservationMinutes = (observations: Observation[]): number => {
  let total = 0;
  for (const o of observations) {
    if (o.valueQuantity?.unit === 'min' && typeof o.valueQuantity.value === 'number') {
      total += o.valueQuantity.value;
    }
  }
  return total;
};

export function TimeTrackingPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Observation[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | undefined>();
  const [tickNow, setTickNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [manualMinutes, setManualMinutes] = useState<number | string>(15);
  const [manualJustification, setManualJustification] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    medplum
      .searchResources('Patient', '_count=50&_sort=-_lastUpdated')
      .then((results) =>
        setPatients(
          results.map((p: Patient) => ({
            value: p.id ?? '',
            label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
          }))
        )
      )
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setLoading(false));
  }, [medplum]);

  const loadEntries = useCallback(async (patientId: string) => {
    if (!patientId) {
      setEntries([]);
      return;
    }
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    try {
      const results = await medplum.searchResources(
        'Observation',
        `subject=Patient/${patientId}&code=ccm-minutes&date=ge${monthStart.toISOString().slice(0, 10)}&_count=100&_sort=-date`
      );
      setEntries(results);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum]);

  useEffect(() => {
    loadEntries(selectedPatient).catch(console.error);
  }, [selectedPatient, loadEntries]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const now = Date.now();
      setTickNow(now);
      if (startedAt && now - startedAt > IDLE_AUTO_STOP_MS) {
        setRunning(false);
        showNotification({ color: 'yellow', message: 'Timer auto-stopped after 30 min idle' });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const liveSeconds = running && startedAt ? Math.floor((tickNow - startedAt) / 1000) : 0;

  const start = useCallback(() => {
    setStartedAt(Date.now());
    setRunning(true);
  }, []);

  const stop = useCallback(async () => {
    if (!startedAt || !selectedPatient || !profile) return;
    const endedAt = Date.now();
    setRunning(false);
    const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60_000));
    setSaving(true);
    try {
      const payload: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            { system: 'https://widercircle.com/fhir/CodeSystem/time-tracking', code: 'ccm-minutes', display: 'CCM clinical staff time (minutes)' },
          ],
          text: 'CCM clinical staff time',
        },
        subject: { reference: `Patient/${selectedPatient}` },
        effectivePeriod: {
          start: new Date(startedAt).toISOString(),
          end: new Date(endedAt).toISOString(),
        },
        issued: new Date().toISOString(),
        performer: [{ reference: `Practitioner/${profile.id}` }],
        valueQuantity: {
          value: minutes,
          unit: 'min',
          system: 'http://unitsofmeasure.org',
          code: 'min',
        },
      };
      await medplum.createResource<Observation>(payload);
      showNotification({ color: 'green', message: `Logged ${minutes} min` });
      setStartedAt(undefined);
      await loadEntries(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }, [startedAt, selectedPatient, profile, medplum, loadEntries]);

  const totalMinutes = useMemo(() => sumObservationMinutes(entries), [entries]);
  const progress = useMemo(() => evaluateThresholdProgress(totalMinutes), [totalMinutes]);

  const submitManualEntry = useCallback(async () => {
    if (!selectedPatient || !profile) return;
    const minutes = typeof manualMinutes === 'string' ? Number(manualMinutes) : manualMinutes;
    const justification = manualJustification.trim();
    if (!Number.isFinite(minutes) || minutes <= 0) {
      showNotification({ color: 'red', message: 'Minutes must be a positive number' });
      return;
    }
    if (justification.length < 10) {
      showNotification({
        color: 'red',
        message: 'Justification is required (≥ 10 characters) for manual entries',
      });
      return;
    }
    setSavingManual(true);
    try {
      const now = new Date();
      const startedDate = new Date(now.getTime() - minutes * 60_000);
      const payload: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            { system: 'https://widercircle.com/fhir/CodeSystem/time-tracking', code: 'ccm-minutes', display: 'CCM clinical staff time (minutes)' },
          ],
          text: 'CCM clinical staff time (manual entry)',
        },
        subject: { reference: `Patient/${selectedPatient}` },
        effectivePeriod: {
          start: startedDate.toISOString(),
          end: now.toISOString(),
        },
        issued: now.toISOString(),
        performer: [{ reference: `Practitioner/${profile.id}` }],
        valueQuantity: {
          value: minutes,
          unit: 'min',
          system: 'http://unitsofmeasure.org',
          code: 'min',
        },
        note: [{ text: justification }],
        extension: [
          { url: MANUAL_ENTRY_EXT, valueBoolean: true },
          { url: MANUAL_JUSTIFICATION_EXT, valueString: justification },
        ],
      };
      await medplum.createResource<Observation>(payload);
      showNotification({ color: 'green', message: `Manual entry · ${minutes} min logged with justification` });
      setManualJustification('');
      setManualMinutes(15);
      await loadEntries(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSavingManual(false);
    }
  }, [selectedPatient, profile, manualMinutes, manualJustification, medplum, loadEntries]);

  if (loading) return <Document><Loader /></Document>;

  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>CCM time tracking</Title>
          <Text c="dimmed" size="sm">Stopwatch for CMS time-based billing. Entries roll up per member per calendar month.</Text>
        </Stack>

        <Select label="Member" placeholder="Pick a member" data={patients} value={selectedPatient} onChange={(v) => setSelectedPatient(v ?? '')} searchable required />

        {selectedPatient && (
          <>
            <Card withBorder radius="md" padding="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Group gap="md">
                    <Text ff="monospace" size="xl" fw={700}>
                      {formatDuration(liveSeconds)}
                    </Text>
                    {running ? (
                      <Badge color="blue" variant="filled">Running</Badge>
                    ) : (
                      <Badge color="gray" variant="light">Idle</Badge>
                    )}
                  </Group>
                  <Group>
                    {!running ? (
                      <Button color="blue" leftSection={<IconPlayerPlay size={16} />} onClick={start} disabled={saving}>Start</Button>
                    ) : (
                      <>
                        <Button color="yellow" leftSection={<IconPlayerPause size={16} />} onClick={() => setRunning(false)} variant="light">Pause</Button>
                        <Button color="red" leftSection={<IconPlayerStop size={16} />} onClick={stop} loading={saving}>Stop & log</Button>
                      </>
                    )}
                  </Group>
                </Group>
                {running && (
                  <Alert variant="light" color="blue">
                    <Text size="xs">Timer auto-stops after 30 min idle (AC-3).</Text>
                  </Alert>
                )}
              </Stack>
            </Card>

            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={5}>This month</Title>
                  <Badge variant="light" ff="monospace">{totalMinutes} min</Badge>
                </Group>
                <Progress value={progress.percentToNext} size="lg" color="grape" />
                {progress.nextThreshold ? (
                  <Text size="sm">
                    <b>{progress.percentToNext}%</b> to <span style={{ fontFamily: 'monospace' }}>{progress.nextThreshold.code}</span> ({progress.nextThreshold.label}) · {progress.minutesRemaining} min remaining
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">All CCM thresholds hit this month.</Text>
                )}
                {progress.currentThreshold && (
                  <Badge color="green" variant="light">
                    Current: {progress.currentThreshold.code} ({progress.currentThreshold.minutes} min · {progress.currentThreshold.label})
                  </Badge>
                )}
              </Stack>
            </Card>

            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group gap={8}>
                  <IconClockEdit size={18} />
                  <Title order={5}>Manual time entry</Title>
                  <Badge variant="light" color="orange">Justification required (AC-4)</Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  For after-the-fact entries when the stopwatch wasn't running. Audit trail captures the justification verbatim.
                </Text>
                <Group align="flex-end" wrap="nowrap" gap="md">
                  <NumberInput
                    label="Minutes"
                    value={manualMinutes}
                    onChange={(v) => setManualMinutes(v)}
                    min={1}
                    max={480}
                    step={5}
                    w={120}
                  />
                  <Textarea
                    label="Justification"
                    placeholder="Describe what work was done and why it wasn't tracked live (≥ 10 chars)"
                    value={manualJustification}
                    onChange={(e) => setManualJustification(e.currentTarget.value)}
                    autosize
                    minRows={2}
                    style={{ flex: 1 }}
                  />
                </Group>
                <Group>
                  <Button
                    color="orange"
                    onClick={submitManualEntry}
                    loading={savingManual}
                    disabled={savingManual || manualJustification.trim().length < 10}
                    leftSection={<IconClockEdit size={16} />}
                  >
                    Log manual entry
                  </Button>
                </Group>
              </Stack>
            </Card>

            {entries.length > 0 && (
              <Card withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={5}>Entries this month</Title>
                    <Badge variant="light">{entries.length}</Badge>
                  </Group>
                  <Stack gap="xs">
                    {entries.slice(0, 20).map((o) => (
                      <Group key={o.id} justify="space-between" p="xs" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                        <Group gap="sm">
                          <Badge variant="light" ff="monospace">{o.valueQuantity?.value ?? 0} min</Badge>
                          <Text size="sm">{o.performer?.[0]?.display ?? o.performer?.[0]?.reference ?? '—'}</Text>
                        </Group>
                        <Text size="xs" c="dimmed" ff="monospace">{o.effectivePeriod?.start ? formatDateTime(o.effectivePeriod.start) : ''}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            )}
          </>
        )}
      </Stack>
    </Document>
  );
}

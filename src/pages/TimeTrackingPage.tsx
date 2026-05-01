// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Loader, Select, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconPlayerPause, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTimer } from '../timer/TimerContext';
import { getActiveCarePlanRef } from '../utils/care-plan-link';

// CMS CCM thresholds (CPT codes) — minutes of clinical staff time per calendar month
export const CCM_THRESHOLDS: Array<{ code: string; minutes: number; label: string }> = [
  { code: '99490', minutes: 20, label: 'CCM · initial 20 min' },
  { code: '99439', minutes: 40, label: 'CCM · +20 min' },
  { code: '99439', minutes: 60, label: 'CCM · +40 min' },
];

// 4-hour idle auto-stop on the demo build so a long board presentation
// doesn't trip the timer mid-talk. Production default is 30 min per CD-17 AC-3
// — flip this back once we move past the 5/5 demo window.
export const IDLE_AUTO_STOP_MS = 4 * 60 * 60 * 1000;

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeTimer, elapsed, startTimer, stopTimer } = useTimer();
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(searchParams.get('patient') ?? activeTimer?.patientId ?? '');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Observation[]>([]);
  const [saving, setSaving] = useState(false);
  // CD-08 + CD-17 gate: billable time requires an authored Plan of Care.
  // Undefined while we're checking; null = confirmed missing; string = ref id.
  const [carePlanRef, setCarePlanRef] = useState<string | null | undefined>(undefined);

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
    // Use full UTC instants computed from the LOCAL month boundary so an
    // entry logged late on the last local day (which lands in the next UTC
    // day in negative-UTC timezones) still rolls into the right month.
    const now = new Date();
    const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
    const nextMonthStartIso = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).toISOString();
    try {
      const results = await medplum.searchResources(
        'Observation',
        `subject=Patient/${patientId}&code=ccm-minutes&date=ge${monthStartIso}&date=lt${nextMonthStartIso}&_count=100&_sort=-date`
      );
      setEntries(results);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum]);

  useEffect(() => {
    loadEntries(selectedPatient).catch(console.error);
  }, [selectedPatient, loadEntries]);

  // Honor ?patient= changes coming from the global timer banner so the page
  // re-targets without forcing a remount.
  useEffect(() => {
    const fromUrl = searchParams.get('patient');
    if (fromUrl && fromUrl !== selectedPatient) {
      setSelectedPatient(fromUrl);
    }
  }, [searchParams, selectedPatient]);

  // Re-fetch entries when the active timer clears (covers the case where the
  // CHW stops the timer from the global banner instead of this page's widget).
  useEffect(() => {
    if (!activeTimer && selectedPatient) {
      loadEntries(selectedPatient).catch(console.error);
    }
  }, [activeTimer, selectedPatient, loadEntries]);

  useEffect(() => {
    if (!selectedPatient) {
      setCarePlanRef(undefined);
      return;
    }
    setCarePlanRef(undefined);
    getActiveCarePlanRef(medplum, selectedPatient)
      .then((ref) => setCarePlanRef(ref?.reference ?? null))
      .catch(() => setCarePlanRef(null));
  }, [medplum, selectedPatient]);

  const noActivePlan = selectedPatient && carePlanRef === null;

  // Treat the global timer as "running for this page" only when the active
  // timer matches the selected member. Cross-member timers stay visible in the
  // banner but the per-page widget disables Start so we can't double-track.
  const runningForSelected = !!activeTimer && activeTimer.patientId === selectedPatient;
  const runningElsewhere = !!activeTimer && !runningForSelected;
  const liveSeconds = runningForSelected ? elapsed : 0;

  const start = useCallback(() => {
    if (!selectedPatient) return;
    if (activeTimer) {
      showNotification({
        color: 'yellow',
        message: `Timer already running for ${activeTimer.patientName}. Stop it before starting a new one.`,
      });
      return;
    }
    const patientName = patients.find((p) => p.value === selectedPatient)?.label ?? 'Member';
    startTimer({ patientId: selectedPatient, patientName });
  }, [selectedPatient, activeTimer, patients, startTimer]);

  const stop = useCallback(async () => {
    if (!runningForSelected) return;
    setSaving(true);
    try {
      const result = await stopTimer();
      if (result) {
        const minutes = result.valueQuantity?.value ?? 0;
        showNotification({ color: 'green', message: `Logged ${minutes} min` });
      } else {
        showNotification({ color: 'red', message: 'Failed to save time entry — see console.', autoClose: false });
      }
      await loadEntries(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }, [runningForSelected, stopTimer, selectedPatient, loadEntries]);

  // Idle auto-stop. Pushes the partial entry through `stop()` so we don't lose
  // logged minutes if a CHW leaves the timer running overnight.
  useEffect(() => {
    if (!runningForSelected || !activeTimer) return;
    const id = setInterval(() => {
      const startedAtMs = new Date(activeTimer.startedAt).getTime();
      if (Date.now() - startedAtMs > IDLE_AUTO_STOP_MS) {
        showNotification({
          color: 'yellow',
          message: `Timer auto-stopped after ${IDLE_AUTO_STOP_MS / 3600000}h idle — entry saved.`,
        });
        void stop();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [runningForSelected, activeTimer, stop]);

  const totalMinutes = useMemo(() => sumObservationMinutes(entries), [entries]);
  const progress = useMemo(() => evaluateThresholdProgress(totalMinutes), [totalMinutes]);

  if (loading) return <Document><Loader /></Document>;

  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>CCM time tracking</Title>
          <Text c="dimmed" size="sm">Stopwatch for CMS time-based billing. Entries roll up per member per calendar month.</Text>
        </Stack>

        <Select label="Member" placeholder="Pick a member" data={patients} value={selectedPatient} onChange={(v) => setSelectedPatient(v ?? '')} searchable required />

        {noActivePlan && (
          <Alert
            color="yellow"
            variant="light"
            icon={<IconAlertTriangle size={16} />}
            title="No active Plan of Care for this member"
          >
            <Text size="sm">
              Time logged here will not be billable until a Provider authors a Plan of Care.
              Start tracking after the plan exists.
            </Text>
            <Button
              size="xs"
              variant="light"
              color="yellow"
              mt="xs"
              onClick={() => navigate('/plan-of-care')}
            >
              Open Plan of Care authoring
            </Button>
          </Alert>
        )}

        {selectedPatient && (
          <>
            {/* v2 billable-encounter widget — port of the active-call timer block.
                Combines timer + threshold marker bar + Candid status into one card. */}
            <BillableEncounterWidget
              elapsedSeconds={liveSeconds + totalMinutes * 60}
              currentCpt={progress.currentThreshold?.code ?? progress.nextThreshold?.code ?? '—'}
              candidSynced={false}
              running={runningForSelected}
              saving={saving}
              disabled={Boolean(noActivePlan) || runningElsewhere}
              totalMinutes={totalMinutes}
              thresholds={CCM_THRESHOLDS}
              onStart={start}
              onPause={stop}
              onStop={stop}
            />

            {runningElsewhere && activeTimer && (
              <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm">
                  A timer is already running for <b>{activeTimer.patientName}</b>. Stop it from the orange
                  banner above before starting a new one.
                </Text>
              </Alert>
            )}

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

/* ─────── v2 billable-encounter widget ───────
   Visual port of Design v2/ui_kits/cms_platform/active-call.jsx's
   "BILLABLE ENCOUNTER · CHRONIC CARE MGMT" card. Big mm:ss timer,
   inline current CPT in brand orange, Candid sync pill, threshold
   marker bar with notches at each CPT cliff. */

const formatMmSs = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

function BillableEncounterWidget({
  elapsedSeconds,
  currentCpt,
  candidSynced,
  running,
  saving,
  disabled,
  totalMinutes,
  thresholds,
  onStart,
  onPause,
  onStop,
}: {
  elapsedSeconds: number;
  currentCpt: string;
  candidSynced: boolean;
  running: boolean;
  saving: boolean;
  disabled: boolean;
  totalMinutes: number;
  thresholds: { code: string; minutes: number; label: string }[];
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}): JSX.Element {
  const maxMinutes = thresholds[thresholds.length - 1]?.minutes ?? 60;
  const fillPct = Math.min(100, (totalMinutes / maxMinutes) * 100);

  return (
    <div
      style={{
        border: '1px solid var(--wc-base-200, #E2E6E9)',
        borderRadius: 18,
        padding: '20px 24px 28px',
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--wc-base-500, #8499AA)',
              textTransform: 'uppercase',
            }}
          >
            Billable encounter · Chronic care mgmt
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 14,
              background: candidSynced ? 'var(--wc-success-100, #DDF3F2)' : 'var(--wc-base-100, #F6F7F8)',
              color: candidSynced ? 'var(--wc-success-700, #015F5D)' : 'var(--wc-base-600, #506D85)',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: candidSynced ? 'var(--wc-success-500, #2F8A89)' : 'var(--wc-base-400, #A7B6C2)',
              }}
            />
            {candidSynced ? 'Candid synced' : 'Candid pending'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!running ? (
            <button
              type="button"
              onClick={onStart}
              disabled={saving || disabled}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 32,
                padding: '0 14px',
                borderRadius: 16,
                border: 'none',
                background: disabled ? 'var(--wc-base-200, #E2E6E9)' : 'var(--wc-primary-500, #EA6424)',
                color: '#fff',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <IconPlayerPlay size={14} /> Start timer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onPause}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 16,
                  border: '1px solid var(--wc-base-200, #E2E6E9)',
                  background: '#fff',
                  color: 'var(--wc-base-700, #34556D)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <IconPlayerPause size={14} /> Pause timer
              </button>
              <button
                type="button"
                onClick={onStop}
                disabled={saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 16,
                  border: '1px solid var(--wc-error-600, #D1190D)',
                  background: '#fff',
                  color: 'var(--wc-error-700, #A73304)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                <IconPlayerStop size={14} /> {saving ? 'Saving…' : 'Stop & log'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Big timer with arrow → CPT */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'Montserrat, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 38,
            letterSpacing: '-0.02em',
            color: 'var(--wc-base-800, #012B49)',
            lineHeight: 1,
          }}
        >
          {formatMmSs(elapsedSeconds)}
        </span>
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--wc-base-500, #8499AA)',
          }}
        >
          → CPT{' '}
          <span style={{ color: 'var(--wc-primary-500, #EA6424)', fontWeight: 700 }}>
            {currentCpt}
          </span>
        </span>
      </div>

      {/* Threshold marker bar */}
      <div style={{ marginTop: 22, position: 'relative' }}>
        <div
          style={{
            position: 'relative',
            height: 6,
            background: 'var(--wc-base-200, #E2E6E9)',
            borderRadius: 3,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${fillPct}%`,
              background: 'var(--wc-info-500, #5AA8B8)',
              borderRadius: 3,
              transition: 'width 0.3s ease-out',
            }}
          />
          {thresholds.map((t) => {
            const pos = Math.min(100, (t.minutes / maxMinutes) * 100);
            return (
              <div
                key={`${t.minutes}-${t.code}`}
                style={{
                  position: 'absolute',
                  left: `${pos}%`,
                  top: -4,
                  transform: 'translateX(-50%)',
                  width: 2,
                  height: 14,
                  background: 'var(--wc-base-700, #34556D)',
                  borderRadius: 1,
                }}
              />
            );
          })}
        </div>
        <div style={{ position: 'relative', marginTop: 10, height: 14 }}>
          {thresholds.map((t, i) => {
            const pos = Math.min(100, (t.minutes / maxMinutes) * 100);
            const align = i === 0 ? 'left' : i === thresholds.length - 1 ? 'right' : 'center';
            const transform =
              align === 'left' ? 'translateX(0)' : align === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
            return (
              <span
                key={`${t.minutes}-${t.code}-l`}
                style={{
                  position: 'absolute',
                  left: `${pos}%`,
                  transform,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 11,
                  color: totalMinutes >= t.minutes ? 'var(--wc-base-800, #012B49)' : 'var(--wc-base-500, #8499AA)',
                  fontWeight: totalMinutes >= t.minutes ? 600 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {t.minutes}m · {t.code}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

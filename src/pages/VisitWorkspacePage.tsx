// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString, resolveId } from '@medplum/core';
import type { Consent, Encounter, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconLock,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconPhoneOff,
  IconShieldCheck,
  IconVideo,
  IconVideoOff,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

// CD-05 (Consent Management) isn't merged to main yet; duplicate the 12-month
// telehealth-chi consent check here. Once CD-05 lands this can be replaced with
// `import { evaluateConsentStatus } from './ConsentCapturePage'`.
const CONSENT_EXPIRATION_MONTHS = 12;
const isConsentValid = (consents: Consent[], now: number = Date.now()): boolean => {
  const active = consents
    .filter((c) => c.status === 'active')
    .filter((c) =>
      c.category?.some((cat) => cat.coding?.some((coding) => coding.code === 'telehealth-chi'))
    )
    .sort((a, b) => (b.dateTime ?? '').localeCompare(a.dateTime ?? ''));
  const latest = active[0];
  if (!latest?.dateTime) return false;
  const signedAt = new Date(latest.dateTime).getTime();
  const expiresAt = signedAt + CONSENT_EXPIRATION_MONTHS * 30 * 24 * 3600 * 1000;
  return expiresAt >= now;
};

type VisitPhase = 'checking' | 'blocked' | 'ready' | 'live' | 'paused' | 'ended' | 'error';

export interface Gap {
  /** ms since epoch when the gap started (pause / disconnect). */
  startedAt: number;
  /** ms since epoch when the gap ended (resume). undefined = gap still open. */
  endedAt?: number;
}

/**
 * Compute billable seconds for a visit: total elapsed time minus any paused/disconnected gaps.
 * Gaps still open at `now` are clamped to `now` so the live counter includes only the connected time.
 */
export const computeBillableSeconds = (
  startedAt: number,
  gaps: Gap[],
  endedAt: number | undefined,
  now: number
): number => {
  const end = endedAt ?? now;
  if (end <= startedAt) {
    return 0;
  }
  let gapMs = 0;
  for (const gap of gaps) {
    // Clamp the gap to the [startedAt, end] window so pre-start or post-end
    // junk doesn't double-count against billable time.
    const gapStart = Math.max(gap.startedAt, startedAt);
    const gapEnd = Math.min(gap.endedAt ?? end, end);
    if (gapEnd > gapStart) {
      gapMs += gapEnd - gapStart;
    }
  }
  const billableMs = Math.max(0, end - startedAt - gapMs);
  return Math.floor(billableMs / 1000);
};

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function VisitWorkspacePage(): JSX.Element {
  const { encounterId } = useParams<{ encounterId: string }>();
  const medplum = useMedplum();

  const [phase, setPhase] = useState<VisitPhase>('checking');
  const [encounter, setEncounter] = useState<Encounter | undefined>();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [consentOnFile, setConsentOnFile] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>();

  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [notes, setNotes] = useState('');

  const [startedAt, setStartedAt] = useState<number | undefined>();
  const [endedAt, setEndedAt] = useState<number | undefined>();
  const gapsRef = useRef<Gap[]>([]);
  const [tickNow, setTickNow] = useState<number>(Date.now());

  // Tick every second while the visit is live or paused so the counter updates.
  useEffect(() => {
    if (phase !== 'live' && phase !== 'paused') {
      return;
    }
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const load = useCallback(async () => {
    if (!encounterId) {
      setError('Missing encounter id');
      setPhase('error');
      return;
    }
    try {
      const enc = await medplum.readResource('Encounter', encounterId);
      setEncounter(enc);
      const patientId = resolveId(enc.subject);
      const [pat, consents] = await Promise.all([
        patientId ? medplum.readResource('Patient', patientId).catch(() => undefined) : Promise.resolve(undefined),
        patientId
          ? medplum
              .searchResources('Consent', `patient=Patient/${patientId}&_sort=-_lastUpdated&_count=20`)
              .catch(() => [] as Consent[])
          : Promise.resolve([] as Consent[]),
      ]);
      setPatient(pat);
      const ok = isConsentValid(consents);
      setConsentOnFile(ok);
      if (enc.status === 'finished') {
        setPhase('ended');
        setStartedAt(enc.period?.start ? new Date(enc.period.start).getTime() : undefined);
        setEndedAt(enc.period?.end ? new Date(enc.period.end).getTime() : undefined);
      } else if (!ok) {
        setPhase('blocked');
      } else {
        setPhase('ready');
      }
    } catch (err) {
      setError(normalizeErrorString(err));
      setPhase('error');
    }
  }, [encounterId, medplum]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const launchVisit = useCallback(async () => {
    if (!encounter || !consentOnFile) return;
    const now = Date.now();
    setStartedAt(now);
    setEndedAt(undefined);
    gapsRef.current = [];
    setPhase('live');
    try {
      await medplum.updateResource<Encounter>({
        ...encounter,
        status: 'in-progress',
        period: { ...(encounter.period ?? {}), start: new Date(now).toISOString() },
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [encounter, consentOnFile, medplum]);

  const togglePause = useCallback(() => {
    const now = Date.now();
    if (phase === 'live') {
      gapsRef.current = [...gapsRef.current, { startedAt: now }];
      setPhase('paused');
    } else if (phase === 'paused') {
      const gaps = [...gapsRef.current];
      const open = gaps[gaps.length - 1];
      if (open && !open.endedAt) {
        open.endedAt = now;
      }
      gapsRef.current = gaps;
      setPhase('live');
    }
  }, [phase]);

  const endVisit = useCallback(async () => {
    if (!encounter || !startedAt) return;
    const now = Date.now();
    // Close any dangling pause before finalizing.
    const gaps = [...gapsRef.current];
    const open = gaps[gaps.length - 1];
    if (open && !open.endedAt) {
      open.endedAt = now;
    }
    gapsRef.current = gaps;
    setEndedAt(now);
    setPhase('ended');
    const billableSec = computeBillableSeconds(startedAt, gaps, now, now);
    try {
      await medplum.updateResource<Encounter>({
        ...encounter,
        status: 'finished',
        period: {
          start: new Date(startedAt).toISOString(),
          end: new Date(now).toISOString(),
        },
        extension: [
          ...(encounter.extension ?? []),
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/visit-billable-seconds',
            valueInteger: billableSec,
          },
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/visit-notes',
            valueString: notes || undefined,
          },
        ].filter((e) => e.valueInteger !== undefined || e.valueString !== undefined),
      });
      showNotification({
        color: 'green',
        message: `Visit ended · ${formatDuration(billableSec)} billable`,
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [encounter, startedAt, notes, medplum]);

  const billableSec = useMemo(() => {
    if (!startedAt) return 0;
    return computeBillableSeconds(startedAt, gapsRef.current, endedAt, tickNow);
  }, [startedAt, endedAt, tickNow]);

  const patientName = patient
    ? `${patient.name?.[0]?.given?.join(' ') ?? ''} ${patient.name?.[0]?.family ?? ''}`.trim()
    : '—';

  if (phase === 'checking') {
    return (
      <Document>
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Document>
    );
  }

  if (phase === 'error') {
    return (
      <Document>
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Couldn't open visit workspace">
          <Text size="sm">{error ?? 'Encounter not found.'}</Text>
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        {/* Top strip */}
        <Card withBorder padding="sm" radius="md">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text fw={700} size="md" truncate>
                {encounter?.type?.[0]?.text ?? 'Visit'} · {patientName}
              </Text>
              <Group gap="xs">
                {consentOnFile ? (
                  <Badge color="green" variant="light" leftSection={<IconShieldCheck size={12} />}>
                    Consent on file
                  </Badge>
                ) : (
                  <Badge color="red" variant="light" leftSection={<IconLock size={12} />}>
                    Consent needed
                  </Badge>
                )}
                {phase === 'live' && <Badge color="blue" variant="filled">In progress</Badge>}
                {phase === 'paused' && <Badge color="yellow" variant="filled">Paused · reconnecting</Badge>}
                {phase === 'ended' && <Badge color="gray" variant="light">Ended</Badge>}
                {phase === 'ready' && <Badge color="cyan" variant="light">Ready to launch</Badge>}
                {phase === 'blocked' && <Badge color="red" variant="light">Launch blocked</Badge>}
                {(phase === 'live' || phase === 'paused' || phase === 'ended') && (
                  <Badge variant="outline" color="gray" ff="monospace">
                    Billable {formatDuration(billableSec)}
                  </Badge>
                )}
              </Group>
            </Stack>
            <Group gap="xs">
              {phase === 'ready' && (
                <Button color="blue" leftSection={<IconPhone size={16} />} onClick={launchVisit}>
                  Launch visit
                </Button>
              )}
              {phase === 'blocked' && (
                <Tooltip label="Capture consent at /consent before launching" withArrow>
                  <span tabIndex={0} style={{ display: 'inline-flex' }}>
                    <Button color="blue" leftSection={<IconPhone size={16} />} disabled>
                      Launch visit
                    </Button>
                  </span>
                </Tooltip>
              )}
              {(phase === 'live' || phase === 'paused') && (
                <Button
                  color="red"
                  leftSection={<IconPhoneOff size={16} />}
                  onClick={endVisit}
                  aria-label="End visit"
                >
                  End visit
                </Button>
              )}
            </Group>
          </Group>
        </Card>

        {phase === 'blocked' && (
          <Alert color="red" icon={<IconLock size={18} />} title="Visit-start blocked">
            <Text size="sm">
              No valid Telehealth + CHI consent on file. Capture it at <b>/consent</b> then return here to launch.
            </Text>
          </Alert>
        )}

        <Grid gutter="md">
          {/* Video pane (60%) */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card withBorder radius="md" padding={0} style={{ overflow: 'hidden', aspectRatio: '16 / 10' }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#0f1419',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {phase === 'ready' && (
                  <Stack align="center" gap="xs">
                    <IconPhone size={40} style={{ opacity: 0.7 }} />
                    <Text c="white" size="sm">
                      Ready. Click Launch visit to connect.
                    </Text>
                  </Stack>
                )}
                {phase === 'live' && (
                  <>
                    <Stack align="center" gap="xs">
                      <Badge color="green" variant="filled" size="lg">
                        Connected · vendor placeholder
                      </Badge>
                      <Text c="white" size="sm" opacity={0.75}>
                        Video feed would render here. Vendor selection (CD-06 §Open questions) blocks real build.
                      </Text>
                      <Text c="white" size="xs" opacity={0.5} ff="monospace">
                        1 remote · 1 local
                      </Text>
                    </Stack>
                    {/* Corner controls */}
                    <Group style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }} gap="xs">
                      <ActionIcon
                        variant="filled"
                        color={micOn ? 'gray' : 'red'}
                        onClick={() => setMicOn((v) => !v)}
                        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                        size="lg"
                        radius="xl"
                      >
                        {micOn ? <IconMicrophone size={18} /> : <IconMicrophoneOff size={18} />}
                      </ActionIcon>
                      <ActionIcon
                        variant="filled"
                        color={videoOn ? 'gray' : 'red'}
                        onClick={() => setVideoOn((v) => !v)}
                        aria-label={videoOn ? 'Stop camera' : 'Start camera'}
                        size="lg"
                        radius="xl"
                      >
                        {videoOn ? <IconVideo size={18} /> : <IconVideoOff size={18} />}
                      </ActionIcon>
                      <Button size="xs" variant="light" color="yellow" onClick={togglePause}>
                        Simulate reconnect
                      </Button>
                    </Group>
                    <Badge
                      style={{ position: 'absolute', top: 12, right: 12 }}
                      color="green"
                      variant="filled"
                      size="xs"
                    >
                      ● HD
                    </Badge>
                  </>
                )}
                {phase === 'paused' && (
                  <>
                    <Stack align="center" gap="xs">
                      <IconAlertTriangle size={32} color="var(--mantine-color-yellow-5)" />
                      <Text c="white" size="sm">
                        Reconnecting…
                      </Text>
                      <Text c="white" size="xs" opacity={0.6}>
                        Billable timer paused while disconnected.
                      </Text>
                    </Stack>
                    <Group style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
                      <Button size="xs" variant="light" color="green" onClick={togglePause}>
                        Resume
                      </Button>
                    </Group>
                  </>
                )}
                {phase === 'ended' && (
                  <Stack align="center" gap="xs">
                    <IconPhoneOff size={32} />
                    <Text c="white" size="sm">
                      Visit ended.
                    </Text>
                    <Text c="white" size="xs" opacity={0.6} ff="monospace">
                      Billable: {formatDuration(billableSec)}
                    </Text>
                  </Stack>
                )}
                {phase === 'blocked' && (
                  <Stack align="center" gap="xs">
                    <IconLock size={32} />
                    <Text c="white" size="sm">
                      Video disabled until consent is on file.
                    </Text>
                  </Stack>
                )}
              </div>
            </Card>
          </Grid.Col>

          {/* Notes pane (40%) */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder radius="md" padding="md" style={{ height: '100%' }}>
              <Stack gap="sm">
                <Title order={5}>Visit notes</Title>
                <Textarea
                  placeholder="Draft inline notes — persist to the encounter on End visit."
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                  autosize
                  minRows={8}
                  maxRows={16}
                  disabled={phase === 'ended' || phase === 'blocked'}
                />
                <Text size="xs" c="dimmed">
                  Plan of Care authoring (CD-08) replaces this textarea when that ticket lands.
                </Text>
                {phase === 'ended' && (
                  <Alert color="green" variant="light" title="Visit finalized">
                    <Text size="xs">
                      Encounter set to <span style={{ fontFamily: 'monospace' }}>finished</span>. Billable
                      duration <span style={{ fontFamily: 'monospace' }}>{formatDuration(billableSec)}</span>{' '}
                      persisted as an extension and flows to CD-17 time tracking.
                    </Text>
                    {startedAt && endedAt && (
                      <Text size="xs" c="dimmed" mt={4}>
                        {formatDateTime(new Date(startedAt).toISOString())} →{' '}
                        {formatDateTime(new Date(endedAt).toISOString())}
                      </Text>
                    )}
                  </Alert>
                )}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Document>
  );
}

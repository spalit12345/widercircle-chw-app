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
  Modal,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString, resolveId } from '@medplum/core';
import type { Consent, Encounter, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconCircle,
  IconCircleFilled,
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
import { ConsentBlock } from '../components/consent/ConsentBlock';
import { CONSENT_CATEGORY_CODE, evaluateConsentStatus, utf8ToBase64 } from './ConsentCapturePage';
import { emitAudit } from '../utils/audit';
import { getActiveCarePlanRef } from '../utils/care-plan-link';

const RECORDING_CATEGORY_CODE = 'call-recording';
const RECORDING_SCRIPT_VERSION = 'call-recording-v1';
const RECORDING_SCRIPT_TEXT = `This visit will be recorded for your care record. Wider Circle stores recordings securely and only your care team can access them. You can ask us to stop recording at any time, and your care does not depend on recording. Are you OK with the visit being recorded?`;

const isConsentValid = (consents: Consent[], now: number = Date.now()): boolean => {
  const filtered = consents.filter((c) =>
    c.category?.some((cat) => cat.coding?.some((coding) => coding.code === CONSENT_CATEGORY_CODE))
  );
  return evaluateConsentStatus(filtered, now).state === 'on-file';
};

const isRecordingConsentValid = (consents: Consent[], now: number = Date.now()): boolean => {
  const filtered = consents.filter((c) =>
    c.category?.some((cat) => cat.coding?.some((coding) => coding.code === RECORDING_CATEGORY_CODE))
  );
  return evaluateConsentStatus(filtered, now).state === 'on-file';
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
  const [recordingConsent, setRecordingConsent] = useState<boolean>(false);
  const [sdohHistory, setSdohHistory] = useState<QuestionnaireResponse[]>([]);
  const [pastVisits, setPastVisits] = useState<Encounter[]>([]);
  const [openSdohResponse, setOpenSdohResponse] = useState<QuestionnaireResponse | undefined>();
  const [recording, setRecording] = useState<boolean>(false);
  const [recordingPromptOpen, { open: openRecordingPrompt, close: closeRecordingPrompt }] = useDisclosure(false);
  const [recordingScriptRead, setRecordingScriptRead] = useState<boolean>(false);
  const [savingRecordingConsent, setSavingRecordingConsent] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>();
  // CD-08 AC-4 — encounter close requires an active Plan of Care. The gate
  // surfaces a confirmation modal instead of silently closing.
  const [closeGateOpen, { open: openCloseGate, close: closeCloseGate }] = useDisclosure(false);
  const [closeGateChecking, setCloseGateChecking] = useState(false);

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

      // Pull patient context, consents, and the visit-context history
      // (SDoH assessments + past encounters) in parallel. The visit-context
      // surfaces are read-only context for the Provider on the call.
      const [pat, consents, sdoh, prior] = await Promise.all([
        patientId ? medplum.readResource('Patient', patientId).catch(() => undefined) : Promise.resolve(undefined),
        patientId
          ? medplum
              .searchResources('Consent', `patient=Patient/${patientId}&_sort=-_lastUpdated&_count=20`)
              .catch(() => [] as Consent[])
          : Promise.resolve([] as Consent[]),
        patientId
          ? medplum
              .searchResources(
                'QuestionnaireResponse',
                `subject=Patient/${patientId}&questionnaire=https://widercircle.com/fhir/Questionnaire/sdoh-prapare-v1&_sort=-authored&_count=20`
              )
              .catch(() => [] as QuestionnaireResponse[])
          : Promise.resolve([] as QuestionnaireResponse[]),
        patientId
          ? medplum
              .searchResources(
                'Encounter',
                `subject=Patient/${patientId}&status=finished&_sort=-date&_count=20`
              )
              .catch(() => [] as Encounter[])
          : Promise.resolve([] as Encounter[]),
      ]);
      setPatient(pat);
      const ok = isConsentValid(consents);
      setConsentOnFile(ok);
      setRecordingConsent(isRecordingConsentValid(consents));
      setSdohHistory(sdoh);
      // Drop the current encounter from the past-visits list (the call we're
      // on isn't a "prior" encounter) and keep only ones that landed before
      // it started.
      setPastVisits(
        prior.filter((e) => e.id && e.id !== encounterId)
      );
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
      // CD-06 AC-5 — DA-13 audit emission on visit launch.
      void emitAudit(medplum, {
        action: 'visit.launched',
        patientRef: patient?.id
          ? { reference: `Patient/${patient.id}` }
          : undefined,
        encounterRef: encounter.id ? { reference: `Encounter/${encounter.id}` } : undefined,
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [encounter, consentOnFile, medplum, patient]);

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

  // CD-08 AC-4 — gate Encounter close on an active Plan of Care. If none, the
  // CHW/Provider can still close (some narratives need it) but the override is
  // captured as an audit event + flagged on the Encounter so billing knows.
  const finalizeVisit = useCallback(
    async (overridePlanGate = false) => {
      if (!encounter || !startedAt) return;
      const now = Date.now();
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
        const baseExtensions = [
          ...(encounter.extension ?? []),
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/visit-billable-seconds',
            valueInteger: billableSec,
          },
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/visit-notes',
            valueString: notes || undefined,
          },
        ].filter((e) => e.valueInteger !== undefined || e.valueString !== undefined);

        const closedWithoutPlanExtensions = overridePlanGate
          ? [
              ...baseExtensions,
              {
                url: 'https://widercircle.com/fhir/StructureDefinition/visit-closed-without-plan',
                valueBoolean: true,
              },
            ]
          : baseExtensions;

        await medplum.updateResource<Encounter>({
          ...encounter,
          status: 'finished',
          period: {
            start: new Date(startedAt).toISOString(),
            end: new Date(now).toISOString(),
          },
          extension: closedWithoutPlanExtensions,
        });
        showNotification({
          color: overridePlanGate ? 'yellow' : 'green',
          message: overridePlanGate
            ? `Visit ended without Plan of Care · ${formatDuration(billableSec)} flagged non-billable`
            : `Visit ended · ${formatDuration(billableSec)} billable`,
        });
        // CD-06 AC-5 — audit on visit end (always).
        void emitAudit(medplum, {
          action: 'visit.ended',
          patientRef: patient?.id ? { reference: `Patient/${patient.id}` } : undefined,
          encounterRef: encounter.id ? { reference: `Encounter/${encounter.id}` } : undefined,
          meta: { billableSeconds: billableSec, recording: recording },
        });
        // CD-08 AC-4 — separate audit when the Plan gate was overridden.
        if (overridePlanGate) {
          void emitAudit(medplum, {
            action: 'encounter.closed-without-plan',
            patientRef: patient?.id ? { reference: `Patient/${patient.id}` } : undefined,
            encounterRef: encounter.id ? { reference: `Encounter/${encounter.id}` } : undefined,
          });
        }
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [encounter, startedAt, notes, medplum, patient, recording]
  );

  const endVisit = useCallback(async () => {
    if (!encounter || !startedAt || !patient?.id) return;
    setCloseGateChecking(true);
    try {
      const planRef = await getActiveCarePlanRef(medplum, patient.id);
      if (planRef) {
        await finalizeVisit(false);
      } else {
        openCloseGate();
      }
    } finally {
      setCloseGateChecking(false);
    }
  }, [encounter, startedAt, patient, medplum, finalizeVisit, openCloseGate]);

  const confirmCloseWithoutPlan = useCallback(async () => {
    closeCloseGate();
    await finalizeVisit(true);
  }, [closeCloseGate, finalizeVisit]);

  const billableSec = useMemo(() => {
    if (!startedAt) return 0;
    return computeBillableSeconds(startedAt, gapsRef.current, endedAt, tickNow);
  }, [startedAt, endedAt, tickNow]);

  const patientName = patient
    ? `${patient.name?.[0]?.given?.join(' ') ?? ''} ${patient.name?.[0]?.family ?? ''}`.trim()
    : '—';

  // CD-06 AC-6: recording requires recording-consent. If not on file, prompt
  // the Provider to capture verbal recording consent before flipping the bit.
  const startRecordingClick = useCallback(() => {
    if (recording) {
      return;
    }
    if (recordingConsent) {
      setRecording(true);
      showNotification({ color: 'red', message: 'Recording started · ● REC' });
    } else {
      setRecordingScriptRead(false);
      openRecordingPrompt();
    }
  }, [recording, recordingConsent, openRecordingPrompt]);

  const stopRecording = useCallback(() => {
    setRecording(false);
    showNotification({ color: 'gray', message: 'Recording stopped' });
  }, []);

  const captureRecordingConsent = useCallback(async () => {
    if (!patient?.id || !recordingScriptRead) {
      return;
    }
    const profile = medplum.getProfile();
    const practitionerRef = profile ? `Practitioner/${profile.id}` : undefined;
    const practitionerLabel = profile
      ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
      : 'Clinician';
    const signedAt = new Date().toISOString();
    setSavingRecordingConsent(true);
    try {
      const consent: Consent = {
        resourceType: 'Consent',
        status: 'active',
        scope: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
        },
        category: [
          {
            coding: [
              {
                system: 'https://widercircle.com/fhir/CodeSystem/consent-category',
                code: RECORDING_CATEGORY_CODE,
                display: 'Call recording',
              },
            ],
          },
        ],
        patient: { reference: `Patient/${patient.id}`, display: patientName },
        policyRule: {
          coding: [
            {
              system: 'https://widercircle.com/fhir/CodeSystem/consent-policy',
              code: RECORDING_CATEGORY_CODE,
              display: 'Call recording attestation policy (v1)',
            },
          ],
        },
        dateTime: signedAt,
        performer: practitionerRef
          ? [{ reference: practitionerRef, display: practitionerLabel }]
          : undefined,
        sourceAttachment: {
          contentType: 'text/plain',
          title: `Verbal attestation — ${RECORDING_SCRIPT_VERSION}`,
          data: utf8ToBase64(
            `Script version: ${RECORDING_SCRIPT_VERSION}\nAttested by: ${practitionerLabel}\nTimestamp: ${signedAt}\nScript:\n${RECORDING_SCRIPT_TEXT}`
          ),
        },
        extension: [
          { url: 'https://widercircle.com/fhir/StructureDefinition/consent-method', valueString: 'verbal' },
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/consent-script-version',
            valueString: RECORDING_SCRIPT_VERSION,
          },
        ],
      };
      const saved = await medplum.createResource<Consent>(consent);
      setRecordingConsent(true);
      setRecording(true);
      closeRecordingPrompt();
      showNotification({ color: 'red', message: 'Recording consent captured · recording started' });
      // CD-06 AC-5 — audit on recording start with the recording-consent ref.
      void emitAudit(medplum, {
        action: 'visit.recording-started',
        patientRef: patient.id ? { reference: `Patient/${patient.id}` } : undefined,
        encounterRef: encounter?.id ? { reference: `Encounter/${encounter.id}` } : undefined,
        consentRef: saved.id ? { reference: `Consent/${saved.id}` } : undefined,
        meta: { scriptVersion: RECORDING_SCRIPT_VERSION, method: 'verbal' },
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSavingRecordingConsent(false);
    }
  }, [patient, patientName, recordingScriptRead, medplum, closeRecordingPrompt, encounter]);

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
                <Tooltip label="Capture consent below to enable launch" withArrow>
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
                  loading={closeGateChecking}
                  aria-label="End visit"
                >
                  End visit
                </Button>
              )}
            </Group>
          </Group>
        </Card>

        {phase === 'blocked' && patient?.id && (
          <ConsentBlock
            patientId={patient.id}
            patientLabel={patientName}
            hideVisitStartFooter
            onCaptured={() => {
              // Re-fetch consent + encounter; if consent now valid, phase flips to 'ready'.
              load().catch(console.error);
            }}
          />
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
                        Video feed would render here. Vendor selection blocks real build.
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
                      {recording ? (
                        <Button
                          size="xs"
                          variant="filled"
                          color="red"
                          leftSection={<IconCircle size={12} />}
                          onClick={stopRecording}
                          aria-label="Stop recording"
                        >
                          Stop recording
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          leftSection={<IconCircleFilled size={12} />}
                          onClick={startRecordingClick}
                          aria-label="Start recording"
                        >
                          Start recording
                        </Button>
                      )}
                      <Button size="xs" variant="light" color="yellow" onClick={togglePause}>
                        Simulate reconnect
                      </Button>
                    </Group>
                    <Badge
                      style={{ position: 'absolute', top: 12, right: 12 }}
                      color={recording ? 'red' : 'green'}
                      variant="filled"
                      size="xs"
                    >
                      {recording ? '● REC' : '● HD'}
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
                  Plan of Care authoring replaces this textarea when that feature lands.
                </Text>
                {phase === 'ended' && (
                  <Alert color="green" variant="light" title="Visit finalized">
                    <Text size="xs">
                      Encounter set to <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>finished</span>. Billable
                      duration <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{formatDuration(billableSec)}</span>{' '}
                      persisted as an extension and flows to time tracking.
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

        {/* Visit context — read-only history surfaces for the Provider on
            the call: prior SDoH screeners and prior closed encounters. */}
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card withBorder radius="md" padding="md" style={{ height: '100%' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Title order={5}>Recent SDoH assessments</Title>
                  <Badge variant="light" color="grape">{sdohHistory.length}</Badge>
                </Group>
                {sdohHistory.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    No SDoH assessments on file for this member yet.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {sdohHistory.slice(0, 5).map((qr) => {
                      const cases = (qr.extension ?? [])
                        .filter((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case')
                        .map((e) => e.valueString)
                        .filter((s): s is string => Boolean(s));
                      return (
                        <Group
                          key={qr.id}
                          justify="space-between"
                          p="xs"
                          wrap="nowrap"
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenSdohResponse(qr)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setOpenSdohResponse(qr);
                            }
                          }}
                          style={{
                            borderLeft: '3px solid var(--mantine-color-grape-5)',
                            paddingLeft: 8,
                            cursor: 'pointer',
                            borderRadius: 6,
                            transition: 'background .12s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--mantine-color-gray-0)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                            <Text size="sm" fw={600}>
                              {cases.length === 0
                                ? 'Screener · no risks triggered'
                                : `${cases.length} risk${cases.length === 1 ? '' : 's'} triggered`}
                            </Text>
                            {cases.length > 0 && (
                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {cases.join(' · ')}
                              </Text>
                            )}
                            <Text size="xs" c="dimmed">
                              {qr.author?.display ?? 'Unknown author'}
                            </Text>
                          </Stack>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {qr.authored ? formatDateTime(qr.authored) : '—'}
                          </Text>
                        </Group>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card withBorder radius="md" padding="md" style={{ height: '100%' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Title order={5}>Recent visits</Title>
                  <Badge variant="light">{pastVisits.length}</Badge>
                </Group>
                {pastVisits.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    No prior closed visits on file for this member.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {pastVisits.slice(0, 5).map((e) => {
                      const reason = e.reasonCode?.[0]?.text ?? e.type?.[0]?.text ?? e.type?.[0]?.coding?.[0]?.display;
                      const program = e.serviceType?.coding?.[0]?.display ?? e.serviceType?.coding?.[0]?.code;
                      const minutes = e.length?.value;
                      return (
                        <Group
                          key={e.id}
                          justify="space-between"
                          p="xs"
                          wrap="nowrap"
                          style={{ borderLeft: '3px solid var(--mantine-color-blue-5)', paddingLeft: 8 }}
                        >
                          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                            <Text size="sm" fw={600} lineClamp={1}>
                              {reason ?? 'Visit'}
                            </Text>
                            <Group gap={6}>
                              {program && (
                                <Badge size="xs" variant="light">
                                  {program}
                                </Badge>
                              )}
                              {typeof minutes === 'number' && (
                                <Text size="xs" c="dimmed" ff="monospace">
                                  {minutes} min
                                </Text>
                              )}
                              {e.participant?.[0]?.individual?.display && (
                                <Text size="xs" c="dimmed">
                                  {e.participant[0].individual.display}
                                </Text>
                              )}
                            </Group>
                          </Stack>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {e.period?.start ? formatDateTime(e.period.start) : '—'}
                          </Text>
                        </Group>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>

      {/* CD-08 AC-4: encounter close requires an active Plan of Care. The CHW
          can override (some narratives need it) but the override is captured
          as an audit event + flagged on the Encounter so billing can refuse. */}
      <Modal
        opened={closeGateOpen}
        onClose={closeCloseGate}
        title="No Plan of Care on file"
        size="md"
        centered
      >
        <Stack gap="md">
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">
              An active Plan of Care is required before you can close an Encounter and bill the
              member's time. This member has no active CarePlan.
            </Text>
            <Text size="xs" c="dimmed" mt="xs">
              You can author a Plan now from <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>/plan-of-care</span>{' '}
              or close anyway — the visit will be flagged{' '}
              <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>visit-closed-without-plan = true</span> and
              treated as non-billable.
            </Text>
          </Alert>
          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={closeCloseGate}>
              Stay in visit · author plan
            </Button>
            <Button color="red" onClick={confirmCloseWithoutPlan}>
              Close without plan
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* CD-06 AC-6: recording-consent prompt — gates Start recording when no
          call-recording consent is on file for this patient. */}
      <Modal
        opened={recordingPromptOpen}
        onClose={closeRecordingPrompt}
        title="Recording consent"
        size="md"
        centered
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconCircleFilled size={16} />}>
            <Text size="sm">
              Per CMS and WC policy, we cannot record this visit without the member's verbal consent.
              Read the script aloud, confirm the member said yes, then capture below.
            </Text>
          </Alert>
          <Card withBorder radius="md" padding="sm" style={{ background: 'var(--mantine-color-gray-0)' }}>
            <Stack gap="xs">
              <Text size="xs" fw={600} c="dimmed">
                Verbal recording script ·{' '}
                <span style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{RECORDING_SCRIPT_VERSION}</span>
              </Text>
              <Text size="sm">{RECORDING_SCRIPT_TEXT}</Text>
            </Stack>
          </Card>
          <Switch
            label="I read this script and the member consented to recording"
            checked={recordingScriptRead}
            onChange={(e) => setRecordingScriptRead(e.currentTarget.checked)}
            color="red"
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={closeRecordingPrompt} disabled={savingRecordingConsent}>
              Cancel — don't record
            </Button>
            <Button
              color="red"
              leftSection={<IconCircleFilled size={14} />}
              loading={savingRecordingConsent}
              disabled={!recordingScriptRead || savingRecordingConsent}
              onClick={captureRecordingConsent}
            >
              Capture consent &amp; start recording
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* SDoH detail — full Q&A from a prior assessment, opened from the
          "Recent SDoH assessments" panel above. Read-only. */}
      <Modal
        opened={!!openSdohResponse}
        onClose={() => setOpenSdohResponse(undefined)}
        title="SDoH assessment"
        size="lg"
        centered
      >
        {openSdohResponse && (
          <Stack gap="md">
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color="grape">
                {openSdohResponse.author?.display ?? 'Unknown author'}
              </Badge>
              <Badge variant="light">
                {openSdohResponse.authored ? formatDateTime(openSdohResponse.authored) : '—'}
              </Badge>
              {(() => {
                const cases = (openSdohResponse.extension ?? [])
                  .filter((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case')
                  .map((e) => e.valueString)
                  .filter((s): s is string => Boolean(s));
                if (cases.length === 0) {
                  return <Badge variant="light" color="gray">No risks triggered</Badge>;
                }
                return (
                  <Badge variant="light" color="yellow">
                    {cases.length} risk{cases.length === 1 ? '' : 's'} triggered
                  </Badge>
                );
              })()}
            </Group>

            {(() => {
              const cases = (openSdohResponse.extension ?? [])
                .filter((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case')
                .map((e) => e.valueString)
                .filter((s): s is string => Boolean(s));
              if (cases.length === 0) return null;
              return (
                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title="Triggered cases">
                  <Stack gap={2}>
                    {cases.map((c) => (
                      <Text key={c} size="xs" ff="monospace">
                        • {c}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              );
            })()}

            <Stack gap="md">
              {(openSdohResponse.item ?? []).map((section) => (
                <Card key={section.linkId ?? section.text} withBorder radius="md" padding="md">
                  <Stack gap="sm">
                    <Text fw={700} size="sm">
                      {section.text ?? section.linkId}
                    </Text>
                    {(section.item ?? []).length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No questions answered in this section.
                      </Text>
                    ) : (
                      <Stack gap="xs">
                        {(section.item ?? []).map((q) => {
                          const answers = (q.answer ?? [])
                            .map((a) => a.valueString ?? a.valueCoding?.display ?? a.valueCoding?.code)
                            .filter((v): v is string => Boolean(v));
                          return (
                            <Stack
                              key={q.linkId ?? q.text}
                              gap={2}
                              p="xs"
                              style={{
                                borderLeft: '3px solid var(--mantine-color-grape-3)',
                                paddingLeft: 10,
                              }}
                            >
                              <Text size="xs" c="dimmed">
                                {q.text ?? q.linkId}
                              </Text>
                              {answers.length === 0 ? (
                                <Text size="sm" c="dimmed" fs="italic">
                                  Not answered
                                </Text>
                              ) : (
                                <Text size="sm" fw={600}>
                                  {answers.join(' · ')}
                                </Text>
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Card>
              ))}
              {(openSdohResponse.item ?? []).length === 0 && (
                <Text size="sm" c="dimmed">
                  This assessment has no recorded answers.
                </Text>
              )}
            </Stack>
          </Stack>
        )}
      </Modal>
    </Document>
  );
}

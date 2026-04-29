// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Loader, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CarePlan, Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconLock, IconLockOpen, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export type ReviewState = 'draft' | 'submitted' | 'approved' | 'revision-requested';

// Task.businessStatus carries the review state. Task.intent='proposal' + focus=CarePlan/{id}
// makes this a supervision task referencing the plan under review.
const REVIEW_TASK_CODE = 'plan-review-submission';

export const isPlanLocked = (state: ReviewState): boolean => state === 'submitted' || state === 'approved';

export const nextCycle = (submissions: Task[]): number => {
  const cycles = submissions
    .map((t) => t.extension?.find((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/review-cycle')?.valueInteger)
    .filter((n): n is number => typeof n === 'number');
  return (cycles.length === 0 ? 0 : Math.max(...cycles)) + 1;
};

export const latestReviewState = (submissions: Task[]): ReviewState => {
  const sorted = [...submissions].sort((a, b) => (b.authoredOn ?? '').localeCompare(a.authoredOn ?? ''));
  const latest = sorted[0];
  if (!latest) return 'draft';
  const code = latest.businessStatus?.coding?.[0]?.code;
  if (code === 'submitted' || code === 'approved' || code === 'revision-requested') return code;
  return 'draft';
};

export function SubmitForReviewPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();
  const [searchParams] = useSearchParams();
  const initialPatient = searchParams.get('patient') ?? '';
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [plan, setPlan] = useState<CarePlan | undefined>();
  const [submissions, setSubmissions] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');

  useEffect(() => {
    medplum
      .searchResources('Patient', '_count=50&_sort=-_lastUpdated')
      .then((results) =>
        setPatients(results.map((p: Patient) => ({
          value: p.id ?? '',
          label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        })))
      )
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setLoading(false));
  }, [medplum]);

  const loadPlanAndSubmissions = useCallback(async (patientId: string) => {
    if (!patientId) {
      setPlan(undefined);
      setSubmissions([]);
      return;
    }
    try {
      const [plans, tasks] = await Promise.all([
        medplum.searchResources('CarePlan', `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=1`),
        medplum.searchResources('Task', `patient=Patient/${patientId}&code=${REVIEW_TASK_CODE}&_sort=-_lastUpdated&_count=20`),
      ]);
      setPlan(plans[0]);
      setSubmissions(tasks);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum]);

  useEffect(() => {
    loadPlanAndSubmissions(selectedPatient).catch(console.error);
  }, [selectedPatient, loadPlanAndSubmissions]);

  const state = useMemo(() => latestReviewState(submissions), [submissions]);
  const locked = isPlanLocked(state);
  const cycleNumber = useMemo(() => nextCycle(submissions), [submissions]);

  const submitForReview = useCallback(async () => {
    if (!plan?.id || !selectedPatient || !profile) return;
    setSubmitting(true);
    try {
      const task: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'proposal',
        code: {
          coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/task-code', code: REVIEW_TASK_CODE }],
          text: 'Plan of Care — submit for Provider review',
        },
        businessStatus: {
          coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/review-state', code: 'submitted' }],
          text: 'Submitted · awaiting Provider response',
        },
        focus: { reference: `CarePlan/${plan.id}` },
        for: { reference: `Patient/${selectedPatient}` },
        requester: { reference: `Practitioner/${profile.id}`, display: `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician' },
        authoredOn: new Date().toISOString(),
        extension: [
          { url: 'https://widercircle.com/fhir/StructureDefinition/review-cycle', valueInteger: cycleNumber },
        ],
      };
      await medplum.createResource<Task>(task);
      showNotification({ color: 'green', message: `Submitted for Provider review · cycle ${cycleNumber}` });
      await loadPlanAndSubmissions(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSubmitting(false);
    }
  }, [plan, selectedPatient, profile, cycleNumber, medplum, loadPlanAndSubmissions]);

  const requestRevision = useCallback(async () => {
    if (!submissions[0]?.id || !profile) return;
    const latest = submissions[0];
    setSubmitting(true);
    try {
      const updated: Task = {
        ...latest,
        businessStatus: {
          coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/review-state', code: 'revision-requested' }],
          text: 'Revision requested',
        },
        status: 'rejected',
        note: [...(latest.note ?? []), { text: revisionNote || 'Revision requested', authorReference: { reference: `Practitioner/${profile.id}` }, time: new Date().toISOString() }],
      };
      await medplum.updateResource<Task>(updated);
      showNotification({ color: 'yellow', message: 'Revision requested · lock released, cycle will increment on re-submit' });
      setRevisionNote('');
      await loadPlanAndSubmissions(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSubmitting(false);
    }
  }, [submissions, profile, revisionNote, medplum, loadPlanAndSubmissions, selectedPatient]);

  const approve = useCallback(async () => {
    if (!submissions[0]?.id) return;
    const latest = submissions[0];
    setSubmitting(true);
    try {
      const updated: Task = {
        ...latest,
        businessStatus: {
          coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/review-state', code: 'approved' }],
          text: 'Approved — lock retained for audit',
        },
        status: 'completed',
      };
      await medplum.updateResource<Task>(updated);
      showNotification({ color: 'green', message: 'Approved · lock retained per AC-2' });
      await loadPlanAndSubmissions(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSubmitting(false);
    }
  }, [submissions, medplum, loadPlanAndSubmissions, selectedPatient]);

  if (loading) return <Document><Loader /></Document>;

  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Provider review submission</Title>
          <Text c="dimmed" size="sm">Submit the Plan of Care for sign-off. Draft → Submitted → Approved | Revision Requested. Lock enforced on Submitted + Approved (AC-1, AC-2).</Text>
        </Stack>

        <Select label="Member" placeholder="Pick a member" data={patients} value={selectedPatient} onChange={(v) => setSelectedPatient(v ?? '')} searchable required />

        {selectedPatient && !plan && (
          <Alert color="yellow" variant="light" title="No plan to submit">
            <Text size="sm">This member has no Plan of Care yet. Author one via /plan-of-care (CD-08) first.</Text>
          </Alert>
        )}

        {plan && (
          <>
            <Card withBorder radius="md" padding="md" style={{ borderColor: locked ? 'var(--mantine-color-red-4)' : undefined }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Title order={5}>Current state</Title>
                  <Badge
                    color={state === 'approved' ? 'green' : state === 'submitted' ? 'blue' : state === 'revision-requested' ? 'yellow' : 'gray'}
                    variant="filled"
                    leftSection={locked ? <IconLock size={12} /> : <IconLockOpen size={12} />}
                  >
                    {state.toUpperCase().replace('-', ' ')}
                  </Badge>
                </Group>
                {locked ? (
                  <Alert color={state === 'approved' ? 'green' : 'blue'} variant="light" icon={<IconLock size={16} />}>
                    <Text size="sm">
                      Plan is <b>locked</b>.{' '}
                      {state === 'submitted'
                        ? 'Editing blocked until Provider approves or requests revision.'
                        : 'Lock retained after approval for audit/billing (AC-2).'}
                    </Text>
                  </Alert>
                ) : (
                  <Text size="sm" c="dimmed">Plan is editable. Cycle {cycleNumber} ready to submit.</Text>
                )}
              </Stack>
            </Card>

            <Group>
              {state === 'draft' || state === 'revision-requested' ? (
                <Button color="blue" leftSection={<IconSend size={16} />} onClick={submitForReview} loading={submitting} disabled={!plan}>
                  Submit for Provider review · cycle {cycleNumber}
                </Button>
              ) : state === 'submitted' ? (
                <>
                  <Button color="green" onClick={approve} loading={submitting} leftSection={<IconCheck size={16} />}>
                    Approve (Provider)
                  </Button>
                  <Button color="yellow" onClick={requestRevision} loading={submitting} variant="light">
                    Request revision
                  </Button>
                </>
              ) : null}
            </Group>

            {state === 'submitted' && (
              <Card withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Text size="sm" fw={600}>Revision note (optional)</Text>
                  <Textarea value={revisionNote} onChange={(e) => setRevisionNote(e.currentTarget.value)} placeholder="What needs to change?" autosize minRows={2} />
                </Stack>
              </Card>
            )}

            {submissions.length > 0 && (
              <Card withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={5}>Cycle history</Title>
                    <Badge variant="light">{submissions.length}</Badge>
                  </Group>
                  <Stack gap="xs">
                    {submissions.slice(0, 10).map((s) => {
                      const code = s.businessStatus?.coding?.[0]?.code ?? 'draft';
                      const cycle = s.extension?.find((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/review-cycle')?.valueInteger;
                      return (
                        <Group key={s.id} justify="space-between" p="xs" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                          <Group gap="sm">
                            <Badge variant="light" ff="monospace">cycle {cycle ?? '?'}</Badge>
                            <Badge color={code === 'approved' ? 'green' : code === 'submitted' ? 'blue' : 'yellow'} variant="light" size="sm">
                              {code}
                            </Badge>
                            <Text size="xs" c="dimmed">{s.requester?.display ?? ''}</Text>
                          </Group>
                          <Text size="xs" c="dimmed" ff="monospace">{s.authoredOn ? formatDateTime(s.authoredOn) : ''}</Text>
                        </Group>
                      );
                    })}
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

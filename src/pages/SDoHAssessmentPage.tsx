// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Chip,
  CopyButton,
  Group,
  Modal,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Patient, QuestionnaireResponse, QuestionnaireResponseItem, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconCheck, IconCopy, IconHeartHandshake, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { emitAudit } from '../utils/audit';

// CD-19 / CM-21 — SDoH-triggered Tasks must match the case-management coding
// the member-profile "Open cases" card searches for (see MemberContextPage).
const CASE_CATEGORY_SYSTEM = 'https://widercircle.com/fhir/CodeSystem/task-category';
const CASE_CATEGORY_CODE = 'case-management';
const CASE_TYPE_EXT = 'https://widercircle.com/fhir/StructureDefinition/case-type';

// Map an SDoH risk caseType (free-text from the rules above) to the case-type
// code shared with manual case creation, so SDoH-triggered cases render with
// the same label and grouping. Unknown caseTypes pass through verbatim — the
// card falls back to the raw string.
const sdohCaseTypeToCategory = (caseType: string): string => {
  const lower = caseType.toLowerCase();
  if (lower.includes('food')) return 'sdoh-food';
  if (lower.includes('housing')) return 'sdoh-housing';
  if (lower.includes('transport')) return 'sdoh-transportation';
  if (lower.includes('utilit')) return 'sdoh-utilities';
  return caseType;
};

type QuestionType = 'single' | 'multi' | 'scale' | 'text';
type RiskRule = { answer: string; caseType: string };
// CD-19 AC-3 — branching: a follow-up question reveals when one of the listed
// `whenAnswers` is the chosen answer to the parent question.
export interface SdohBranch {
  whenAnswers: string[];
  follow: SdohQuestion;
}

export interface SdohQuestion {
  id: string;
  text: string;
  helper?: string;
  type: QuestionType;
  options?: string[];
  risks?: RiskRule[];
  branches?: SdohBranch[];
}

export interface SdohSection {
  id: string;
  title: string;
  questions: SdohQuestion[];
}

// PRAPARE-aligned default assessment. Real deployment loads Survey Definition
// from admin config per CD-19 §Data model; this static copy is the v1 default.
export const DEFAULT_SDOH_SECTIONS: SdohSection[] = [
  {
    id: 'food',
    title: 'Food',
    questions: [
      {
        id: 'food_worry',
        text: 'In the past 12 months, did you worry that food would run out before you could buy more?',
        type: 'single',
        options: ['Never', 'Sometimes', 'Often'],
        risks: [
          { answer: 'Sometimes', caseType: 'Food insecurity follow-up' },
          { answer: 'Often', caseType: 'Food insecurity follow-up' },
        ],
      },
      {
        id: 'food_stretched',
        text: 'In the past 12 months, did the food you bought just not last and you did not have money to get more?',
        type: 'single',
        options: ['Never', 'Sometimes', 'Often'],
        risks: [{ answer: 'Often', caseType: 'Food insecurity follow-up' }],
      },
    ],
  },
  {
    id: 'housing',
    title: 'Housing',
    questions: [
      {
        id: 'housing_current',
        text: 'What is your housing situation today?',
        type: 'single',
        options: ['I have housing', 'I have housing but worried about losing it', 'I do not have housing'],
        risks: [
          { answer: 'I have housing but worried about losing it', caseType: 'Housing instability' },
          { answer: 'I do not have housing', caseType: 'Housing crisis' },
        ],
        // CD-19 AC-3 — branching: when the member is worried about losing
        // housing or doesn't have housing, ask the follow-up so the CHW can
        // route the right Housing case (eviction prevention vs shelter
        // placement). Hidden when housing is stable.
        branches: [
          {
            whenAnswers: ['I have housing but worried about losing it', 'I do not have housing'],
            follow: {
              id: 'housing_duration',
              text: 'How long has housing been unstable for you?',
              type: 'single',
              options: ['Less than 30 days', '1–3 months', '3–12 months', 'More than a year'],
              risks: [
                { answer: 'More than a year', caseType: 'Long-term housing case' },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'transportation',
    title: 'Transportation',
    questions: [
      {
        id: 'transport_missed',
        text: 'In the past 12 months, has a lack of reliable transportation kept you from medical appointments, meetings, work, or getting things needed for daily living?',
        type: 'single',
        options: ['No', 'Yes'],
        risks: [{ answer: 'Yes', caseType: 'Transportation assistance' }],
      },
    ],
  },
  {
    id: 'utilities',
    title: 'Utilities',
    questions: [
      {
        id: 'utilities_cutoff',
        text: 'In the past 12 months, has the electric, gas, oil, or water company threatened to shut off services in your home?',
        type: 'single',
        options: ['No', 'Yes, already shut off', 'Yes'],
        risks: [
          { answer: 'Yes', caseType: 'Utilities assistance' },
          { answer: 'Yes, already shut off', caseType: 'Utilities crisis' },
        ],
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safety',
    questions: [
      {
        id: 'safety_home',
        text: 'Do you feel physically and emotionally safe where you currently live?',
        type: 'single',
        options: ['Yes', 'Unsure', 'No'],
        risks: [
          { answer: 'Unsure', caseType: 'Safety check-in' },
          { answer: 'No', caseType: 'Safety urgent — IPV screening' },
        ],
      },
    ],
  },
  {
    id: 'employment',
    title: 'Employment & Income',
    questions: [
      {
        id: 'employment_status',
        text: 'What is your current employment situation?',
        type: 'multi',
        options: ['Employed full-time', 'Employed part-time', 'Retired', 'Unemployed', 'Disabled', 'Student', 'Caregiving'],
      },
    ],
  },
  {
    id: 'family',
    title: 'Family & support',
    questions: [
      {
        id: 'support_strength',
        text: 'How often do you feel you have someone you can rely on for help?',
        type: 'scale',
        options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        risks: [
          { answer: 'Never', caseType: 'Social isolation follow-up' },
          { answer: 'Rarely', caseType: 'Social isolation follow-up' },
        ],
      },
      {
        id: 'notes',
        text: 'Anything else we should know? (optional)',
        type: 'text',
      },
    ],
  },
];

type Answers = Record<string, string | string[] | undefined>;

// CD-19 AC-3 — return the questions that are *currently visible* given the
// answers, walking branches whose whenAnswers match the parent's answer.
export const visibleQuestions = (questions: SdohQuestion[], answers: Answers): SdohQuestion[] => {
  const out: SdohQuestion[] = [];
  for (const q of questions) {
    out.push(q);
    if (!q.branches) continue;
    const a = answers[q.id];
    const values = Array.isArray(a) ? a : a ? [a] : [];
    for (const branch of q.branches) {
      if (values.some((v) => branch.whenAnswers.includes(v))) {
        out.push(...visibleQuestions([branch.follow], answers));
      }
    }
  }
  return out;
};

export const triggeredCases = (sections: SdohSection[], answers: Answers): string[] => {
  const cases: string[] = [];
  for (const section of sections) {
    for (const q of visibleQuestions(section.questions, answers)) {
      if (!q.risks) continue;
      const answer = answers[q.id];
      if (!answer) continue;
      const values = Array.isArray(answer) ? answer : [answer];
      for (const v of values) {
        const hit = q.risks.find((r) => r.answer === v);
        if (hit && !cases.includes(hit.caseType)) {
          cases.push(hit.caseType);
        }
      }
    }
  }
  return cases;
};

export const totalQuestions = (sections: SdohSection[], answers: Answers): number =>
  sections.reduce((n, s) => n + visibleQuestions(s.questions, answers).length, 0);

export const answeredCount = (sections: SdohSection[], answers: Answers): number => {
  let n = 0;
  for (const section of sections) {
    for (const q of visibleQuestions(section.questions, answers)) {
      const a = answers[q.id];
      if (Array.isArray(a) ? a.length > 0 : typeof a === 'string' && a.length > 0) {
        n += 1;
      }
    }
  }
  return n;
};

export const isAnswerHighRisk = (question: SdohQuestion, answer: string | string[] | undefined): boolean => {
  if (!answer || !question.risks) return false;
  const values = Array.isArray(answer) ? answer : [answer];
  return values.some((v) => question.risks?.some((r) => r.answer === v));
};

const buildQuestionnaireResponse = (
  patientId: string,
  patientLabel: string,
  practitionerRef: string | undefined,
  practitionerLabel: string,
  sections: SdohSection[],
  answers: Answers,
  startedAt: string,
  submittedAt: string
): QuestionnaireResponse => {
  const items: QuestionnaireResponseItem[] = sections.map((section) => ({
    linkId: section.id,
    text: section.title,
    item: visibleQuestions(section.questions, answers).map((q) => {
      const a = answers[q.id];
      const values = Array.isArray(a) ? a : a ? [a] : [];
      return {
        linkId: q.id,
        text: q.text,
        answer: values.map((v) => ({ valueString: v })),
      };
    }),
  }));

  const triggered = triggeredCases(sections, answers);

  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    authored: submittedAt,
    subject: { reference: `Patient/${patientId}`, display: patientLabel },
    author: practitionerRef
      ? { reference: practitionerRef, display: practitionerLabel }
      : { display: practitionerLabel },
    questionnaire: 'https://widercircle.com/fhir/Questionnaire/sdoh-prapare-v1',
    item: items,
    extension: [
      {
        url: 'https://widercircle.com/fhir/StructureDefinition/sdoh-started-at',
        valueDateTime: startedAt,
      },
      ...triggered.map((caseType) => ({
        url: 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case',
        valueString: caseType,
      })),
    ],
  };
};

export function SDoHAssessmentPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();

  // Deep-link from member profile: `/sdoh?patient=<id>` pre-selects the
  // member so the CHW lands on the assessment ready to administer.
  const [searchParams] = useSearchParams();
  const initialPatient = searchParams.get('patient') ?? '';

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedResponse, setSubmittedResponse] = useState<QuestionnaireResponse | undefined>();
  const [startedAt] = useState<string>(() => new Date().toISOString());
  const [shareOpened, { open: openShare, close: closeShare }] = useDisclosure(false);

  // CD-19 §3.1 — preferred path: patient fills on their phone via the public
  // link. CHW-fill is the fallback when the member isn't reachable. Both
  // submit the same QuestionnaireResponse downstream.
  const publicLink = selectedPatient
    ? `${window.location.origin}/public/sdoh/${selectedPatient}`
    : '';
  const smsBody = publicLink
    ? `Hi, this is your Wider Circle care team. Please take a quick health check-in here: ${publicLink}`
    : '';

  const sections = DEFAULT_SDOH_SECTIONS;
  const total = totalQuestions(sections, answers);
  const answered = answeredCount(sections, answers);
  const triggered = useMemo(() => triggeredCases(sections, answers), [sections, answers]);

  useEffect(() => {
    const patientLabel = (p: Patient): string =>
      `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient';

    Promise.all([
      medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated'),
      // If we landed via a deep-link, make sure that specific patient is in
      // the dropdown even if they aren't in the recent-50 list.
      initialPatient
        ? medplum.readResource('Patient', initialPatient).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
      .then(([results, deepLinked]) => {
        const list = results.map((p: Patient) => ({ value: p.id ?? '', label: patientLabel(p) }));
        if (deepLinked?.id && !list.some((p) => p.value === deepLinked.id)) {
          list.unshift({ value: deepLinked.id, label: patientLabel(deepLinked) });
        }
        setPatients(list);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, initialPatient]);

  const setAnswer = useCallback((qId: string, value: string | string[] | undefined) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (!selectedPatient) {
      return;
    }
    setSubmitting(true);
    try {
      const patientLabel = patients.find((p) => p.value === selectedPatient)?.label ?? '';
      const practitionerRef = profile ? `Practitioner/${profile.id}` : undefined;
      const practitionerLabel = profile
        ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
        : 'Clinician';

      const payload = buildQuestionnaireResponse(
        selectedPatient,
        patientLabel,
        practitionerRef,
        practitionerLabel,
        sections,
        answers,
        startedAt,
        new Date().toISOString()
      );
      const saved = await medplum.createResource<QuestionnaireResponse>(payload);
      // CD-19 AC-2 — auto-create a Task per triggered risk so the case shows up
      // in the CHW queue (delegates to CM-21 for full Case resource in v2).
      const taskCreations = await Promise.all(
        triggered.map((caseType) =>
          medplum
            .createResource<Task>({
              resourceType: 'Task',
              status: 'requested',
              intent: 'order',
              priority: caseType.toLowerCase().includes('crisis') ? 'urgent' : 'routine',
              code: {
                coding: [
                  {
                    system: CASE_CATEGORY_SYSTEM,
                    code: CASE_CATEGORY_CODE,
                    display: 'Case management',
                  },
                ],
                text: caseType,
              },
              description: `SDoH risk-triggered: ${caseType}`,
              focus: saved.id ? { reference: `QuestionnaireResponse/${saved.id}` } : undefined,
              for: { reference: `Patient/${selectedPatient}`, display: patientLabel },
              requester: practitionerRef ? { reference: practitionerRef, display: practitionerLabel } : undefined,
              authoredOn: new Date().toISOString(),
              extension: [{ url: CASE_TYPE_EXT, valueString: sdohCaseTypeToCategory(caseType) }],
            })
            .then((t) => ({ ok: true as const, task: t, caseType }))
            .catch((err) => ({ ok: false as const, err, caseType }))
        )
      );
      const created = taskCreations.filter((r) => r.ok).length;
      const failed = taskCreations.length - created;
      setSubmittedResponse(saved);
      // CD-19 AC-6 — DA-13 audit on submit + per triggered case.
      const patientRef = { reference: `Patient/${selectedPatient}`, display: patientLabel };
      void emitAudit(medplum, {
        action: 'sdoh.submitted',
        patientRef,
        questionnaireResponseRef: saved.id
          ? { reference: `QuestionnaireResponse/${saved.id}` }
          : undefined,
        meta: { triggeredCount: triggered.length, answeredCount: Object.keys(answers).length },
      });
      for (const result of taskCreations) {
        if (result.ok) {
          void emitAudit(medplum, {
            action: 'sdoh.case-triggered',
            patientRef,
            taskRef: result.task.id ? { reference: `Task/${result.task.id}` } : undefined,
            meta: { caseType: result.caseType },
          });
        }
      }
      showNotification({
        color: failed > 0 ? 'yellow' : 'green',
        message:
          failed > 0
            ? `Assessment submitted · ${created} of ${taskCreations.length} cases created (${failed} failed)`
            : `Assessment submitted · ${created} case${created === 1 ? '' : 's'} created in your queue`,
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSubmitting(false);
    }
  }, [selectedPatient, patients, profile, sections, answers, startedAt, medplum, triggered.length]);

  const startOver = useCallback(() => {
    setSubmittedResponse(undefined);
    setAnswers({});
    setSelectedPatient('');
  }, []);

  if (submittedResponse) {
    const submittedCases = submittedResponse.extension
      ?.filter((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case')
      .map((e) => e.valueString)
      .filter((s): s is string => Boolean(s)) ?? [];
    const submittedPatientId = submittedResponse.subject?.reference?.split('/')[1];
    const submittedPatientLabel = submittedResponse.subject?.display ?? 'this member';
    return (
      <Document>
        <Stack gap="lg">
          <Alert color="green" icon={<IconCheck size={20} />} title="Assessment submitted">
            <Text size="sm">
              Submitted {submittedResponse.authored ? formatDateTime(submittedResponse.authored) : ''} for{' '}
              {submittedPatientId ? (
                <Anchor component={Link} to={`/members/${submittedPatientId}`} fw={700} c="inherit" underline="hover">
                  {submittedPatientLabel}
                </Anchor>
              ) : (
                <b>{submittedPatientLabel}</b>
              )}
              .
            </Text>
            <Text size="sm" mt="xs">
              {submittedCases.length === 0
                ? 'No risk thresholds crossed. No follow-up cases created.'
                : `${submittedCases.length} case${submittedCases.length === 1 ? '' : 's'} triggered and routed to your queue.`}
            </Text>
            {submittedCases.length > 0 && (
              <Stack gap={2} mt="xs">
                {submittedCases.map((c) => (
                  <Text key={c} size="xs" ff="monospace">
                    • {c}
                  </Text>
                ))}
              </Stack>
            )}
          </Alert>
          <Group>
            <Button onClick={startOver}>Start another assessment</Button>
          </Group>
        </Stack>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="lg">
        {/* Sticky header strip */}
        <Card withBorder radius="md" padding="md" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <IconHeartHandshake size={20} color="var(--mantine-color-grape-7)" />
                <Title order={4} style={{ minWidth: 0 }}>
                  SDoH Assessment
                </Title>
              </Group>
              <Text size="xs" c="dimmed" ff="monospace">
                Question {answered} of {total}
              </Text>
            </Group>
            <Progress value={total === 0 ? 0 : (answered / total) * 100} size="sm" color="grape" />
          </Stack>
        </Card>

        <Group align="flex-end" gap="sm" wrap="nowrap">
          <Select
            label="Member"
            placeholder="Pick a member"
            data={patients}
            value={selectedPatient}
            onChange={(v) => setSelectedPatient(v ?? '')}
            searchable
            required
            style={{ flex: 1 }}
          />
          <Button
            variant="light"
            color="grape"
            leftSection={<IconSend size={14} />}
            disabled={!selectedPatient}
            onClick={openShare}
          >
            Send link to member
          </Button>
        </Group>

        <Alert color="blue" variant="light" icon={<IconHeartHandshake size={16} />}>
          <Text size="sm">
            <b>Preferred path:</b> send the assessment link to the member by SMS so they fill it on their phone (CD-19 §3.1). CHW-fill below is the fallback when the member is unreachable.
          </Text>
        </Alert>

        {sections.map((section) => (
          <Card key={section.id} withBorder radius="md" padding="md">
            <Title order={5} mb="sm">
              {section.title}
            </Title>
            <Stack gap="md">
              {visibleQuestions(section.questions, answers).map((q) => {
                const answer = answers[q.id];
                const highRisk = isAnswerHighRisk(q, answer);
                return (
                  <Stack
                    key={q.id}
                    gap="xs"
                    p="xs"
                    style={{
                      borderLeft: highRisk ? '4px solid var(--mantine-color-yellow-5)' : '4px solid transparent',
                      paddingLeft: '12px',
                    }}
                  >
                    <Text size="sm" fw={600}>
                      {q.text}
                    </Text>
                    {q.type === 'single' && q.options && (
                      <Chip.Group value={(answer as string) ?? ''} onChange={(v) => setAnswer(q.id, v as string)}>
                        <Group gap="xs">
                          {q.options.map((opt) => (
                            <Chip key={opt} value={opt} color="grape">
                              {opt}
                            </Chip>
                          ))}
                        </Group>
                      </Chip.Group>
                    )}
                    {q.type === 'multi' && q.options && (
                      <Chip.Group
                        multiple
                        value={Array.isArray(answer) ? answer : []}
                        onChange={(v) => setAnswer(q.id, v as string[])}
                      >
                        <Group gap="xs">
                          {q.options.map((opt) => (
                            <Chip key={opt} value={opt} color="grape">
                              {opt}
                            </Chip>
                          ))}
                        </Group>
                      </Chip.Group>
                    )}
                    {q.type === 'scale' && q.options && (
                      <Group gap="xs">
                        {q.options.map((opt, idx) => (
                          <Button
                            key={opt}
                            size="xs"
                            variant={answer === opt ? 'filled' : 'light'}
                            color="grape"
                            onClick={() => setAnswer(q.id, opt)}
                            aria-pressed={answer === opt}
                          >
                            {idx + 1} · {opt}
                          </Button>
                        ))}
                      </Group>
                    )}
                    {q.type === 'text' && (
                      <Textarea
                        placeholder="Type an answer"
                        value={(answer as string) ?? ''}
                        onChange={(e) => setAnswer(q.id, e.currentTarget.value || undefined)}
                        minRows={2}
                      />
                    )}
                    {highRisk && (
                      <Badge color="yellow" leftSection={<IconAlertTriangle size={12} />} variant="light" size="sm">
                        This answer will open a case
                      </Badge>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Card>
        ))}

        <Card withBorder radius="md" padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>Review & submit</Title>
              <Badge color={triggered.length > 0 ? 'yellow' : 'gray'} variant="light">
                {triggered.length} case{triggered.length === 1 ? '' : 's'} queued
              </Badge>
            </Group>
            {triggered.length > 0 && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm">
                  {triggered.length} follow-up case{triggered.length === 1 ? '' : 's'} will be created on submit:
                </Text>
                <Stack gap={2} mt="xs">
                  {triggered.map((c) => (
                    <Text key={c} size="xs" ff="monospace">
                      • {c}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
            <Group>
              <Button
                size="md"
                color="grape"
                onClick={submit}
                loading={submitting}
                disabled={!selectedPatient || answered === 0}
              >
                Submit assessment
              </Button>
              <Text size="xs" c="dimmed">
                {answered}/{total} answered
              </Text>
            </Group>
          </Stack>
        </Card>
      </Stack>

      <Modal opened={shareOpened} onClose={closeShare} title="Send assessment to member" size="md">
        <Stack gap="md">
          <Alert color="blue" variant="light" icon={<IconSend size={16} />}>
            <Text size="sm">
              Generate a link the member can fill from their phone. Closes the §3.1 spec gap that says the
              assessment must be sent by portal/SMS, not administered by the CHW.
            </Text>
          </Alert>

          <Stack gap={4}>
            <Text size="xs" fw={600} c="dimmed">Public link</Text>
            <Group gap="xs" wrap="nowrap">
              <TextInput value={publicLink} readOnly style={{ flex: 1 }} ff="monospace" />
              <CopyButton value={publicLink} timeout={1500}>
                {({ copied, copy }) => (
                  <Button
                    variant="light"
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={600} c="dimmed">SMS body (paste into your messaging tool)</Text>
            <Group gap="xs" wrap="nowrap">
              <TextInput value={smsBody} readOnly style={{ flex: 1 }} />
              <CopyButton value={smsBody} timeout={1500}>
                {({ copied, copy }) => (
                  <Button
                    color="grape"
                    leftSection={copied ? <IconCheck size={14} /> : <IconSend size={14} />}
                    onClick={() => {
                      copy();
                      showNotification({
                        color: 'grape',
                        message: 'SMS body copied. Twilio integration lands with CM-12; for the demo paste this into your messaging tool.',
                      });
                    }}
                  >
                    {copied ? 'Copied' : 'Send via SMS'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>

          <Text size="xs" c="dimmed">
            When the member submits, their response will appear under their Member 360 → Assessments tab.
          </Text>
        </Stack>
      </Modal>
    </Document>
  );
}

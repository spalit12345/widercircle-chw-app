// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Patient, QuestionnaireResponse, QuestionnaireResponseItem, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconCheck, IconHeartHandshake } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type QuestionType = 'single' | 'multi' | 'scale' | 'text';
type RiskRule = { answer: string; caseType: string };

export interface SdohQuestion {
  id: string;
  text: string;
  helper?: string;
  type: QuestionType;
  options?: string[];
  risks?: RiskRule[];
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

export const triggeredCases = (sections: SdohSection[], answers: Answers): string[] => {
  const cases: string[] = [];
  for (const section of sections) {
    for (const q of section.questions) {
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

export const totalQuestions = (sections: SdohSection[]): number =>
  sections.reduce((n, s) => n + s.questions.length, 0);

export const answeredCount = (sections: SdohSection[], answers: Answers): number => {
  let n = 0;
  for (const section of sections) {
    for (const q of section.questions) {
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
    item: section.questions.map((q) => {
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

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedResponse, setSubmittedResponse] = useState<QuestionnaireResponse | undefined>();
  const [startedAt] = useState<string>(() => new Date().toISOString());

  const sections = DEFAULT_SDOH_SECTIONS;
  const total = totalQuestions(sections);
  const answered = answeredCount(sections, answers);
  const triggered = useMemo(() => triggeredCases(sections, answers), [sections, answers]);

  useEffect(() => {
    medplum
      .searchResources('Patient', '_count=50&_sort=-_lastUpdated')
      .then((results) =>
        setPatients(
          results.map((p: Patient) => ({
            value: p.id ?? '',
            label:
              `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
          }))
        )
      )
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

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
              code: { text: caseType },
              description: `SDoH risk-triggered: ${caseType}`,
              focus: saved.id ? { reference: `QuestionnaireResponse/${saved.id}` } : undefined,
              for: { reference: `Patient/${selectedPatient}`, display: patientLabel },
              requester: practitionerRef ? { reference: practitionerRef, display: practitionerLabel } : undefined,
              authoredOn: new Date().toISOString(),
            })
            .then((t) => ({ ok: true as const, task: t, caseType }))
            .catch((err) => ({ ok: false as const, err, caseType }))
        )
      );
      const created = taskCreations.filter((r) => r.ok).length;
      const failed = taskCreations.length - created;
      setSubmittedResponse(saved);
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
    return (
      <Document>
        <Stack gap="lg">
          <Alert color="green" icon={<IconCheck size={20} />} title="Assessment submitted">
            <Text size="sm">
              Submitted {submittedResponse.authored ? formatDateTime(submittedResponse.authored) : ''} for{' '}
              <b>{submittedResponse.subject?.display}</b>.
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

        <Select
          label="Member"
          placeholder="Pick a member"
          data={patients}
          value={selectedPatient}
          onChange={(v) => setSelectedPatient(v ?? '')}
          searchable
          required
        />

        {sections.map((section) => (
          <Card key={section.id} withBorder radius="md" padding="md">
            <Title order={5} mb="sm">
              {section.title}
            </Title>
            <Stack gap="md">
              {section.questions.map((q) => {
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
    </Document>
  );
}

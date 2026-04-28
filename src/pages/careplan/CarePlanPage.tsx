// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Divider,
  Drawer,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Timeline,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  CarePlan,
  Condition,
  Goal,
  Patient,
  PlanDefinition,
  ResourceType,
  Task,
} from '@medplum/fhirtypes';
import { Document, useMedplum, useResource } from '@medplum/react';
import {
  IconAlertCircle,
  IconChecklist,
  IconExternalLink,
  IconNote,
  IconPlayerPlay,
  IconPlus,
  IconStethoscope,
  IconTarget,
} from '@tabler/icons-react';
import { Fragment, type JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GlobalActivityTimer } from '../../billing/GlobalActivityTimer';
import { useGlobalTimer } from '../../billing/TimerContext';
import { useBillingConfig } from '../../billing/useBillingConfig';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'red',
  'high-priority': 'red',
  routine: 'yellow',
  'medium-priority': 'yellow',
  'low-priority': 'gray',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'High',
  'high-priority': 'High',
  routine: 'Medium',
  'medium-priority': 'Medium',
  'low-priority': 'Low',
};

interface GoalRow {
  id: string;
  title: string;
  targetValue: string;
  startDate: string;
  targetDate: string;
  status: string;
  priority: string;
  interventions: { description: string; status: string }[];
  barriers: { description: string; status: string }[];
}

interface ResourceLink {
  label: string;
  url: string;
  description: string;
}

const CONDITION_RESOURCES: Record<string, ResourceLink[]> = {
  'pin-chf': [
    { label: 'AHA Heart Failure Guidelines', url: 'https://www.heart.org/en/health-topics/heart-failure', description: 'Understanding heart failure symptoms, treatment, and living with CHF' },
    { label: 'ACC/AHA Clinical Practice Guidelines', url: 'https://www.acc.org/guidelines/hf', description: 'Evidence-based clinical guidelines for heart failure management' },
    { label: 'Heart Failure Patient Education', url: 'https://www.heart.org/en/health-topics/heart-failure/living-with-heart-failure', description: 'Daily living tips, diet, exercise, and medication management' },
  ],
  'pin-diabetes': [
    { label: 'ADA Standards of Care', url: 'https://diabetesjournals.org/care', description: 'American Diabetes Association clinical practice recommendations' },
    { label: 'CDC Diabetes Self-Management', url: 'https://www.cdc.gov/diabetes/managing/index.html', description: 'Tools and resources for diabetes self-management education' },
    { label: 'NIDDK Patient Education', url: 'https://www.niddk.nih.gov/health-information/diabetes', description: 'National Institute of Diabetes — patient-friendly guides' },
  ],
  'chi-sdoh': [
    { label: 'AAFP Social Determinants of Health', url: 'https://www.aafp.org/family-physician/patient-care/the-everyone-project/toolkit/social-determinants-of-health.html', description: 'Toolkit for addressing SDoH in clinical practice' },
    { label: 'Healthy People 2030 — SDoH', url: 'https://health.gov/healthypeople/priority-areas/social-determinants-health', description: 'Federal goals and resources for SDoH improvement' },
    { label: '211.org Resource Finder', url: 'https://www.211.org/', description: 'Find local community resources: food, housing, transportation, healthcare' },
  ],
  'pin-htn': [
    { label: 'AHA High Blood Pressure', url: 'https://www.heart.org/en/health-topics/high-blood-pressure', description: 'Understanding, preventing, and managing hypertension' },
  ],
};

function getResourceLinks(templateCode: string): ResourceLink[] {
  // Direct match
  if (CONDITION_RESOURCES[templateCode]) {
    return CONDITION_RESOURCES[templateCode];
  }
  // Fuzzy match — check if any key is a substring of the template code
  for (const [key, links] of Object.entries(CONDITION_RESOURCES)) {
    if (templateCode.toLowerCase().includes(key) || key.includes(templateCode.toLowerCase())) {
      return links;
    }
  }
  // General resources for any plan
  return [
    { label: 'CMS CHI/PIN Billing Guide', url: 'https://www.cms.gov/medicare/payment/fee-for-service-providers', description: 'Medicare billing requirements for community health services' },
  ];
}

export function CarePlanPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { patientId: id } = useParams() as { patientId: string };
  const resourceType = 'Patient' as const;
  const resource = useResource({ reference: resourceType + '/' + id });

  const navigate = useNavigate();
  const [carePlan, setCarePlan] = useState<CarePlan | undefined>();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateModalOpened, { open: openTemplateModal, close: closeTemplateModal }] = useDisclosure(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalRow | undefined>();
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickPlanModalOpened, { open: openQuickPlanModal, close: closeQuickPlanModal }] = useDisclosure(false);
  const [qpBarriers, setQpBarriers] = useState('');
  const [qpInterventions, setQpInterventions] = useState('');
  const [qpResponsibilities, setQpResponsibilities] = useState('');
  const [qpNextContact, setQpNextContact] = useState('');
  const [qpFrequency, setQpFrequency] = useState('weekly');
  // Document Visit modal state (enhanced from Add Note)
  const [docVisitOpened, { open: openDocVisit, close: closeDocVisit }] = useDisclosure(false);
  const [dvDescription, setDvDescription] = useState('');
  const [dvActivityType, setDvActivityType] = useState<string>('');
  const [dvProgram, setDvProgram] = useState<string>('');
  const [dvDuration, setDvDuration] = useState<number>(15);
  const [dvBillable, setDvBillable] = useState(true);
  const [dvNotes, setDvNotes] = useState('');
  const [dvGoalId, setDvGoalId] = useState<string>('');

  // Billing config (DB-backed activity types, programs)
  const { activityTypes, programs } = useBillingConfig();
  // Credential from logged-in user profile
  const profile = medplum.getProfile();
  const credential = (profile && 'qualification' in profile ? profile.qualification?.[0]?.code?.coding?.[0]?.code : undefined) ?? 'CHW';

  // Derive patient program from care plan category
  const patientProgram = useMemo(() => {
    const catCode = carePlan?.category?.[0]?.coding?.[0]?.code ?? '';
    if (catCode.toLowerCase().startsWith('pin')) {
      return 'PIN';
    }
    return 'CHI';
  }, [carePlan]);

  const fetchData = useCallback(async () => {
    try {
      // Fetch existing care plan
      const plans = await medplum.searchResources('CarePlan', `subject=Patient/${id}&status=active`);
      const plan = plans[0];
      setCarePlan(plan);

      // CD-08 linkage: tasks attached to this plan via Task.basedOn
      if (plan?.id) {
        const tasks = await medplum
          .searchResources('Task', `based-on=CarePlan/${plan.id}&_sort=-_lastUpdated&_count=20`)
          .catch(() => [] as Task[]);
        setLinkedTasks(tasks);
      } else {
        setLinkedTasks([]);
      }

      if (plan) {
        // Fetch goals linked to this care plan
        const goalRefs = plan.goal?.map((g) => g.reference).filter(Boolean) ?? [];
        const goalRows: GoalRow[] = [];
        for (const ref of goalRefs) {
          try {
            const goal = await medplum.readReference({ reference: ref as string });
            const g = goal as Goal;
            const activities = plan.activity?.filter((a) => a.detail?.goal?.some((gr) => gr.reference === ref)) ?? [];
            const barriers = plan.addresses?.map((a) => a.display ?? a.reference ?? '').filter(Boolean) ?? [];

            goalRows.push({
              id: g.id ?? '',
              title: g.description?.text ?? '',
              targetValue: g.target?.[0]?.detailString ?? '',
              startDate: g.startDate ?? '',
              targetDate: g.target?.[0]?.dueDate ?? '',
              status: g.lifecycleStatus ?? 'active',
              priority: g.priority?.coding?.[0]?.code ?? 'routine',
              interventions: activities.map((a) => ({
                description: a.detail?.description ?? '',
                status: a.detail?.status ?? 'not-started',
              })),
              barriers: barriers.map((b) => ({ description: b, status: 'active' })),
            });
          } catch {
            // Skip broken references
          }
        }
        setGoals(goalRows);
      }

      // Fetch templates
      const tpls = await medplum.searchResources('PlanDefinition', 'status=active&_sort=-_lastUpdated');
      setTemplates(tpls);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, id]);

  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  const handleCreateFromTemplate = useCallback(
    async (templateId: string) => {
      try {
        const template = templates.find((t) => t.id === templateId);
        if (!template) {
          return;
        }

        const now = new Date();
        const sixMonthsLater = new Date(now);
        sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
        const startDate = now.toISOString().split('T')[0];
        const targetDate = sixMonthsLater.toISOString().split('T')[0];

        // Create Goal resources from template actions
        const goalRefs: { reference: string }[] = [];
        const allActivities: CarePlan['activity'] = [];
        const conditionRefs: { reference: string; display: string }[] = [];

        // Deduplicate barriers by display text
        const seenBarriers = new Set<string>();

        // Create goals and interventions using Promise.all for performance
        const goalPromises = (template.action ?? []).map(async (action) => {
          const priority = action.priority === 'urgent' ? 'high-priority' : 'medium-priority';
          const goal = await medplum.createResource<Goal>({
            resourceType: 'Goal',
            lifecycleStatus: 'active',
            priority: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-priority', code: priority }],
            },
            description: { text: action.title ?? '' },
            subject: { reference: `Patient/${id}` },
            startDate,
            target: [{ dueDate: targetDate }],
          });
          return { goal, action };
        });

        const goalResults = await Promise.all(goalPromises);

        for (const { goal, action } of goalResults) {
          goalRefs.push({ reference: `Goal/${goal.id}` });

          for (const subAction of action.action ?? []) {
            allActivities.push({
              detail: {
                status: 'not-started',
                description: subAction.title ?? '',
                goal: [{ reference: `Goal/${goal.id}` }],
              },
            });
          }

          for (const doc of action.documentation ?? []) {
            if (doc.display && !seenBarriers.has(doc.display)) {
              seenBarriers.add(doc.display);
              const condition = await medplum.createResource<Condition>({
                resourceType: 'Condition',
                clinicalStatus: {
                  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
                },
                code: { text: doc.display },
                subject: { reference: `Patient/${id}` },
              });
              conditionRefs.push({ reference: `Condition/${condition.id}`, display: doc.display });
            }
          }
        }

        const profile = medplum.getProfile();
        const author = profile
          ? {
              reference: `Practitioner/${profile.id}`,
              display: `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim(),
            }
          : undefined;

        await medplum.createResource<CarePlan>({
          resourceType: 'CarePlan',
          status: 'active',
          intent: 'plan',
          category: [{ coding: [{ code: template.name ?? '', display: template.title ?? '' }] }],
          subject: { reference: `Patient/${id}` },
          author,
          period: { start: startDate, end: targetDate },
          goal: goalRefs,
          addresses: conditionRefs,
          activity: allActivities,
        });

        showNotification({ color: 'green', message: `Care plan created from "${template.title}" template.` });
        closeTemplateModal();
        await fetchData();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, id, templates, closeTemplateModal, fetchData]
  );

  // Goal status changes are MD-only — CHW has read-only access to goals

  const handleCreateQuickPlan = useCallback(async () => {
    if (!qpBarriers.trim() || !qpInterventions.trim()) {
      return;
    }
    try {
      // Check for existing active plan
      const existing = await medplum.searchResources('CarePlan', `subject=Patient/${id}&status=active`);
      if (existing.length > 0) {
        showNotification({ color: 'yellow', message: 'An active care plan already exists for this patient.' });
        closeQuickPlanModal();
        return;
      }
      const profile = medplum.getProfile();
      const author = profile
        ? { reference: `Practitioner/${profile.id}`, display: `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() }
        : undefined;

      await medplum.createResource<CarePlan>({
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        category: [{ coding: [{ code: 'quick-plan', display: 'Quick Care Plan' }] }],
        subject: { reference: `Patient/${id}` },
        author,
        period: { start: new Date().toISOString().split('T')[0] },
        note: [
          { text: `**Barriers:** ${qpBarriers}` },
          { text: `**Interventions:** ${qpInterventions}` },
          ...(qpResponsibilities ? [{ text: `**Patient Responsibilities:** ${qpResponsibilities}` }] : []),
          { text: `**Next Contact:** ${qpNextContact || 'TBD'} | **Frequency:** ${qpFrequency}` },
        ],
      });

      showNotification({ color: 'green', message: 'Quick care plan created.' });
      closeQuickPlanModal();
      setQpBarriers('');
      setQpInterventions('');
      setQpResponsibilities('');
      setQpNextContact('');
      await fetchData();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum, id, qpBarriers, qpInterventions, qpResponsibilities, qpNextContact, qpFrequency, closeQuickPlanModal, fetchData]);

  const { timer, startTimer } = useGlobalTimer();

  // Capture intervention before stopTimer clears it (avoids stale closure)
  const timerInterventionRef = timer?.intervention;

  const handleTimerStop = useCallback((seconds: number) => {
    const mins = Math.max(1, Math.round(seconds / 60));
    setDvDuration(mins);
    setDvProgram(patientProgram);
    if (activityTypes.length > 0 && !dvActivityType) {
      setDvActivityType(activityTypes[0].value);
    }
    // Auto-fill from intervention context if timer was linked
    if (timerInterventionRef) {
      setDvDescription(timerInterventionRef.description);
      setDvGoalId(timerInterventionRef.goalId);
    }
    openDocVisit();
  }, [openDocVisit, patientProgram, activityTypes, dvActivityType, timerInterventionRef]);

  const handleDocumentVisit = useCallback(async () => {
    if (!carePlan?.id || !dvDescription.trim()) {
      return;
    }
    try {
      const existingPlan = await medplum.readResource('CarePlan', carePlan.id);
      const actLabel = activityTypes.find((a) => a.value === dvActivityType)?.label ?? dvActivityType;
      const goalTitle = dvGoalId ? goals.find((g) => g.id === dvGoalId)?.title : undefined;
      const goalPrefix = goalTitle ? `[Goal: ${goalTitle}] ` : '';
      const newNote = {
        authorReference: profile
          ? { reference: `Practitioner/${profile.id}`, display: `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() }
          : undefined,
        time: new Date().toISOString(),
        text: `${goalPrefix}[${actLabel}] (${dvDuration} min) ${dvDescription}`,
      };
      await medplum.updateResource({
        ...existingPlan,
        note: [...(existingPlan.note ?? []), newNote],
      });

      // Create billing encounter with full metadata
      if (dvDuration > 0) {
        const now = new Date().toISOString();
        const progLabel = programs.find((p) => p.value === dvProgram)?.label ?? dvProgram;
        const reasonCodes: Array<{ text?: string; coding?: Array<{ system?: string; code?: string; display?: string }> }> = [{ text: dvDescription }];
        if (dvNotes) {
          reasonCodes.push({ text: dvNotes });
        }
        // Add goal context to reasonCode (not reasonReference — FHIR R4 only allows Condition/Procedure/Observation there)
        if (dvGoalId && goalTitle) {
          reasonCodes.push({ coding: [{ system: 'http://medplum.com/goal', code: dvGoalId, display: goalTitle }], text: `Goal: ${goalTitle}` });
        }
        const patientDisplay = `${(resource as Patient)?.name?.[0]?.given?.[0] ?? ''} ${(resource as Patient)?.name?.[0]?.family ?? ''}`.trim();
        const practitionerDisplay = `${profile?.name?.[0]?.given?.[0] ?? ''} ${profile?.name?.[0]?.family ?? ''}`.trim();
        await medplum.createResource({
          resourceType: 'Encounter',
          status: dvBillable ? 'planned' : 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
          type: [
            { coding: [{ system: 'http://medplum.com/activity-type', code: dvActivityType, display: actLabel }] },
            ...(!dvBillable ? [{ coding: [{ system: 'http://medplum.com/billable', code: 'non-billable', display: 'Non-billable' }] }] : []),
          ],
          serviceType: { coding: [{ system: 'http://medplum.com/program', code: dvProgram, display: progLabel }] },
          subject: { reference: `Patient/${id}`, display: patientDisplay },
          participant: [{
            type: [{ coding: [{ system: 'http://medplum.com/credential', code: credential, display: credential }] }],
            individual: { reference: `Practitioner/${profile?.id}`, display: practitionerDisplay },
          }],
          length: { value: dvDuration, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
          period: { start: now, end: new Date(Date.now() + dvDuration * 60000).toISOString() },
          reasonCode: reasonCodes,
        });
      }

      showNotification({ color: 'green', message: `Documented ${dvDuration} min of ${actLabel} and logged to billing.` });
      closeDocVisit();
      setDvDescription('');
      setDvNotes('');
      setDvGoalId('');
      setDvBillable(true);
      await fetchData();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum, id, resource, carePlan, dvDescription, dvActivityType, dvProgram, dvDuration, dvBillable, dvNotes, dvGoalId, profile, credential, goals, activityTypes, programs, closeDocVisit, fetchData]);

  if (!resource) {
    return null;
  }

  if (resource.resourceType !== 'Patient') {
    return (
      <Document>
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported" color="red">
          Care plans are only supported for Patient resources.
        </Alert>
      </Document>
    );
  }

  const filteredTemplates = templates.filter(
    (t) =>
      (t.title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>Care Plan</Title>
          <Group>
            {carePlan && (
              <>
                <GlobalActivityTimer
                  patientId={id}
                  patientName={`${(resource as Patient)?.name?.[0]?.given?.[0] ?? ''} ${(resource as Patient)?.name?.[0]?.family ?? ''}`.trim() || 'Patient'}
                  onStop={handleTimerStop}
                />
                <Button leftSection={<IconStethoscope size={16} />} onClick={() => { setDvProgram(patientProgram); if (activityTypes.length > 0 && !dvActivityType) { setDvActivityType(activityTypes[0].value); } openDocVisit(); }}>
                  Document Visit
                </Button>
              </>
            )}
            {!loading && !carePlan && (
              <>
                <Button leftSection={<IconPlus size={16} />} onClick={openTemplateModal}>
                  Create from Template
                </Button>
                <Button leftSection={<IconNote size={16} />} variant="light" onClick={openQuickPlanModal}>
                  Create Quick Plan
                </Button>
              </>
            )}
          </Group>
        </Group>

        {loading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : !carePlan ? (
          <Text c="dimmed" ta="center" py="xl">
            No care plan for this patient. Use &quot;Create from Template&quot; for structured goals or &quot;Create Quick Plan&quot; for a simple text-based plan.
          </Text>
        ) : (
          <Stack gap="md">
            {/* Care plan header */}
            <Group gap="xs">
              <Badge variant="light">{carePlan.category?.[0]?.coding?.[0]?.display ?? 'Care Plan'}</Badge>
              <Badge color="green">{carePlan.status}</Badge>
              {carePlan.author?.display && <Text size="sm" c="dimmed">Author: {carePlan.author.display}</Text>}
            </Group>

            {/* Problems, Goals and Interventions — Curitics-style (#49) */}
            <Group gap="md">
              <Badge color="pink" variant="dot">Problem</Badge>
              <Badge color="green" variant="dot">Goal</Badge>
              <Badge color="grape" variant="dot">Intervention</Badge>
              <Badge color="orange" variant="dot">Barrier</Badge>
            </Group>
            <Title order={4}>Problems, Goals and Interventions</Title>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>P</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Start Date</Table.Th>
                  <Table.Th>Target Date</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {goals.map((goal) => (
                  <Fragment key={goal.id}><Table.Tr
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedGoal(goal);
                      openDrawer();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setSelectedGoal(goal);
                        openDrawer();
                      }
                    }}
                  >
                    <Table.Td>
                      <Badge size="xs" color="green" variant="filled" circle>G</Badge>
                    </Table.Td>
                    <Table.Td fw={500}>
                      <Text size="sm" c="green" fw={700}>Goal:</Text> {goal.title}
                      {goal.targetValue && (
                        <Text size="xs" c="dimmed">{goal.targetValue}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>{goal.startDate ? formatDate(goal.startDate) : '—'}</Table.Td>
                    <Table.Td>{goal.targetDate ? formatDate(goal.targetDate) : '—'}</Table.Td>
                    <Table.Td>
                      <Badge
                        color={goal.status === 'completed' ? 'green' : goal.status === 'active' ? 'blue' : 'gray'}
                        size="sm"
                      >
                        {goal.status}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                  {/* Interventions nested under goal */}
                  {goal.interventions.map((intv, idx) => {
                    const isTimerOnThis = timer?.intervention?.description === intv.description && timer?.intervention?.goalId === goal.id && timer?.patientId === id;
                    return (
                    <Table.Tr key={`${goal.id}-intv-${idx}`} style={{ backgroundColor: isTimerOnThis ? 'var(--mantine-color-green-0)' : 'var(--mantine-color-grape-0)' }}>
                      <Table.Td>
                        {!timer && intv.status !== 'completed' && (
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="green"
                            aria-label={`Start timer for ${intv.description}`}
                            onClick={() => startTimer(id, `${(resource as Patient)?.name?.[0]?.given?.[0] ?? ''} ${(resource as Patient)?.name?.[0]?.family ?? ''}`.trim(), { description: intv.description, goalId: goal.id, goalTitle: goal.title })}
                          >
                            <IconPlayerPlay size={12} />
                          </ActionIcon>
                        )}
                      </Table.Td>
                      <Table.Td pl={40}>
                        <Text size="sm" c="grape" fw={600}>Intervention:</Text> <Text size="sm" component="span">{intv.description}</Text>
                      </Table.Td>
                      <Table.Td></Table.Td>
                      <Table.Td></Table.Td>
                      <Table.Td><Badge size="xs" color={intv.status === 'completed' ? 'green' : 'gray'}>{intv.status}</Badge></Table.Td>
                    </Table.Tr>
                    );
                  })}
                </Fragment>))}
              </Table.Tbody>
            </Table>

            {/* Barriers */}
            {carePlan.addresses && carePlan.addresses.length > 0 && (
              <>
                <Title order={4}>Barriers / SDoH</Title>
                <Group gap="xs">
                  {carePlan.addresses.map((addr, i) => (
                    <Badge key={i} variant="light" color="orange">
                      {addr.display ?? addr.reference}
                    </Badge>
                  ))}
                </Group>
              </>
            )}

            {/* Linked tasks (CD-08: Task.basedOn → CarePlan) */}
            <Divider />
            <Group justify="space-between">
              <Group gap="xs">
                <IconChecklist size={18} />
                <Title order={4}>Linked tasks</Title>
                <Badge variant="light">{linkedTasks.length}</Badge>
              </Group>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => navigate('/today')}
              >
                Add task
              </Button>
            </Group>
            {linkedTasks.length === 0 ? (
              <Text size="sm" c="dimmed">
                No tasks linked to this plan yet. Tasks created from Today (or from the
                /Task board) with this member selected will automatically attach here.
              </Text>
            ) : (
              <Stack gap="xs">
                {linkedTasks.map((task) => {
                  const due = task.restriction?.period?.end?.slice(0, 10);
                  return (
                    <Group
                      key={task.id}
                      justify="space-between"
                      wrap="nowrap"
                      p="xs"
                      style={{
                        borderBottom: '1px solid var(--mantine-color-gray-2)',
                        cursor: 'pointer',
                      }}
                      onClick={() => task.id && navigate(`/Task/${task.id}`)}
                    >
                      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text size="sm" fw={500} c="blue" truncate>
                          {task.code?.text ?? task.description ?? 'Untitled task'}
                        </Text>
                        <Group gap={6}>
                          {task.owner?.display && (
                            <Text size="xs" c="dimmed">
                              {task.owner.display}
                            </Text>
                          )}
                          {due && (
                            <Text size="xs" c="dimmed" ff="monospace">
                              · due {formatDate(due)}
                            </Text>
                          )}
                        </Group>
                      </Stack>
                      <Group gap={6}>
                        {task.priority && (
                          <Badge
                            color={
                              task.priority === 'asap' || task.priority === 'urgent'
                                ? 'red'
                                : 'blue'
                            }
                            size="xs"
                            variant="light"
                          >
                            {task.priority}
                          </Badge>
                        )}
                        <Badge
                          color={task.status === 'completed' ? 'green' : 'gray'}
                          size="xs"
                          variant="light"
                        >
                          {task.status}
                        </Badge>
                      </Group>
                    </Group>
                  );
                })}
              </Stack>
            )}

            {/* Progress Notes */}
            <Divider />
            <Group justify="space-between">
              <Title order={4}>Progress Notes</Title>
              <Button leftSection={<IconStethoscope size={16} />} variant="light" onClick={() => { setDvProgram(patientProgram); if (activityTypes.length > 0 && !dvActivityType) { setDvActivityType(activityTypes[0].value); } openDocVisit(); }}>
                Document Visit
              </Button>
            </Group>
            {carePlan.note && carePlan.note.length > 0 ? (
              <Timeline active={carePlan.note.length - 1} bulletSize={24}>
                {[...carePlan.note].reverse().map((note, i) => (
                  <Timeline.Item key={`note-${carePlan.note!.length - 1 - i}`} title={note.authorReference?.display ?? 'CHW'}>
                    <Text size="sm">{note.text}</Text>
                    <Text size="xs" c="dimmed">
                      {note.time ? formatDateTime(note.time) : ''}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Text size="sm" c="dimmed">
                No progress notes yet. Click &quot;Add Note&quot; after a visit.
              </Text>
            )}

            {/* Educational Resources */}
            <Divider />
            <Title order={4}>Resources & Guidelines</Title>
            {getResourceLinks(carePlan.category?.[0]?.coding?.[0]?.code ?? '').length > 0 ? (
              <Stack gap="xs">
                {getResourceLinks(carePlan.category?.[0]?.coding?.[0]?.code ?? '').map((link, i) => (
                  <Group key={i} gap="xs">
                    <IconExternalLink size={14} />
                    <Text
                      component="a"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      c="blue"
                      style={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {link.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      — {link.description}
                    </Text>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                No condition-specific resources available for this plan type.
              </Text>
            )}
          </Stack>
        )}
      </Stack>

      {/* Template selector modal */}
      <Modal opened={templateModalOpened} onClose={closeTemplateModal} title="Select Care Plan Template" size="lg">
        <Stack gap="md">
          <TextInput
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.currentTarget.value)}
          />
          {filteredTemplates.length === 0 ? (
            <Text c="dimmed" ta="center">
              No templates found.
            </Text>
          ) : (
            <Stack gap="xs">
              {filteredTemplates.map((t) => (
                <Button
                  key={t.id}
                  variant="light"
                  fullWidth
                  justify="space-between"
                  rightSection={<IconTarget size={16} />}
                  onClick={() => handleCreateFromTemplate(t.id ?? '')}
                >
                  <Stack gap={0} align="flex-start">
                    <Text fw={500}>{t.title}</Text>
                    <Text size="xs" c="dimmed">
                      {t.action?.length ?? 0} goals
                    </Text>
                  </Stack>
                </Button>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>

      {/* Progress Note Modal */}
      {/* Quick Care Plan Modal */}
      <Modal opened={quickPlanModalOpened} onClose={closeQuickPlanModal} title="Create Quick Care Plan" size="lg">
        <Stack gap="md">
          <Textarea
            label="Patient Barriers"
            placeholder="List barriers: transportation, food insecurity, housing..."
            value={qpBarriers}
            onChange={(e) => setQpBarriers(e.currentTarget.value)}
            minRows={3}
            required
          />
          <Textarea
            label="Planned Interventions"
            placeholder="What steps will you take: connect to food bank by 4/15, arrange transport by 4/20..."
            value={qpInterventions}
            onChange={(e) => setQpInterventions(e.currentTarget.value)}
            minRows={3}
            required
          />
          <Textarea
            label="Patient Responsibilities"
            placeholder="What the patient agrees to do..."
            value={qpResponsibilities}
            onChange={(e) => setQpResponsibilities(e.currentTarget.value)}
            minRows={2}
          />
          <Group grow>
            <TextInput
              label="Next Contact Date"
              type="date"
              value={qpNextContact}
              onChange={(e) => setQpNextContact(e.currentTarget.value)}
            />
            <Select
              label="Contact Frequency"
              data={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'bi-weekly', label: 'Bi-weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              value={qpFrequency}
              onChange={(v) => setQpFrequency(v ?? 'weekly')}
            />
          </Group>
          <Button onClick={handleCreateQuickPlan} disabled={!qpBarriers.trim() || !qpInterventions.trim()} fullWidth>
            Create Care Plan
          </Button>
        </Stack>
      </Modal>

      <Modal opened={docVisitOpened} onClose={closeDocVisit} title="Document Visit" size="md">
        <Stack gap="md">
          <Select
            label="Activity Type"
            data={activityTypes}
            value={dvActivityType || activityTypes[0]?.value}
            onChange={(v) => setDvActivityType(v ?? '')}
            required
          />
          <Select
            label="Program"
            data={programs}
            value={dvProgram || patientProgram}
            onChange={(v) => setDvProgram(v ?? patientProgram)}
            required
          />
          <NumberInput
            label="Duration (minutes)"
            value={dvDuration}
            onChange={(v) => setDvDuration(Number(v) || 0)}
            min={1}
            max={480}
            required
          />
          <Textarea
            label="Activity Description"
            placeholder="What was done during this visit..."
            value={dvDescription}
            onChange={(e) => setDvDescription(e.currentTarget.value)}
            minRows={3}
            required
          />
          {goals.length > 0 && (
            <Select
              label="Related Goal (optional)"
              placeholder="Link to a specific goal..."
              data={goals.map((g) => ({ value: g.id, label: g.title }))}
              value={dvGoalId || null}
              onChange={(v) => setDvGoalId(v ?? '')}
              clearable
            />
          )}
          <Switch
            label="Billable time"
            checked={dvBillable}
            onChange={(e) => setDvBillable(e.currentTarget.checked)}
            description="Uncheck for admin tasks not related to patient care"
          />
          <Textarea
            label="Additional Notes"
            placeholder="Optional notes..."
            value={dvNotes}
            onChange={(e) => setDvNotes(e.currentTarget.value)}
            minRows={2}
          />
          <Button onClick={handleDocumentVisit} disabled={!dvDescription.trim()} fullWidth>
            Save & Log Time
          </Button>
        </Stack>
      </Modal>

      {/* Goal detail drawer */}
      <Drawer opened={drawerOpened} onClose={closeDrawer} title="Goal Details" position="right" size="lg">
        {selectedGoal && (
          <Stack gap="md">
            <Group>
              <Badge color={PRIORITY_COLORS[selectedGoal.priority] ?? 'gray'}>
                {PRIORITY_LABELS[selectedGoal.priority] ?? selectedGoal.priority} Priority
              </Badge>
              <Badge
                color={selectedGoal.status === 'completed' ? 'green' : selectedGoal.status === 'active' ? 'blue' : 'gray'}
              >
                {selectedGoal.status === 'completed' ? 'Achieved' : selectedGoal.status === 'cancelled' ? 'Cancelled' : selectedGoal.status === 'on-hold' ? 'On Hold' : 'Active'}
              </Badge>
              <Text size="xs" c="dimmed">Set by MD — read only</Text>
            </Group>

            <Title order={4}>{selectedGoal.title}</Title>

            {selectedGoal.targetValue && (
              <TextInput label="Target Value" value={selectedGoal.targetValue} readOnly />
            )}

            <Group grow>
              <TextInput label="Start Date" value={selectedGoal.startDate} readOnly />
              <TextInput label="Target Date" value={selectedGoal.targetDate} readOnly />
            </Group>

            {/* Linked Interventions */}
            <Title order={5}>Interventions</Title>
            {selectedGoal.interventions.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {selectedGoal.interventions.map((intv, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{intv.description}</Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={intv.status === 'completed' ? 'green' : 'gray'}>
                          {intv.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="dimmed">
                No interventions linked.
              </Text>
            )}

            {/* Linked Barriers */}
            <Title order={5}>Barriers</Title>
            {selectedGoal.barriers.length > 0 ? (
              <Group gap="xs">
                {selectedGoal.barriers.map((b, i) => (
                  <Badge key={i} variant="light" color="orange">
                    {b.description}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                No barriers linked.
              </Text>
            )}
          </Stack>
        )}
      </Drawer>
    </Document>
  );
}

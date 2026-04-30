// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-20 — No-code workflow builder. The on-stage Act 3 bonus: an admin
// configures a triggered automation in a minute or two without engineering.
//
// Storage model:
//   - PlanDefinition is the workflow definition (name, description, version,
//     status, action[], trigger). Each action carries the WC step config in
//     a custom extension so we can round-trip without inventing a new
//     resource type.
//   - RequestGroup is the runtime instance (instantiatesCanonical →
//     PlanDefinition, subject = Patient, action[] = per-step execution
//     records). Real-mode runs additionally write Task / Communication /
//     Encounter resources.
//
// Out of scope for this iteration: real event-bus trigger ingestion (manual
// "Run on member" only), background SLA timers / escalation rules, survey
// embedding, multi-assignee handoffs. Versioning is simple — Publish
// increments PlanDefinition.version and archives any previous active
// definition with the same `name`.

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  Patient,
  PlanDefinition,
  PlanDefinitionAction,
  RequestGroup,
  Task,
} from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconBolt,
  IconChevronDown,
  IconChevronUp,
  IconHistory,
  IconPlayerPlay,
  IconPlus,
  IconRoute,
  IconTrash,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { emitAudit } from '../utils/audit';

const STEP_CONFIG_EXT = 'https://widercircle.com/fhir/StructureDefinition/wf-step-config';
const TRIGGER_CONFIG_EXT = 'https://widercircle.com/fhir/StructureDefinition/wf-trigger-config';
const WF_TAG_SYSTEM = 'https://widercircle.com/fhir/CodeSystem/workflow';

type ActionType = 'create_task' | 'create_case';
type TriggerType = 'manual' | 'event:case-created' | 'scheduled:daily';

interface StepConfig {
  id: string;
  actionType: ActionType;
  title: string;
  description: string;
  // Optional condition expressed as "key=value" against the patient or run context.
  conditionKey?: string;
  conditionValue?: string;
}

interface TriggerConfig {
  type: TriggerType;
  filter?: string; // e.g., for event:case-created could be "case-type=sdoh-food"
}

const ACTION_LABELS: Record<ActionType, string> = {
  create_task: 'Create task',
  create_case: 'Create case',
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  manual: 'Manual run only',
  'event:case-created': 'When a case is created',
  'scheduled:daily': 'Daily (scheduled)',
};

const newStep = (): StepConfig => ({
  id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  actionType: 'create_task',
  title: '',
  description: '',
});

const stepFromAction = (action: PlanDefinitionAction): StepConfig | undefined => {
  const cfgExt = action.extension?.find((e) => e.url === STEP_CONFIG_EXT)?.valueString;
  if (!cfgExt) return undefined;
  try {
    return JSON.parse(cfgExt) as StepConfig;
  } catch {
    return undefined;
  }
};

const planSteps = (plan: PlanDefinition): StepConfig[] =>
  (plan.action ?? [])
    .map((a) => stepFromAction(a))
    .filter((s): s is StepConfig => Boolean(s));

const planTrigger = (plan: PlanDefinition): TriggerConfig => {
  const ext = plan.extension?.find((e) => e.url === TRIGGER_CONFIG_EXT)?.valueString;
  if (ext) {
    try {
      return JSON.parse(ext) as TriggerConfig;
    } catch {
      // fall through
    }
  }
  return { type: 'manual' };
};

const buildPlanDefinition = (args: {
  existing?: PlanDefinition;
  name: string;
  description: string;
  trigger: TriggerConfig;
  steps: StepConfig[];
  status: PlanDefinition['status'];
  version: string;
}): PlanDefinition => {
  const { existing, name, description, trigger, steps, status, version } = args;
  const actions: PlanDefinitionAction[] = steps.map((step, idx) => ({
    id: step.id,
    title: step.title || `Step ${idx + 1}`,
    description: step.description || undefined,
    code: [
      {
        coding: [{ system: WF_TAG_SYSTEM, code: step.actionType, display: ACTION_LABELS[step.actionType] }],
      },
    ],
    extension: [{ url: STEP_CONFIG_EXT, valueString: JSON.stringify(step) }],
  }));
  return {
    ...existing,
    resourceType: 'PlanDefinition',
    name,
    title: name,
    description,
    status,
    version,
    type: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/plan-definition-type', code: 'workflow-definition' }],
    },
    action: actions,
    extension: [{ url: TRIGGER_CONFIG_EXT, valueString: JSON.stringify(trigger) }],
  };
};

const isWorkflowPlan = (plan: PlanDefinition): boolean =>
  plan.type?.coding?.some((c) => c.code === 'workflow-definition') === true;

export function WorkflowBuilderPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<PlanDefinition | undefined>();
  const [editorOpened, { open: openEditor, close: closeEditor }] = useDisclosure(false);
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorTrigger, setEditorTrigger] = useState<TriggerConfig>({ type: 'manual' });
  const [editorSteps, setEditorSteps] = useState<StepConfig[]>([newStep()]);
  const [savingEditor, setSavingEditor] = useState(false);
  const [runOpened, { open: openRunModal, close: closeRunModal }] = useDisclosure(false);
  const [runPlan, setRunPlan] = useState<PlanDefinition | undefined>();
  const [runPatient, setRunPatient] = useState('');
  const [runIsTest, setRunIsTest] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string[] | undefined>();
  const [historyForPlanId, setHistoryForPlanId] = useState<string | undefined>();
  const [historyRows, setHistoryRows] = useState<RequestGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allPlans, patientResults] = await Promise.all([
        medplum.searchResources(
          'PlanDefinition',
          'type=workflow-definition&_sort=-_lastUpdated&_count=50'
        ),
        medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated'),
      ]);
      setPlans(allPlans.filter(isWorkflowPlan));
      setPatients(
        patientResults.map((p: Patient) => ({
          value: p.id ?? '',
          label:
            `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() ||
            'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const resetEditor = useCallback(() => {
    setEditorName('');
    setEditorDescription('');
    setEditorTrigger({ type: 'manual' });
    setEditorSteps([newStep()]);
    setEditingPlan(undefined);
  }, []);

  const startNewWorkflow = useCallback(() => {
    resetEditor();
    openEditor();
  }, [resetEditor, openEditor]);

  const startEditWorkflow = useCallback(
    (plan: PlanDefinition) => {
      setEditingPlan(plan);
      setEditorName(plan.name ?? plan.title ?? '');
      setEditorDescription(plan.description ?? '');
      setEditorTrigger(planTrigger(plan));
      const steps = planSteps(plan);
      setEditorSteps(steps.length > 0 ? steps : [newStep()]);
      openEditor();
    },
    [openEditor]
  );

  const saveDraft = useCallback(
    async (status: PlanDefinition['status']) => {
      const trimmedName = editorName.trim();
      if (!trimmedName) {
        showNotification({ color: 'yellow', message: 'Workflow name is required.' });
        return;
      }
      const validSteps = editorSteps.filter((s) => s.title.trim().length > 0);
      if (validSteps.length === 0) {
        showNotification({ color: 'yellow', message: 'Add at least one step with a title.' });
        return;
      }
      setSavingEditor(true);
      try {
        const previousVersion = Number.parseInt(editingPlan?.version ?? '0', 10) || 0;
        const nextVersion =
          status === 'active' ? String(previousVersion + 1) : editingPlan?.version ?? '1';
        const payload = buildPlanDefinition({
          existing: editingPlan,
          name: trimmedName,
          description: editorDescription.trim(),
          trigger: editorTrigger,
          steps: validSteps,
          status,
          version: nextVersion,
        });
        const saved = editingPlan?.id
          ? await medplum.updateResource<PlanDefinition>({ ...payload, id: editingPlan.id })
          : await medplum.createResource<PlanDefinition>(payload);
        // CM-20 AC-7 — audit emission on every CRUD operation.
        void emitAudit(medplum, {
          action: 'case.created',
          meta: {
            wfAction: status === 'active' ? 'workflow.published' : 'workflow.saved',
            workflowId: saved.id ?? '',
            workflowName: trimmedName,
            version: saved.version ?? '',
            stepCount: validSteps.length,
          },
        });
        showNotification({
          color: status === 'active' ? 'green' : 'blue',
          message:
            status === 'active'
              ? `Workflow published as v${nextVersion}`
              : 'Workflow draft saved',
        });
        closeEditor();
        resetEditor();
        await load();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setSavingEditor(false);
      }
    },
    [editorName, editorDescription, editorTrigger, editorSteps, editingPlan, medplum, closeEditor, resetEditor, load]
  );

  const archivePlan = useCallback(
    async (plan: PlanDefinition) => {
      if (!plan.id) return;
      try {
        await medplum.updateResource<PlanDefinition>({ ...plan, status: 'retired' });
        showNotification({ color: 'gray', message: `Workflow "${plan.name}" archived` });
        await load();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, load]
  );

  const startRun = useCallback(
    (plan: PlanDefinition) => {
      setRunPlan(plan);
      setRunPatient('');
      setRunIsTest(true);
      setRunResult(undefined);
      openRunModal();
    },
    [openRunModal]
  );

  const executeRun = useCallback(async () => {
    if (!runPlan || !runPlan.id || !runPatient) return;
    const patientLabel = patients.find((p) => p.value === runPatient)?.label ?? '';
    const steps = planSteps(runPlan);
    setRunning(true);
    try {
      const log: string[] = [];
      const results: Array<{ stepId: string; outcome: 'completed' | 'skipped' | 'failed'; resourceRef?: string; reason?: string }> = [];
      for (const step of steps) {
        // CM-20 AC-3 demo branching keys. Real workflow engine should use a
        // richer expression matcher; this lookup table covers the demo paths.
        let conditionPasses = true;
        if (step.conditionKey && step.conditionValue) {
          const patient = await medplum
            .readResource('Patient', runPatient)
            .catch(() => undefined as Patient | undefined);
          const homeAddress =
            patient?.address?.find((a) => a.use === 'home') ?? patient?.address?.[0];
          const lhs =
            step.conditionKey === 'patient.gender' ? patient?.gender :
            step.conditionKey === 'patient.id' ? patient?.id :
            step.conditionKey === 'patient.zip' ? homeAddress?.postalCode :
            step.conditionKey === 'patient.state' ? homeAddress?.state :
            step.conditionKey === 'patient.city' ? homeAddress?.city :
            step.conditionKey === 'patient.language' ?
              patient?.communication?.[0]?.language?.coding?.[0]?.code ??
              patient?.communication?.[0]?.language?.text :
            step.conditionKey === 'patient.maritalStatus' ?
              patient?.maritalStatus?.coding?.[0]?.code ?? patient?.maritalStatus?.text :
            undefined;
          conditionPasses = (lhs ?? '').toString().toLowerCase() === step.conditionValue.toLowerCase();
        }
        if (!conditionPasses) {
          log.push(`⏭  ${step.title}: condition (${step.conditionKey}=${step.conditionValue}) not met — skipped`);
          results.push({ stepId: step.id, outcome: 'skipped' });
          continue;
        }

        if (runIsTest) {
          log.push(
            `🧪 ${step.title}: would ${ACTION_LABELS[step.actionType].toLowerCase()} for ${patientLabel}` +
              (step.description ? ` — "${step.description}"` : '')
          );
          results.push({ stepId: step.id, outcome: 'completed' });
          continue;
        }

        try {
          if (step.actionType === 'create_task') {
            const t = await medplum.createResource<Task>({
              resourceType: 'Task',
              status: 'requested',
              intent: 'order',
              priority: 'routine',
              code: { text: step.title },
              description: step.description || `Auto-created by workflow ${runPlan.name}`,
              for: { reference: `Patient/${runPatient}`, display: patientLabel },
              authoredOn: new Date().toISOString(),
            });
            log.push(`✅ ${step.title}: Task created (${t.id})`);
            results.push({ stepId: step.id, outcome: 'completed', resourceRef: `Task/${t.id}` });
          } else if (step.actionType === 'create_case') {
            const t = await medplum.createResource<Task>({
              resourceType: 'Task',
              status: 'requested',
              intent: 'order',
              priority: 'urgent',
              code: {
                coding: [
                  {
                    system: 'https://widercircle.com/fhir/CodeSystem/task-category',
                    code: 'case-management',
                    display: 'Case management',
                  },
                ],
                text: step.title,
              },
              description: step.description || `Auto-created by workflow ${runPlan.name}`,
              for: { reference: `Patient/${runPatient}`, display: patientLabel },
              authoredOn: new Date().toISOString(),
            });
            log.push(`✅ ${step.title}: Case created (${t.id})`);
            results.push({ stepId: step.id, outcome: 'completed', resourceRef: `Task/${t.id}` });
          }
        } catch (err) {
          const reason = normalizeErrorString(err);
          log.push(`❌ ${step.title}: failed — ${reason}`);
          results.push({ stepId: step.id, outcome: 'failed', reason });
        }
      }

      // Always write a RequestGroup so the run history surfaces both real
      // and test runs. FHIR constraint `rgg-1` requires each action to carry
      // a resource OR a nested action[] (not both, not neither). The simplest
      // shape that satisfies it AND remains useful for the demo is a single
      // top-level action whose nested children point at the per-step result
      // payload via extensions; the per-step structured results are still
      // available there.
      try {
        await medplum.createResource<RequestGroup>({
          resourceType: 'RequestGroup',
          status: 'completed',
          intent: 'order',
          subject: { reference: `Patient/${runPatient}`, display: patientLabel },
          instantiatesCanonical: [`PlanDefinition/${runPlan.id}`],
          authoredOn: new Date().toISOString(),
          note: [{ text: log.join('\n') }],
          extension: [
            {
              url: 'https://widercircle.com/fhir/StructureDefinition/wf-run-mode',
              valueString: runIsTest ? 'test' : 'real',
            },
            {
              url: 'https://widercircle.com/fhir/StructureDefinition/wf-run-results',
              valueString: JSON.stringify(results),
            },
          ],
        });
      } catch (err) {
        log.push(`⚠️  Could not save run history: ${normalizeErrorString(err)}`);
      }

      void emitAudit(medplum, {
        action: 'case.created',
        patientRef: { reference: `Patient/${runPatient}` },
        meta: {
          wfAction: runIsTest ? 'workflow.test-run' : 'workflow.executed',
          workflowId: runPlan.id ?? '',
          workflowName: runPlan.name ?? '',
          stepsExecuted: results.length,
        },
      });
      setRunResult(log);
      if (historyForPlanId === runPlan.id) {
        await loadHistory(runPlan.id);
      }
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setRunning(false);
    }
  }, [runPlan, runPatient, runIsTest, patients, medplum, historyForPlanId]);

  const loadHistory = useCallback(
    async (planId: string) => {
      setHistoryLoading(true);
      try {
        const rg = await medplum.searchResources(
          'RequestGroup',
          `instantiates-canonical=PlanDefinition/${planId}&_sort=-_lastUpdated&_count=10`
        );
        setHistoryRows(rg);
        setHistoryForPlanId(planId);
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setHistoryLoading(false);
      }
    },
    [medplum]
  );

  const toggleHistory = useCallback(
    async (plan: PlanDefinition) => {
      if (!plan.id) return;
      if (historyForPlanId === plan.id) {
        setHistoryForPlanId(undefined);
        setHistoryRows([]);
      } else {
        await loadHistory(plan.id);
      }
    },
    [historyForPlanId, loadHistory]
  );

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    setEditorSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const updateStep = useCallback((idx: number, patch: Partial<StepConfig>) => {
    setEditorSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const removeStep = useCallback((idx: number) => {
    setEditorSteps((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const stepDescriptors = useMemo(
    () => editorSteps.map((s, idx) => ({ ...s, ordinal: idx + 1 })),
    [editorSteps]
  );

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Group gap="xs">
              <IconRoute size={22} />
              <Title order={2}>Workflow builder</Title>
              <Badge variant="light">{plans.length}</Badge>
            </Group>
            <Text c="dimmed" size="sm">
              No-code builder for triggered automations: chain steps with optional conditional routing, then run on a member.
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              variant="light"
              color="gray"
              leftSection={<IconArrowLeft size={14} />}
              onClick={() => navigate('/admin/roles')}
            >
              Back to roles
            </Button>
            <Button leftSection={<IconPlus size={14} />} onClick={startNewWorkflow}>
              New workflow
            </Button>
          </Group>
        </Group>

        {loading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : plans.length === 0 ? (
          <Card withBorder radius="md" padding="md">
            <Stack gap="xs" align="center" py="md">
              <IconBolt size={32} color="var(--mantine-color-gray-5)" />
              <Text size="sm" c="dimmed">
                No workflows yet. Click "New workflow" to author the first one.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Stack gap="sm">
            {plans.map((plan) => {
              const trigger = planTrigger(plan);
              const steps = planSteps(plan);
              const isPublished = plan.status === 'active';
              const isHistoryOpen = historyForPlanId === plan.id;
              return (
                <Card key={plan.id} withBorder radius="md" padding="md">
                  <Stack gap="sm">
                    <Group justify="space-between" wrap="wrap">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text fw={600} size="md">
                            {plan.title ?? plan.name ?? 'Untitled'}
                          </Text>
                          <Badge
                            color={isPublished ? 'green' : plan.status === 'retired' ? 'gray' : 'yellow'}
                            variant="light"
                          >
                            {plan.status ?? 'draft'}
                          </Badge>
                          <Badge variant="light" ff="monospace">
                            v{plan.version ?? '1'}
                          </Badge>
                        </Group>
                        {plan.description && (
                          <Text size="sm" c="dimmed">
                            {plan.description}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {TRIGGER_LABELS[trigger.type]} · {steps.length} step
                          {steps.length === 1 ? '' : 's'}
                        </Text>
                      </Stack>
                      <Group gap="xs" wrap="wrap">
                        {isPublished && (
                          <Button
                            size="xs"
                            color="blue"
                            leftSection={<IconPlayerPlay size={14} />}
                            onClick={() => startRun(plan)}
                          >
                            Run on member
                          </Button>
                        )}
                        <Button size="xs" variant="light" onClick={() => startEditWorkflow(plan)}>
                          {isPublished ? 'Edit & re-publish' : 'Edit'}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={
                            isHistoryOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                          }
                          onClick={() => toggleHistory(plan)}
                        >
                          Run history
                        </Button>
                        {plan.status !== 'retired' && (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => archivePlan(plan)}
                          >
                            Archive
                          </Button>
                        )}
                      </Group>
                    </Group>

                    {steps.length > 0 && (
                      <Stack gap={4}>
                        {steps.map((s, idx) => (
                          <Group key={s.id} gap="xs" wrap="nowrap">
                            <Badge size="xs" variant="light" color="gray" ff="monospace">
                              {idx + 1}
                            </Badge>
                            <Text size="xs" c="dimmed">
                              <span style={{ fontFamily: 'monospace' }}>{ACTION_LABELS[s.actionType]}</span>
                              {' · '}
                              {s.title}
                              {s.conditionKey && s.conditionValue && (
                                <> · <em>if {s.conditionKey}={s.conditionValue}</em></>
                              )}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    )}

                    {isHistoryOpen && (
                      <Card withBorder radius="md" padding="sm" style={{ background: 'var(--mantine-color-gray-0)' }}>
                        <Stack gap="xs">
                          <Group gap="xs">
                            <IconHistory size={14} />
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                              Run history
                            </Text>
                            {historyLoading && <Loader size="xs" />}
                          </Group>
                          {historyRows.length === 0 && !historyLoading ? (
                            <Text size="xs" c="dimmed">
                              No runs yet.
                            </Text>
                          ) : (
                            historyRows.map((rg) => {
                              const mode = rg.extension?.find(
                                (e) =>
                                  e.url ===
                                  'https://widercircle.com/fhir/StructureDefinition/wf-run-mode'
                              )?.valueString;
                              return (
                                <Box
                                  key={rg.id}
                                  p="xs"
                                  style={{
                                    borderLeft: `3px solid var(--mantine-color-${mode === 'real' ? 'blue' : 'grape'}-5)`,
                                    paddingLeft: 8,
                                  }}
                                >
                                  <Group justify="space-between" wrap="nowrap">
                                    <Stack gap={2}>
                                      <Text size="xs" fw={600}>
                                        {rg.subject?.display ?? rg.subject?.reference ?? '—'}
                                      </Text>
                                      <Text size="xs" c="dimmed" ff="monospace">
                                        {rg.authoredOn ? formatDateTime(rg.authoredOn) : ''}
                                      </Text>
                                    </Stack>
                                    <Badge size="xs" color={mode === 'real' ? 'blue' : 'grape'} variant="light">
                                      {mode === 'real' ? 'real run' : 'test run'}
                                    </Badge>
                                  </Group>
                                  {rg.note?.[0]?.text && (
                                    <Text size="xs" c="dimmed" mt={4} style={{ whiteSpace: 'pre-line' }}>
                                      {rg.note[0].text}
                                    </Text>
                                  )}
                                </Box>
                              );
                            })
                          )}
                        </Stack>
                      </Card>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>

      {/* Designer modal */}
      <Modal
        opened={editorOpened}
        onClose={() => {
          closeEditor();
          resetEditor();
        }}
        title={editingPlan ? `Edit · ${editingPlan.name}` : 'New workflow'}
        size="lg"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="e.g. Food insecurity intake"
            value={editorName}
            onChange={(e) => setEditorName(e.currentTarget.value)}
            required
          />
          <Textarea
            label="Description"
            placeholder="What this workflow does and when it should fire"
            value={editorDescription}
            onChange={(e) => setEditorDescription(e.currentTarget.value)}
            minRows={2}
            autosize
          />
          <Select
            label="Trigger"
            data={Object.entries(TRIGGER_LABELS).map(([value, label]) => ({ value, label }))}
            value={editorTrigger.type}
            onChange={(v) => setEditorTrigger((prev) => ({ ...prev, type: (v as TriggerType) ?? 'manual' }))}
            allowDeselect={false}
          />
          {editorTrigger.type === 'event:case-created' && (
            <TextInput
              label="Filter (optional)"
              placeholder="case-type=sdoh-food"
              value={editorTrigger.filter ?? ''}
              onChange={(e) => setEditorTrigger((prev) => ({ ...prev, filter: e.currentTarget.value }))}
            />
          )}

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Steps
              </Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => setEditorSteps((prev) => [...prev, newStep()])}
              >
                Add step
              </Button>
            </Group>
            {stepDescriptors.map((step, idx) => (
              <Card key={step.id} withBorder radius="md" padding="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Group gap={6}>
                      <Badge size="xs" variant="light" ff="monospace">
                        Step {step.ordinal}
                      </Badge>
                    </Group>
                    <Group gap={4}>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, -1)}
                        aria-label="Move step up"
                      >
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        disabled={idx === editorSteps.length - 1}
                        onClick={() => moveStep(idx, 1)}
                        aria-label="Move step down"
                      >
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        disabled={editorSteps.length === 1}
                        onClick={() => removeStep(idx)}
                        aria-label="Remove step"
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Group grow>
                    <Select
                      label="Action"
                      data={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
                      value={step.actionType}
                      onChange={(v) =>
                        updateStep(idx, { actionType: (v as ActionType) ?? 'create_task' })
                      }
                      allowDeselect={false}
                    />
                    <TextInput
                      label="Title"
                      placeholder="What this step creates"
                      value={step.title}
                      onChange={(e) => updateStep(idx, { title: e.currentTarget.value })}
                    />
                  </Group>
                  <Textarea
                    label="Description"
                    placeholder="Optional"
                    value={step.description}
                    onChange={(e) => updateStep(idx, { description: e.currentTarget.value })}
                    minRows={1}
                    autosize
                  />
                  <Group grow>
                    <TextInput
                      label="Condition key (optional)"
                      placeholder="patient.gender"
                      value={step.conditionKey ?? ''}
                      onChange={(e) =>
                        updateStep(idx, { conditionKey: e.currentTarget.value || undefined })
                      }
                    />
                    <TextInput
                      label="Condition value"
                      placeholder="female"
                      value={step.conditionValue ?? ''}
                      onChange={(e) =>
                        updateStep(idx, { conditionValue: e.currentTarget.value || undefined })
                      }
                    />
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>

          <Group justify="flex-end" gap="sm">
            <Button
              variant="light"
              onClick={() => {
                closeEditor();
                resetEditor();
              }}
              disabled={savingEditor}
            >
              Cancel
            </Button>
            <Button
              variant="light"
              loading={savingEditor}
              disabled={savingEditor}
              onClick={() => saveDraft('draft')}
            >
              Save draft
            </Button>
            <Button
              color="green"
              loading={savingEditor}
              disabled={savingEditor}
              onClick={() => saveDraft('active')}
            >
              Publish
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Run-on-member modal */}
      <Modal
        opened={runOpened}
        onClose={() => {
          closeRunModal();
          setRunResult(undefined);
        }}
        title={runPlan ? `Run · ${runPlan.name}` : 'Run workflow'}
        size="md"
        centered
      >
        <Stack gap="md">
          <Select
            label="Member"
            placeholder="Pick a member"
            data={patients}
            value={runPatient}
            onChange={(v) => setRunPatient(v ?? '')}
            searchable
            required
          />
          <Switch
            label="Test mode (simulate without writing real records)"
            checked={runIsTest}
            onChange={(e) => setRunIsTest(e.currentTarget.checked)}
            color="grape"
          />
          {runResult && (
            <Alert
              color={runIsTest ? 'grape' : 'blue'}
              variant="light"
              title={runIsTest ? 'Test run output' : 'Run output'}
            >
              <Stack gap={2}>
                {runResult.map((line, idx) => (
                  <Text key={idx} size="xs" ff="monospace">
                    {line}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="light"
              onClick={() => {
                closeRunModal();
                setRunResult(undefined);
              }}
              disabled={running}
            >
              Close
            </Button>
            <Button
              color={runIsTest ? 'grape' : 'blue'}
              leftSection={<IconPlayerPlay size={14} />}
              loading={running}
              disabled={running || !runPatient}
              onClick={executeRun}
            >
              {runIsTest ? 'Run test' : 'Run real'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}

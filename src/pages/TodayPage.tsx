// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Appointment, Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconCheck,
  IconClipboardCheck,
  IconClock,
  IconHeartHandshake,
  IconLockAccess,
  IconNotebook,
  IconPlus,
  IconShieldCheck,
  IconSignature,
  IconStethoscope,
} from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getActiveCarePlanRef } from '../utils/care-plan-link';
import { useRole } from '../auth/RoleContext';
import type { Permission } from '../auth/roles';

type PriorityOption = 'urgent' | 'asap' | 'routine';

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'red',
  asap: 'orange',
  routine: 'blue',
};

// Use local calendar date (not UTC) — FHIR due dates are authored in the user's local
// calendar, so a 9pm PT task saved as 2026-04-24 must still count as "today" at 9pm PT
// even though UTC already rolled over.
const todayISO = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const appointmentTime = (appt: Appointment): string => {
  if (!appt.start) {
    return '—';
  }
  return formatDateTime(appt.start).split(',').pop()?.trim() ?? formatDateTime(appt.start);
};

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
  permission?: Permission;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'SDoH assessment',
    description: 'PRAPARE screening · CHW or send to patient',
    href: '/sdoh',
    icon: IconHeartHandshake,
    permission: 'sdoh.administer',
  },
  {
    label: 'Capture consent',
    description: 'Telehealth + CHI · verbal or e-sig',
    href: '/consent',
    icon: IconSignature,
    permission: 'consent.capture',
  },
  {
    label: 'Eligibility check',
    description: 'Bridge real-time benefits',
    href: '/eligibility',
    icon: IconShieldCheck,
    permission: 'eligibility.check',
  },
  {
    label: 'Author Plan of Care',
    description: 'Provider — narrative + action items',
    href: '/plan-of-care',
    icon: IconNotebook,
    permission: 'careplan.author',
  },
  {
    label: 'Review plan',
    description: 'CHW / clinical staff acknowledge',
    href: '/plan-review',
    icon: IconClipboardCheck,
    permission: 'careplan.review',
  },
  {
    label: 'Edit plan',
    description: 'CHW updates as care progresses',
    href: '/plan-edit',
    icon: IconStethoscope,
    permission: 'careplan.edit',
  },
  {
    label: 'Time tracking',
    description: 'CCM stopwatch · billable minutes',
    href: '/time-tracking',
    icon: IconClock,
    permission: 'time.track',
  },
  {
    label: 'Submit for review',
    description: 'CHW — flag work for Provider sign-off',
    href: '/review-submission',
    icon: IconLockAccess,
    permission: 'review.submit',
  },
];

export function TodayPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { hasPermission } = useRole();
  const visibleQuickActions = useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.permission || hasPermission(a.permission)),
    [hasPermission]
  );

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPatient, setFormPatient] = useState('');
  const [formDueDate, setFormDueDate] = useState(todayISO());
  const [formPriority, setFormPriority] = useState<PriorityOption>('routine');

  const profile = medplum.getProfile();
  const practitionerRef = profile ? `Practitioner/${profile.id}` : undefined;
  const practitionerName = profile
    ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
    : 'Clinician';

  const fetchEverything = useCallback(async () => {
    if (!practitionerRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [apptResults, taskResults, patientResults] = await Promise.all([
        medplum.searchResources(
          'Appointment',
          `practitioner=${practitionerRef}&_sort=date&_count=100`
        ),
        medplum.searchResources('Task', `owner=${practitionerRef}&_count=100`),
        medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated'),
      ]);
      setAppointments(apptResults);
      setTasks(taskResults);
      setPatients(
        patientResults.map((p: Patient) => ({
          value: p.id ?? '',
          label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, practitionerRef]);

  useEffect(() => {
    fetchEverything().catch(console.error);
  }, [fetchEverything]);

  const today = todayISO();

  const scheduleToday = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== 'cancelled' && a.start?.startsWith(today))
        .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    [appointments, today]
  );

  const dueToday = useMemo(
    () =>
      tasks.filter(
        (t) => t.status !== 'completed' && t.restriction?.period?.end?.slice(0, 10) === today
      ),
    [tasks, today]
  );

  const overdue = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status === 'completed') {
          return false;
        }
        const due = t.restriction?.period?.end?.slice(0, 10);
        return !!due && due < today;
      }),
    [tasks, today]
  );

  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormDescription('');
    setFormPatient('');
    setFormDueDate(today);
    setFormPriority('routine');
  }, [today]);

  const handleCreate = useCallback(async () => {
    if (!formTitle.trim() || !practitionerRef) {
      return;
    }
    // Close the modal immediately so the user doesn't stare at the form during the
    // network round trip. The create then runs in the background; success shows a
    // toast and refreshes, failure shows an error toast (form data is lost, same as
    // any optimistic-UI tradeoff — acceptable for a manual task with no heavy payload).
    // CD-08 linkage: when a member is selected, stamp the Task's basedOn with
    // their active CarePlan so the task surfaces under the plan and so billing
    // rules can attribute the work to the right plan version.
    const carePlanRef = formPatient ? await getActiveCarePlanRef(medplum, formPatient) : undefined;
    const payload: Task = {
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority: formPriority,
      code: { text: formTitle.trim() },
      description: formDescription.trim() || undefined,
      for: formPatient
        ? {
            reference: `Patient/${formPatient}`,
            display: patients.find((p) => p.value === formPatient)?.label ?? '',
          }
        : undefined,
      basedOn: carePlanRef ? [carePlanRef] : undefined,
      owner: { reference: practitionerRef, display: practitionerName },
      restriction: formDueDate ? { period: { end: formDueDate } } : undefined,
      authoredOn: new Date().toISOString(),
    };
    closeModal();
    resetForm();
    try {
      await medplum.createResource<Task>(payload);
      showNotification({
        color: 'green',
        message: carePlanRef
          ? 'Task created and linked to active Care Plan'
          : 'Task created',
      });
      await fetchEverything();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [
    medplum,
    practitionerRef,
    practitionerName,
    patients,
    formTitle,
    formDescription,
    formPatient,
    formDueDate,
    formPriority,
    closeModal,
    resetForm,
    fetchEverything,
  ]);

  const handleComplete = useCallback(
    async (taskId: string | undefined) => {
      if (!taskId) {
        return;
      }
      try {
        const task = await medplum.readResource('Task', taskId);
        await medplum.updateResource({ ...task, status: 'completed' });
        showNotification({ color: 'green', message: 'Task completed' });
        await fetchEverything();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, fetchEverything]
  );

  const greeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good morning';
    }
    if (hour < 18) {
      return 'Good afternoon';
    }
    return 'Good evening';
  };

  const taskRow = (task: Task, isOverdue: boolean): JSX.Element => {
    const patientRef = task.for?.reference;
    const patientId = patientRef?.startsWith('Patient/') ? patientRef.replace('Patient/', '') : undefined;
    const due = task.restriction?.period?.end?.slice(0, 10);
    return (
      <Group
        key={task.id}
        justify="space-between"
        wrap="nowrap"
        p="sm"
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          backgroundColor: isOverdue ? 'var(--mantine-color-red-0)' : undefined,
        }}
      >
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ActionIcon
            variant="subtle"
            color="green"
            onClick={() => handleComplete(task.id)}
            aria-label={`Complete task ${task.code?.text ?? task.description ?? ''}`}
          >
            <IconCheck size={16} />
          </ActionIcon>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text
              fw={500}
              size="sm"
              c="blue"
              style={{ cursor: 'pointer' }}
              onClick={() => task.id && navigate(`/Task/${task.id}`)}
              title="Open task details"
              truncate
            >
              {task.code?.text ?? task.description ?? 'Untitled task'}
            </Text>
            {patientId && (
              <Text
                size="xs"
                c="dimmed"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/Patient/${patientId}`)}
              >
                {task.for?.display ?? patientRef}
              </Text>
            )}
          </Stack>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {due && (
            <Badge color={isOverdue ? 'red' : 'gray'} variant={isOverdue ? 'filled' : 'light'} size="sm">
              {isOverdue ? `${formatDate(due)} overdue` : formatDate(due)}
            </Badge>
          )}
          <Badge color={PRIORITY_COLOR[task.priority ?? 'routine'] ?? 'gray'} size="sm" variant="light">
            {task.priority ?? 'routine'}
          </Badge>
        </Group>
      </Group>
    );
  };

  return (
    <Document>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2}>
              {greeting()}, {practitionerName}.
            </Title>
            <Text c="dimmed" size="sm">
              {formatDate(today)}
            </Text>
          </Stack>
          <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
            New task
          </Button>
        </Group>

        {/* Quick actions — every demo-relevant standalone flow lives behind one
            click. Permissions hide actions the active role can't perform so the
            on-stage role-switch trims the rail to what each persona uses. */}
        {visibleQuickActions.length > 0 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Quick actions</Title>
                <Text size="xs" c="dimmed">
                  Launch the workflows you use most — no URL typing required.
                </Text>
              </Group>
              <Group gap="xs" wrap="wrap">
                {visibleQuickActions.map((action) => (
                  <Button
                    key={action.href}
                    variant="light"
                    color="blue"
                    leftSection={<action.icon size={14} />}
                    onClick={() => navigate(action.href)}
                    title={action.description}
                  >
                    {action.label}
                  </Button>
                ))}
              </Group>
            </Stack>
          </Card>
        )}

        {loading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : (
          <>
            {/* Schedule today */}
            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={4}>Schedule today</Title>
                  <Badge variant="light">{scheduleToday.length}</Badge>
                </Group>
                {scheduleToday.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    Clear day.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {scheduleToday.map((appt) => {
                      const patient = appt.participant?.find((p) =>
                        p.actor?.reference?.startsWith('Patient/')
                      );
                      const patientId = patient?.actor?.reference?.replace('Patient/', '');
                      const type = appt.appointmentType?.coding?.[0]?.code ?? appt.appointmentType?.text ?? '—';
                      return (
                        <Group
                          key={appt.id}
                          justify="space-between"
                          wrap="nowrap"
                          p="sm"
                          style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                        >
                          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                            <Text fw={600} size="sm" ff="monospace" w={72}>
                              {appointmentTime(appt)}
                            </Text>
                            <Text
                              size="sm"
                              c={patientId ? 'blue' : undefined}
                              style={patientId ? { cursor: 'pointer' } : undefined}
                              onClick={() => patientId && navigate(`/Patient/${patientId}`)}
                              truncate
                            >
                              {patient?.actor?.display ?? '—'}
                            </Text>
                          </Group>
                          <Badge variant="light" size="sm">
                            {type}
                          </Badge>
                        </Group>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </Card>

            {/* Due today */}
            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={4}>Due today</Title>
                  <Badge variant="light">{dueToday.length}</Badge>
                </Group>
                {dueToday.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    Nothing due today — nice.
                  </Text>
                ) : (
                  <Stack gap="xs">{dueToday.map((t) => taskRow(t, false))}</Stack>
                )}
              </Stack>
            </Card>

            {/* Overdue */}
            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={4}>Overdue</Title>
                  <Badge
                    color={overdue.length > 0 ? 'red' : 'gray'}
                    variant={overdue.length > 0 ? 'filled' : 'light'}
                  >
                    {overdue.length}
                  </Badge>
                </Group>
                {overdue.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    No overdue items.
                  </Text>
                ) : (
                  <Stack gap="xs">{overdue.map((t) => taskRow(t, true))}</Stack>
                )}
              </Stack>
            </Card>
          </>
        )}
      </Stack>

      <Modal opened={modalOpened} onClose={closeModal} title="New task" size="md">
        <Stack gap="md">
          <TextInput
            label="Title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.currentTarget.value)}
            placeholder="e.g. Follow up on BP reading"
            required
            autoFocus
          />
          <Textarea
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.currentTarget.value)}
            placeholder="Optional details"
            minRows={2}
          />
          <Select
            label="Member (optional)"
            data={patients}
            value={formPatient}
            onChange={(v) => setFormPatient(v ?? '')}
            searchable
            clearable
          />
          <TextInput
            label="Due date"
            type="date"
            value={formDueDate}
            onChange={(e) => setFormDueDate(e.currentTarget.value)}
          />
          <Select
            label="Priority"
            // FHIR ordering (ascending): routine < urgent < asap < stat.
            // Label → value must preserve that ordering so SLA rules and sorts stay sane.
            data={[
              { value: 'asap', label: 'High' },
              { value: 'urgent', label: 'Medium' },
              { value: 'routine', label: 'Low' },
            ]}
            value={formPriority}
            onChange={(v) => setFormPriority((v as PriorityOption) ?? 'routine')}
          />
          <Button onClick={handleCreate} disabled={!formTitle.trim()} fullWidth>
            Add task
          </Button>
        </Stack>
      </Modal>
    </Document>
  );
}

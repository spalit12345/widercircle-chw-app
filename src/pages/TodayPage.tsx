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
import { useMedplum } from '@medplum/react';
import { Today360View } from '../components/Today360View';
import { TodayCaseloadRail } from '../components/TodayCaseloadRail';
import {
  IconBell,
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
  const [patientResources, setPatientResources] = useState<Patient[]>([]);
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
      setPatientResources(patientResults);
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

  const greetingName =
    practitionerName.split(' ')[0] || 'CHW';
  const patientLabelFor = (ref: string | undefined): string | undefined => {
    if (!ref) return undefined;
    const id = ref.startsWith('Patient/') ? ref.slice('Patient/'.length) : ref;
    return patients.find((p) => p.value === id)?.label;
  };

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  const visitsToday = scheduleToday.length;
  const taskCount = dueToday.length + overdue.length;
  const overdueNow = overdue.length;
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
        {/* v2 top header — full width above the rails. Status indicator on
            left, member-style identity (greeting + date), chip stats, then a
            single notification bell on the right. New-task and Add-member
            buttons explicitly NOT included per the user's last instruction —
            New-task moves to the Tasks section header below. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 28px',
            borderBottom: '1px solid var(--wc-base-200, #E2E6E9)',
            background: '#fff',
            flexWrap: 'wrap',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: 'var(--wc-success-500, #2F8A89)',
              }}
            />
            <span
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.06em',
                color: 'var(--wc-success-700, #015F5D)',
                textTransform: 'uppercase',
              }}
            >
              {greeting()}, {practitionerName}
            </span>
          </div>
          <span
            style={{
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--wc-base-800, #012B49)',
              marginLeft: 14,
            }}
          >
            {dateLine}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 14,
              background: 'var(--wc-primary-100, #FDEEE6)',
              color: 'var(--wc-primary-700, #B84E1A)',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--wc-primary-500, #EA6424)' }} />
            {visitsToday} visit{visitsToday === 1 ? '' : 's'} · {taskCount} task{taskCount === 1 ? '' : 's'}
          </span>
          {overdueNow > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 14,
                background: 'var(--wc-error-100, #FCE9E1)',
                color: 'var(--wc-error-700, #A73304)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--wc-error-600, #D1190D)' }} />
              {overdueNow} overdue
            </span>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 14,
              background: 'var(--wc-info-100, #EAF7FA)',
              color: 'var(--wc-info-700, #015F5D)',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Threshold cohort widget arrives with the cohort dashboard"
          >
            <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--wc-info-500, #5AA8B8)' }} />
            CCM threshold cohort · pending
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: '1px solid var(--wc-base-200, #E2E6E9)',
              background: '#fff',
              color: 'var(--wc-base-700, #34556D)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <IconBell size={16} />
            {overdueNow > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 10,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--wc-primary-500, #EA6424)',
                  border: '2px solid #fff',
                }}
              />
            )}
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <TodayCaseloadRail
            patients={patientResources}
            appointments={appointments}
            tasks={tasks}
            todayISO={today}
            appointmentTime={appointmentTime}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Today360View
            greetingName={greetingName}
            todayLabel={today}
            scheduleToday={scheduleToday}
            dueToday={dueToday}
            overdue={overdue}
            appointmentTime={appointmentTime}
            patientLabelFor={patientLabelFor}
            onNewTask={openModal}
            onOpenAppointment={(_apptId, patientId) => {
              if (patientId) navigate(`/members/${patientId}`);
            }}
            onOpenTask={(taskId) => taskId && navigate(`/Task/${taskId}`)}
            onOpenPatient={(patientId) => patientId && navigate(`/Patient/${patientId}`)}
            onNavigate={navigate}
          />
        </div>
      </div>
      </div>

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
    </>
  );
}

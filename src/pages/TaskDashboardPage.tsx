// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDate, normalizeErrorString } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconExternalLink, IconLockAccess, IconPlus, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useRole } from '../auth/RoleContext';

interface TaskRow {
  id: string;
  patient: string;
  patientId: string;
  description: string;
  dueDate: string;
  priority: string;
  status: string;
}

export function TaskDashboardPage(): JSX.Element {
  const { hasPermission } = useRole();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  // Form state
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [formPatient, setFormPatient] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formPriority, setFormPriority] = useState('routine');

  const profile = medplum.getProfile();

  const fetchTasks = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Task', `owner=Practitioner/${profile?.id}&_count=100`);
      const rows: TaskRow[] = results.map((t: Task) => ({
        id: t.id ?? '',
        patient: t.for?.display ?? t.for?.reference ?? '—',
        patientId: t.for?.reference?.replace('Patient/', '') ?? '',
        description: t.description ?? '',
        dueDate: t.restriction?.period?.end ?? '',
        priority: t.priority ?? 'routine',
        status: t.status ?? 'requested',
      }));
      setTasks(rows);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, profile?.id]);

  const fetchPatients = useCallback(async () => {
    try {
      const pts = await medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated');
      setPatients(
        pts.map((p: Patient) => ({
          value: p.id ?? '',
          label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim(),
        }))
      );
    } catch {
      // ignore
    }
  }, [medplum]);

  useEffect(() => {
    fetchTasks().catch(console.error);
    fetchPatients().catch(console.error);
  }, [fetchTasks, fetchPatients]);

  const handleCreate = useCallback(async () => {
    if (!formDescription.trim() || !formPatient) {
      return;
    }
    try {
      const patientLabel = patients.find((p) => p.value === formPatient)?.label ?? '';
      await medplum.createResource({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: formPriority as Task['priority'],
        description: formDescription,
        for: { reference: `Patient/${formPatient}`, display: patientLabel },
        owner: { reference: `Practitioner/${profile?.id}`, display: `${profile?.name?.[0]?.given?.[0] ?? ''} ${profile?.name?.[0]?.family ?? ''}`.trim() },
        restriction: formDueDate ? { period: { end: formDueDate } } : undefined,
      });
      showNotification({ color: 'green', message: 'Task created' });
      closeModal();
      setFormDescription('');
      setFormPatient('');
      setFormDueDate('');
      setFormPriority('routine');
      await fetchTasks();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum, profile, formPatient, formDescription, formDueDate, formPriority, patients, closeModal, fetchTasks]);

  const handleComplete = useCallback(
    async (taskId: string) => {
      try {
        const task = await medplum.readResource('Task', taskId);
        await medplum.updateResource({ ...task, status: 'completed' });
        showNotification({ color: 'green', message: 'Task completed' });
        await fetchTasks();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, fetchTasks]
  );

  const today = new Date().toISOString().split('T')[0];
  const filtered = tasks
    .filter((t) => t.status !== 'completed')
    .filter((t) => {
      if (filter === 'today') {
        return t.dueDate === today;
      }
      if (filter === 'overdue') {
        return t.dueDate && t.dueDate < today;
      }
      return true;
    })
    .sort((a, b) => {
      // Overdue first, then today, then future
      const aOverdue = a.dueDate && a.dueDate < today ? 0 : a.dueDate === today ? 1 : 2;
      const bOverdue = b.dueDate && b.dueDate < today ? 0 : b.dueDate === today ? 1 : 2;
      if (aOverdue !== bOverdue) {
        return aOverdue - bOverdue;
      }
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });

  const priorityColor: Record<string, string> = { urgent: 'red', asap: 'orange', routine: 'blue' };

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>My Tasks</Title>
          <Group>
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              data={[
                { label: 'All', value: 'all' },
                { label: 'Today', value: 'today' },
                { label: 'Overdue', value: 'overdue' },
              ]}
              size="sm"
            />
            <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
              New Task
            </Button>
          </Group>
        </Group>

        {/* Cross-queue links so the demo never has to type a URL. Permission-
            gated: CHW sees Submit-for-review; Provider sees Sign-off queue. */}
        <Group gap="xs" wrap="wrap">
          {hasPermission('queue.signoff') && (
            <Button
              variant="light"
              color="grape"
              leftSection={<IconShieldCheck size={14} />}
              onClick={() => navigate('/signoff-queue')}
            >
              Provider sign-off queue
            </Button>
          )}
          {hasPermission('review.submit') && (
            <Button
              variant="light"
              color="indigo"
              leftSection={<IconLockAccess size={14} />}
              onClick={() => navigate('/review-submission')}
            >
              Submit for review
            </Button>
          )}
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconExternalLink size={14} />}
            onClick={() => navigate('/Task')}
          >
            Open full task board
          </Button>
        </Group>

        {loading ? (
          <Center py="xl"><Loader size="lg" /></Center>
        ) : filtered.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {filter === 'all' ? 'No open tasks. Click "New Task" to create one.' : `No ${filter} tasks.`}
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40}></Table.Th>
                <Table.Th>Patient</Table.Th>
                <Table.Th>Task</Table.Th>
                <Table.Th>Due Date</Table.Th>
                <Table.Th>Priority</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((task) => {
                const isOverdue = task.dueDate && task.dueDate < today;
                return (
                  <Table.Tr key={task.id} style={isOverdue ? { backgroundColor: 'var(--mantine-color-red-0)' } : undefined}>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="green" onClick={() => handleComplete(task.id)} aria-label="Complete task">
                        <IconCheck size={16} />
                      </ActionIcon>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        size="sm"
                        c="blue"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/Patient/${task.patientId}`)}
                      >
                        {task.patient}
                      </Text>
                    </Table.Td>
                    <Table.Td>{task.description}</Table.Td>
                    <Table.Td>
                      {task.dueDate ? (
                        <Text size="sm" c={isOverdue ? 'red' : undefined} fw={isOverdue ? 700 : undefined}>
                          {formatDate(task.dueDate)}
                          {isOverdue && ' (overdue)'}
                        </Text>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={priorityColor[task.priority] ?? 'gray'} size="sm">{task.priority}</Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Modal opened={modalOpened} onClose={closeModal} title="New Task" size="md">
        <Stack gap="md">
          <Select label="Patient" data={patients} value={formPatient} onChange={(v) => setFormPatient(v ?? '')} searchable required />
          <Textarea label="Task Description" value={formDescription} onChange={(e) => setFormDescription(e.currentTarget.value)} placeholder="What needs to be done..." minRows={2} required />
          <TextInput label="Due Date" type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.currentTarget.value)} />
          <Select
            label="Priority"
            data={[
              { value: 'urgent', label: 'High' },
              { value: 'asap', label: 'Medium' },
              { value: 'routine', label: 'Low' },
            ]}
            value={formPriority}
            onChange={(v) => setFormPriority(v ?? 'routine')}
          />
          <Button onClick={handleCreate} disabled={!formDescription.trim() || !formPatient} fullWidth>
            Create Task
          </Button>
        </Stack>
      </Modal>
    </Document>
  );
}

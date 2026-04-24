// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconClock, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

const REVIEW_TASK_CODE = 'plan-review-submission';

/** Priority/SLA helper: how long a submission has been pending sign-off. */
export const pendingHours = (task: Task, now: number = Date.now()): number => {
  if (!task.authoredOn) return 0;
  return Math.floor((now - new Date(task.authoredOn).getTime()) / 3_600_000);
};

export const slaTone = (hours: number): 'green' | 'yellow' | 'red' => {
  if (hours >= 72) return 'red';
  if (hours >= 24) return 'yellow';
  return 'green';
};

export function SignOffQueuePage(): JSX.Element {
  const medplum = useMedplum();
  const [queue, setQueue] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tasks = await medplum.searchResources(
        'Task',
        `code=${REVIEW_TASK_CODE}&status=requested&_sort=authored&_count=50`
      );
      setQueue(tasks);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => { load().catch(console.error); }, [load]);

  const respond = useCallback(async (task: Task, decision: 'approve' | 'revise') => {
    if (!task.id) return;
    setActing(task.id);
    try {
      const updated: Task = {
        ...task,
        businessStatus: {
          coding: [{
            system: 'https://widercircle.com/fhir/CodeSystem/review-state',
            code: decision === 'approve' ? 'approved' : 'revision-requested',
          }],
          text: decision === 'approve' ? 'Approved — lock retained for audit' : 'Revision requested',
        },
        status: decision === 'approve' ? 'completed' : 'rejected',
      };
      await medplum.updateResource<Task>(updated);
      showNotification({ color: decision === 'approve' ? 'green' : 'yellow', message: `Submission ${decision === 'approve' ? 'approved' : 'returned for revision'}` });
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setActing(undefined);
    }
  }, [medplum, load]);

  if (loading) return <Document><Loader /></Document>;

  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Sign-off queue</Title>
          <Text c="dimmed" size="sm">Provider queue of Plans of Care submitted for review. Approve (lock retained for audit) or return for revision. Sorted by oldest pending.</Text>
        </Stack>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between">
            <Title order={5}>Pending</Title>
            <Badge variant="light">{queue.length}</Badge>
          </Group>
        </Card>

        {queue.length === 0 ? (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />} title="Nothing pending">
            <Text size="sm">No submissions awaiting sign-off. CHW team is caught up.</Text>
          </Alert>
        ) : (
          <Stack gap="xs">
            {queue.map((t) => {
              const hours = pendingHours(t);
              const tone = slaTone(hours);
              return (
                <Card key={t.id} withBorder radius="md" padding="md">
                  <Group justify="space-between" wrap="wrap" gap="md">
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Group gap="xs">
                        <Text fw={600} size="sm">{t.requester?.display ?? '—'}</Text>
                        <Text size="xs" c="dimmed">→ {t.for?.display ?? t.for?.reference ?? 'member'}</Text>
                      </Group>
                      <Group gap="xs">
                        <Badge color={tone} variant="light" leftSection={<IconClock size={12} />}>
                          {hours}h pending
                        </Badge>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {t.authoredOn ? formatDateTime(t.authoredOn) : ''}
                        </Text>
                      </Group>
                    </Stack>
                    <Group>
                      <Button color="green" size="xs" leftSection={<IconCheck size={14} />} onClick={() => respond(t, 'approve')} loading={acting === t.id}>
                        Approve
                      </Button>
                      <Button color="yellow" size="xs" variant="light" leftSection={<IconX size={14} />} onClick={() => respond(t, 'revise')} loading={acting === t.id}>
                        Revise
                      </Button>
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Document>
  );
}

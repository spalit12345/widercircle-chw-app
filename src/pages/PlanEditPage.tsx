// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Alert, Badge, Button, Card, Group, Loader, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CarePlan, CarePlanActivity, Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { isPlanLocked, latestReviewState, type ReviewState } from './SubmitForReviewPage';

type ItemStatus = 'not-started' | 'in-progress' | 'completed' | 'cancelled' | 'on-hold';

const STATUS_LABELS: Record<ItemStatus, string> = {
  'not-started': 'Open',
  'in-progress': 'In Progress',
  completed: 'Complete',
  cancelled: 'Cancelled',
  'on-hold': 'Blocked',
};

export interface EditableItem {
  id: string;
  title: string;
  description: string;
  status: ItemStatus;
  billable: boolean;
}

export const hasBillableCompletion = (before: EditableItem[], after: EditableItem[]): boolean => {
  return after.some((aItem) => {
    if (!aItem.billable || aItem.status !== 'completed') return false;
    const previous = before.find((b) => b.id === aItem.id);
    return !previous || previous.status !== 'completed';
  });
};

const itemFromActivity = (activity: CarePlanActivity, idx: number): EditableItem => {
  const detail = activity.detail;
  const coding = detail?.code?.coding?.[0];
  const status = (detail?.status ?? 'not-started') as ItemStatus;
  return {
    id: coding?.code ?? `item-${idx}`,
    title: detail?.description ?? `Action item ${idx + 1}`,
    description: detail?.code?.text ?? '',
    status: (['not-started', 'in-progress', 'completed', 'cancelled', 'on-hold'] as const).includes(status)
      ? status
      : 'not-started',
    billable: Boolean(coding?.display?.includes('billable')),
  };
};

export function PlanEditPage(): JSX.Element {
  const medplum = useMedplum();
  const [searchParams] = useSearchParams();
  const initialPatient = searchParams.get('patient') ?? '';
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [loading, setLoading] = useState(true);
  const [latestPlan, setLatestPlan] = useState<CarePlan | undefined>();
  const [originalItems, setOriginalItems] = useState<EditableItem[]>([]);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const [reviewState, setReviewState] = useState<ReviewState>('draft');

  const profile = medplum.getProfile();

  const loadPatients = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated');
      setPatients(results.map((p: Patient) => ({
        value: p.id ?? '',
        label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
      })));
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  const loadPlan = useCallback(async (patientId: string) => {
    if (!patientId) {
      setLatestPlan(undefined);
      setItems([]);
      setOriginalItems([]);
      setVersionCount(0);
      setReviewState('draft');
      return;
    }
    try {
      const [plans, reviewTasks] = await Promise.all([
        medplum.searchResources('CarePlan', `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=20`),
        medplum
          .searchResources(
            'Task',
            `patient=Patient/${patientId}&code=plan-review-submission&_sort=-_lastUpdated&_count=10`
          )
          .catch(() => [] as Task[]),
      ]);
      setVersionCount(plans.length);
      const latest = plans[0];
      setLatestPlan(latest);
      const parsed = latest ? (latest.activity ?? []).map((a, i) => itemFromActivity(a, i)) : [];
      setItems(parsed);
      setOriginalItems(parsed);
      // Only the review tasks for this plan version count toward the lock.
      const planTasks = latest?.id
        ? reviewTasks.filter((t) => t.focus?.reference === `CarePlan/${latest.id}`)
        : [];
      setReviewState(latestReviewState(planTasks));
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum]);

  useEffect(() => { loadPatients().catch(console.error); }, [loadPatients]);
  useEffect(() => { loadPlan(selectedPatient).catch(console.error); }, [selectedPatient, loadPlan]);

  const saveEdits = useCallback(async () => {
    if (!latestPlan || !selectedPatient) return;
    setSaving(true);
    try {
      const newPlan: CarePlan = {
        ...latestPlan,
        id: undefined,
        meta: undefined,
        created: new Date().toISOString(),
        author: profile ? { reference: `Practitioner/${profile.id}` } : latestPlan.author,
        activity: items.map((item) => ({
          detail: {
            status: item.status,
            description: item.title,
            code: {
              text: item.description || undefined,
              coding: [{ code: item.id, display: item.billable ? 'billable' : undefined }],
            },
          },
        })),
      };
      const saved = await medplum.createResource<CarePlan>(newPlan);
      const willFlag = hasBillableCompletion(originalItems, items);
      showNotification({
        color: willFlag ? 'yellow' : 'green',
        message: willFlag
          ? 'Saved · billable completion triggered Provider review flag (AC-3)'
          : 'Plan saved · new version created',
      });
      setLatestPlan(saved);
      setOriginalItems(items);
      setVersionCount((v) => v + 1);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }, [latestPlan, selectedPatient, items, originalItems, profile, medplum]);

  const addItem = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    setItems((prev) => [...prev, { id: `item-${Date.now()}`, title, description: '', status: 'not-started', billable: false }]);
    setNewTitle('');
  }, [newTitle]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'cancelled' as const } : i)));
  }, []);

  const updateStatus = useCallback((id: string, status: ItemStatus) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }, []);

  const dirty = useMemo(() => JSON.stringify(items) !== JSON.stringify(originalItems), [items, originalItems]);
  const flagPending = useMemo(() => hasBillableCompletion(originalItems, items), [originalItems, items]);
  const locked = isPlanLocked(reviewState);

  if (loading) return <Document><Loader /></Document>;

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2}>Plan edit (CHW)</Title>
            <Text c="dimmed" size="sm">Daily-use editor — edit status, add items, complete tasks. Each save creates a new version.</Text>
          </Stack>
          {latestPlan && <Badge variant="light" ff="monospace">v{versionCount}</Badge>}
        </Group>

        <Select label="Member" placeholder="Pick a member" data={patients} value={selectedPatient} onChange={(v) => setSelectedPatient(v ?? '')} searchable required />

        {selectedPatient && !latestPlan && (
          <Alert color="yellow" variant="light" icon={<IconLock size={16} />} title="No plan to edit">
            <Text size="sm">This member has no Plan of Care yet. Provider authors first via /plan-of-care (CD-08).</Text>
          </Alert>
        )}

        {latestPlan && locked && (
          <Alert color="orange" variant="light" icon={<IconLock size={16} />} title={`Plan locked — ${reviewState === 'approved' ? 'approved by Provider' : 'awaiting Provider review'}`}>
            <Text size="sm">
              Editing is disabled while the plan is in supervision (CD-14 lock). To make changes, request a revision via the review submission page.
            </Text>
          </Alert>
        )}

        {latestPlan && (
          <>
            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={5}>Action items</Title>
                  <Badge variant="light">{items.filter((i) => i.status !== 'cancelled').length} active</Badge>
                </Group>
                {items.length === 0 ? (
                  <Text c="dimmed" size="sm">No action items.</Text>
                ) : (
                  <Stack gap="xs">
                    {items.map((item) => (
                      <Group key={item.id} justify="space-between" p="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', opacity: item.status === 'cancelled' ? 0.5 : 1 }} wrap="nowrap">
                        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={500} td={item.status === 'cancelled' ? 'line-through' : undefined}>{item.title}</Text>
                          {item.billable && <Badge size="xs" color="orange" variant="light" style={{ width: 'fit-content' }}>Billable</Badge>}
                        </Stack>
                        <Group gap="xs">
                          <Select value={item.status} onChange={(v) => updateStatus(item.id, (v as ItemStatus) ?? 'not-started')} data={(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} size="xs" w={140} aria-label={`Status for ${item.title}`} disabled={locked} />
                          <ActionIcon variant="subtle" color="red" onClick={() => removeItem(item.id)} aria-label={`Soft-delete ${item.title}`} disabled={locked || item.status === 'cancelled'}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                )}
                <Group gap="xs">
                  <TextInput placeholder="Add an action item…" value={newTitle} onChange={(e) => setNewTitle(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} style={{ flex: 1 }} disabled={locked} />
                  <Button leftSection={<IconPlus size={14} />} onClick={addItem} disabled={locked || !newTitle.trim()} variant="light">Add</Button>
                </Group>
              </Stack>
            </Card>

            {flagPending && (
              <Alert color="yellow" variant="light" icon={<IconCheck size={16} />} title="Will flag for Provider review">
                <Text size="xs">You marked a billable item as completed. Saving will flag this Plan for Provider review (AC-3).</Text>
              </Alert>
            )}

            <Group>
              <Button color="blue" onClick={saveEdits} loading={saving} disabled={locked || !dirty || saving} leftSection={<IconCheck size={16} />}>
                Save edits
              </Button>
              {locked && <Text size="xs" c="dimmed">Locked while in Provider review.</Text>}
              {!locked && !dirty && <Text size="xs" c="dimmed">No changes to save.</Text>}
              {!locked && dirty && <Text size="xs" c="dimmed">Unsaved changes — saving creates v{versionCount + 1}.</Text>}
            </Group>

            {latestPlan.meta?.lastUpdated && (
              <Text size="xs" c="dimmed">Last saved {formatDateTime(latestPlan.meta.lastUpdated)}</Text>
            )}
          </>
        )}
      </Stack>
    </Document>
  );
}

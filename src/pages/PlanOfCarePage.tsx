// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
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
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CarePlan, CarePlanActivity, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCalendar, IconCheck, IconDotsVertical, IconPencil, IconPlus, IconTag, IconTrash, IconUser } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { emitAudit } from '../utils/audit';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type ActionStatus = 'not-started' | 'in-progress' | 'completed' | 'cancelled' | 'on-hold';

const STATUS_LABELS: Record<ActionStatus, string> = {
  'not-started': 'Open',
  'in-progress': 'In Progress',
  completed: 'Complete',
  cancelled: 'Cancelled',
  'on-hold': 'Blocked',
};

const STATUS_COLORS: Record<ActionStatus, string> = {
  'not-started': 'gray',
  'in-progress': 'blue',
  completed: 'green',
  cancelled: 'dark',
  'on-hold': 'yellow',
};

export const AUTO_SAVE_MS = 30_000;

export const OWNER_ROLE_OPTIONS = [
  'CHW',
  'Care Provider',
  'Case Manager',
  'Member',
  'Caregiver',
  'Other',
] as const;
export type OwnerRole = (typeof OWNER_ROLE_OPTIONS)[number];

export const CATEGORY_OPTIONS = [
  'Clinical',
  'Social',
  'Behavioral',
  'Logistical',
  'Other',
] as const;
export type ItemCategory = (typeof CATEGORY_OPTIONS)[number];

export interface PlanItemDraft {
  id: string;
  title: string;
  description: string;
  ownerRole: OwnerRole;
  ownerName?: string;
  dueDate?: string;
  status: ActionStatus;
  category?: ItemCategory;
}

const OWNER_ROLE_EXT = 'https://widercircle.com/fhir/StructureDefinition/action-item-owner-role';

// Category isn't a standard FHIR CarePlanActivity.detail field (category is on the
// top-level CarePlan). Stash it in the code.coding.display slot so it round-trips
// without violating schema, then pull it back out on read.
export const draftFromActivity = (activity: CarePlanActivity, idx: number): PlanItemDraft => {
  const detail = activity.detail;
  const status = (detail?.status ?? 'not-started') as ActionStatus;
  const coding = detail?.code?.coding?.[0];
  const performer = detail?.performer?.[0];
  const performerExt = performer?.extension?.find((e) => e.url === OWNER_ROLE_EXT)?.valueString;
  const knownRole = OWNER_ROLE_OPTIONS.find((r) => r === performerExt);
  return {
    id: coding?.code ?? `item-${idx}`,
    title: detail?.description ?? detail?.code?.text ?? `Action item ${idx + 1}`,
    description: detail?.code?.text ?? '',
    ownerRole: knownRole ?? 'Other',
    ownerName: performer?.display ?? undefined,
    dueDate: detail?.scheduledPeriod?.end,
    status: (['not-started', 'in-progress', 'completed', 'cancelled', 'on-hold'] as const).includes(status)
      ? status
      : 'not-started',
    category: (CATEGORY_OPTIONS as readonly string[]).includes(coding?.display ?? '')
      ? (coding?.display as ItemCategory)
      : undefined,
  };
};

export const activityFromDraft = (item: PlanItemDraft): CarePlanActivity => ({
  detail: {
    status: item.status,
    description: item.title,
    code: {
      text: item.description || undefined,
      coding: [{ code: item.id, display: item.category || undefined }],
    },
    performer: [
      {
        display: item.ownerName?.trim() || item.ownerRole,
        extension: [{ url: OWNER_ROLE_EXT, valueString: item.ownerRole }],
      },
    ],
    scheduledPeriod: item.dueDate ? { end: item.dueDate } : undefined,
  },
});

export const isPlanEmpty = (narrative: string, items: PlanItemDraft[]): boolean => {
  return narrative.trim().length === 0 && items.length === 0;
};

export function PlanOfCarePage(): JSX.Element {
  const medplum = useMedplum();
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [searchParams] = useSearchParams();
  const initialPatient = searchParams.get('patient') ?? '';
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [loading, setLoading] = useState(true);

  const [planId, setPlanId] = useState<string | undefined>();
  const [version, setVersion] = useState<number>(1);
  const [narrative, setNarrative] = useState('');
  const [items, setItems] = useState<PlanItemDraft[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | undefined>();
  const [versionHistory, setVersionHistory] = useState<CarePlan[]>([]);
  const [itemModalOpened, { open: openItemModal, close: closeItemModal }] = useDisclosure(false);
  const [editingItemId, setEditingItemId] = useState<string | undefined>();
  const [draft, setDraft] = useState<PlanItemDraft>(() => ({
    id: '',
    title: '',
    description: '',
    ownerRole: 'CHW',
    ownerName: '',
    dueDate: undefined,
    status: 'not-started',
    category: undefined,
  }));

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const practitionerRef = medplum.getProfile()
    ? `Practitioner/${medplum.getProfile()?.id}`
    : undefined;

  const loadPatients = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated');
      setPatients(
        results.map((p: Patient) => ({
          value: p.id ?? '',
          label:
            `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  const loadPlan = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setPlanId(undefined);
        setNarrative('');
        setItems([]);
        setVersion(1);
        setVersionHistory([]);
        setSaveState('idle');
        return;
      }
      try {
        const plans = await medplum.searchResources(
          'CarePlan',
          `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=20`
        );
        setVersionHistory(plans);
        const latest = plans[0];
        if (latest) {
          setPlanId(latest.id);
          setNarrative(latest.description ?? '');
          setItems((latest.activity ?? []).map((a, i) => draftFromActivity(a, i)));
          setVersion(plans.length);
          setSaveState('saved');
          setSavedAt(latest.meta?.lastUpdated ? new Date(latest.meta.lastUpdated).getTime() : Date.now());
        } else {
          setPlanId(undefined);
          setNarrative('');
          setItems([]);
          setVersion(1);
          setSaveState('idle');
        }
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        setSaveState('error');
      }
    },
    [medplum]
  );

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    loadPlan(selectedPatient).catch(console.error);
  }, [selectedPatient, loadPlan]);

  const doSave = useCallback(async () => {
    if (!selectedPatient) return;
    if (isPlanEmpty(narrative, items)) {
      showNotification({ color: 'yellow', message: 'Plan is empty — nothing to save.' });
      return;
    }
    setSaveState('saving');
    try {
      const patientLabel = patients.find((p) => p.value === selectedPatient)?.label ?? '';
      const payload: CarePlan = {
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        title: 'Plan of Care',
        description: narrative,
        subject: { reference: `Patient/${selectedPatient}`, display: patientLabel },
        author: practitionerRef ? { reference: practitionerRef } : undefined,
        created: new Date().toISOString(),
        activity: items.map(activityFromDraft),
        extension: [
          {
            url: 'https://widercircle.com/fhir/StructureDefinition/plan-version',
            valueInteger: version,
          },
        ],
      };
      // Create a new version each save so AC-3 (new version on edit) holds.
      const saved = await medplum.createResource<CarePlan>(payload);
      setPlanId(saved.id);
      setSaveState('saved');
      setSavedAt(Date.now());
      setVersion((v) => v + 1);
      // CD-08 AC-6 — DA-13 audit emission on every save (new version).
      void emitAudit(medplum, {
        action: 'careplan.saved',
        patientRef: { reference: `Patient/${selectedPatient}`, display: patientLabel },
        carePlanRef: saved.id ? { reference: `CarePlan/${saved.id}` } : undefined,
        meta: { version: version, itemCount: items.length },
      });
      const plans = await medplum.searchResources(
        'CarePlan',
        `subject=Patient/${selectedPatient}&_sort=-_lastUpdated&_count=20`
      );
      setVersionHistory(plans);
    } catch (err) {
      setSaveState('error');
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [selectedPatient, patients, narrative, items, practitionerRef, version, medplum]);

  // Debounced auto-save on dirty → fires after AUTO_SAVE_MS idle.
  useEffect(() => {
    if (saveState !== 'dirty') return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doSave().catch(console.error);
    }, AUTO_SAVE_MS);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [saveState, doSave]);

  const markDirty = useCallback(() => {
    setSaveState('dirty');
  }, []);

  const openCreateItemModal = useCallback(() => {
    setEditingItemId(undefined);
    setDraft({
      id: `item-${Date.now()}`,
      title: '',
      description: '',
      ownerRole: 'CHW',
      ownerName: '',
      dueDate: undefined,
      status: 'not-started',
      category: undefined,
    });
    openItemModal();
  }, [openItemModal]);

  const openEditItemModal = useCallback(
    (id: string) => {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      setEditingItemId(id);
      setDraft({ ...it });
      openItemModal();
    },
    [items, openItemModal]
  );

  const commitDraft = useCallback(() => {
    if (!draft.title.trim()) {
      showNotification({ color: 'red', message: 'Action item needs a title.' });
      return;
    }
    setItems((prev) => {
      if (editingItemId) {
        return prev.map((i) => (i.id === editingItemId ? { ...draft, id: editingItemId } : i));
      }
      return [...prev, draft];
    });
    closeItemModal();
    setEditingItemId(undefined);
    markDirty();
  }, [draft, editingItemId, closeItemModal, markDirty]);

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      markDirty();
    },
    [markDirty]
  );

  const updateItemStatus = useCallback(
    (id: string, status: ActionStatus) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      markDirty();
    },
    [markDirty]
  );

  const saveStateLabel = useMemo(() => {
    if (saveState === 'saving') return 'Saving…';
    if (saveState === 'dirty') return 'Unsaved changes';
    if (saveState === 'error') return 'Save failed — retry';
    if (saveState === 'saved' && savedAt) {
      const sec = Math.floor((Date.now() - savedAt) / 1000);
      if (sec < 60) return `Saved ${sec}s ago`;
      const min = Math.floor(sec / 60);
      return `Saved ${min}m ago`;
    }
    return 'Idle';
  }, [saveState, savedAt]);

  const planIsEmpty = isPlanEmpty(narrative, items);

  if (loading) {
    return (
      <Document>
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2}>Plan of Care</Title>
            <Text c="dimmed" size="sm">
              Narrative + discrete action items. Auto-saves every 30s; each save is a new version.
            </Text>
          </Stack>
          <Group gap="xs">
            <Badge variant="light" ff="monospace">v{version}</Badge>
            <Badge variant="light" color={saveState === 'error' ? 'red' : saveState === 'saving' ? 'blue' : 'gray'}>
              {saveStateLabel}
            </Badge>
          </Group>
        </Group>

        <Select
          label="Member"
          placeholder="Pick a member"
          data={patients}
          value={selectedPatient}
          onChange={(v) => setSelectedPatient(v ?? '')}
          searchable
          required
        />

        {selectedPatient && (
          <>
            <Card withBorder radius="md" padding="md">
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Narrative
                </Text>
                <Textarea
                  placeholder="What's the plan for this member? Goals, interventions, context the reviewer needs…"
                  value={narrative}
                  onChange={(e) => {
                    setNarrative(e.currentTarget.value);
                    markDirty();
                  }}
                  autosize
                  minRows={4}
                  maxRows={12}
                />
              </Stack>
            </Card>

            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    Action items
                  </Text>
                  <Badge variant="light">{items.length}</Badge>
                </Group>

                {items.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    No action items yet. Click <b>Add action item</b> below.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {items.map((item) => (
                      <Card
                        key={item.id}
                        withBorder
                        radius="sm"
                        padding="sm"
                      >
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                            <Group gap={6} wrap="wrap">
                              <Text size="sm" fw={600}>{item.title}</Text>
                              <Badge color={STATUS_COLORS[item.status]} variant="light" size="sm">
                                {STATUS_LABELS[item.status]}
                              </Badge>
                              {item.category && (
                                <Badge variant="light" color="grape" size="sm" leftSection={<IconTag size={11} />}>
                                  {item.category}
                                </Badge>
                              )}
                            </Group>
                            {item.description && (
                              <Text size="xs" c="dimmed">{item.description}</Text>
                            )}
                            <Group gap={12} wrap="wrap">
                              <Group gap={4}>
                                <IconUser size={12} />
                                <Text size="xs" c="dimmed">
                                  {item.ownerName?.trim() ? `${item.ownerName} (${item.ownerRole})` : item.ownerRole}
                                </Text>
                              </Group>
                              {item.dueDate && (
                                <Group gap={4}>
                                  <IconCalendar size={12} />
                                  <Text size="xs" c="dimmed">Due {item.dueDate}</Text>
                                </Group>
                              )}
                            </Group>
                          </Stack>
                          <Group gap={4}>
                            <Select
                              value={item.status}
                              onChange={(v) => updateItemStatus(item.id, (v as ActionStatus) ?? 'not-started')}
                              data={(Object.keys(STATUS_LABELS) as ActionStatus[]).map((s) => ({
                                value: s,
                                label: STATUS_LABELS[s],
                              }))}
                              size="xs"
                              w={130}
                              aria-label={`Status for ${item.title}`}
                            />
                            <ActionIcon
                              variant="subtle"
                              color="orange"
                              onClick={() => openEditItemModal(item.id)}
                              aria-label={`Edit ${item.title}`}
                            >
                              <IconPencil size={14} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.title}`}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                )}

                <Group justify="flex-end">
                  <Button
                    leftSection={<IconPlus size={14} />}
                    onClick={openCreateItemModal}
                    variant="light"
                    color="orange"
                  >
                    Add action item
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Group>
              <Button
                color="blue"
                onClick={doSave}
                loading={saveState === 'saving'}
                disabled={planIsEmpty || saveState === 'saving'}
                leftSection={<IconCheck size={16} />}
              >
                Save plan
              </Button>
              {planIsEmpty && (
                <Alert color="yellow" variant="light" p="xs" style={{ flex: 1 }}>
                  <Text size="xs">
                    Plan is empty. Encounter cannot be closed until narrative or at least one action item is added (AC-4).
                  </Text>
                </Alert>
              )}
            </Group>

            {versionHistory.length > 1 && (
              <Card withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={5}>Version history</Title>
                    <Badge variant="light">{versionHistory.length}</Badge>
                  </Group>
                  <Stack gap="xs">
                    {versionHistory.slice(0, 10).map((v, idx) => (
                      <Group key={v.id} justify="space-between" p="xs" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap">
                          <Badge variant="light" ff="monospace">
                            v{versionHistory.length - idx}
                          </Badge>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {v.meta?.lastUpdated ? formatDateTime(v.meta.lastUpdated) : ''}
                          </Text>
                        </Group>
                        <Group gap="xs">
                          <IconDotsVertical size={12} />
                          <Text size="xs" c="dimmed">
                            {(v.activity ?? []).length} items
                          </Text>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            )}
          </>
        )}
      </Stack>

      <Modal
        opened={itemModalOpened}
        onClose={() => {
          closeItemModal();
          setEditingItemId(undefined);
        }}
        title={editingItemId ? 'Edit action item' : 'Add action item'}
        size="lg"
        withinPortal
      >
        <Stack gap="sm">
          <TextInput
            label="Title"
            placeholder="e.g. Connect with housing authority"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.currentTarget.value })}
            required
          />
          <Textarea
            label="Description (optional)"
            placeholder="Detail what needs to happen and any context the owner needs."
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
            autosize
            minRows={2}
            maxRows={6}
          />
          <Group grow>
            <Select
              label="Owner role"
              data={OWNER_ROLE_OPTIONS as unknown as string[]}
              value={draft.ownerRole}
              onChange={(v) => setDraft({ ...draft, ownerRole: (v as OwnerRole) ?? 'CHW' })}
              allowDeselect={false}
              required
            />
            <TextInput
              label="Owner name (optional)"
              placeholder="Specific staff or member, if known"
              value={draft.ownerName ?? ''}
              onChange={(e) => setDraft({ ...draft, ownerName: e.currentTarget.value })}
            />
          </Group>
          <Group grow>
            <TextInput
              label="Due date (optional)"
              type="date"
              value={draft.dueDate ?? ''}
              onChange={(e) => setDraft({ ...draft, dueDate: e.currentTarget.value || undefined })}
            />
            <Select
              label="Category (optional)"
              data={CATEGORY_OPTIONS as unknown as string[]}
              value={draft.category ?? null}
              onChange={(v) => setDraft({ ...draft, category: (v as ItemCategory) ?? undefined })}
              clearable
            />
          </Group>
          <Select
            label="Status"
            data={(Object.keys(STATUS_LABELS) as ActionStatus[]).map((s) => ({
              value: s,
              label: STATUS_LABELS[s],
            }))}
            value={draft.status}
            onChange={(v) => setDraft({ ...draft, status: (v as ActionStatus) ?? 'not-started' })}
            allowDeselect={false}
          />
          <Group justify="flex-end" mt="sm">
            <Button
              variant="subtle"
              onClick={() => {
                closeItemModal();
                setEditingItemId(undefined);
              }}
            >
              Cancel
            </Button>
            <Button color="orange" onClick={commitDraft} disabled={!draft.title.trim()}>
              {editingItemId ? 'Save changes' : 'Add to plan'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}

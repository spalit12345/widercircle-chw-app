// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-13 caseload-wide CarePlan list. Loads every CarePlan the active user
// can read, joins to its review-submission Task to surface lock state, and
// gives the CHW direct CTAs into Review / Edit / Submit-for-review for each
// plan. v1 doesn't honor a per-CHW caseload filter (DA-01 deferred); switch
// the active role's permission scope when that lands.

import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CarePlan, Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconCheck,
  IconClipboardCheck,
  IconLock,
  IconPencil,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { isPlanLocked, latestReviewState, type ReviewState } from './SubmitForReviewPage';

type FilterChip = 'all' | 'active' | 'draft' | 'locked';

const REVIEW_TASK_CODE = 'plan-review-submission';

interface PlanRow {
  plan: CarePlan;
  patientName: string;
  patientId: string | null;
  reviewState: ReviewState;
  locked: boolean;
  activeItems: number;
  totalItems: number;
}

const buildRows = (plans: CarePlan[], reviewTasks: Task[], patientsById: Map<string, Patient>): PlanRow[] => {
  return plans.map((plan) => {
    const patientId = plan.subject?.reference?.replace('Patient/', '') ?? null;
    const patient = patientId ? patientsById.get(patientId) : undefined;
    const patientName =
      plan.subject?.display ??
      (patient
        ? `${patient.name?.[0]?.given?.[0] ?? ''} ${patient.name?.[0]?.family ?? ''}`.trim() || 'Unknown'
        : 'Unknown');
    const planTasks = plan.id
      ? reviewTasks.filter((t) => t.focus?.reference === `CarePlan/${plan.id}`)
      : [];
    const reviewState = latestReviewState(planTasks);
    const items = plan.activity ?? [];
    const activeItems = items.filter((a) => {
      const s = a.detail?.status;
      return s === 'in-progress' || s === 'not-started' || s === 'on-hold';
    }).length;
    return {
      plan,
      patientName,
      patientId,
      reviewState,
      locked: isPlanLocked(reviewState),
      activeItems,
      totalItems: items.length,
    };
  });
};

const reviewStateBadge = (state: ReviewState): { label: string; color: string } => {
  switch (state) {
    case 'submitted':
      return { label: 'Submitted', color: 'orange' };
    case 'approved':
      return { label: 'Approved', color: 'green' };
    case 'revision-requested':
      return { label: 'Revision requested', color: 'yellow' };
    default:
      return { label: 'Draft', color: 'gray' };
  }
};

export function MyCarePlansPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plans, reviewTasks] = await Promise.all([
        medplum
          .searchResources('CarePlan', '_count=200&_sort=-_lastUpdated')
          .catch(() => [] as CarePlan[]),
        medplum
          .searchResources('Task', `code=${REVIEW_TASK_CODE}&_count=500&_sort=-_lastUpdated`)
          .catch(() => [] as Task[]),
      ]);
      // Resolve patient display names that didn't ship in CarePlan.subject.display.
      const missingPatientIds = new Set<string>();
      plans.forEach((p) => {
        const pid = p.subject?.reference?.replace('Patient/', '');
        if (pid && !p.subject?.display) missingPatientIds.add(pid);
      });
      const patientsById = new Map<string, Patient>();
      if (missingPatientIds.size > 0) {
        const ids = Array.from(missingPatientIds).join(',');
        const patients = await medplum
          .searchResources('Patient', `_id=${ids}&_count=200`)
          .catch(() => [] as Patient[]);
        patients.forEach((p) => {
          if (p.id) patientsById.set(p.id, p);
        });
      }
      setRows(buildRows(plans, reviewTasks, patientsById));
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.patientName.toLowerCase().includes(q) && !(r.plan.title?.toLowerCase().includes(q))) {
        return false;
      }
      if (filter === 'active') return r.plan.status === 'active';
      if (filter === 'draft') return r.reviewState === 'draft' && !r.locked;
      if (filter === 'locked') return r.locked;
      return true;
    });
  }, [rows, filter, search]);

  if (loading) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>My care plans</Title>
          <Text c="dimmed" size="sm">
            Caseload-wide list of CarePlans you can review or edit. Filter by status, search by member or plan title.
          </Text>
        </Stack>

        <Group gap="md" wrap="wrap">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder="Search by member or plan title…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <Chip.Group multiple={false} value={filter} onChange={(v) => setFilter((v as FilterChip) ?? 'all')}>
            <Group gap={6}>
              <Chip value="all">All</Chip>
              <Chip value="active">Active</Chip>
              <Chip value="draft">Draft</Chip>
              <Chip value="locked">Locked for review</Chip>
            </Group>
          </Chip.Group>
        </Group>

        {filtered.length === 0 ? (
          <Alert color="gray" variant="light" title="No matching care plans">
            <Text size="sm">
              {rows.length === 0
                ? 'No CarePlans on file yet. Providers create them via /plan-of-care; CHWs edit them via /plan-edit.'
                : 'Try a different filter or clear the search.'}
            </Text>
          </Alert>
        ) : (
          <Stack gap="xs">
            {filtered.map((r) => (
              <PlanRowCard
                key={r.plan.id}
                row={r}
                onReview={() => navigate(`/plan-review${r.patientId ? `?patient=${r.patientId}` : ''}`)}
                onEdit={() => navigate(`/plan-edit${r.patientId ? `?patient=${r.patientId}` : ''}`)}
                onSubmit={() => navigate(`/review-submission${r.patientId ? `?patient=${r.patientId}` : ''}`)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Document>
  );
}

function PlanRowCard({
  row,
  onReview,
  onEdit,
  onSubmit,
}: {
  row: PlanRow;
  onReview: () => void;
  onEdit: () => void;
  onSubmit: () => void;
}): JSX.Element {
  const { plan, patientName, reviewState, locked, activeItems, totalItems } = row;
  const stateBadge = reviewStateBadge(reviewState);
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={8} wrap="wrap">
            <Text fw={600}>{patientName}</Text>
            <Text size="sm" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {plan.title ?? 'Care plan'}
            </Text>
          </Group>
          <Group gap={6} wrap="wrap">
            <Badge color={plan.status === 'active' ? 'green' : 'gray'} variant="light" size="sm">
              {plan.status ?? 'unknown'}
            </Badge>
            <Badge color={stateBadge.color} variant="light" size="sm">{stateBadge.label}</Badge>
            {locked && (
              <Badge color="orange" variant="filled" size="sm" leftSection={<IconLock size={11} />}>
                Locked
              </Badge>
            )}
            <Badge color="gray" variant="light" size="sm">
              {activeItems}/{totalItems} active items
            </Badge>
            {plan.meta?.lastUpdated && (
              <Text size="xs" c="dimmed" ff="monospace">
                {formatDateTime(plan.meta.lastUpdated)}
              </Text>
            )}
          </Group>
        </Stack>
        <Group gap={6}>
          <Button
            size="compact-sm"
            variant="light"
            color="blue"
            leftSection={<IconClipboardCheck size={14} />}
            onClick={onReview}
          >
            Review
          </Button>
          <Button
            size="compact-sm"
            variant="light"
            color="orange"
            leftSection={<IconPencil size={14} />}
            onClick={onEdit}
            disabled={locked}
          >
            Edit
          </Button>
          {!locked && reviewState !== 'submitted' && reviewState !== 'approved' && (
            <Button
              size="compact-sm"
              variant="light"
              color="grape"
              leftSection={<IconUpload size={14} />}
              onClick={onSubmit}
            >
              Submit
            </Button>
          )}
          {reviewState === 'approved' && (
            <Badge color="green" variant="light" leftSection={<IconCheck size={11} />}>
              Approved
            </Badge>
          )}
        </Group>
      </Group>
    </Card>
  );
}

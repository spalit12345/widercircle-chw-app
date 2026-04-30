// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CarePlan, CarePlanActivity, Communication, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconGitCompare, IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRole } from '../auth/RoleContext';
import { SignaturePad } from '../components/SignaturePad';
import { PlanReview360View } from '../components/PlanReview360View';

const SIGNATURE_EXT = 'https://widercircle.com/fhir/StructureDefinition/acknowledgment-signature';

// Plan acknowledgments are recorded as Communication resources with
// category.coding.code='plan-acknowledgment'. Plain FHIR Communication works
// here — it's the canonical resource for "X told Y about Z at time T."
const ACK_CATEGORY_CODE = 'plan-acknowledgment';

type ItemStatus = 'not-started' | 'in-progress' | 'completed' | 'cancelled' | 'on-hold';

export interface ReviewItem {
  id: string;
  title: string;
  description?: string;
  status: ItemStatus;
  ownerLabel: string;
  assignedToMe: boolean;
}

export const STATUS_LABELS: Record<ItemStatus, string> = {
  'not-started': 'Open',
  'in-progress': 'In Progress',
  completed: 'Complete',
  cancelled: 'Cancelled',
  'on-hold': 'Blocked',
};

export const STATUS_COLORS: Record<ItemStatus, string> = {
  'not-started': 'gray',
  'in-progress': 'blue',
  completed: 'green',
  cancelled: 'dark',
  'on-hold': 'yellow',
};

export const partitionForReview = (items: ReviewItem[]): { mine: ReviewItem[]; others: ReviewItem[] } => {
  const mine: ReviewItem[] = [];
  const others: ReviewItem[] = [];
  for (const item of items) {
    if (item.assignedToMe) {
      mine.push(item);
    } else {
      others.push(item);
    }
  }
  return { mine, others };
};

export const itemsFromPlan = (plan: CarePlan, currentUserRef?: string): ReviewItem[] => {
  return (plan.activity ?? []).map((a, idx) => activityToReviewItem(a, idx, currentUserRef));
};

const activityToReviewItem = (
  activity: CarePlanActivity,
  idx: number,
  currentUserRef: string | undefined
): ReviewItem => {
  const detail = activity.detail;
  const coding = detail?.code?.coding?.[0];
  const status = (detail?.status ?? 'not-started') as ItemStatus;
  const performerRef = detail?.performer?.[0]?.reference;
  const performerDisplay = detail?.performer?.[0]?.display;
  return {
    id: coding?.code ?? `item-${idx}`,
    title: detail?.description ?? `Action item ${idx + 1}`,
    description: detail?.code?.text ?? coding?.display,
    status: (['not-started', 'in-progress', 'completed', 'cancelled', 'on-hold'] as const).includes(status)
      ? status
      : 'not-started',
    ownerLabel: performerDisplay ?? performerRef ?? 'Unassigned',
    assignedToMe: Boolean(performerRef && currentUserRef && performerRef === currentUserRef),
  };
};

export function PlanReviewPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();
  const { hasPermission } = useRole();
  const canSignAsProvider = hasPermission('review.signoff');
  const currentUserRef = profile ? `Practitioner/${profile.id}` : undefined;
  const currentUserLabel = profile
    ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Care Provider'
    : 'Care Provider';

  const [searchParams] = useSearchParams();
  const initialPatient = searchParams.get('patient') ?? '';
  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [plan, setPlan] = useState<CarePlan | undefined>();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [acks, setAcks] = useState<Communication[]>([]);
  const [versionHistory, setVersionHistory] = useState<CarePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [diffOpened, { open: openDiff, close: closeDiff }] = useDisclosure(false);

  const loadPatients = useCallback(async () => {
    try {
      // CD-19 — order patients by who has an active CarePlan first so the demo
      // doesn't open onto an empty plan dropdown. Patients without plans still
      // appear (so unrelated members are reachable), they just sort below.
      const [plansResp, patientsResp] = await Promise.all([
        medplum.searchResources('CarePlan', 'status=active&_count=200&_sort=-_lastUpdated'),
        medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated'),
      ]);
      const planPatientIds = new Set<string>();
      const planOrder: string[] = [];
      plansResp.forEach((cp: CarePlan) => {
        const ref = cp.subject?.reference?.split('/').pop();
        if (ref && !planPatientIds.has(ref)) {
          planPatientIds.add(ref);
          planOrder.push(ref);
        }
      });
      const byId = new Map<string, Patient>();
      patientsResp.forEach((p: Patient) => {
        if (p.id) byId.set(p.id, p);
      });
      const ordered: Patient[] = [
        ...planOrder.map((id) => byId.get(id)).filter((p): p is Patient => Boolean(p)),
        ...patientsResp.filter((p: Patient) => p.id && !planPatientIds.has(p.id)),
      ];
      setPatients(
        ordered.map((p) => ({
          value: p.id ?? '',
          label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
      // Don't auto-select: leave the dropdown empty unless a ?patient= deep
      // link supplied one in initial state. CHW must pick the member.
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  const loadPlan = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setPlan(undefined);
        setItems([]);
        setAcks([]);
        return;
      }
      try {
        const plans = await medplum.searchResources(
          'CarePlan',
          `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=10`
        );
        const latest = plans[0];
        setPlan(latest);
        setItems(latest ? itemsFromPlan(latest, currentUserRef) : []);
        setVersionHistory(plans);
        if (latest?.id) {
          const ackResults = await medplum.searchResources(
            'Communication',
            `based-on=CarePlan/${latest.id}&category=${ACK_CATEGORY_CODE}&_sort=-_lastUpdated&_count=10`
          );
          setAcks(ackResults);
        } else {
          setAcks([]);
        }
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, currentUserRef]
  );

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    loadPlan(selectedPatient).catch(console.error);
  }, [selectedPatient, loadPlan]);

  const ackThisPlan = useCallback(async () => {
    if (!plan?.id || !currentUserRef) return;
    if (!signatureDataUrl) {
      showNotification({ color: 'red', message: 'Please capture a signature before acknowledging.' });
      return;
    }
    setAcking(true);
    try {
      const now = new Date().toISOString();
      const ack: Communication = {
        resourceType: 'Communication',
        status: 'completed',
        category: [
          {
            coding: [
              {
                system: 'https://widercircle.com/fhir/CodeSystem/communication-category',
                code: ACK_CATEGORY_CODE,
                display: 'Plan of Care — reviewer acknowledgment',
              },
            ],
          },
        ],
        subject: plan.subject,
        sent: now,
        sender: { reference: currentUserRef, display: currentUserLabel },
        basedOn: [{ reference: `CarePlan/${plan.id}` }],
        payload: [
          {
            contentString: `Plan of Care signed by ${currentUserLabel} (Care Provider) on ${now}.`,
          },
          {
            contentAttachment: {
              contentType: 'image/png',
              creation: now,
              title: `${currentUserLabel} signature`,
              data: signatureDataUrl.replace(/^data:image\/png;base64,/, ''),
            },
          },
        ],
        extension: [
          {
            url: SIGNATURE_EXT,
            valueAttachment: {
              contentType: 'image/png',
              creation: now,
              data: signatureDataUrl.replace(/^data:image\/png;base64,/, ''),
            },
          },
        ],
      };
      await medplum.createResource<Communication>(ack);
      showNotification({ color: 'green', message: 'Care Provider signature captured' });
      setSignatureDataUrl(null);
      await loadPlan(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setAcking(false);
    }
  }, [plan, currentUserRef, currentUserLabel, medplum, selectedPatient, loadPlan, signatureDataUrl]);

  const { mine, others } = useMemo(() => partitionForReview(items), [items]);

  const alreadyAcked = useMemo(() => {
    if (!plan?.id || !currentUserRef) return false;
    return acks.some((a) => a.sender?.reference === currentUserRef);
  }, [acks, plan?.id, currentUserRef]);

  // CD-08 AC-3 — diff against the previous Plan version. Three buckets:
  // added items (in latest, not in previous), removed (in previous, not in
  // latest), status-changed (same id, different detail.status).
  const versionDiff = useMemo(() => {
    if (versionHistory.length < 2) {
      return { added: [], removed: [], statusChanged: [] };
    }
    const itemsOf = (cp: CarePlan): ReviewItem[] => itemsFromPlan(cp, currentUserRef);
    const latestItems = itemsOf(versionHistory[0]);
    const prevItems = itemsOf(versionHistory[1]);
    const prevById = new Map(prevItems.map((i) => [i.id, i]));
    const latestById = new Map(latestItems.map((i) => [i.id, i]));
    const added = latestItems.filter((i) => !prevById.has(i.id));
    const removed = prevItems.filter((i) => !latestById.has(i.id));
    const statusChanged: { item: ReviewItem; from: ItemStatus }[] = [];
    for (const item of latestItems) {
      const prev = prevById.get(item.id);
      if (prev && prev.status !== item.status) {
        statusChanged.push({ item, from: prev.status });
      }
    }
    return { added, removed, statusChanged };
  }, [versionHistory, currentUserRef]);

  const hasDiff =
    versionDiff.added.length + versionDiff.removed.length + versionDiff.statusChanged.length > 0;

  if (loading) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  return (
    <>
      <PlanReview360View
        plan={plan}
        patient={undefined}
        items={items}
        versionHistory={versionHistory}
        acks={acks}
        reviewState="draft"
        alreadyAcked={alreadyAcked}
        canSignAsProvider={canSignAsProvider}
        acking={acking}
        signatureDataUrl={signatureDataUrl}
        setSignatureDataUrl={setSignatureDataUrl}
        ackThisPlan={ackThisPlan}
        onCompareV3={openDiff}
      />

      {/* CD-08 AC-3 — Plan version diff. Compares latest vs previous version
          and lists items added, removed, and status-changed. */}
      <Modal
        opened={diffOpened}
        onClose={closeDiff}
        title={`Changes since v${Math.max(0, versionHistory.length - 1)}`}
        size="lg"
        centered
      >
        <Stack gap="md">
          {!hasDiff ? (
            <Alert color="gray" variant="light">
              <Text size="sm">
                No item-level changes between this version and the previous one. Differences may
                be in narrative or metadata only.
              </Text>
            </Alert>
          ) : (
            <>
              {versionDiff.added.length > 0 && (
                <Card withBorder radius="md" padding="md">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Badge color="green" variant="light">
                        Added · {versionDiff.added.length}
                      </Badge>
                    </Group>
                    {versionDiff.added.map((item) => (
                      <Group
                        key={`added-${item.id}`}
                        justify="space-between"
                        p="xs"
                        wrap="nowrap"
                        style={{ borderLeft: '3px solid var(--mantine-color-green-5)', paddingLeft: 8 }}
                      >
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>
                            {item.title}
                          </Text>
                          {item.description && (
                            <Text size="xs" c="dimmed">
                              {item.description}
                            </Text>
                          )}
                        </Stack>
                        <Badge size="xs" color={STATUS_COLORS[item.status]} variant="light">
                          {STATUS_LABELS[item.status]}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                </Card>
              )}
              {versionDiff.removed.length > 0 && (
                <Card withBorder radius="md" padding="md">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Badge color="red" variant="light">
                        Removed · {versionDiff.removed.length}
                      </Badge>
                    </Group>
                    {versionDiff.removed.map((item) => (
                      <Group
                        key={`removed-${item.id}`}
                        justify="space-between"
                        p="xs"
                        wrap="nowrap"
                        style={{
                          borderLeft: '3px solid var(--mantine-color-red-5)',
                          paddingLeft: 8,
                          textDecoration: 'line-through',
                          opacity: 0.7,
                        }}
                      >
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>
                            {item.title}
                          </Text>
                          {item.description && (
                            <Text size="xs" c="dimmed">
                              {item.description}
                            </Text>
                          )}
                        </Stack>
                        <Badge size="xs" color={STATUS_COLORS[item.status]} variant="light">
                          {STATUS_LABELS[item.status]}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                </Card>
              )}
              {versionDiff.statusChanged.length > 0 && (
                <Card withBorder radius="md" padding="md">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Badge color="blue" variant="light">
                        Status changed · {versionDiff.statusChanged.length}
                      </Badge>
                    </Group>
                    {versionDiff.statusChanged.map(({ item, from }) => (
                      <Group
                        key={`status-${item.id}`}
                        justify="space-between"
                        p="xs"
                        wrap="nowrap"
                        style={{
                          borderLeft: '3px solid var(--mantine-color-blue-5)',
                          paddingLeft: 8,
                        }}
                      >
                        <Text size="sm" fw={500}>
                          {item.title}
                        </Text>
                        <Group gap={4}>
                          <Badge size="xs" color={STATUS_COLORS[from]} variant="light">
                            {STATUS_LABELS[from]}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            →
                          </Text>
                          <Badge size="xs" color={STATUS_COLORS[item.status]} variant="light">
                            {STATUS_LABELS[item.status]}
                          </Badge>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                </Card>
              )}
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}

function ReviewItemRow({ item }: { item: ReviewItem }): JSX.Element {
  // v2 row pattern: vertical stripe + monospace ref label, item title in
  // Inter Bold 13.5, owner + status as a meta line below.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: '#fff',
        border: '1px solid var(--wc-base-200, #E2E6E9)',
        borderRadius: 12,
        padding: 14,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: 2,
          background:
            item.status === 'completed' ? 'var(--wc-success-500, #2F8A89)'
            : item.status === 'cancelled' || item.status === 'on-hold' ? 'var(--wc-base-400, #A7B6C2)'
            : item.status === 'in-progress' ? 'var(--wc-primary-500, #EA6424)'
            : 'var(--wc-base-300, #D6DCDF)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 10 }}>
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--wc-base-800, #012B49)',
          }}
        >
          {item.title}
        </div>
        {item.description && (
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 11.5,
              color: 'var(--wc-base-500, #8499AA)',
              marginTop: 3,
            }}
          >
            {item.description}
          </div>
        )}
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11.5,
            color: 'var(--wc-base-500, #8499AA)',
            marginTop: 3,
          }}
        >
          Owner: <span style={{ color: 'var(--wc-base-600, #506D85)' }}>{item.ownerLabel}</span>
        </div>
      </div>
      <Badge color={STATUS_COLORS[item.status]} variant="light" size="sm">
        {STATUS_LABELS[item.status]}
      </Badge>
    </div>
  );
}

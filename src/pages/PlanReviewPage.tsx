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
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { CarePlan, CarePlanActivity, Communication, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SignaturePad } from '../components/SignaturePad';

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
  const currentUserRef = profile ? `Practitioner/${profile.id}` : undefined;
  const currentUserLabel = profile
    ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
    : 'Clinician';

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [plan, setPlan] = useState<CarePlan | undefined>();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [acks, setAcks] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

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
        setPlan(undefined);
        setItems([]);
        setAcks([]);
        return;
      }
      try {
        const plans = await medplum.searchResources(
          'CarePlan',
          `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=1`
        );
        const latest = plans[0];
        setPlan(latest);
        setItems(latest ? itemsFromPlan(latest, currentUserRef) : []);
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
            contentString: `Plan of Care acknowledged by ${currentUserLabel} on ${now}.`,
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
      showNotification({ color: 'green', message: 'Plan acknowledged with signature' });
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
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2}>Plan review</Title>
            <Text c="dimmed" size="sm">
              CHW view: assigned-to-me items first, then the rest. Read-only — status changes and full edits
              flow through CD-14.
            </Text>
          </Stack>
          {plan && (
            <Badge variant="light" ff="monospace">
              {plan.meta?.lastUpdated ? formatDateTime(plan.meta.lastUpdated) : ''}
            </Badge>
          )}
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

        {selectedPatient && !plan && (
          <Alert color="yellow" variant="light" icon={<IconLock size={16} />} title="No plan on file">
            <Text size="sm">This member has no Plan of Care yet. Provider authors it via /plan-of-care (CD-08).</Text>
          </Alert>
        )}

        {plan && (
          <>
            <Card withBorder radius="md" padding="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Title order={4}>Care Plan for {plan.subject?.display ?? 'member'}</Title>
                  <Badge color={plan.status === 'active' ? 'green' : 'gray'} variant="light">
                    {plan.status}
                  </Badge>
                </Group>
                {plan.description && <Text size="sm">{plan.description}</Text>}
                <Text size="xs" c="dimmed">
                  Authored {plan.author?.display ? `by ${plan.author.display}` : ''}{' '}
                  {plan.created ? `· ${formatDateTime(plan.created)}` : ''}
                </Text>
              </Stack>
            </Card>

            <Card
              withBorder
              radius="md"
              padding="md"
              style={{ borderColor: 'var(--mantine-color-orange-3)', background: 'var(--mantine-color-orange-0)' }}
            >
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={5}>Assigned to you</Title>
                  <Badge color="orange" variant="filled" size="sm">
                    {mine.length}
                  </Badge>
                </Group>
                {mine.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Nothing is directly assigned to you on this plan.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {mine.map((item) => (
                      <ReviewItemRow key={item.id} item={item} />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>

            <Card withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={5}>All other items</Title>
                  <Badge variant="light">{others.length}</Badge>
                </Group>
                {others.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No other items on this plan.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {others.map((item) => (
                      <ReviewItemRow key={item.id} item={item} />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>

            <Divider />

            {alreadyAcked ? (
              <Group justify="space-between" wrap="wrap">
                <Text size="xs" c="dimmed" style={{ maxWidth: 400 }}>
                  You already acknowledged this plan. Acknowledgments are immutable.
                </Text>
                <Badge color="green" variant="light" leftSection={<IconCheck size={12} />} size="lg">
                  You acknowledged this plan
                </Badge>
              </Group>
            ) : (
              <Card withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Title order={5}>Acknowledge with member signature</Title>
                  <Text size="xs" c="dimmed">
                    Capture the reviewer's signature, then acknowledge. The PNG is stored on the Communication
                    resource for audit. Acknowledgments are immutable and notify the Provider.
                  </Text>
                  <SignaturePad onChange={setSignatureDataUrl} />
                  <Group justify="flex-end">
                    <Button
                      color="blue"
                      leftSection={<IconCheck size={16} />}
                      onClick={ackThisPlan}
                      loading={acking}
                      disabled={acking || !plan || !signatureDataUrl}
                    >
                      Acknowledge with signature
                    </Button>
                  </Group>
                </Stack>
              </Card>
            )}

            {acks.length > 0 && (
              <Card withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={5}>Acknowledgments</Title>
                    <Badge variant="light">{acks.length}</Badge>
                  </Group>
                  <Stack gap="xs">
                    {acks.slice(0, 10).map((a) => {
                      const sig = a.payload?.find((p) => p.contentAttachment?.contentType === 'image/png');
                      const data = sig?.contentAttachment?.data;
                      return (
                        <Group key={a.id} justify="space-between" p="xs" wrap="nowrap">
                          <Group gap="sm" wrap="nowrap">
                            <Badge color="green" variant="light" size="sm">
                              {a.status ?? 'completed'}
                            </Badge>
                            <Text size="sm">{a.sender?.display ?? a.sender?.reference ?? '—'}</Text>
                            {data && (
                              <img
                                src={`data:image/png;base64,${data}`}
                                alt="Signature"
                                style={{
                                  height: 32,
                                  border: '1px solid var(--mantine-color-gray-3)',
                                  borderRadius: 4,
                                  background: '#fff',
                                }}
                              />
                            )}
                          </Group>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {a.sent ? formatDateTime(a.sent) : ''}
                          </Text>
                        </Group>
                      );
                    })}
                  </Stack>
                </Stack>
              </Card>
            )}
          </>
        )}
      </Stack>
    </Document>
  );
}

function ReviewItemRow({ item }: { item: ReviewItem }): JSX.Element {
  return (
    <Group
      justify="space-between"
      p="xs"
      style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
      wrap="nowrap"
    >
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={500}>
          {item.title}
        </Text>
        {item.description && (
          <Text size="xs" c="dimmed">
            {item.description}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Owner: {item.ownerLabel}
        </Text>
      </Stack>
      <Badge color={STATUS_COLORS[item.status]} variant="light" size="sm">
        {STATUS_LABELS[item.status]}
      </Badge>
    </Group>
  );
}

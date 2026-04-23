// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDate, normalizeErrorString } from '@medplum/core';
import type { Bundle, Encounter, ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum, useResource } from '@medplum/react';
import { IconAlertCircle, IconClock, IconScissors, IconStethoscope, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getMonthRange } from '../../billing/billing-utils';
import { useGlobalTimer } from '../../billing/TimerContext';
import { getThresholdFromCptCodes, useBillingConfig } from '../../billing/useBillingConfig';

interface TimeEntry {
  id: string;
  date: string;
  activityType: string;
  program: string;
  minutes: number;
  cptCode: string;
  status: string;
  careManager: string;
  credential: string;
  notes: string;
  billable: boolean;
  description: string;
}

interface SplitRow {
  activityType: string;
  minutes: number;
  description: string;
}

export function BillingPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patientId: id } = useParams() as { patientId: string };
  const resourceType = 'Patient' as const;
  const resource = useResource({ reference: resourceType + '/' + id });
  const { activityTypes, cptCodes } = useBillingConfig();
  const { timer } = useGlobalTimer();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Split modal state
  const [splitModalOpened, { open: openSplitModal, close: closeSplitModal }] = useDisclosure(false);
  const [splitEntry, setSplitEntry] = useState<TimeEntry | null>(null);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [splitting, setSplitting] = useState(false);

  const { start: monthStart, end: monthEnd } = useMemo(() => getMonthRange(), []);

  const totalMinutes = useMemo(() => entries.filter((e) => e.billable).reduce((sum, e) => sum + e.minutes, 0), [entries]);
  const patientProgram = useMemo(() => {
    if (entries.length === 0) {
      return 'CHI';
    }
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.program] = (counts[e.program] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'CHI';
  }, [entries]);

  const fetchEntries = useCallback(async () => {
    try {
      const bundle = await medplum.search(
        'Encounter',
        `subject=Patient/${id}&date=ge${monthStart}&date=le${monthEnd}&status:not=cancelled&_sort=-date&_count=100`
      );
      const results: TimeEntry[] = (bundle.entry ?? []).map((e) => {
        const enc = e.resource as Encounter;
        const typeCoding = enc.type?.[0]?.coding ?? [];
        const actCode = typeCoding.find((c) => c.system === 'http://medplum.com/activity-type')?.code ?? '';
        const cpt = typeCoding.find((c) => c.system === 'http://www.ama-assn.org/go/cpt')?.code ?? '';
        return {
          id: enc.id ?? '',
          date: enc.period?.start ?? '',
          activityType: actCode,
          program: enc.serviceType?.coding?.[0]?.code ?? '',
          minutes: enc.length?.value ?? 0,
          cptCode: cpt,
          status: enc.status === 'finished' ? 'Billed' : 'Pending',
          careManager: enc.participant?.[0]?.individual?.display ?? 'CHW',
          credential: enc.participant?.[0]?.type?.[0]?.coding?.[0]?.display ?? 'CHW',
          notes: enc.reasonCode?.[0]?.text ?? '',
          billable: !(enc.type ?? []).some((t) => t.coding?.some((c) => c.system === 'http://medplum.com/billable' && c.code === 'non-billable')),
          description: enc.reasonCode?.[1]?.text ?? '',
        };
      });
      setEntries(results);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, id, monthStart, monthEnd]);

  useEffect(() => {
    fetchEntries().catch(console.error);
  }, [fetchEntries]);

  const handleOpenSplit = useCallback((entry: TimeEntry) => {
    setSplitEntry(entry);
    setSplits([
      { activityType: entry.activityType || activityTypes[0]?.value || '', minutes: Math.ceil(entry.minutes / 2), description: '' },
      { activityType: activityTypes[1]?.value || activityTypes[0]?.value || '', minutes: Math.floor(entry.minutes / 2), description: '' },
    ]);
    openSplitModal();
  }, [activityTypes, openSplitModal]);

  const updateSplit = useCallback((index: number, field: keyof SplitRow, value: string | number) => {
    setSplits((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }, []);

  const removeSplit = useCallback((index: number) => {
    setSplits((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addSplit = useCallback(() => {
    setSplits((prev) => [...prev, { activityType: activityTypes[0]?.value || '', minutes: 0, description: '' }]);
  }, [activityTypes]);

  const totalAllocated = useMemo(() => splits.reduce((sum, s) => sum + s.minutes, 0), [splits]);
  const isValidSplit = useMemo(() => splitEntry && totalAllocated === splitEntry.minutes && splits.length >= 2 && splits.every((s) => s.activityType && s.minutes > 0), [splitEntry, totalAllocated, splits]);

  const handleSplit = useCallback(async () => {
    if (!splitEntry || !isValidSplit) {
      return;
    }
    setSplitting(true);
    try {
      // Read the original encounter to get full data
      const original = await medplum.readResource('Encounter', splitEntry.id);

      // Build transaction bundle: cancel original + create N splits
      const bundleEntries: Bundle['entry'] = [
        {
          resource: { ...original, status: 'cancelled' } as Encounter,
          request: { method: 'PUT', url: `Encounter/${splitEntry.id}` },
        },
        ...splits.map((split) => {
          const actLabel = activityTypes.find((a) => a.value === split.activityType)?.label ?? split.activityType;
          const newEnc: Encounter = {
            resourceType: 'Encounter',
            status: 'planned',
            class: original.class,
            type: [{ coding: [{ system: 'http://medplum.com/activity-type', code: split.activityType, display: actLabel }] }],
            serviceType: original.serviceType,
            subject: original.subject,
            participant: original.participant,
            length: { value: split.minutes, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
            period: original.period,
            reasonCode: split.description ? [{ text: split.description }] : original.reasonCode,
            partOf: { reference: `Encounter/${splitEntry.id}` },
          };
          return {
            resource: newEnc,
            request: { method: 'POST' as const, url: 'Encounter' },
          };
        }),
      ];

      await medplum.executeBatch({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: bundleEntries,
      });

      showNotification({ color: 'green', message: `Split ${splitEntry.minutes} min into ${splits.length} entries` });
      closeSplitModal();
      setSplitEntry(null);
      setSplits([]);
      await fetchEntries();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSplitting(false);
    }
  }, [medplum, splitEntry, splits, isValidSplit, activityTypes, closeSplitModal, fetchEntries]);

  if (!resource) {
    return null;
  }

  if (resource.resourceType !== 'Patient') {
    return (
      <Document>
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported" color="red">
          Billing is only supported for Patient resources.
        </Alert>
      </Document>
    );
  }

  const threshold = getThresholdFromCptCodes(cptCodes);
  const progress = Math.min(100, Math.round((totalMinutes / threshold) * 100));
  const isTimerActiveForPatient = timer?.patientId === id;

  return (
    <Document>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Title order={3}>Billing Ledger</Title>
          <Group>
            {isTimerActiveForPatient && (
              <Group gap="xs">
                <IconClock size={18} color="var(--mantine-color-blue-6)" />
                <Text size="sm" c="blue" fw={500}>
                  Timer active on Care Plan ({Math.floor((timer?.elapsed ?? 0) / 60)}:{String((timer?.elapsed ?? 0) % 60).padStart(2, '0')})
                </Text>
              </Group>
            )}
            <Button
              variant="light"
              leftSection={<IconStethoscope size={16} />}
              onClick={() => navigate(`/${resourceType}/${id}/careplan`)}
            >
              Go to Care Plan
            </Button>
          </Group>
        </Group>

        {/* Monthly summary */}
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
          <Group gap="xs">
            <Text fw={600}>{totalMinutes} min</Text>
            <Text c="dimmed">/</Text>
            <Text c="dimmed">{threshold} min threshold</Text>
          </Group>
        </Group>
        <Progress value={progress} color={progress >= 100 ? 'green' : progress >= 70 ? 'yellow' : 'red'} size="lg" />
        {/* Billing Code Summary */}
        {totalMinutes > 0 && (
          <Table withTableBorder withColumnBorders w={400}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Code</Table.Th>
                <Table.Th>Minutes</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(() => {
                const isPIN = patientProgram === 'PIN';
                const baseCode = isPIN ? 'G0023' : 'G0019';
                const addOnCode = isPIN ? 'G0024' : 'G0022';
                const baseMin = Math.min(totalMinutes, 60);
                const addOnMin = Math.max(0, totalMinutes - 60);
                const rows = [];
                rows.push(
                  <Table.Tr key="base">
                    <Table.Td><Badge variant="light">{baseCode}</Badge></Table.Td>
                    <Table.Td>{baseMin} min</Table.Td>
                    <Table.Td><Badge color={baseMin >= 60 ? 'green' : 'yellow'} size="sm">{baseMin >= 60 ? 'Base Met' : `${baseMin}/60`}</Badge></Table.Td>
                  </Table.Tr>
                );
                if (addOnMin > 0) {
                  const units = Math.floor(addOnMin / 30);
                  const remainder = addOnMin % 30;
                  rows.push(
                    <Table.Tr key="addon">
                      <Table.Td><Badge variant="light">{addOnCode}</Badge></Table.Td>
                      <Table.Td>{addOnMin} min</Table.Td>
                      <Table.Td><Badge color="blue" size="sm">{units} unit{units !== 1 ? 's' : ''}{remainder > 0 ? ` + ${remainder} min` : ''}</Badge></Table.Td>
                    </Table.Tr>
                  );
                }
                return rows;
              })()}
            </Table.Tbody>
          </Table>
        )}

        {/* Ledger table */}
        {loading ? (
          <Text>Loading...</Text>
        ) : entries.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No time entries for this month. Document visits from the Care Plan tab to log billable time.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Service Date</Table.Th>
                <Table.Th>Activity</Table.Th>
                <Table.Th>Time</Table.Th>
                <Table.Th>Staff (Credential)</Table.Th>
                <Table.Th>Code</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th w={60}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.map((entry) => (
                <Table.Tr key={entry.id} style={entry.billable ? undefined : { opacity: 0.5, textDecoration: 'line-through' }}>
                  <Table.Td>{entry.date ? formatDate(entry.date) : '—'}</Table.Td>
                  <Table.Td>
                    {activityTypes.find((a) => a.value === entry.activityType)?.label ?? entry.activityType}
                    {entry.description && <Text size="xs" c="dimmed">{entry.description}</Text>}
                  </Table.Td>
                  <Table.Td>{entry.minutes} min</Table.Td>
                  <Table.Td>{entry.careManager} ({entry.credential})</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{entry.cptCode || '—'}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {!entry.billable ? (
                      <Badge color="gray">Non-billable</Badge>
                    ) : (
                      <Badge color={entry.status === 'Billed' ? 'green' : 'yellow'}>{entry.status}</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {entry.status !== 'Billed' && entry.billable && entry.minutes > 1 && (
                      <ActionIcon variant="subtle" color="grape" onClick={() => handleOpenSplit(entry)} aria-label="Split time entry">
                        <IconScissors size={16} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      {/* Split Time Modal */}
      <Modal opened={splitModalOpened} onClose={closeSplitModal} title="Split Time Entry" size="lg">
        {splitEntry && (
          <Stack gap="md">
            <Alert color="gray" variant="light">
              <Text fw={500}>
                Original: {activityTypes.find((a) => a.value === splitEntry.activityType)?.label ?? splitEntry.activityType} — {splitEntry.minutes} min — {splitEntry.date ? formatDate(splitEntry.date) : ''}
              </Text>
            </Alert>

            {splits.map((split, idx) => (
              <Group key={idx} align="flex-end" gap="sm">
                <Select
                  label={idx === 0 ? 'Activity Type' : undefined}
                  data={activityTypes}
                  value={split.activityType}
                  onChange={(v) => updateSplit(idx, 'activityType', v ?? '')}
                  style={{ flex: 2 }}
                  size="sm"
                />
                <NumberInput
                  label={idx === 0 ? 'Minutes' : undefined}
                  value={split.minutes}
                  onChange={(v) => updateSplit(idx, 'minutes', Number(v) || 0)}
                  min={1}
                  max={splitEntry.minutes}
                  style={{ flex: 1 }}
                  size="sm"
                />
                <TextInput
                  label={idx === 0 ? 'Description' : undefined}
                  value={split.description}
                  onChange={(e) => updateSplit(idx, 'description', e.currentTarget.value)}
                  placeholder="What was done..."
                  style={{ flex: 3 }}
                  size="sm"
                />
                {splits.length > 2 && (
                  <ActionIcon color="red" variant="subtle" onClick={() => removeSplit(idx)} aria-label="Remove split row">
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
            ))}

            {splits.length < 5 && (
              <Button variant="subtle" size="sm" onClick={addSplit}>
                + Add Split
              </Button>
            )}

            <Group justify="space-between">
              <Text size="sm" fw={500} c={totalAllocated === splitEntry.minutes ? 'green' : 'red'}>
                Total: {totalAllocated} / {splitEntry.minutes} min {totalAllocated === splitEntry.minutes ? '✓' : ''}
              </Text>
              <Button onClick={handleSplit} disabled={!isValidSplit || splitting} loading={splitting}>
                Save Split
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Document>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-05-lite — SDoH Referrals. Backed by FHIR Task with code='sdoh-referral'.
// businessStatus carries the referral lifecycle: Referred → Accepted →
// Fulfilled → Closed (admin-configurable in v2; hard-coded supplier directory
// in v1 for the demo).

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconExternalLink, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';

const REFERRAL_TASK_CODE = 'sdoh-referral';

export type ReferralStatus = 'Referred' | 'Accepted' | 'Fulfilled' | 'Closed';
export const REFERRAL_STATUSES: ReferralStatus[] = ['Referred', 'Accepted', 'Fulfilled', 'Closed'];

export const REFERRAL_STATUS_TONE: Record<ReferralStatus, string> = {
  Referred: 'gray',
  Accepted: 'blue',
  Fulfilled: 'green',
  Closed: 'dark',
};

export interface SupplierOption {
  id: string;
  name: string;
  category: 'internal' | 'partner';
  serviceLine: string;
}

export const SUPPLIER_DIRECTORY: SupplierOption[] = [
  { id: 'medicircle', name: 'MediCircle', category: 'partner', serviceLine: 'Specialty Rx / pharmacy delivery' },
  { id: 'upside', name: 'Upside (housing)', category: 'partner', serviceLine: 'Housing, in-person SDoH' },
  { id: 'truconnect', name: 'TruConnect', category: 'partner', serviceLine: 'Lifeline / ACP wireless' },
  { id: 'wc-cm-team', name: 'Wider Circle Case Management', category: 'internal', serviceLine: 'General SDoH coordination' },
  { id: 'wc-clinical', name: 'Wider Circle Clinical Staff', category: 'internal', serviceLine: 'Clinical follow-up' },
  { id: 'wc-events', name: 'Wider Circle Community Events', category: 'internal', serviceLine: 'Community / engagement' },
];

const SERVICE_TYPES = [
  'Food assistance',
  'Housing support',
  'Transportation',
  'Utilities assistance',
  'Pharmacy / medication delivery',
  'Behavioral health',
  'Primary care follow-up',
  'Wireless / connectivity',
  'Other',
];

export interface ReferralView {
  task: Task;
  status: ReferralStatus;
  supplierName: string;
  serviceType: string;
  notes: string;
}

export const readReferralStatus = (t: Task): ReferralStatus => {
  const code = t.businessStatus?.coding?.[0]?.code;
  if (code === 'Referred' || code === 'Accepted' || code === 'Fulfilled' || code === 'Closed') return code;
  return 'Referred';
};

const buildReferralTask = (opts: {
  patientId: string;
  patientLabel: string;
  supplier: SupplierOption;
  serviceType: string;
  notes: string;
  requesterRef?: string;
  requesterLabel?: string;
}): Task => {
  const now = new Date().toISOString();
  return {
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: 'routine',
    code: { text: opts.serviceType, coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/task-code', code: REFERRAL_TASK_CODE, display: 'SDoH Referral' }] },
    description: `Refer to ${opts.supplier.name} for ${opts.serviceType}`,
    for: { reference: `Patient/${opts.patientId}`, display: opts.patientLabel },
    requester: opts.requesterRef ? { reference: opts.requesterRef, display: opts.requesterLabel } : undefined,
    authoredOn: now,
    businessStatus: {
      coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/referral-status', code: 'Referred' }],
      text: 'Referred',
    },
    note: opts.notes ? [{ text: opts.notes, time: now }] : undefined,
    extension: [
      { url: 'https://widercircle.com/fhir/StructureDefinition/referral-supplier-id', valueString: opts.supplier.id },
      { url: 'https://widercircle.com/fhir/StructureDefinition/referral-supplier-name', valueString: opts.supplier.name },
    ],
  };
};

export function ReferralsPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = medplum.getProfile();
  const requesterRef = profile ? `Practitioner/${profile.id}` : undefined;
  const requesterLabel = profile
    ? `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() || 'Clinician'
    : 'Clinician';

  const [searchParams] = useSearchParams();
  const initialPatient = searchParams.get('patientId') ?? '';

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [supplierId, setSupplierId] = useState<string>(SUPPLIER_DIRECTORY[0].id);
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [notes, setNotes] = useState('');

  const loadPatients = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated');
      setPatients(
        results.map((p: Patient) => ({
          value: p.id ?? '',
          label: `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  const loadReferrals = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setTasks([]);
        return;
      }
      try {
        const results = await medplum.searchResources(
          'Task',
          `patient=Patient/${patientId}&code=${REFERRAL_TASK_CODE}&_sort=-_lastUpdated&_count=50`
        );
        setTasks(results);
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum]
  );

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    loadReferrals(selectedPatient).catch(console.error);
  }, [selectedPatient, loadReferrals]);

  const create = useCallback(async () => {
    if (!selectedPatient) return;
    const supplier = SUPPLIER_DIRECTORY.find((s) => s.id === supplierId);
    if (!supplier) return;
    setCreating(true);
    try {
      const patientLabel = patients.find((p) => p.value === selectedPatient)?.label ?? '';
      await medplum.createResource<Task>(
        buildReferralTask({
          patientId: selectedPatient,
          patientLabel,
          supplier,
          serviceType,
          notes,
          requesterRef,
          requesterLabel,
        })
      );
      showNotification({ color: 'green', message: `Referral to ${supplier.name} created` });
      setNotes('');
      await loadReferrals(selectedPatient);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setCreating(false);
    }
  }, [selectedPatient, supplierId, serviceType, notes, medplum, patients, requesterRef, requesterLabel, loadReferrals]);

  const advance = useCallback(
    async (task: Task, next: ReferralStatus) => {
      try {
        const fhirStatus: Task['status'] =
          next === 'Closed' ? 'cancelled' : next === 'Fulfilled' ? 'completed' : next === 'Accepted' ? 'in-progress' : 'requested';
        const updated: Task = {
          ...task,
          status: fhirStatus,
          businessStatus: {
            coding: [{ system: 'https://widercircle.com/fhir/CodeSystem/referral-status', code: next }],
            text: next,
          },
        };
        await medplum.updateResource<Task>(updated);
        showNotification({ color: 'green', message: `Referral marked ${next}` });
        await loadReferrals(selectedPatient);
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, loadReferrals, selectedPatient]
  );

  const referralViews = useMemo<ReferralView[]>(
    () =>
      tasks.map((t) => ({
        task: t,
        status: readReferralStatus(t),
        supplierName:
          t.extension?.find((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/referral-supplier-name')
            ?.valueString ?? 'Unknown supplier',
        serviceType: t.code?.text ?? 'Service',
        notes: t.note?.[0]?.text ?? '',
      })),
    [tasks]
  );

  // Mantine v8 Select expects grouped data as
  // [{ group: '...', items: [{value, label}, ...] }] — the v7 flat shorthand
  // ({value, label, group}) crashes parseItem on undefined .items. Grouping
  // upfront keeps the supplier dropdown rendering on member selection.
  const supplierOptions = useMemo(() => {
    const partner = SUPPLIER_DIRECTORY.filter((s) => s.category === 'partner').map((s) => ({
      value: s.id,
      label: `${s.name} · ${s.serviceLine}`,
    }));
    const internal = SUPPLIER_DIRECTORY.filter((s) => s.category !== 'partner').map((s) => ({
      value: s.id,
      label: `${s.name} · ${s.serviceLine}`,
    }));
    const out: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [];
    if (partner.length > 0) out.push({ group: 'Partner suppliers', items: partner });
    if (internal.length > 0) out.push({ group: 'Internal teams', items: internal });
    return out;
  }, []);

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
          <Title order={2}>SDoH Referrals (CM-05)</Title>
          <Text c="dimmed" size="sm">
            Refer a member to a partner supplier or internal team. Status lifecycle: Referred → Accepted → Fulfilled → Closed.
          </Text>
        </Stack>

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
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Title order={5}>New referral</Title>
              <Group grow align="flex-end">
                <Select
                  label="Supplier"
                  data={supplierOptions}
                  value={supplierId}
                  onChange={(v) => setSupplierId(v ?? SUPPLIER_DIRECTORY[0].id)}
                />
                <Select
                  label="Service type"
                  data={SERVICE_TYPES}
                  value={serviceType}
                  onChange={(v) => setServiceType(v ?? SERVICE_TYPES[0])}
                />
              </Group>
              <Textarea
                label="Notes for supplier (optional)"
                placeholder="Member context, urgency, contact preferences…"
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Group justify="flex-end">
                <Button color="orange" leftSection={<IconPlus size={16} />} onClick={create} loading={creating}>
                  Create referral
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        {selectedPatient && referralViews.length === 0 && (
          <Alert color="gray" variant="light" title="No referrals yet">
            <Text size="sm">No referrals on file for this member. Create one above.</Text>
          </Alert>
        )}

        {referralViews.length > 0 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Referral history</Title>
                <Badge variant="light">{referralViews.length}</Badge>
              </Group>
              <Stack gap="xs">
                {referralViews.map(({ task, status, supplierName, serviceType: svc, notes: n }) => (
                  <Card key={task.id} withBorder radius="sm" padding="sm">
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap={8}>
                          <Badge color={REFERRAL_STATUS_TONE[status]} variant="filled">{status}</Badge>
                          <Text size="sm" fw={600}>{supplierName}</Text>
                          <Badge variant="light" color="gray">{svc}</Badge>
                        </Group>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {task.authoredOn ? formatDateTime(task.authoredOn) : ''}
                        </Text>
                      </Group>
                      {n && (
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                          {n}
                        </Text>
                      )}
                      <Group gap={6} mt={4}>
                        {REFERRAL_STATUSES.filter((s) => s !== status).map((s) => (
                          <Button
                            key={s}
                            size="compact-xs"
                            variant="light"
                            color={REFERRAL_STATUS_TONE[s]}
                            leftSection={s === 'Fulfilled' || s === 'Closed' ? <IconCheck size={12} /> : <IconExternalLink size={12} />}
                            onClick={() => {
                              advance(task, s).catch(() => undefined);
                            }}
                          >
                            Mark {s}
                          </Button>
                        ))}
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </Document>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-02 Unified Member Context — single profile showing 8 canonical sections:
// 1. Key info (CM-03 header)        2. Demographics
// 3. Conditions                      4. Medications
// 5. Allergies                       6. Consents
// 7. Recent interactions             8. Care plan
//
// Source of truth for case history, communications, referrals, and clinical
// data is the FHIR Patient compartment. v1 reads what's available; v2 will
// add referral and case timeline once CM-05 / CM-21 land.

import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  AllergyIntolerance,
  CarePlan,
  Communication,
  Condition,
  Consent,
  Coverage,
  MedicationRequest,
  Patient,
  Task,
} from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import {
  IconBriefcase,
  IconCalendar,
  IconChevronRight,
  IconExternalLink,
  IconHistory,
  IconHome,
  IconNotes,
  IconPill,
  IconPlus,
  IconStethoscope,
  IconVirus,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MemberKeyInfoHeader } from '../components/MemberKeyInfoHeader';
import { useRole } from '../auth/RoleContext';

const CASE_CATEGORY_CODE = 'case-management';
const CASE_TYPE_EXT = 'https://widercircle.com/fhir/StructureDefinition/case-type';

const CASE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sdoh-food', label: 'SDoH — Food insecurity' },
  { value: 'sdoh-housing', label: 'SDoH — Housing instability' },
  { value: 'sdoh-transportation', label: 'SDoH — Transportation' },
  { value: 'sdoh-utilities', label: 'SDoH — Utilities' },
  { value: 'pcp-referral', label: 'Needs new PCP' },
  { value: 'eligibility', label: 'Eligibility verification' },
  { value: 'coverage', label: 'Coverage / benefits issue' },
  { value: 'other', label: 'Other' },
];

const CASE_PRIORITIES: Array<{ value: string; label: string }> = [
  { value: 'asap', label: 'High' },
  { value: 'urgent', label: 'Medium' },
  { value: 'routine', label: 'Low' },
];

const caseTypeLabel = (code: string | undefined): string =>
  CASE_TYPES.find((t) => t.value === code)?.label ?? code ?? 'Case';

interface LoadedData {
  patient: Patient | undefined;
  coverages: Coverage[];
  conditions: Condition[];
  medications: MedicationRequest[];
  allergies: AllergyIntolerance[];
  consents: Consent[];
  communications: Communication[];
  carePlans: CarePlan[];
  cases: Task[];
}

const EMPTY: LoadedData = {
  patient: undefined,
  coverages: [],
  conditions: [],
  medications: [],
  allergies: [],
  consents: [],
  communications: [],
  carePlans: [],
  cases: [],
};

export function MemberContextPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { hasPermission } = useRole();
  const { patientId } = useParams<{ patientId: string }>();
  const [data, setData] = useState<LoadedData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [caseModalOpened, { open: openCaseModal, close: closeCaseModal }] = useDisclosure(false);
  const [caseType, setCaseType] = useState<string>('sdoh-food');
  const [caseSummary, setCaseSummary] = useState('');
  const [casePriority, setCasePriority] = useState<string>('urgent');
  const [creatingCase, setCreatingCase] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    const subject = `subject=Patient/${patientId}`;
    const patientRef = `patient=Patient/${patientId}`;
    try {
      const [patient, coverages, conditions, medications, allergies, consents, communications, carePlans, cases] =
        await Promise.all([
          medplum.readResource('Patient', patientId).catch(() => undefined),
          medplum.searchResources('Coverage', `${patientRef}&_count=10`).catch(() => []),
          medplum
            .searchResources('Condition', `${subject}&clinical-status=active&_count=20&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('MedicationRequest', `${subject}&status=active&_count=20&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('AllergyIntolerance', `${patientRef}&_count=20&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('Consent', `${patientRef}&_count=10&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('Communication', `${subject}&_count=10&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('CarePlan', `${subject}&status=active&_count=5&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources(
              'Task',
              `patient=Patient/${patientId}&code=${CASE_CATEGORY_CODE}&_sort=-_lastUpdated&_count=20`
            )
            .catch(() => [] as Task[]),
        ]);
      setData({
        patient,
        coverages: coverages ?? [],
        conditions: conditions ?? [],
        medications: medications ?? [],
        allergies: allergies ?? [],
        consents: consents ?? [],
        communications: communications ?? [],
        carePlans: carePlans ?? [],
        cases: (cases ?? []) as Task[],
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, patientId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const resetCaseForm = useCallback(() => {
    setCaseType('sdoh-food');
    setCasePriority('urgent');
    setCaseSummary('');
  }, []);

  const handleCreateCase = useCallback(async () => {
    if (!patientId || !data.patient || !caseSummary.trim()) {
      return;
    }
    const profile = medplum.getProfile();
    setCreatingCase(true);
    try {
      const newCase: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: casePriority as Task['priority'],
        code: {
          coding: [
            {
              system: 'https://widercircle.com/fhir/CodeSystem/task-category',
              code: CASE_CATEGORY_CODE,
              display: 'Case management',
            },
          ],
          text: caseTypeLabel(caseType),
        },
        description: caseSummary.trim(),
        for: {
          reference: `Patient/${patientId}`,
          display:
            `${data.patient.name?.[0]?.given?.[0] ?? ''} ${data.patient.name?.[0]?.family ?? ''}`.trim() ||
            'Member',
        },
        authoredOn: new Date().toISOString(),
        requester: profile ? createReference(profile) : undefined,
        owner: profile ? createReference(profile) : undefined,
        extension: [{ url: CASE_TYPE_EXT, valueString: caseType }],
      };
      await medplum.createResource<Task>(newCase);
      showNotification({ color: 'green', message: 'Case created' });
      closeCaseModal();
      resetCaseForm();
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setCreatingCase(false);
    }
  }, [patientId, data.patient, caseSummary, caseType, casePriority, medplum, closeCaseModal, resetCaseForm, load]);

  if (loading) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  if (!data.patient) {
    return (
      <Document>
        <Title order={3}>Member not found</Title>
        <Text c="dimmed" size="sm" mt="xs">No Patient resource for ID {patientId}.</Text>
      </Document>
    );
  }

  const consentValid = data.consents.some((c) => c.status === 'active');

  return (
    <Document>
      <Stack gap="md">
        <MemberKeyInfoHeader patient={data.patient} coverages={data.coverages} consentValid={consentValid} />

        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            color="grape"
            leftSection={<IconPlus size={14} />}
            onClick={openCaseModal}
          >
            Create case
          </Button>
          {hasPermission('referrals.manage') && (
            <Button
              variant="light"
              color="orange"
              leftSection={<IconExternalLink size={14} />}
              onClick={() => navigate(`/referrals?patientId=${patientId}`)}
            >
              Refer to supplier
            </Button>
          )}
        </Group>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Demographics" icon={<IconHome size={16} />}>
              <DemographicsBlock patient={data.patient} />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Active conditions" icon={<IconStethoscope size={16} />} count={data.conditions.length}>
              <ItemList
                items={data.conditions.slice(0, 5).map((c) => ({
                  key: c.id ?? '',
                  primary: c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Untitled',
                  secondary: c.recordedDate ? `Recorded ${formatDateTime(c.recordedDate)}` : undefined,
                }))}
                empty="No active conditions on file."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Medications" icon={<IconPill size={16} />} count={data.medications.length}>
              <ItemList
                items={data.medications.slice(0, 5).map((m) => ({
                  key: m.id ?? '',
                  primary:
                    m.medicationCodeableConcept?.text ??
                    m.medicationCodeableConcept?.coding?.[0]?.display ??
                    'Medication',
                  secondary: m.dosageInstruction?.[0]?.text ?? undefined,
                }))}
                empty="No active medications."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Allergies" icon={<IconVirus size={16} />} count={data.allergies.length}>
              <ItemList
                items={data.allergies.slice(0, 5).map((a) => ({
                  key: a.id ?? '',
                  primary: a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Allergy',
                  secondary: a.criticality ? `Criticality: ${a.criticality}` : undefined,
                }))}
                empty="No known allergies."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Consents" icon={<IconNotes size={16} />} count={data.consents.length}>
              <ItemList
                items={data.consents.slice(0, 5).map((c) => ({
                  key: c.id ?? '',
                  primary: c.category?.[0]?.text ?? c.category?.[0]?.coding?.[0]?.display ?? 'Consent',
                  secondary: c.dateTime
                    ? `${c.status} · ${formatDateTime(c.dateTime)}`
                    : c.status,
                }))}
                empty="No consents recorded."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Active care plan" icon={<IconCalendar size={16} />} count={data.carePlans.length}>
              <ItemList
                items={data.carePlans.slice(0, 3).map((p) => ({
                  key: p.id ?? '',
                  primary: p.title ?? 'Care plan',
                  secondary: p.period?.start ? `Started ${formatDateTime(p.period.start)}` : undefined,
                }))}
                empty="No active care plan."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <SectionCard
              title="Open cases"
              icon={<IconBriefcase size={16} />}
              count={data.cases.filter((c) => c.status !== 'completed' && c.status !== 'cancelled').length}
            >
              {data.cases.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No cases for this member. Click "Create case" above to track an SDoH need, PCP referral,
                  eligibility issue, or any ad-hoc case.
                </Text>
              ) : (
                <Stack gap="xs">
                  {data.cases.slice(0, 6).map((task) => {
                    const typeCode =
                      task.extension?.find((e) => e.url === CASE_TYPE_EXT)?.valueString ?? 'other';
                    const closed = task.status === 'completed' || task.status === 'cancelled';
                    return (
                      <Group
                        key={task.id}
                        justify="space-between"
                        wrap="nowrap"
                        p="xs"
                        style={{
                          borderBottom: '1px solid var(--mantine-color-gray-2)',
                          cursor: 'pointer',
                          opacity: closed ? 0.6 : 1,
                        }}
                        onClick={() => task.id && navigate(`/Task/${task.id}`)}
                      >
                        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={500} c="blue" truncate>
                            {caseTypeLabel(typeCode)}
                          </Text>
                          {task.description && (
                            <Text size="xs" c="dimmed" truncate>
                              {task.description}
                            </Text>
                          )}
                          {task.authoredOn && (
                            <Text size="xs" c="dimmed" ff="monospace">
                              opened {formatDateTime(task.authoredOn)}
                            </Text>
                          )}
                        </Stack>
                        <Group gap={6}>
                          {task.priority && (
                            <Badge
                              color={task.priority === 'asap' ? 'red' : task.priority === 'urgent' ? 'orange' : 'blue'}
                              size="xs"
                              variant="light"
                            >
                              {CASE_PRIORITIES.find((p) => p.value === task.priority)?.label ?? task.priority}
                            </Badge>
                          )}
                          <Badge
                            color={closed ? 'gray' : task.status === 'in-progress' ? 'blue' : 'yellow'}
                            size="xs"
                            variant="light"
                          >
                            {task.status}
                          </Badge>
                        </Group>
                      </Group>
                    );
                  })}
                </Stack>
              )}
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <SectionCard title="Recent interactions" icon={<IconHistory size={16} />} count={data.communications.length}>
              <ItemList
                items={data.communications.slice(0, 6).map((c) => ({
                  key: c.id ?? '',
                  primary: c.payload?.[0]?.contentString ?? c.topic?.text ?? 'Communication',
                  secondary: c.sent ? `${c.status} · ${formatDateTime(c.sent)}` : c.status,
                }))}
                empty="No interactions in the last 30 days."
              />
            </SectionCard>
          </Grid.Col>
        </Grid>

        <Group justify="flex-end">
          <Text size="sm" c="dimmed">
            <Link to={`/Patient/${patientId}`} style={{ color: 'var(--mantine-color-orange-6)' }}>
              Open full chart <IconChevronRight size={12} style={{ verticalAlign: 'middle' }} />
            </Link>
          </Text>
        </Group>
      </Stack>

      {/* CM-21: Manual case creation. Creates a Task with category=case-management
          + case-type extension. Surfaces in the Open cases card above. */}
      <Modal
        opened={caseModalOpened}
        onClose={() => {
          closeCaseModal();
          resetCaseForm();
        }}
        title="Create case"
        size="md"
      >
        <Stack gap="md">
          <Select
            label="Case type"
            data={CASE_TYPES}
            value={caseType}
            onChange={(v) => setCaseType(v ?? 'other')}
            allowDeselect={false}
            required
          />
          <Textarea
            label="Summary"
            placeholder="What's the need or issue? Include context the next CHW would want."
            value={caseSummary}
            onChange={(e) => setCaseSummary(e.currentTarget.value)}
            minRows={3}
            autosize
            required
          />
          <Select
            label="Priority"
            data={CASE_PRIORITIES}
            value={casePriority}
            onChange={(v) => setCasePriority(v ?? 'urgent')}
            allowDeselect={false}
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                closeCaseModal();
                resetCaseForm();
              }}
              disabled={creatingCase}
            >
              Cancel
            </Button>
            <Button
              color="grape"
              leftSection={<IconBriefcase size={14} />}
              loading={creatingCase}
              disabled={creatingCase || !caseSummary.trim()}
              onClick={handleCreateCase}
            >
              Create case
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}

function SectionCard({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card withBorder radius="md" padding="md" h="100%">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap={8}>
            {icon}
            <Title order={6}>{title}</Title>
          </Group>
          {count !== undefined && count > 0 && (
            <Badge variant="light" color="gray">{count}</Badge>
          )}
        </Group>
        {children}
      </Stack>
    </Card>
  );
}

function ItemList({
  items,
  empty,
}: {
  items: { key: string; primary: string; secondary?: string }[];
  empty: string;
}): JSX.Element {
  if (items.length === 0) {
    return <Text size="sm" c="dimmed">{empty}</Text>;
  }
  return (
    <Stack gap="xs">
      {items.map((it) => (
        <Stack key={it.key} gap={2}>
          <Text size="sm" fw={500}>{it.primary}</Text>
          {it.secondary && <Text size="xs" c="dimmed">{it.secondary}</Text>}
        </Stack>
      ))}
    </Stack>
  );
}

function DemographicsBlock({ patient }: { patient: Patient | undefined }): JSX.Element {
  if (!patient) return <Text size="sm" c="dimmed">No demographics on file.</Text>;
  const home = patient.address?.find((a) => a.use === 'home') ?? patient.address?.[0];
  const fullAddress = home
    ? [home.line?.join(', '), home.city, home.state, home.postalCode].filter(Boolean).join(', ')
    : null;
  return (
    <Stack gap={6}>
      <Row label="Born" value={patient.birthDate ?? '—'} />
      <Row label="Marital" value={patient.maritalStatus?.text ?? patient.maritalStatus?.coding?.[0]?.display ?? '—'} />
      <Row label="Address" value={fullAddress ?? '—'} />
      <Row label="Email" value={patient.telecom?.find((t) => t.system === 'email')?.value ?? '—'} />
      <Row label="Phone" value={patient.telecom?.find((t) => t.system === 'phone')?.value ?? '—'} />
    </Stack>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Group gap={8} justify="space-between" wrap="nowrap">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
      <Text size="sm" style={{ textAlign: 'right' }}>{value}</Text>
    </Group>
  );
}

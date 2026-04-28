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

import { Badge, Button, Card, Grid, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  AllergyIntolerance,
  CarePlan,
  Communication,
  Condition,
  Consent,
  Coverage,
  MedicationRequest,
  Patient,
} from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { IconCalendar, IconChevronRight, IconExternalLink, IconHistory, IconHome, IconNotes, IconPill, IconStethoscope, IconVirus } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MemberKeyInfoHeader } from '../components/MemberKeyInfoHeader';
import { useRole } from '../auth/RoleContext';

interface LoadedData {
  patient: Patient | undefined;
  coverages: Coverage[];
  conditions: Condition[];
  medications: MedicationRequest[];
  allergies: AllergyIntolerance[];
  consents: Consent[];
  communications: Communication[];
  carePlans: CarePlan[];
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
};

export function MemberContextPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { hasPermission } = useRole();
  const { patientId } = useParams<{ patientId: string }>();
  const [data, setData] = useState<LoadedData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    const subject = `subject=Patient/${patientId}`;
    const patientRef = `patient=Patient/${patientId}`;
    try {
      const [patient, coverages, conditions, medications, allergies, consents, communications, carePlans] =
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

        <Group justify="flex-end">
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-13 — CHW caseload list. The CHW lands here from the "Members" nav and
// sees every member they're responsible for, surfaced by risk:
//   - CCM minutes this month (approaching/passed 99490 threshold)
//   - Plan of Care status (active vs missing)
//   - Telehealth + CHI consent (valid vs missing/expired)
//   - Overdue tasks count
//   - SDoH risk triggers from recent assessments
//
// Filter chips let the CHW slice the caseload by any single risk dimension.
// Rows click through to /members/:patientId (the existing CM-02 surface).
//
// Data is loaded in 6 bulk searches, grouped client-side, so the page stays
// fast for caseloads up to a few dozen members. For the full FHIR-Patient
// compartment story, a server-side aggregator would replace this client-side
// grouping — out of scope for the demo.

import {
  Badge,
  Button,
  Card,
  Center,
  Chip,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type {
  CarePlan,
  Communication,
  Consent,
  Observation,
  Patient,
  QuestionnaireResponse,
  Task,
} from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconClipboardCheck,
  IconClock,
  IconHeartHandshake,
  IconLock,
  IconPhone,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CONSENT_CATEGORY_CODE,
  CONSENT_EXPIRATION_MONTHS,
  evaluateConsentStatus,
} from './ConsentCapturePage';
import {
  ECM_APPROACHING_CAP_AT,
  ECM_CAP_DEFAULT,
  ECM_CATEGORY_CODE,
  evaluateEcmStatus,
} from '../utils/ecm';

const CCM_FIRST_THRESHOLD_MIN = 20; // 99490
const CCM_APPROACHING_MIN = 18;
const SDOH_TRIGGERED_CASE_EXT = 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case';

type FilterId = 'all' | 'threshold' | 'noPlan' | 'noConsent' | 'overdue' | 'sdoh' | 'ecmCap';

interface CaseloadRow {
  patient: Patient;
  fullName: string;
  ccmMinutes: number;
  hasActivePlan: boolean;
  consentValid: boolean;
  overdueTasks: number;
  sdohTriggers: number;
  ecmBillable: number;
  ecmCapReached: boolean;
  ecmApproachingCap: boolean;
  ecmWindowClosed: boolean;
}

const formatPatientName = (p: Patient): string => {
  const given = p.name?.[0]?.given?.join(' ') ?? '';
  const family = p.name?.[0]?.family ?? '';
  return `${given} ${family}`.trim() || 'Unnamed member';
};

const startOfMonthIso = (): string => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const sumMinutes = (observations: Observation[]): number => {
  let total = 0;
  for (const o of observations) {
    if (o.valueQuantity?.unit === 'min' && typeof o.valueQuantity.value === 'number') {
      total += o.valueQuantity.value;
    }
  }
  return total;
};

const patientIdFromRef = (ref: string | undefined): string | undefined =>
  ref?.startsWith('Patient/') ? ref.replace('Patient/', '') : undefined;

export function CaseloadPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CaseloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonthIso();
      const today = todayIso();
      const [patients, carePlans, consents, observations, tasks, qrs, ecmComms] = await Promise.all([
        medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated'),
        medplum.searchResources('CarePlan', 'status=active&_count=200&_sort=-_lastUpdated'),
        medplum.searchResources('Consent', 'status=active&_count=300&_sort=-_lastUpdated'),
        medplum.searchResources(
          'Observation',
          `code=ccm-minutes&date=ge${monthStart}&_count=300&_sort=-date`
        ),
        medplum.searchResources(
          'Task',
          `status:not=completed&status:not=cancelled&_count=300&_sort=-_lastUpdated`
        ),
        medplum.searchResources(
          'QuestionnaireResponse',
          `status=completed&_count=200&_sort=-authored`
        ),
        medplum.searchResources(
          'Communication',
          `category=${ECM_CATEGORY_CODE}&_count=500&_sort=-sent`
        ),
      ]);

      // Group helpers
      const planByPatient = new Map<string, CarePlan>();
      for (const p of carePlans as CarePlan[]) {
        const id = patientIdFromRef(p.subject?.reference);
        if (id && !planByPatient.has(id)) {
          planByPatient.set(id, p);
        }
      }

      const consentsByPatient = new Map<string, Consent[]>();
      for (const c of consents as Consent[]) {
        const id = patientIdFromRef(c.patient?.reference);
        if (!id) continue;
        const arr = consentsByPatient.get(id) ?? [];
        arr.push(c);
        consentsByPatient.set(id, arr);
      }

      const minutesByPatient = new Map<string, Observation[]>();
      for (const o of observations as Observation[]) {
        const id = patientIdFromRef(o.subject?.reference);
        if (!id) continue;
        const arr = minutesByPatient.get(id) ?? [];
        arr.push(o);
        minutesByPatient.set(id, arr);
      }

      const overdueByPatient = new Map<string, number>();
      for (const t of tasks as Task[]) {
        const id = patientIdFromRef(t.for?.reference);
        if (!id) continue;
        const due = t.restriction?.period?.end?.slice(0, 10);
        if (due && due < today) {
          overdueByPatient.set(id, (overdueByPatient.get(id) ?? 0) + 1);
        }
      }

      const triggersByPatient = new Map<string, number>();
      for (const qr of qrs as QuestionnaireResponse[]) {
        const id = patientIdFromRef(qr.subject?.reference);
        if (!id) continue;
        const triggers =
          qr.extension?.filter((e) => e.url === SDOH_TRIGGERED_CASE_EXT).length ?? 0;
        if (triggers > 0) {
          triggersByPatient.set(id, (triggersByPatient.get(id) ?? 0) + triggers);
        }
      }

      const ecmByPatient = new Map<string, Communication[]>();
      for (const c of ecmComms as Communication[]) {
        const id = patientIdFromRef(c.subject?.reference);
        if (!id) continue;
        const arr = ecmByPatient.get(id) ?? [];
        arr.push(c);
        ecmByPatient.set(id, arr);
      }

      const computed: CaseloadRow[] = (patients as Patient[]).map((p) => {
        const id = p.id ?? '';
        const patientConsents = consentsByPatient.get(id) ?? [];
        const filtered = patientConsents.filter((c) =>
          c.category?.some((cat) => cat.coding?.some((coding) => coding.code === CONSENT_CATEGORY_CODE))
        );
        const consentStatus = evaluateConsentStatus(filtered);
        const ccmMinutes = sumMinutes(minutesByPatient.get(id) ?? []);
        const ecmStatus = evaluateEcmStatus(ecmByPatient.get(id) ?? [], p);
        return {
          patient: p,
          fullName: formatPatientName(p),
          ccmMinutes,
          hasActivePlan: planByPatient.has(id),
          consentValid: consentStatus.state === 'on-file',
          overdueTasks: overdueByPatient.get(id) ?? 0,
          sdohTriggers: triggersByPatient.get(id) ?? 0,
          ecmBillable: ecmStatus.billable,
          ecmCapReached: ecmStatus.capReached,
          ecmApproachingCap: ecmStatus.approachingCap,
          ecmWindowClosed: ecmStatus.windowClosed,
        };
      });

      // Sort: at-risk first (no plan, no consent, overdue, near threshold)
      computed.sort((a, b) => riskScore(b) - riskScore(a));
      setRows(computed);
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
      if (q && !r.fullName.toLowerCase().includes(q)) {
        return false;
      }
      switch (filter) {
        case 'threshold':
          return r.ccmMinutes >= CCM_APPROACHING_MIN && r.ccmMinutes < CCM_FIRST_THRESHOLD_MIN;
        case 'noPlan':
          return !r.hasActivePlan;
        case 'noConsent':
          return !r.consentValid;
        case 'overdue':
          return r.overdueTasks > 0;
        case 'sdoh':
          return r.sdohTriggers > 0;
        case 'ecmCap':
          return r.ecmCapReached || r.ecmApproachingCap;
        default:
          return true;
      }
    });
  }, [rows, search, filter]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      threshold: rows.filter(
        (r) => r.ccmMinutes >= CCM_APPROACHING_MIN && r.ccmMinutes < CCM_FIRST_THRESHOLD_MIN
      ).length,
      noPlan: rows.filter((r) => !r.hasActivePlan).length,
      noConsent: rows.filter((r) => !r.consentValid).length,
      overdue: rows.filter((r) => r.overdueTasks > 0).length,
      sdoh: rows.filter((r) => r.sdohTriggers > 0).length,
      ecmCap: rows.filter((r) => r.ecmCapReached || r.ecmApproachingCap).length,
    }),
    [rows]
  );

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Group gap="xs">
              <IconUsers size={22} />
              <Title order={2}>My caseload</Title>
              <Badge variant="light">{rows.length}</Badge>
            </Group>
            <Text c="dimmed" size="sm">
              Members assigned to you with current risk surfaced. Click any row to open the full member 360.
            </Text>
          </Stack>
          <Button variant="light" size="sm" onClick={() => load()} loading={loading}>
            Refresh
          </Button>
        </Group>

        <TextInput
          placeholder="Search members by name…"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />

        <Chip.Group value={filter} onChange={(v) => setFilter((Array.isArray(v) ? v[0] : v) as FilterId)}>
          <Group gap="xs">
            <Chip value="all" color="gray" variant="light">
              All ({counts.all})
            </Chip>
            <Chip value="threshold" color="orange" variant="light">
              Approaching CCM ({counts.threshold})
            </Chip>
            <Chip value="noPlan" color="red" variant="light">
              No Plan of Care ({counts.noPlan})
            </Chip>
            <Chip value="noConsent" color="red" variant="light">
              Consent missing ({counts.noConsent})
            </Chip>
            <Chip value="overdue" color="red" variant="light">
              Overdue tasks ({counts.overdue})
            </Chip>
            <Chip value="sdoh" color="yellow" variant="light">
              SDoH risk ({counts.sdoh})
            </Chip>
            <Chip value="ecmCap" color="orange" variant="light">
              ECM cap ({counts.ecmCap})
            </Chip>
          </Group>
        </Chip.Group>

        {loading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : filtered.length === 0 ? (
          <Card withBorder radius="md" padding="md">
            <Text c="dimmed" size="sm" ta="center">
              No members match this filter.
            </Text>
          </Card>
        ) : (
          <Stack gap="xs">
            {filtered.map((r) => (
              <Card
                key={r.patient.id}
                withBorder
                radius="md"
                padding="md"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/members/${r.patient.id}`)}
              >
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                    <Group gap="xs" wrap="wrap">
                      <Text fw={600} size="md" c="blue">
                        {r.fullName}
                      </Text>
                      {r.patient.gender && (
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {r.patient.gender}
                        </Text>
                      )}
                      {r.patient.birthDate && (
                        <Text size="xs" c="dimmed" ff="monospace">
                          DOB {r.patient.birthDate}
                        </Text>
                      )}
                    </Group>
                    <RiskPills row={r} />
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Document>
  );
}

function RiskPills({ row }: { row: CaseloadRow }): JSX.Element {
  const {
    ccmMinutes,
    hasActivePlan,
    consentValid,
    overdueTasks,
    sdohTriggers,
    ecmBillable,
    ecmCapReached,
    ecmApproachingCap,
    ecmWindowClosed,
  } = row;
  const passedThreshold = ccmMinutes >= CCM_FIRST_THRESHOLD_MIN;
  const approaching = ccmMinutes >= CCM_APPROACHING_MIN && !passedThreshold;
  return (
    <Group gap={6} wrap="wrap">
      <Badge
        color={passedThreshold ? 'green' : approaching ? 'orange' : 'gray'}
        size="sm"
        variant="light"
        leftSection={<IconClock size={10} />}
      >
        {ccmMinutes} min · {passedThreshold ? '99490 hit' : approaching ? `${CCM_FIRST_THRESHOLD_MIN - ccmMinutes} to 99490` : 'CCM started'}
      </Badge>
      {!hasActivePlan && (
        <Badge color="red" size="sm" variant="light" leftSection={<IconClipboardCheck size={10} />}>
          No Plan of Care
        </Badge>
      )}
      {!consentValid && (
        <Badge color="red" size="sm" variant="light" leftSection={<IconLock size={10} />}>
          Consent missing
        </Badge>
      )}
      {overdueTasks > 0 && (
        <Badge color="red" size="sm" variant="light" leftSection={<IconAlertTriangle size={10} />}>
          {overdueTasks} overdue
        </Badge>
      )}
      {sdohTriggers > 0 && (
        <Badge color="yellow" size="sm" variant="light" leftSection={<IconHeartHandshake size={10} />}>
          {sdohTriggers} SDoH risk
        </Badge>
      )}
      {ecmBillable > 0 && (
        <Badge
          color={ecmCapReached ? 'red' : ecmApproachingCap ? 'orange' : 'gray'}
          size="sm"
          variant="light"
          leftSection={<IconPhone size={10} />}
        >
          ECM {ecmBillable}/{ECM_CAP_DEFAULT}
          {ecmCapReached
            ? ' · cap'
            : ecmApproachingCap
              ? ` · ${ECM_CAP_DEFAULT - ecmBillable} left`
              : ''}
        </Badge>
      )}
      {ecmWindowClosed && (
        <Badge color="gray" size="sm" variant="light">
          ECM window closed
        </Badge>
      )}
      {hasActivePlan && consentValid && overdueTasks === 0 && sdohTriggers === 0 && (
        <Text size="xs" c="dimmed">
          Plan + consent in good standing · {CONSENT_EXPIRATION_MONTHS}-month consent validity
        </Text>
      )}
    </Group>
  );
}

function riskScore(r: CaseloadRow): number {
  let s = 0;
  if (!r.hasActivePlan) s += 50;
  if (!r.consentValid) s += 30;
  if (r.overdueTasks > 0) s += 20 + Math.min(r.overdueTasks, 5) * 4;
  if (r.ccmMinutes >= CCM_APPROACHING_MIN && r.ccmMinutes < CCM_FIRST_THRESHOLD_MIN) s += 15;
  if (r.sdohTriggers > 0) s += 10 + Math.min(r.sdohTriggers, 5) * 2;
  return s;
}

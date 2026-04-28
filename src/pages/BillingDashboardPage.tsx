// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Center, Group, Loader, Progress, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  getMonthRange,
  getProgressColor,
  getStatusLabel,
} from '../billing/billing-utils';
import { getThresholdFromCptCodes, suggestCptFromConfig, useBillingConfig } from '../billing/useBillingConfig';

interface PatientBillingRow {
  patientId: string;
  patientName: string;
  program: string;
  totalMinutes: number;
  threshold: number;
  suggestedCpt: string;
  progress: number;
  entryCount: number;
}

export function BillingDashboardPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PatientBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { cptCodes } = useBillingConfig();

  // Month range is fixed for the session lifetime — recalculated on page load
  const { start: monthStart, end: monthEnd, label: monthLabel } = useMemo(() => getMonthRange(), []);

  const fetchData = useCallback(async () => {
    try {
      // Use searchResources for auto-pagination
      const patients = await medplum.searchResources('Patient', '_sort=-_lastUpdated');
      const encounters = await medplum.searchResources(
        'Encounter',
        `date=ge${monthStart}&date=le${monthEnd}&_sort=-date`
      );

      // Aggregate encounters by patient AND program (dual-enrolled have separate floors)
      const patientProgramMinutes: Record<string, Record<string, { minutes: number; count: number }>> = {};

      for (const enc of encounters as Encounter[]) {
        const patRef = enc.subject?.reference ?? '';
        const patId = patRef.replace('Patient/', '');
        if (!patId) {
          continue;
        }
        const minutes = enc.length?.value ?? 0;
        const prog = enc.serviceType?.coding?.[0]?.code ?? 'CHI';

        if (!patientProgramMinutes[patId]) {
          patientProgramMinutes[patId] = {};
        }
        if (!patientProgramMinutes[patId][prog]) {
          patientProgramMinutes[patId][prog] = { minutes: 0, count: 0 };
        }
        patientProgramMinutes[patId][prog].minutes += minutes;
        patientProgramMinutes[patId][prog].count += 1;
      }

      // Build rows — one per patient per program (dual-enrolled get multiple rows)
      const billingRows: PatientBillingRow[] = [];
      for (const patient of patients as Patient[]) {
        const patId = patient.id ?? '';
        const name = patient.name?.[0];
        const displayName = name ? `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim() : patId;
        const programData = patientProgramMinutes[patId] ?? { CHI: { minutes: 0, count: 0 } };
        const programKeys = Object.keys(programData);
        if (programKeys.length === 0) {
          programKeys.push('CHI');
        }

        for (const prog of programKeys) {
          const data = programData[prog] ?? { minutes: 0, count: 0 };
          const threshold = getThresholdFromCptCodes(cptCodes);
          const progress = threshold > 0 ? Math.min(100, Math.round((data.minutes / threshold) * 100)) : 0;
          const cpt = suggestCptFromConfig(data.minutes, cptCodes, prog);

          billingRows.push({
            patientId: patId,
            patientName: displayName,
            program: prog,
            totalMinutes: data.minutes,
          threshold,
          suggestedCpt: cpt || '—',
          progress,
          entryCount: data.count,
        });
        }
      }

      // Sort: approaching threshold first (70-99%), then met (100%+), then below
      billingRows.sort((a, b) => {
        const aApproaching = a.progress >= 70 && a.progress < 100;
        const bApproaching = b.progress >= 70 && b.progress < 100;
        if (aApproaching && !bApproaching) {
          return -1;
        }
        if (!aApproaching && bApproaching) {
          return 1;
        }
        return b.progress - a.progress;
      });

      setRows(billingRows);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, monthStart, monthEnd, cptCodes]);

  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  // Stats use row counts (including dual-enrolled as separate rows — each program is a billing unit)
  const totalRows = rows.length;
  const metThreshold = rows.filter((r) => r.progress >= 100).length;
  const approaching = rows.filter((r) => r.progress >= 70 && r.progress < 100).length;
  const below = totalRows - metThreshold - approaching;

  // Mid-month revenue protection
  const now = useMemo(() => new Date(), []);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const isMidMonthAudit = dayOfMonth >= 15;
  // De-duplicate at-risk by patient ID
  const atRiskPatientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.totalMinutes < 40 && r.totalMinutes > 0) {
        ids.add(r.patientId);
      }
    }
    return ids;
  }, [rows]);

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={2}>Billing Threshold Dashboard</Title>
            <Text size="sm" c="dimmed">
              {monthLabel}
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconRefresh size={14} />}
              onClick={() => navigate('/billing-sync')}
            >
              Sync to Candid
            </Button>
          </Group>
        </Group>

        {/* Summary stats */}
        <Group gap="xl">
          <Stack gap={0}>
            <Text size="xl" fw={700}>
              {totalRows}
            </Text>
            <Text size="sm" c="dimmed">
              Total Patients
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text size="xl" fw={700} c="green">
              {metThreshold}
            </Text>
            <Text size="sm" c="dimmed">
              Threshold Met
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text size="xl" fw={700} c="yellow">
              {approaching}
            </Text>
            <Text size="sm" c="dimmed">
              Approaching
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text size="xl" fw={700} c="red">
              {below}
            </Text>
            <Text size="sm" c="dimmed">
              Below
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text size="sm" c="dimmed">
              {daysRemaining} days left
            </Text>
          </Stack>
        </Group>

        {/* Mid-month audit alert */}
        {isMidMonthAudit && atRiskPatientIds.size > 0 && (
          <Alert icon={<IconAlertTriangle size={16} />} title="Revenue Protection — Mid-Month Audit" color="orange">
            <Text size="sm">
              <strong>{atRiskPatientIds.size} patient(s)</strong> have less than 40 minutes logged with {daysRemaining} days remaining.
              Schedule immediate &quot;Care Plan Review&quot; calls to ensure the 60-minute billing floor is met by month-end.
            </Text>
          </Alert>
        )}

        {/* Dashboard table */}
        {loading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : rows.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No patients found.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Patient</Table.Th>
                <Table.Th>Program</Table.Th>
                <Table.Th>Minutes This Month</Table.Th>
                <Table.Th>Threshold</Table.Th>
                <Table.Th>Progress</Table.Th>
                <Table.Th>Suggested CPT</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => {
                const status = getStatusLabel(row.progress);
                return (
                  <Table.Tr
                    key={`${row.patientId}-${row.program}`}
                    role="link"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/Patient/${row.patientId}/billing`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        navigate(`/Patient/${row.patientId}/billing`);
                      }
                    }}
                  >
                    <Table.Td fw={500}>{row.patientName}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="sm">
                        {row.program}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.totalMinutes} min</Table.Td>
                    <Table.Td>{row.threshold} min</Table.Td>
                    <Table.Td w={180}>
                      <Group gap="xs">
                        <Progress value={row.progress} color={getProgressColor(row.progress)} size="lg" w={120} />
                        <Text size="xs" c="dimmed">
                          {row.progress}%
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={row.suggestedCpt !== '—' ? 'blue' : 'gray'}>
                        {row.suggestedCpt}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={status.color}>{status.label}</Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Document>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Center, Group, Loader, Progress, Stack, Table, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { IconAlertTriangle, IconClock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { getMonthRange, getProgressColor, getStatusLabel } from '../billing/billing-utils';
import { useCcmMonthlyTotals } from '../billing/useCcmMonthlyTotals';
import { useTimer } from '../timer/TimerContext';

export function BillingDashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { rows, summary, loading } = useCcmMonthlyTotals();
  const { activeTimer, elapsed } = useTimer();
  const monthLabel = useMemo(() => getMonthRange().label, []);

  const totalRows = summary.totalRows;
  const metThreshold = summary.metCount;
  const approaching = summary.approachingCount;
  const below = summary.belowCount;

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
                const isLive = !!activeTimer && activeTimer.patientId === row.patientId && row.program === 'CHI';
                const liveSeconds = isLive ? elapsed : 0;
                const liveMinutes = isLive ? Math.floor(elapsed / 60) : 0;
                const displayedMinutes = row.totalMinutes + liveMinutes;
                const displayedProgress = row.threshold > 0
                  ? Math.min(100, Math.round((displayedMinutes / row.threshold) * 100))
                  : row.progress;
                const status = getStatusLabel(displayedProgress);
                return (
                  <Table.Tr
                    key={`${row.patientId}-${row.program}`}
                    role="link"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/members/${row.patientId}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        navigate(`/members/${row.patientId}`);
                      }
                    }}
                  >
                    <Table.Td fw={500}>
                      <Group gap={6} wrap="nowrap">
                        <span>{row.patientName}</span>
                        {isLive && (
                          <Badge color="orange" variant="light" size="xs" leftSection={<IconClock size={10} />}>
                            LIVE
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="sm">
                        {row.program}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {displayedMinutes} min
                      {isLive && (
                        <Text component="span" size="xs" c="orange" ml={6}>
                          (+{Math.floor(liveSeconds / 60)}m{(liveSeconds % 60).toString().padStart(2, '0')}s running)
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{row.threshold} min</Table.Td>
                    <Table.Td w={180}>
                      <Group gap="xs">
                        <Progress value={displayedProgress} color={getProgressColor(displayedProgress)} size="lg" w={120} />
                        <Text size="xs" c="dimmed">
                          {displayedProgress}%
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

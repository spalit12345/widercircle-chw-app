// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DA-13 audit viewer — reads AuditEvent resources written by `emitAudit()`
// so admins can inspect the trail on stage. v1 lists the most recent 100
// events; future iterations should add patient/actor filters and export.

import { Alert, Badge, Button, Card, Group, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';
import type { AuditEvent } from '@medplum/fhirtypes';
import { IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type JSX } from 'react';

const formatTime = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString() : '—';

const subtypeDisplay = (e: AuditEvent): string =>
  e.subtype?.[0]?.display ?? e.subtype?.[0]?.code ?? '—';

const actorDisplay = (e: AuditEvent): string =>
  e.agent?.[0]?.who?.display ?? e.agent?.[0]?.who?.reference ?? '—';

const targetDisplay = (e: AuditEvent): string => {
  const what = e.entity?.[0]?.what;
  return what?.display ?? what?.reference ?? '—';
};

export function AuditEventLogPage(): JSX.Element {
  const medplum = useMedplum();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const rows = await medplum.searchResources('AuditEvent', '_sort=-_lastUpdated&_count=100');
      setEvents(rows);
    } catch (err) {
      setError((err as Error).message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={2}>Audit log</Title>
            <Text c="dimmed" size="sm">
              DA-13 — every consent capture, visit launch/end, plan save/sign, SDoH submission, and case
              creation writes a FHIR AuditEvent. v1 shows the most recent 100; production retention
              ≥ 6 years per spec lands with the server-side mirror.
            </Text>
          </Stack>
          <Button leftSection={<IconRefresh size={14} />} variant="light" onClick={() => load()}>
            Refresh
          </Button>
        </Group>

        {error && (
          <Alert color="red" title="Could not load audit events">
            {error}
          </Alert>
        )}

        <Card withBorder>
          <Group gap="xs" mb="sm">
            <IconShieldCheck size={16} />
            <Text fw={600}>Recent activity</Text>
            <Badge variant="light">{events.length}</Badge>
          </Group>

          <ScrollArea>
            <Table striped withRowBorders={false} verticalSpacing="xs" miw={720}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Actor</Table.Th>
                  <Table.Th>Target</Table.Th>
                  <Table.Th>Outcome</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.length === 0 && !loading && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" size="sm">
                        No audit events yet. Take a clinical action — capture consent, save a plan, log
                        a visit — and the trail will populate here.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {events.map((e) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>{formatTime(e.recorded)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">{subtypeDisplay(e)}</Badge>
                    </Table.Td>
                    <Table.Td>{actorDisplay(e)}</Table.Td>
                    <Table.Td>{targetDisplay(e)}</Table.Td>
                    <Table.Td>
                      <Badge color={e.outcome === '0' ? 'green' : 'red'} variant="light">
                        {e.outcome === '0' ? 'Success' : `Code ${e.outcome ?? '—'}`}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      </Stack>
    </Document>
  );
}

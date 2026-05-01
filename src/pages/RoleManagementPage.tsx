// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-15-lite — admin surface for DA-14 role assignments. v1 manages the demo
// role for the active user only and exposes the audit trail. v2 should query
// staff Practitioners, persist assignments to FHIR (PractitionerRole), and
// support time-bounded grants.

import { Badge, Button, Card, Group, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { Document, useMedplumProfile } from '@medplum/react';
import { IconRefresh, IconRoute, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useRole } from '../auth/RoleContext';
import { clearRoleAuditTrail, getRoleAuditTrail, recordRoleChange, type RoleAuditEntry } from '../auth/audit';
import { permissionsFor, ROLES, ROLE_LABELS, type Role } from '../auth/roles';

export function RoleManagementPage(): JSX.Element {
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const { role, setRole } = useRole();
  const [trail, setTrail] = useState<RoleAuditEntry[]>([]);

  const refreshTrail = useCallback(() => setTrail(getRoleAuditTrail()), []);

  useEffect(() => {
    refreshTrail();
  }, [refreshTrail]);

  const assign = async (next: Role): Promise<void> => {
    if (next === role) return;
    setRole(next);
    await recordRoleChange({ from: role, to: next, actor: profile });
    refreshTrail();
  };

  const wipe = (): void => {
    clearRoleAuditTrail();
    refreshTrail();
  };

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={2}>Role management</Title>
            <Text c="dimmed" size="sm">
              RBAC v1 — function-dimension only. Entity-scope (CE/BA/Dual) and member-assignment scope deferred. Role changes append-only to a local audit trail.
            </Text>
          </Stack>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconRoute size={14} />}
              onClick={() => navigate('/admin/workflows')}
            >
              Workflow builder
            </Button>
            <Button
              variant="light"
              leftSection={<IconShieldCheck size={14} />}
              onClick={() => navigate('/admin/audit-log')}
            >
              Audit log
            </Button>
          </Group>
        </Group>

        <Card withBorder radius="md" padding="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap={8}>
                <IconShieldCheck size={18} />
                <Title order={5}>Active demo role</Title>
              </Group>
              <Badge color="orange" variant="light">{ROLE_LABELS[role]}</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Switch to verify role-gated routes default-deny. Permissions for the active role are listed below.
            </Text>
            <Group gap="xs">
              {ROLES.map((r) => (
                <Button
                  key={r}
                  size="xs"
                  variant={r === role ? 'filled' : 'default'}
                  color={r === role ? 'orange' : undefined}
                  onClick={() => {
                    assign(r).catch(() => undefined);
                  }}
                >
                  {ROLE_LABELS[r]}
                </Button>
              ))}
            </Group>
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Permissions granted</Text>
              <Group gap={6}>
                {permissionsFor(role).map((p) => (
                  <Badge key={p} variant="light" color="gray" size="sm" ff="monospace">
                    {p}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Role-change audit trail</Title>
              <Group gap="xs">
                <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={refreshTrail}>
                  Refresh
                </Button>
                <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={wipe}>
                  Clear
                </Button>
              </Group>
            </Group>
            {trail.length === 0 ? (
              <Text size="sm" c="dimmed">No role changes recorded yet.</Text>
            ) : (
              <ScrollArea.Autosize mah={360}>
                <Table striped withTableBorder verticalSpacing="xs" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>When</Table.Th>
                      <Table.Th>Actor</Table.Th>
                      <Table.Th>From</Table.Th>
                      <Table.Th>To</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {trail.map((e) => (
                      <Table.Tr key={e.id}>
                        <Table.Td ff="monospace">{new Date(e.at).toLocaleString()}</Table.Td>
                        <Table.Td>{e.actor?.display ?? 'unknown'}</Table.Td>
                        <Table.Td>{e.from ? ROLE_LABELS[e.from] : '—'}</Table.Td>
                        <Table.Td>{ROLE_LABELS[e.to]}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </Stack>
        </Card>
      </Stack>
    </Document>
  );
}

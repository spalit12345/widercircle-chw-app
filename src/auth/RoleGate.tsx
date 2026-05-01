// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DA-14 RBAC v1 — gating primitives. RoleGate hides children when the role
// lacks the permission. RequirePermission redirects route-level traffic to
// /forbidden so deep-links can't bypass the check.

import { Alert, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { IconLock } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useRole } from './RoleContext';
import { ROLE_LABELS, type Permission, type Role } from './roles';

export function RoleGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}): JSX.Element {
  const { hasPermission } = useRole();
  return <>{hasPermission(permission) ? children : fallback}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}): JSX.Element {
  const { hasPermission, role } = useRole();
  if (hasPermission(permission)) {
    return <>{children}</>;
  }
  return <ForbiddenPage role={role} permission={permission} />;
}

function ForbiddenPage({ role, permission }: { role: Role; permission: Permission }): JSX.Element {
  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Access denied</Title>
          <Text c="dimmed" size="sm">RBAC default-deny.</Text>
        </Stack>
        <Alert
          icon={<IconLock size={18} />}
          color="red"
          variant="light"
          title="You do not have permission for this action"
        >
          <Stack gap={4}>
            <Text size="sm">
              Current role: <strong>{ROLE_LABELS[role]}</strong>
            </Text>
            <Text size="sm">
              Required permission: <code>{permission}</code>
            </Text>
            <Text size="sm" c="dimmed">
              Switch to a role that has this permission, or ask a System Admin to update your role assignment.
            </Text>
          </Stack>
        </Alert>
      </Stack>
    </Document>
  );
}

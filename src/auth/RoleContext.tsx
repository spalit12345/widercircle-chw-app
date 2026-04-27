// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DA-14 RBAC v1 — role state for the demo. Persists the active role in
// localStorage so the on-stage role-switch survives reloads. Real RBAC will
// derive role from Practitioner.qualification or AccessPolicy in v2.

import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ROLE, hasPermission as roleHas, type Permission, type Role } from './roles';

const STORAGE_KEY = 'wc-active-role';

export interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
  hasPermission: (permission: Permission) => boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

function readStoredRole(): Role {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'CHW' || raw === 'Provider' || raw === 'CaseManager' || raw === 'ContactCenterAgent' || raw === 'SystemAdmin') {
      return raw;
    }
  } catch {
    // localStorage unavailable (SSR, private mode); fall through.
  }
  return DEFAULT_ROLE;
}

export function RoleProvider({ children }: { children: ReactNode }): JSX.Element {
  const [role, setRoleState] = useState<Role>(() => readStoredRole());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, role);
    } catch {
      // ignore
    }
  }, [role]);

  const setRole = useCallback((next: Role) => setRoleState(next), []);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      setRole,
      hasPermission: (p) => roleHas(role, p),
    }),
    [role, setRole]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return ctx;
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DA-13-lite — role-change audit. v1 stores events in localStorage so the
// admin page can show a trail without depending on server-side AuditEvent
// permissions. Production should mirror these to FHIR AuditEvent.

import type { ProfileResource } from '@medplum/core';
import type { Role } from './roles';

const STORAGE_KEY = 'wc-role-audit';
const MAX_ENTRIES = 200;

export interface RoleAuditEntry {
  id: string;
  at: string;
  from: Role | null;
  to: Role;
  actor: { id: string; display: string } | null;
}

export interface RecordRoleChangeArgs {
  from: Role | null;
  to: Role;
  actor: ProfileResource | undefined;
}

function readAll(): RoleAuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RoleAuditEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RoleAuditEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore quota / unavailable
  }
}

function actorDisplay(actor: ProfileResource | undefined): { id: string; display: string } | null {
  if (!actor || !actor.id) return null;
  const name = (actor as { name?: { given?: string[]; family?: string }[] }).name?.[0];
  const given = name?.given?.[0] ?? '';
  const family = name?.family ?? '';
  const display = `${given} ${family}`.trim() || (actor as { resourceType?: string }).resourceType || actor.id;
  return { id: actor.id, display };
}

export async function recordRoleChange(args: RecordRoleChangeArgs): Promise<RoleAuditEntry> {
  const entry: RoleAuditEntry = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
    at: new Date().toISOString(),
    from: args.from,
    to: args.to,
    actor: actorDisplay(args.actor),
  };
  const existing = readAll();
  writeAll([entry, ...existing]);
  return entry;
}

export function getRoleAuditTrail(): RoleAuditEntry[] {
  return readAll();
}

export function clearRoleAuditTrail(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

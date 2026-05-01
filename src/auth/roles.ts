// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DA-14 RBAC v1 — canonical role definitions and permission matrix.
// Roles = function dimension only in v1. Entity-scope (CE/BA/Dual, DA-11) and
// data-scope (member-assignment via DA-01) are explicitly deferred.

export const ROLES = [
  'CHW',
  'Provider',
  'CaseManager',
  'ContactCenterAgent',
  'SystemAdmin',
] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = 'CHW';

export const ROLE_LABELS: Record<Role, string> = {
  CHW: 'Community Health Worker',
  Provider: 'Care Provider (MD)',
  CaseManager: 'Case Manager',
  ContactCenterAgent: 'Contact Center Agent',
  SystemAdmin: 'System Admin',
};

// Permissions are coarse-grained verbs on resources. Adding a permission here
// only grants UI affordances — the gate is in `hasPermission()` below.
export const PERMISSIONS = [
  'today.view',
  'queue.view',
  'queue.signoff',
  'members.view',
  'members.manage',
  'eligibility.check',
  'consent.capture',
  'visit.conduct',
  'careplan.author',
  'careplan.review',
  'careplan.edit',
  'time.track',
  'time.manualEntry',
  'review.submit',
  'review.signoff',
  'billing.view',
  'billing.sync',
  'sdoh.administer',
  'referrals.manage',
  'admin.roles',
  'admin.integrations',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  CHW: new Set<Permission>([
    'today.view',
    'queue.view',
    'members.view',
    'consent.capture',
    'careplan.review',
    'careplan.edit',
    'time.track',
    'time.manualEntry',
    'review.submit',
    'sdoh.administer',
    'referrals.manage',
    'billing.view',
  ]),
  Provider: new Set<Permission>([
    'today.view',
    'queue.view',
    'queue.signoff',
    'members.view',
    'eligibility.check',
    'consent.capture',
    'visit.conduct',
    'careplan.author',
    'careplan.review',
    'review.signoff',
    'time.track',
    'billing.view',
  ]),
  CaseManager: new Set<Permission>([
    'today.view',
    'queue.view',
    'members.view',
    'eligibility.check',
    'careplan.review',
    'sdoh.administer',
    'referrals.manage',
    'time.track',
  ]),
  ContactCenterAgent: new Set<Permission>(['members.view']),
  SystemAdmin: new Set<Permission>(PERMISSIONS),
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role]).sort();
}

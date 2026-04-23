---
id: DA-14
title: "RBAC v1 (Role-Based Access Control)"
source_requirement: DA-14
parent_epic: epic-da-platform-foundations
demo_track: track-1-cd-cm
demo_act: act-3-closer
module: data-administration
phase: 1
priority: must
persona: system-admin
secondary_personas: [compliance-officer, all]
labels: [demo-5-5, track-1, hero, foundation, rbac, security, cross-cutting]
blocked_by: [DA-11, DA-13]
blocks: [CM-02, CM-13, CC-04, AC-09, AC-10, AC-11, all-platform-features]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# DA-14 — RBAC v1 (Role-Based Access Control)

## Background & User Context

Every read and write across the platform is gated by RBAC. v2 §3.7 defines role as `entity × function × data-scope`. Without this primitive in place, no other feature can ship safely — CM-02 needs it for section visibility, CC-04 for call notes scope, AC-09/10/11 for cross-entity boundaries, supplier views for slicing.

In the demo (Act 3 closer): admin shows the access-control story by role-switching live. Provider sees clinical; supplier sees their slice; Compliance sees the audit trail. One person, many lenses, all enforced.

## User Story

As a System Admin, I want a role-based access control model that gates every read and write across the platform, scoped by entity (WC / Ask Claire / Supplier), function (clinical / case-mgmt / community / ops / compliance / analytics), and data scope (program / geography / member-assignment), so the platform enforces minimum-necessary access by default.

## Scope

**In scope:**
- Role primitive: `entity × function × data-scope`
- Permission primitive: capability tied to action (read / write / export / bulk-query) on entity type
- Role assignment: user × role with effective-date and expiration
- Default-deny enforcement: any unrecognized action is denied
- Server-side enforcement on every API and UI gate
- Role administration UI for System Admin
- Role-change audit (DA-13 cross-link)

**Out of scope / Non-goals:**
- Cross-entity unified access (AC-09) — Phase 3
- Anti-steering enforcement specifics (AC-10) — Phase 3
- Cross-entity audit log (AC-11) — separate ticket; consumes this
- ABAC (attribute-based access control) — Phase 3 if needed
- SSO / authentication — separate platform concern

## Functional Requirements

1. Role schema: `{entity, function, data_scope, name, permissions[]}` where:
   - entity ∈ {WC, AskClaire, Supplier:{id}}
   - function ∈ {clinical, case_mgmt, chw, community, ops, compliance, analytics, billing, brokerage}
   - data_scope ∈ {program:{id}, geography:{...}, assignment-only, all}
2. Permission schema: `{entity_type, action}` (e.g., `{member, read}`, `{plan_of_care, write}`).
3. Role assignment: `{user_id, role_id, effective_from, effective_until, assigned_by, assigned_at}`.
4. Default-deny: any action not explicitly permitted is denied.
5. Server-side enforcement: every API endpoint validates permission + scope; client-side hides UI but is not the source of truth.
6. Role admin UI: create/edit/assign roles; effective-date scheduling; role-change requires admin role.
7. Audit: every role create/edit/assign and every denied action logged to DA-13.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Default deny**
- *Given* a user with no role assigned
- *When* they attempt any platform API call
- *Then* request is denied; DA-13 audit entry written

**AC-2 — Role grants access**
- *Given* a user assigned the "WC × CHW × assignment-only" role
- *When* they request a member they're assigned to
- *Then* request succeeds

**AC-3 — Scope filtering**
- *Given* the same user requests a member outside their assignment
- *When* request fires
- *Then* member is invisible (404 normalized vs. 403); denial logged

**AC-4 — Role expiration**
- *Given* a role assignment with effective_until=`2026-04-22`
- *When* user attempts action on `2026-04-23`
- *Then* permission denied as if no role assigned

**AC-5 — Role change is audited**
- *Given* admin assigns a new role to a user
- *When* assignment saves
- *Then* DA-13 audit entry written with admin_id, target_user_id, role_id, effective dates

**AC-6 — Anti-steering readiness**
- *Given* an Ask Claire role
- *When* user attempts to read a clinical_note entity
- *Then* permission denied (clinical entity not in AC role permissions)

**AC-7 — Role-switch demo (Act 3)**
- *Given* admin in role-switch mode (test feature)
- *When* they impersonate Provider role and view a member
- *Then* clinical sections render; supplier sections absent
- *And when* they impersonate Supplier role
- *Then* supplier-slice renders; clinical absent
- *And when* they impersonate Compliance Officer
- *Then* audit panel renders; full member context visible (with audit emission)

## Data Model

**Role (write):** role_id, entity, function, data_scope_descriptor, name, description, permissions[], created_at, created_by, version

**Permission (read; static taxonomy):** entity_type × action (e.g., member.read, plan_of_care.write)

**Role Assignment (write):** assignment_id, user_id, role_id, effective_from, effective_until, assigned_by, assigned_at, reason

**Permission Check Audit (write):** check_id, user_id, action, entity_type, entity_id (where applicable), result (allow/deny), reason, timestamp — bundled into DA-13 audit log

## API Contract

- `POST /v1/admin/roles` → create role
- `PATCH /v1/admin/roles/{id}` → edit (versioned)
- `POST /v1/admin/users/{uid}/roles` → assign role
- `GET /v1/admin/users/{uid}/roles` → user's current roles
- `POST /v1/admin/role-switch` → impersonation for testing/demo (audited prominently)

**Enforcement:** All other endpoints invoke a permission middleware that checks user's effective roles against requested action + entity. No endpoint may skip this.

## UI / UX Specification

- Role admin: list roles, edit role permissions/scope, assign to user
- User detail (admin): show current roles, assignment history, edit
- Role-switch UI (demo + dev): toggle impersonation with prominent banner + audit logging

**States:** loading, default, role-switch active (banner), denied action error message (non-leaky, doesn't reveal entity existence)

## Edge Cases & Error Handling

- User with multiple roles → permissions are union; data_scope is additive (broadest of scopes per entity)
- Conflicting roles (e.g., clinical + brokerage) → flagged at assignment as policy violation; admin can override with reason (logged)
- Role permissions changed mid-session → next request re-evaluates; cached permissions invalidated
- Role deletion when assigned to active users → blocked; must reassign first
- Cross-entity action (e.g., user has WC clinical role, requests AC data) → denied; logged
- Race condition on role assignment → eventual consistency; explicit re-check on critical paths

## Security, Privacy & Compliance

- **Foundational** — every other feature depends on this
- **Default-deny** is the security posture
- **Audit:** every permission check optionally logged (sample policy for high-volume reads); every denial always logged; every role admin action always logged
- **Role-switch (impersonation):** strictly audited, banner visible, cannot be hidden, max session duration limited
- **Anti-steering readiness** (AC-10): role definitions enforce entity boundaries
- **Separation of duties:** admin cannot self-grant roles without 2-person approval (configurable; deferred to AC-10 Phase 3 for cross-entity)

## Observability

- Metrics: permission-check rate, denial rate, role-switch usage, role-admin action rate
- Alerts: denial spike (potential attack or misconfig), role-switch usage spike, role-admin action spike
- Dashboards: RBAC health, role coverage analysis (users with no role, orphaned roles)

## Performance Budget

- Permission check <5ms p95 (in-memory after first lookup; cached per request)
- Role admin action <500ms

## Dependencies & Sequencing

**Blocked by:** DA-11 (provenance — informs scope boundaries), DA-13 (audit emission)
**Blocks:** essentially every other feature in the platform — they all gate on this
**Parallel-safe with:** none (foundational; build first)

## Test Strategy

**Unit:** permission-check matrix per role × action × scope; default-deny verification
**Integration:** role assignment → effective permission → action allow/deny correctly
**E2E:** demo role-switch flow (Track 1 Act 3 closer)
**Compliance:** audit emitted for assignments, denials, role-switch
**Security:** attempt to bypass via direct API; cross-entity escalation attempts
**Performance:** permission-check under load
**Fixtures:** roles for each persona (Provider, CHW, CM, Agent, Supplier, Compliance, Admin, Brokerage); cross-entity scenarios

## Rollout

- **Feature flag:** `rbac_v1` — but cannot be disabled in prod (foundational)
- Pre-launch: every existing endpoint mapped to a permission; coverage audit complete
- Pilot: deny mode in staging with error monitoring before prod
- Rollback: extreme — only via emergency admin override with full incident review

## Definition of Done

- [ ] All ACs pass
- [ ] Every API endpoint covered by permission middleware (audited list)
- [ ] Default-deny verified (uncovered endpoints fail closed)
- [ ] Role taxonomy seeded for launch personas
- [ ] Role-switch UI with audit + banner + session limit
- [ ] Permission-check performance <5ms p95
- [ ] Audit log emitted for all admin actions and denials
- [ ] Security review complete (penetration testing of cross-role access)
- [ ] Role admin UI live for System Admins
- [ ] Documentation: role catalog + permission taxonomy

## Success Metric in Production

- **Coverage:** 100% of endpoints behind permission middleware (zero uncovered)
- **Reliability:** denial rate stable (no false-deny incidents)
- **Compliance:** zero unauthorized cross-entity access incidents
- **Auditability:** every denial reconstructable to user + intent within 1 click

## Stop-and-Ask-the-Human Triggers

- Adding a new **entity** (impacts entire role taxonomy)
- Adding a new **function** category
- Changes to **default-deny** posture (enabling permissive defaults)
- Changes to **role-switch / impersonation** controls
- Changes to **separation-of-duties** rules
- Any change that could introduce **cross-entity access** outside Phase 3 controls
- Bypass / emergency override expansion
- Any **shared role across entity boundaries** (explicitly disallowed by AC-10 readiness)

## Open Questions

1. Role taxonomy seed — full list of launch personas signed off?
2. Data-scope descriptor format — DSL or structured object?
3. Multi-role precedence — union semantics confirmed across all action types?
4. Role-switch session duration limit — 30 min default reasonable?
5. Permission-check audit sampling — 100% for writes / denials, sampled for high-volume reads?
6. Migration from existing Salesforce profile permissions — automated mapping or manual?

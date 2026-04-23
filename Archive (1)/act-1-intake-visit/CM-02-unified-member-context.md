---
id: CM-02
title: "Unified Member Context"
source_requirement: CM-02
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw, provider, clinical-staff, contact-center-agent, supervisor, compliance-officer]
labels: [demo-5-5, track-1, member-profile, foundation, hero]
blocked_by: [DA-11, DA-12, DA-13, DA-14]
blocks: [CM-13, CM-03, CC-04, CD-07, CC-03, CM-09, CM-22]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-02 — Unified Member Context

## Background & User Context

Every persona on the platform — CHW, CM, Provider, Clinical Staff, Contact Center Agent, Supervisor, Compliance — needs to see the same member from one consolidated view. Today, staff jump between Salesforce, Tellescope, Healthie, Five9, and other tools to assemble a mental model of any single member. The cost is measured in lost time per call, lost context across handoffs, and downstream errors.

This is the most-referenced ticket in the demo. It is the *visible center* of the platform. Almost every other ticket either renders inside this view (CM-09, CM-22, time-tracking) or links to it (CM-13 navigates here, CC-03 pops here, CD-07 reads from here). It is also the highest-stakes UI surface from a security standpoint — every PHI access is logged through it.

## User Story

As any platform user with member access, I want a single member-profile view that shows everything I need (case history, communications across all channels, referrals, consents, notes, relationships, and clinical summary) so I can prepare for or act on a member interaction without switching tools or chasing context.

## Scope

**In scope:**
- Single canonical member-profile route and React component
- Section composition: identity header (CM-03), case history (open + closed), interaction log (CM-09), referrals (CM-05 / SUP-13), consents (DA-12), notes (clinical + non-clinical, role-scoped), relationships, clinical summary (conditions, meds, allergies, vitals)
- Provenance tag (DA-11) visible to authorized roles
- Role-aware section visibility (a supplier sees their slice; a Compliance Officer sees the audit panel; a CHW sees the CHW-tailored summary)
- Member-search entry surface (also reachable from CC-03 screen pop)
- Profile-load performance budget (<2s)

**Out of scope / Non-goals:**
- Authoring of any of the sub-sections (each is owned by its specific ticket)
- Time-tracking stopwatch UI → CD-17 (rendered as read-only widget here)
- ECM cap visualization → CM-22 (rendered as panel here)
- Role-switch admin UI → DA-14
- Member-merge / dedup workflow → engineering platform scope (per v2 §3.7 admin note)

## Functional Requirements

1. Member profile is reachable via `/members/{id}` route from any authorized surface in the platform.
2. The profile renders 8 canonical sections (identity header, case history, interaction log, communications, referrals, consents, relationships, clinical summary) — each section is a composable React component owned by its source ticket.
3. Each section query is independent so partial-data states render gracefully (a slow clinical-data query does not block the rest of the profile).
4. Provenance tag (CE / BA / Dual per DA-11) visible in the identity header for authorized roles.
5. Section visibility is role-scoped per DA-14 — RBAC is enforced server-side; client never receives data for sections the role cannot see.
6. Every section render emits a DA-13 audit event with purpose code derived from the user role's default purpose.
7. Member search supports name, phone, MRN, Plan ID; results limited by RBAC scope.
8. Profile load latency <2s p95 for a "typical" member (defined in NFR-§5.1).

## Acceptance Criteria (Given/When/Then)

**AC-1 — Profile renders with all 8 sections**
- *Given* an authenticated CM with full clinical scope
- *When* they navigate to `/members/{id}`
- *Then* all 8 canonical sections render with data within the page-load NFR (<2s)

**AC-2 — Partial data is graceful**
- *Given* a network blip during the clinical-data section query
- *When* the page loads
- *Then* the other 7 sections render normally; the clinical section shows an inline retry affordance; no error masks the whole page

**AC-3 — RBAC scopes section visibility**
- *Given* a Supplier (MediCircle) user viewing a member they have access to
- *When* the profile loads
- *Then* only the supplier-relevant sections render; clinical-note section is absent (not "empty" — absent); RBAC denial logged for any sections the role cannot see

**AC-4 — Audit log emitted on view**
- *Given* a user views a member profile
- *When* the page renders
- *Then* a DA-13 audit event is written with: user_id, member_id, action="member_profile_view", purpose_code, sections_rendered list, timestamp

**AC-5 — Provenance tag visible to compliance**
- *Given* a member with a BA provenance tag
- *When* a Compliance Officer views the profile
- *Then* the identity header shows "BA" badge with tooltip explaining provenance

**AC-6 — Search respects RBAC scope**
- *Given* a CHW with caseload of 25 members
- *When* they search the platform for a member name that matches both their own member and a member outside their caseload
- *Then* only their own member appears; the off-caseload member is invisible (not redacted — invisible); search-scope-applied audit entry logged

**AC-7 — Cross-channel comms render in feed**
- *Given* a member with calls (Five9), SMS (Twilio), email, and in-person Interactions
- *When* the profile loads
- *Then* the communication feed shows all four channels in unified chronological order

## Data Model

**Entities (most are owned by other tickets; CM-02 composes them):**

- **Member** (read; canonical entity defined in §1.5)
- **Case** (read; CM ownership; open + closed)
- **Encounter** (read; CD ownership)
- **Interaction** (read; CM-09 ownership)
- **Referral** (read; CM-05 + SUP-13 ownership)
- **Consent** (read; DA-12 ownership)
- **Note** (read; module-specific ownership)
- **Relationship** (read; CM-13 + relationship registry)
- **Clinical Summary** (read; computed from Encounter, Action Plan, problem list)
- **Audit Event** (write; per DA-13)

**Indexes / migrations:**
- Index on `member.id` (PK; trivial)
- Materialized view or denormalized read model for the profile composition is acceptable to hit the <2s budget; refresh strategy TBD

**PHI fields touched:** every PHI field on the Member and related entities. Section-level access controls determine which fields render per role.

## API Contract

**Endpoints:**

- `GET /v1/members/{id}` → returns identity header + section manifest (which sections current role can see)
- `GET /v1/members/{id}/sections/{section_name}` → returns each section's data independently (parallel-loadable from client)
- `GET /v1/members/search?q={query}&scope={auto}` → search; scope defaults to user's RBAC scope
- `GET /v1/members/{id}/audit-summary` → returns recent audit events for this member (Compliance Officer only)

**Auth:** JWT bearer; RBAC enforced server-side per DA-14.

**Error codes:**
- 401 unauthorized, 403 RBAC denial (logged), 404 member not found (or RBAC-invisible — same response code to prevent enumeration), 5xx with retry

## UI / UX Specification

**Layout (desktop):**
- Two-column: identity header spans top; left column = case history + clinical summary; right column = communications feed + referrals + consents + relationships
- Sticky identity header with provenance badge

**Layout (mobile):**
- Single-column scroll; identity header pinned at top; sections collapsed by default with item counts visible

**States to specify:**
- Loading (skeleton per section)
- Default
- Empty (e.g., "No interactions yet")
- Error per-section (with inline retry)
- Partial-data
- RBAC-denied section: section is *absent*, not visible-but-empty
- Read-only mode (no edit affordances for roles with read-only scope)

**Accessibility:** WCAG 2.1 AA; section headings are proper H2/H3; section state changes announced to screen readers.

## Edge Cases & Error Handling

- Member merged/deduped while profile is open → banner appears; user redirected to canonical profile after acknowledgment
- Member deceased flag set → prominent banner; outreach affordances disabled
- Member has no consents on file at all → banner advises CM to capture consent before outreach
- Clinical summary query times out → that section shows retry; rest of profile fine
- Search returns 1000+ results → paginated; "narrow your search" hint
- Concurrent edits to a Case visible in the profile → eventually-consistent refresh on next interaction; no stale-data warning needed at this surface
- Network drops mid-page-load → profile renders sections that loaded; pending sections show retry; no blank profile

## Security, Privacy & Compliance

- **PHI handled:** all member PHI; this is the highest-volume PHI surface in the platform
- **Provenance tag:** rendered in identity header per DA-11; access policies enforced based on tag
- **Consent enforcement:** profile-view itself does not require consent; specific actions (outreach, note-write) check consent at action time
- **RBAC:** every section gated; default-deny per DA-14
- **Audit log entries (DA-13):** every profile view, every section query, every search; purpose codes per role default
- **Anti-steering (AC-10 readiness):** clinical sections hidden from AC roles; AC-sourced sections (alignment status) read-only for WC clinical roles

## Observability

- **Structured logs:** every API call with user, member (hashed in non-prod), section requested, latency, RBAC outcome
- **Metrics:** profile-load p50/p95, per-section load p50/p95, RBAC-denial rate, search-result-count distribution, partial-data render rate
- **Alerts:** profile p95 >2s sustained 10min; per-section p95 >1.5s; RBAC denial spike (potential enumeration attack)
- **Dashboards:** member-profile health dashboard

## Performance Budget

- Profile load <2s p95 (per §5.1)
- Per-section load <1s p95
- Search results <500ms p95

## Dependencies & Sequencing

**Blocked by:**
- DA-11 (provenance tag visible)
- DA-12 (consent section data)
- DA-13 (audit emission contract)
- DA-14 (section RBAC)

**Blocks:**
- CM-13 (CHW workflows opens member detail using this)
- CM-03 (header pattern is part of this)
- CC-03 (screen pop renders this)
- CC-04 (call notes attached here)
- CD-07 (provider pre-visit reads from this)
- CM-09 (communication feed lives here)
- CM-22 (cap visualization lives here)

**External contracts:** none direct (consumes other tickets' APIs)

## Test Strategy

**Unit:**
- Section visibility per role matrix (CM, CHW, Provider, Supplier, Compliance, Agent)
- Search RBAC scope filter
- Audit emission per section query

**Integration:**
- Profile composition with all sections present
- Profile composition with one section failing (graceful)
- Profile composition with role-restricted sections (correct sections absent)

**E2E:**
- CHW navigates from caseload to member profile (Track 1 demo path)
- Agent screen-pops from inbound call to profile (Track 2 demo path)
- Compliance Officer views audit summary

**Compliance:**
- DA-13 audit events written for every section query
- RBAC denial does not leak section existence (404 vs 403 normalization)
- DA-11 provenance tag rendered correctly per role

**Performance:**
- Load test: 200 concurrent profile views, p95 <2s

**Accessibility:**
- axe-core scan
- Manual keyboard-only navigation pass

**Fixtures:**
- Synthetic members with all section types populated, including BA-tagged member, member with revoked consent, deceased member, member-merged scenario

## Rollout

- **Feature flag:** `unified_member_profile_v1`
- **Cohort:** internal users first (CM team), then Provider, then Supplier
- **Rollback trigger:** profile p95 >5s; RBAC failure leaking data; audit emission rate drop >10%
- **Comms plan:** training on the new profile shape; deprecation comms for legacy Salesforce profile
- **Data backfill:** materialized view backfilled before flag enable

## Definition of Done

- [ ] All ACs pass in staging
- [ ] Unit + integration + E2E tests written and green
- [ ] Audit log entries verified for every section query
- [ ] RBAC matrix verified per role (denials logged, sections absent not redacted)
- [ ] DA-11 provenance tag rendering verified for CE / BA / Dual cases
- [ ] axe-core a11y passes; manual keyboard pass complete
- [ ] Performance budgets met under load
- [ ] Feature flag default state documented
- [ ] Runbook updated (slow-section diagnostics, RBAC failure escalation)
- [ ] PHI handling reviewed by security
- [ ] API spec published and consumed by CM-13, CC-03, CC-04, CD-07

## Success Metric in Production

- **Adoption:** ≥95% of platform users open a member profile at least once per day within 30 days of GA
- **Performance:** p95 profile load <2s sustained
- **Compliance:** zero unauthorized section access; 100% of profile views audited
- **Time saved:** median time-to-context (login → first member profile open) drops from baseline (target: 80% reduction vs. multi-system baseline)

## Stop-and-Ask-the-Human Triggers (for subagents)

- Any change to the **section list** (adding/removing canonical sections)
- Any change to **RBAC section-visibility matrix** beyond explicit authorization
- Any change to **DA-13 audit emission contract** for profile views
- Any change to **DA-11 provenance display logic**
- Any change that would expose a section to a role currently denied access
- Any change to the **search RBAC scope policy**
- Any change to the **404-vs-403 normalization** (anti-enumeration policy)
- Any caching/materialization strategy that could expose stale PHI

## Open Questions

1. Materialized read-model refresh strategy — event-driven vs. periodic? Affects freshness vs. cost trade-off.
2. Supplier-role profile view: which sections are shown? Need explicit per-supplier matrix (MediCircle, Upside, TruConnect).
3. "Recent interactions" feed depth — last 30 days? 90 days? Configurable per role?
4. Profile-merge UX when canonical member changes mid-view — banner-and-redirect vs. soft transition?
5. Should clinical summary surface AI-generated insights here, or strictly raw data? Affects future scope.
6. Audit summary panel for Compliance — same-page or separate route?

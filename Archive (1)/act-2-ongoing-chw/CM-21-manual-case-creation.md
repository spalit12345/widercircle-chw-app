---
id: CM-21
title: "Manual Case Creation"
source_requirement: CM-21
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw]
labels: [demo-5-5, track-1, case-management, ad-hoc]
blocked_by: [CM-02, DA-13]
blocks: [CM-05, CM-22]
parallel_safe_with: [CM-04]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-21 — Manual Case Creation

## Background & User Context

Most cases are auto-generated (CM-01 from eligibility/claims, CD-19 from SDoH triggers, RF-01 from Resource Finder). But CMs and CHWs frequently identify ad-hoc needs that require their own case — "member mentioned a new housing concern", "no PCP assigned", "transportation gap for next visit". They need to create a case quickly, link it to a member, and track it through resolution.

In the demo: CHW notices Maria mentioned losing her PCP → creates a manual "Needs new PCP" case → tracks it as part of ongoing engagement.

## User Story

As a CM (or CHW), I want to create new cases ad hoc as I identify needs, so I can track and document assistance to the member from identification through resolution.

## Scope

**In scope:**
- Manual case creation form: type (from configurable list), member link, description, priority
- State transitions through resolution with audit history
- Case linkage to outreach attempts (CM-09), referrals (CM-05), action items
- Case visible in member profile (CM-02) and worklist
- Closure with resolution notes

**Out of scope / Non-goals:**
- Auto-generated cases → CM-01, CD-19 trigger, RF-01
- Case dependency rules → CM-19
- Workflow automation across cases → CM-20

## Functional Requirements

1. "Create Case" CTA on member profile and case-list pages.
2. Form: type (dropdown of configured case types), description (rich text), priority, due date (optional), assignee (default self).
3. State machine: Open → In Progress → Resolved / Closed; substates per case type configurable.
4. Case detail page with: header, description, state, timeline of activity (linked outreach, referrals, notes), close action with resolution notes.
5. Case visible in member profile + assignee worklist.
6. State transitions logged immutably.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Create case**
- *Given* CHW on Maria's profile
- *When* they create a "Needs New PCP" case with description and priority Medium
- *Then* case is created in Open state, assigned to CHW, visible in profile + worklist; audit logged

**AC-2 — State transitions**
- *Given* an Open case
- *When* CHW marks In Progress, then Resolved with resolution note
- *Then* state history records both transitions with timestamps and actor

**AC-3 — Linked activity**
- *Given* a case is open
- *When* CHW logs an outreach attempt (CM-09) and creates a referral (CM-05) "from this case"
- *Then* both link to the case; visible in case timeline

**AC-4 — RBAC enforced**
- *Given* a CM viewing a member outside their scope
- *When* they attempt to create a case
- *Then* blocked per DA-14; logged

**AC-5 — Audit logged**
- *Given* any case creation, state change, or update
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

**Case (write):**
- case_id, type, member_id, description, priority, status, assignee_id, due_date, created_by, created_at, source (manual / auto-rule / RF / SDoH-trigger / etc.), provenance_tag

**Case State History (write):** case_id, from_state, to_state, transitioned_by, transitioned_at, note

**Case Type Config (read; admin-managed):** case_type, label, allowed_states, required_fields, default_assignee_role

## API Contract

- `POST /v1/members/{id}/cases` → create
- `PATCH /v1/cases/{id}` → update (status, assignee, fields)
- `GET /v1/members/{id}/cases?status={...}` → list per member
- `GET /v1/cases/{id}` → detail with timeline

## UI / UX Specification

- Create modal: type, description (rich text), priority, due date, assignee
- Case detail: header, description, state-change buttons, timeline (chronological activity)
- Close modal: resolution notes required

**States:** form, creating, created, in-progress, resolved, closed, error

## Edge Cases & Error Handling

- Two users editing same case → optimistic concurrency
- Case type config changed mid-case → old case keeps original schema; new fields not added retroactively
- Closing a case with open referrals → warn but allow
- Re-open closed case → allowed; audit logged

## Security, Privacy & Compliance

- **PHI:** case description, member linkage
- **Provenance:** inherits member's tag
- **RBAC:** create restricted to CM/CHW with member access
- **Audit:** every action

## Observability

- Metrics: cases created/CM/week, mean time-to-resolution, % manual vs auto
- Alerts: cases stuck >X days in any state

## Performance Budget

- Create <500ms
- Detail load <1s

## Dependencies & Sequencing

**Blocked by:** CM-02, DA-13
**Blocks:** CM-05 (referrals link to cases), CM-22 (ECM cases counted)

## Test Strategy

**Unit:** state machine, validation
**Integration:** create → state transitions → close; linked activity
**E2E:** Track 1 Act 2 supporting flow
**Compliance:** audit emitted, RBAC enforced
**Fixtures:** various case types with different state machines

## Rollout

- **Feature flag:** `manual_case_creation_v1`
- Case type config seed for launch (clinical, SDoH, transportation, etc.)

## Definition of Done

- [ ] All ACs pass
- [ ] State machine reliable
- [ ] Linked activity visible in timeline
- [ ] Audit log emitted

## Success Metric in Production

- **Adoption:** mean ≥3 manual cases/CM/week
- **Resolution:** ≥75% of manual cases reach Resolved/Closed within 30 days

## Stop-and-Ask-the-Human Triggers

- Adding new state machine states beyond defaults
- Changes to required-fields per case type
- Adding bulk creation
- Changes to RBAC

## Open Questions

1. Case type list — admin-managed; what's the seed list?
2. Re-open semantics — new state instance or append history?
3. Cross-team case assignment — who can assign to whom?
4. Templates per case type — Phase 2 (with CM-20)?

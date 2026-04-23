---
id: CD-09
title: "Clinical Staff Supervision (Provider Sign-Off Queue)"
source_requirement: CD-09
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: care-delivery
phase: 1
priority: must
persona: provider
secondary_personas: [clinical-staff]
labels: [demo-5-5, track-1, sign-off, incident-to-billing, supervision]
blocked_by: [CD-15, DA-13]
blocks: [CD-10]
parallel_safe_with: [CD-14]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-09 — Clinical Staff Supervision (Provider Sign-Off Queue)

## Background & User Context

Incident-To billing (and several other CMS programs) require Provider sign-off on documentation produced by NPs / Clinical Staff / CHWs. The Provider needs a queue showing pending sign-offs, fast review, and one-click approve / request revision. Without this, billing pipeline jams.

In the demo: Provider opens sign-off queue → sees Maria's documentation submitted by NP → reviews and signs off in seconds.

## User Story

As a Provider, I want a clean review queue of clinical staff documentation pending my sign-off, with the ability to approve or request revision in one click, so I can keep the billing pipeline flowing without administrative drag.

## Scope

**In scope:**
- Provider sign-off queue (per-Provider; supervisor view of team-wide aggregate)
- Submission detail view with documentation rendered for review
- One-click Approve action; Request Revision with note
- Approval recorded as Provider sign-off (immutable; tied to billing eligibility)
- Audit trail of every sign-off

**Out of scope / Non-goals:**
- Submission action → CD-15
- Plan editing → CD-14
- Billing sync → CD-10

## Functional Requirements

1. Sign-off queue accessible from Provider dashboard / Today view (CD-18).
2. Queue shows all submissions where current user is the assigned Provider; filterable by submitter, age, member.
3. Detail view: submitted Plan / documentation rendered read-only; submitter info; cycle number.
4. Approve action: single click; saves Provider sign-off record; status → Approved; lock retained.
5. Request Revision: requires note; status → Revision Requested; lock released.
6. Sign-off record is immutable and linked to billing eligibility.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Queue shows pending**
- *Given* Provider with 5 pending submissions
- *When* they open sign-off queue
- *Then* all 5 visible, sortable by age; queue load <2s

**AC-2 — One-click approve**
- *Given* Provider in detail view
- *When* they click Approve
- *Then* sign-off saved (immutable); Plan status = Approved; submitter notified

**AC-3 — Revision request**
- *Given* Provider needs more info
- *When* they Request Revision with note "Please add medication reconciliation"
- *Then* status = Revision Requested; submitter notified with note; lock released

**AC-4 — Sign-off immutability**
- *Given* an approved sign-off record
- *When* anyone (including admin) attempts to modify
- *Then* modification rejected; only revocation flow available (separate record)

**AC-5 — Sign-off enables billing**
- *Given* a Plan with an Approved sign-off
- *When* DA-08 billing rules evaluate
- *Then* Plan documentation eligible for inclusion in billing export

**AC-6 — Audit logged**
- *Given* any sign-off or revision-request action
- *When* it occurs
- *Then* DA-13 audit event written

## Data Model

**Sign-Off Record (write):**
- signoff_id, submission_id, plan_id, plan_version_id, signed_by_provider_id, signed_at, action (approved | revision_requested), note (nullable), provenance_tag

**Plan (update):** signoff_status, last_signoff_id

## API Contract

- `GET /v1/providers/{uid}/signoff-queue?filter={...}` → queue
- `GET /v1/submissions/{id}` → detail for review
- `POST /v1/submissions/{id}/approve` → sign off
- `POST /v1/submissions/{id}/request-revision` → with note

## UI / UX Specification

- Queue: list view, age column prominent, member context inline
- Detail: read-only documentation render + Approve / Request Revision buttons
- Bulk approve available for multiple Plans (with explicit confirmation per Plan)

**States:** queue empty / loading / list, detail loading / displayed, approving, approved, revision-requesting, error

## Edge Cases & Error Handling

- Provider on PTO → submissions accumulate; supervisor can reassign per CM-17 pattern (or unlock per CD-15)
- Bulk approve attempt → require per-Plan confirmation (no silent batch)
- Plan edited after submission (shouldn't happen due to lock) → reject sign-off; investigate
- Provider tries to sign off on their own submission → blocked (separation of duties)

## Security, Privacy & Compliance

- **PHI:** documentation rendered for review
- **Provenance:** sign-off inherits Plan's tag
- **RBAC:** queue scoped to current Provider; supervisor view extra
- **Immutability:** sign-off records cannot be modified
- **Separation of duties:** Provider cannot sign off on their own submission
- **Audit:** every sign-off / revision request

## Observability

- Metrics: queue depth, mean age in queue, approval rate, revision rate, mean time-to-decision
- Alerts: queue depth >X, age >24hr (revenue impact)

## Performance Budget

- Queue load <2s
- Approve action <500ms

## Dependencies & Sequencing

**Blocked by:** CD-15 (submissions), DA-13
**Blocks:** CD-10 (billing requires sign-off)

## Test Strategy

**Unit:** state machine, immutability, separation-of-duties check
**Integration:** submission → queue → approve → billing eligibility
**E2E:** Track 1 Act 2 supporting flow
**Compliance:** audit emitted, immutability enforced, sep-of-duties enforced
**Fixtures:** Provider with various queue states; supervisor view

## Rollout

- **Feature flag:** `signoff_queue_v1`
- Provider pilot

## Definition of Done

- [ ] All ACs pass
- [ ] Queue performant
- [ ] Sign-off immutable
- [ ] Audit log emitted
- [ ] Billing-eligibility integration verified

## Success Metric in Production

- **Speed:** median time-to-sign-off <12 hr business
- **Throughput:** zero submissions aged >48hr in queue (alert threshold)

## Stop-and-Ask-the-Human Triggers

- Changes to immutability or separation-of-duties rules
- Bulk approve without per-item confirmation
- Adding any auto-approve

## Open Questions

1. Auto-assignment to Provider — same Provider as encounter, or any available?
2. Bulk approve UX — explicit per-Plan even in bulk, or single confirmation for batch?
3. Cross-Provider coverage — when assigned Provider unavailable, fallback rules?
4. Mobile sign-off — Provider on phone, supported Phase 1?

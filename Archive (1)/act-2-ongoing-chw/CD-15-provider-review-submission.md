---
id: CD-15
title: "Provider Review Submission"
source_requirement: CD-15
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: care-delivery
phase: 1
priority: must
persona: clinical-staff
secondary_personas: [chw, provider]
labels: [demo-5-5, track-1, billing-prereq, supervision]
blocked_by: [CD-08, CD-14, DA-13]
blocks: [CD-09, CD-10]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-15 — Provider Review Submission

## Background & User Context

Clinical Staff and CHWs document services that require Provider sign-off for billing (Incident-To billing pattern). They need to formally submit documentation for the Provider to review, with status tracking and an edit lock so the Provider reviews exactly what was submitted.

In the demo: NP/CHW completes documentation on Maria → submits for Provider sign-off → Provider receives in queue (CD-09).

## User Story

As a Clinical Staff member, I want to submit my documentation to the Provider for sign-off with clear status tracking and an edit lock so the Provider reviews the exact version I prepared.

## Scope

**In scope:**
- Submit-for-review action on Plan / documentation
- Submission status: Draft → Submitted → Approved | Revision Requested
- Edit lock: documentation locked from edits between Submit and Provider response
- Provider notification on submission
- Submission history visible

**Out of scope / Non-goals:**
- Provider sign-off action → CD-09
- Plan editing → CD-14
- Billing sync → CD-10

## Functional Requirements

1. "Submit for Provider Review" action available on completed Plan / documentation.
2. On submit: status = Submitted, Plan locks, Provider receives in queue (CD-09).
3. Provider can Approve (status → Approved, lock retained for audit) or Request Revision (status → Revision Requested, lock released, NP can re-edit).
4. Multiple submission cycles allowed; full history retained.
5. Lock prevents edits by anyone (including original author) while Submitted; supervisor can unlock with reason if Provider unavailable.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Submit locks**
- *Given* NP completed Plan documentation on Maria
- *When* they click Submit for Review
- *Then* status = Submitted; Plan editing blocked; Provider notified

**AC-2 — Approve closes loop**
- *Given* a Submitted Plan
- *When* Provider approves (CD-09)
- *Then* status = Approved; Plan remains locked (immutable for audit/billing)

**AC-3 — Revision Requested releases lock**
- *Given* Submitted Plan
- *When* Provider requests revision with note
- *Then* status = Revision Requested; lock released; NP can edit; submission cycle increments

**AC-4 — Submission history**
- *Given* Plan with 3 submission cycles
- *When* user views history
- *Then* all 3 cycles visible with submitter, timestamp, Provider response, response note

**AC-5 — Audit logged**
- *Given* any submission action
- *When* it occurs
- *Then* DA-13 audit event written

## Data Model

**Submission Record (write):**
- submission_id, plan_id, plan_version_id, submitted_by, submitted_at, status, provider_user_id (nullable), provider_responded_at (nullable), revision_note (nullable), cycle_number

**Plan (update):** review_status, current_submission_id, locked bool

## API Contract

- `POST /v1/plan-of-care/{id}/submissions` → submit
- `GET /v1/plan-of-care/{id}/submissions` → history
- `POST /v1/submissions/{id}/unlock` → supervisor unlock with reason
- (Provider response actions are CD-09 endpoints)

## UI / UX Specification

- Submit button on Plan with confirm modal
- Status badge on Plan (Draft / Submitted / Approved / Revision Requested)
- History panel: chronological cycles
- Lock indicator with reason

**States:** draft, submitting, submitted, approved, revision-requested, locked, unlock-requested

## Edge Cases & Error Handling

- Provider unavailable for extended period → supervisor unlock workflow with reason (audit)
- NP resubmits after revision → new cycle; old cycle preserved
- Concurrent submissions to same Plan (rare) → reject second; only one pending submission at a time
- Plan edit attempt while locked → blocked with clear message

## Security, Privacy & Compliance

- **PHI:** submission references documentation (PHI)
- **Audit:** every submit, approve, revision, unlock

## Observability

- Metrics: submission rate, approval-vs-revision split, time-to-Provider-response, unlock frequency
- Alerts: high revision rate (quality signal), unlock spike (process issue)

## Performance Budget

- Submit action <500ms

## Dependencies & Sequencing

**Blocked by:** CD-08 (Plan), CD-14 (editing), DA-13
**Blocks:** CD-09 (sign-off), CD-10 (billing requires approved status)

## Test Strategy

**Unit:** state machine, lock enforcement
**Integration:** submit → lock → Provider responds → state transitions
**E2E:** Track 1 Act 2 documentation flow
**Compliance:** audit emitted, lock enforced
**Fixtures:** Plans in each state

## Rollout

- **Feature flag:** `provider_review_submission_v1`

## Definition of Done

- [ ] All ACs pass
- [ ] Lock reliable
- [ ] Submission history complete
- [ ] Audit log emitted

## Success Metric in Production

- **Cycle time:** mean time-to-Provider-response <24 hr business
- **Quality:** revision-requested rate <20%

## Stop-and-Ask-the-Human Triggers

- Changes to lock policy or unlock workflow
- Adding bypass for unavailable Provider
- Bulk submission

## Open Questions

1. Auto-route to which Provider (assigned, on-call, any)? Configurable?
2. Time-out behavior if no Provider response within X days?
3. Can submitter cancel a submission before Provider acts?

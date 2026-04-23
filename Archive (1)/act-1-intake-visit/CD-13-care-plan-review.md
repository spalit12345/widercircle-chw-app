---
id: CD-13
title: "Care Plan Review (CHW / Clinical Staff)"
source_requirement: CD-13
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: chw
secondary_personas: [clinical-staff]
labels: [demo-5-5, track-1, plan-of-care, post-visit]
blocked_by: [CD-08, CM-02, CM-13]
blocks: [CD-14, CM-22]
parallel_safe_with: [CD-09]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-13 — Care Plan Review (CHW / Clinical Staff)

## Background & User Context

After the Provider authors the Action Plan during the visit (CD-08), the CHW takes over per the §3.1 narrative. They review the Plan with the member at the end of the intake visit (third part of the intake), then carry it forward. Reviewing means: seeing what's assigned to them, understanding the full plan, and confirming nothing is missing before they walk out the door.

In the demo: Provider hands off; CHW opens the Plan in their view (CM-13), walks Maria through the items assigned to her, and acknowledges receipt.

## User Story

As a CHW, I want to review the Provider's Plan of Care after the visit — see what's assigned to me, what's assigned to others, and what the patient should know — so I can carry the work forward and walk the patient through next steps.

## Scope

**In scope:**
- Read-only Plan of Care view tailored for CHW (assigned-to-me items prominent, all-items view available)
- "Acknowledge Plan" affordance to confirm CHW has seen and discussed
- Status updates on action items the CHW owns (delegated to CD-14 for actual edit)
- Notification to Provider on acknowledgment
- Member-facing summary export (PDF / printable)

**Out of scope / Non-goals:**
- Plan editing → CD-14
- Plan authoring → CD-08
- Provider sign-off → CD-09

## Functional Requirements

1. CHW navigates to a member with a Plan from CM-13 view; "Care Plan" card opens read-only review.
2. View highlights items assigned to the current user (top section), then all other items grouped by owner.
3. "Acknowledge Plan" button writes acknowledgment record (CHW user, timestamp); Provider receives in-platform notification.
4. Item status update: status-only edits (Open → In Progress) allowed inline (delegates to CD-14 for full edit).
5. Member-facing Plan export: human-readable PDF with narrative + items.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Assigned-to-me view**
- *Given* a CHW with 2 of 5 items assigned to them
- *When* they open the Plan
- *Then* their 2 items are highlighted at top; other 3 visible below grouped by owner

**AC-2 — Acknowledgment recorded**
- *Given* CHW reviewed the Plan with the patient
- *When* they click "Acknowledge"
- *Then* an acknowledgment record is written; Provider receives notification within 1min

**AC-3 — Status-only edit allowed**
- *Given* a CHW item with status Open
- *When* they mark it In Progress
- *Then* CD-14 versioning records the change; full Plan version updated

**AC-4 — Member export**
- *Given* a CHW reviewed Plan with patient
- *When* they request "Print for Patient"
- *Then* a clean PDF generates with narrative + items in plain language; PHI handled per platform policy

**AC-5 — Audit logged**
- *Given* any Plan view, acknowledgment, or status update
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

- Reads Plan of Care + Plan Versions (CD-08 owned)
- Writes Plan Acknowledgment record (acknowledgment_id, plan_id, plan_version_id, acknowledged_by, acknowledged_at)
- Writes new Plan Version on status update (delegates to CD-14)

## API Contract

- `GET /v1/plan-of-care/{id}/review-view?for_user={uid}` → CHW-tailored view payload
- `POST /v1/plan-of-care/{id}/acknowledgments` → record acknowledgment
- `PATCH /v1/plan-of-care/{id}/items/{item_id}/status` → status-only update (delegates to CD-14)
- `GET /v1/plan-of-care/{id}/export?format=pdf` → PDF export

## UI / UX Specification

- Card / page with two sections: "Assigned to you" (top, prominent) and "All items" (collapsed by default, grouped by owner)
- "Acknowledge Plan" CTA at bottom
- Status quick-change inline on owned items
- "Print for Patient" / "Send to Patient" actions

**States:** loading, default, acknowledged (badge shows "Acknowledged YYYY-MM-DD"), partial-data, locked-pending-supervision (CD-09)

## Edge Cases & Error Handling

- Plan locked pending Provider sign-off → review allowed, status updates blocked
- CHW not on member's care team → RBAC deny
- Plan revised by Provider after CHW acknowledged → re-acknowledgment prompted
- Member declined Plan during review → CHW captures decline as a note; alerts Provider
- Acknowledgment of an old version → ack record stamped with the specific version reviewed

## Security, Privacy & Compliance

- **PHI:** Plan content
- **Provenance:** inherits member's tag
- **Consent:** Plan review does not itself need consent; status updates require care-coordination consent on file
- **RBAC:** CHW must be on member's care team
- **Audit:** views, acknowledgments, status updates all logged

## Observability

- Metrics: review-to-acknowledgment latency, % of plans acknowledged within 24h of save, status-update rate
- Alerts: ack rate <80% within 7 days (data-quality signal)

## Performance Budget

- View load <1s
- Status update <500ms

## Dependencies & Sequencing

**Blocked by:** CD-08 (Plan exists), CM-02, CM-13 (CHW navigation surface)
**Blocks:** CD-14 (full edit consumes review pattern), CM-22 (ECM uses Plan acknowledgment as engagement signal)

## Test Strategy

**Unit:** assigned-to-me filter logic; PDF generation
**Integration:** Provider saves Plan → CHW reviews → ack → Provider notified
**E2E:** Track 1 Act 1 closing flow
**Compliance:** audit emitted; PHI policy followed in PDF
**Fixtures:** Plan with multiple owners, locked Plan, revised-after-ack Plan

## Rollout

- **Feature flag:** `plan_review_v1`
- Ships with CD-08

## Definition of Done

- [ ] All ACs pass
- [ ] PDF export reviewed for PHI compliance
- [ ] Acknowledgment notification reaches Provider
- [ ] RBAC verified
- [ ] Audit log emitted
- [ ] Performance budget met

## Success Metric in Production

- **Engagement:** ≥80% of Plans acknowledged by assigned CHW within 24h
- **Patient experience:** member receives Plan PDF on >70% of intake visits

## Stop-and-Ask-the-Human Triggers

- Changes to Plan acknowledgment data model
- Changes to status-only edit policy
- Any change that exposes Plan content to non-care-team roles

## Open Questions

1. PDF template — clinical-jargon-free? Translated for non-English members?
2. Member-facing acknowledgment — should member also acknowledge digitally? (Bridges to CM-13 e-sig)
3. Re-ack policy — every revision, or only material revisions?

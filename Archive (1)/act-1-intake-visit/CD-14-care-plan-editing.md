---
id: CD-14
title: "Care Plan Editing (CHW / Clinical Staff)"
source_requirement: CD-14
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: chw
secondary_personas: [clinical-staff]
labels: [demo-5-5, track-1, plan-of-care, ongoing-care]
blocked_by: [CD-08, CD-13]
blocks: [CM-22]
parallel_safe_with: [CD-09]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-14 — Care Plan Editing (CHW / Clinical Staff)

## Background & User Context

The Provider authored the initial Plan. Once the visit closes and the CHW takes over (per §3.1 narrative), the CHW is the ongoing editor — updating progress, adding notes, marking items complete, sometimes adding new items as the work evolves. Every edit is versioned and attributed.

This is the daily-use editor for Act 2 of the demo (ongoing CHW engagement). Provider-only edits live in CD-08; this is the CHW/Clinical-Staff editor that respects sign-off boundaries.

## User Story

As a CHW (or Clinical Staff member), I want to edit the Plan of Care over time — update item status, add notes, add new items, attach evidence — so the Plan reflects what is actually happening with the patient and feeds correct billing.

## Scope

**In scope:**
- Edit existing action items: title, description, owner, due date, status, category
- Add new action items
- Cancel items (status transition)
- Attach evidence (Document, photo) per item
- Versioning: every save creates a new version with author, timestamp, and diff
- Edit lock: when CD-09 supervision-pending, edits blocked (read-only display)
- Some edits trigger Provider review flag (admin-configurable rule, e.g., "completing a CCM-billable item")

**Out of scope / Non-goals:**
- Authoring the initial Plan → CD-08
- Plan acknowledgment → CD-13
- Provider sign-off → CD-09
- E-signature on Plan → CM-13

## Functional Requirements

1. CHW navigates to a Plan from CM-13 and clicks "Edit"; editor loads with all items editable per RBAC.
2. Editor allows: edit-in-place on existing items, add new items, delete items (soft — marked Cancelled).
3. Each save creates a new Plan Version (CD-08 versioning model); diff retrievable.
4. Configurable rule: certain edits flag the Plan for Provider review (e.g., status=Complete on items tagged "billable").
5. Edits blocked when Plan is in supervision-pending state (CD-09).
6. Evidence attachment: photo, document — links to Document entity (also written by CM-13).
7. Audit every edit (DA-13).

## Acceptance Criteria (Given/When/Then)

**AC-1 — CHW edits item status**
- *Given* a CHW with edit access to an active Plan
- *When* they mark an item as Complete and save
- *Then* a new version is saved; previous-version diff shows the status change; audit logged

**AC-2 — Adding new item**
- *Given* CHW noticed a new need during visit
- *When* they add a new item with title, owner, due date, and save
- *Then* item appears in the new version with all fields; assigned owner is notified if a different user

**AC-3 — Provider-review trigger**
- *Given* an admin rule "Completing a billable item flags Plan for Provider review"
- *When* CHW completes such an item
- *Then* Plan flagged "Pending Provider Review"; Provider receives notification (CD-09)

**AC-4 — Edit blocked during supervision**
- *Given* a Plan in "Pending Provider Sign-Off" state (CD-09)
- *When* CHW attempts to edit
- *Then* edit is blocked with "Plan locked for sign-off — request unlock or wait"

**AC-5 — Evidence attachment**
- *Given* CHW completes an item with proof
- *When* they attach a photo via the evidence button
- *Then* the photo is uploaded as a Document, linked to the item, and visible in the version history

**AC-6 — Audit logged**
- *Given* any edit
- *When* the version saves
- *Then* DA-13 audit event with member_id, plan_id, version, actor, change summary

## Data Model

- Writes to Plan of Care Version (CD-08 schema)
- Evidence: Document entity write (linked_entity_type=plan_action_item, linked_entity_id=item_id)
- Plan-flagged-for-review: Plan.review_flag boolean + review_reason

## API Contract

- `PATCH /v1/plan-of-care/{id}/items/{item_id}` → update item; returns new version
- `POST /v1/plan-of-care/{id}/items` → add new item
- `DELETE /v1/plan-of-care/{id}/items/{item_id}` → soft-delete (Cancelled)
- `POST /v1/plan-of-care/{id}/items/{item_id}/evidence` → attach Document
- `GET /v1/plan-of-care/{id}/review-rules` → admin-configured rules that flag for review

## UI / UX Specification

- Edit-in-place pattern on item rows; Save / Cancel per item or bulk save
- Add Item: inline form at bottom
- Evidence: attach button per item; drag-drop on desktop
- Version history dropdown
- Lock indicator when Plan is in supervision-pending
- Conflict prompt when concurrent edit detected

**States:** edit, saving, save-success, save-error, locked, conflict, evidence-uploading

## Edge Cases & Error Handling

- Concurrent edit by another user → optimistic concurrency; conflict prompt with merge UI
- Network drop during save → local content preserved; resync on reconnect
- Photo upload fails → retry; do not block the rest of the edit
- Removing the last item → allowed but flag for Provider awareness
- Editing an item that is referenced by a downstream record (e.g., CM-22 ECM attempt) → allow edit, log impact
- Plan in supervision-pending and CHW urgent need → request unlock workflow (CD-09 escalation)

## Security, Privacy & Compliance

- **PHI:** Plan content + evidence
- **Provenance:** new version inherits Plan's tag (= member's tag)
- **Consent:** care-coordination consent required for ongoing edits
- **RBAC:** CHW with care-team assignment; supervisor view scoped
- **Audit:** every edit, every evidence upload, every conflict
- **Lock:** supervision-pending state enforced

## Observability

- Metrics: edit-success rate, conflict rate, evidence-upload rate, mean items-completed-per-week per CHW
- Alerts: conflict rate >5%, evidence-upload failure >2%

## Performance Budget

- Edit save <500ms
- Evidence upload <5s for typical photo

## Dependencies & Sequencing

**Blocked by:** CD-08 (Plan model), CD-13 (review surface)
**Blocks:** CM-22 (ECM tracks against Plan-item completion)
**Parallel-safe with:** CD-09 (sign-off operates on completed Plans, not in-progress edits)

## Test Strategy

**Unit:** edit operations, versioning, soft-delete behavior, conflict detection
**Integration:** edit → version → diff → CD-13 review render
**E2E:** Track 1 Act 2 ongoing edit flow
**Compliance:** audit emitted, lock enforced
**Fixtures:** Plan with items in each status, Plan locked for supervision, evidence-attached scenarios

## Rollout

- **Feature flag:** `plan_editing_v1`
- Pilot CHWs first

## Definition of Done

- [ ] All ACs pass
- [ ] Versioning + conflict resolution verified
- [ ] Lock-during-supervision enforced
- [ ] Audit log emitted
- [ ] Evidence attachment works
- [ ] RBAC verified
- [ ] Performance budget met

## Success Metric in Production

- **Activity:** mean Plan-edits per CHW per week ≥10
- **Quality:** ≥70% of Plan items reach a terminal state (Complete or Cancelled) within 90 days
- **Reliability:** zero data-loss incidents

## Stop-and-Ask-the-Human Triggers

- Schema change to Plan/Item
- Changes to **review-flag rule engine**
- Changes to **lock policy** (supervision-pending)
- Adding any **bypass** to the lock
- Changes to **versioning / diff** model

## Open Questions

1. Review-flag rules — which conditions trigger Provider review by default? Admin-configurable per program?
2. Bulk-edit support — CHW closing 5 items at once?
3. Suggested edits from AI (e.g., "based on CHW visit notes, suggest marking item X complete") — Phase 2/3?
4. Plan archiving — when does an active Plan become "Closed"?

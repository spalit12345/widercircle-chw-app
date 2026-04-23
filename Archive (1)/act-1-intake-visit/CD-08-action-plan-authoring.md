---
id: CD-08
title: "Action Plan Authoring (Plan of Care)"
source_requirement: CD-08
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: provider
secondary_personas: [clinical-staff, chw]
labels: [demo-5-5, track-1, hero, plan-of-care, structured-data, billing-prereq]
blocked_by: [CM-02, CD-05, CD-06, DA-13]
blocks: [CD-09, CD-10, CD-13, CD-14, CM-13]
parallel_safe_with: [CD-11]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-08 — Action Plan Authoring (Plan of Care)

## Background & User Context

The Action Plan (synonym: Plan of Care, per §1.5 — canonical name = Plan of Care) is the structured output of the intake visit and the central artifact the entire care team works against. The Provider authors during the visit, the CHW reviews and edits going forward (CD-13/14), the NP submits documentation against it (CD-15), and the MD signs off (CD-09).

Without structure (just free-text notes), value-based reporting falls apart. The platform requires Action Plans as first-class versioned entities with assignable items.

In the demo: Provider, during the live telehealth visit, dictates and structures Maria's Plan — clinical goals, action items, assigned owners, due dates. Save-as-you-go. CHW takes over from this artifact in Act 2.

## User Story

As a Provider, I want to author a structured Plan of Care during the visit — with rich-text clinical notes plus discrete action items each with an owner and due date — so the patient and care team have a clear, trackable next-step contract.

## Scope

**In scope:**
- Plan of Care editor surface (opens in encounter view alongside CD-06 video)
- Rich-text narrative section (clinical notes)
- Structured action items (each: title, description, owner role/user, due date, status, optional category)
- Versioning (every save creates a new version; full history retrievable)
- Auto-save during authoring
- Templating (optional Phase 2 enhancement; basic create-from-blank Phase 1)
- Linkage: Plan ↔ Encounter ↔ Member

**Out of scope / Non-goals:**
- Plan review by CHW → CD-13
- Plan editing post-visit → CD-14
- Plan sign-off → CD-09
- Patient-facing display of Plan → CD-03 (visit summary delivery)
- E-signature on Plan → CM-13

## Functional Requirements

1. Plan of Care editor opens in the encounter view; available once visit is In Progress (CD-06).
2. Editor sections: rich-text narrative (clinical notes), structured action items list.
3. Each action item: title (required), description (rich-text), owner (role + optional specific user), due date, status (default Open), category (optional, configurable).
4. Save-as-you-go: editor saves every 30s while editing; manual Save button always available; saves create new versions only on meaningful change (debounced).
5. Plan version history viewable; diffs between versions visible.
6. Plan linked to Encounter and Member; Encounter cannot transition to Closed without a non-empty Plan.
7. Plan items default to Open; full status set: Open, In Progress, Complete, Cancelled, Blocked.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Provider authors during visit**
- *Given* a Provider in an In Progress encounter
- *When* they type narrative and add 3 action items
- *Then* edits persist via auto-save within 30s; on next view, all content is present

**AC-2 — Action items capture all fields**
- *Given* a Provider adding an action item
- *When* they fill title, owner=`CHW`, due_date=+7d, status=`Open`, category=`Follow-up`
- *Then* the item saves with all fields and is visible in subsequent versions

**AC-3 — Plan versioning works**
- *Given* a Plan with an initial save
- *When* Provider edits an item and saves
- *Then* a new version is created; previous version retrievable; diff visible

**AC-4 — Encounter close requires Plan**
- *Given* an In Progress encounter with no Plan content
- *When* Provider attempts to mark Closed
- *Then* close is blocked with "Plan of Care required"

**AC-5 — Plan visible to CHW after save**
- *Given* Provider saved Plan during visit
- *When* CHW navigates to the member view (CM-13)
- *Then* the latest Plan version is visible, ready for CD-13 review

**AC-6 — Audit logged**
- *Given* any Plan write
- *When* the version saves
- *Then* DA-13 audit event written with member_id, plan_id, version, actor, action

## Data Model

**Plan of Care (write):**
- plan_id, member_id, encounter_id (initial), current_version_id, status (Active | Superseded), created_by, created_at, provenance_tag

**Plan of Care Version (write):**
- version_id, plan_id, version_number, edited_by, edited_at, change_summary, narrative_richtext, action_items[], previous_version_id

**Action Item (embedded in version):**
- item_id (stable across versions), title, description, owner_role, owner_user_id (nullable), due_date, status, category, created_in_version, last_updated_in_version

**Encounter (update):** plan_of_care_id reference; close-blocked-without-plan rule

## API Contract

- `POST /v1/encounters/{id}/plan-of-care` → creates initial plan
- `PATCH /v1/plan-of-care/{id}` → save edit (debounced auto-save uses idempotency key on draft cycle)
- `GET /v1/plan-of-care/{id}` → current version
- `GET /v1/plan-of-care/{id}/versions` → version history list
- `GET /v1/plan-of-care/{id}/versions/{vid}` → specific version
- `GET /v1/plan-of-care/{id}/diff?from=v1&to=v2` → version diff

## UI / UX Specification

- Editor pane in encounter view (alongside video pane in CD-06 layout)
- Two-column or stacked: narrative on top, action items list below
- Action item add: inline form
- Auto-save indicator: "Saved 3s ago" / "Saving…" / "Save failed — retry"
- Version history dropdown / sidebar

**States:** new (no plan yet), draft-with-content, saving, saved, save-error, locked-pending-supervision (CD-09), historical-version-view (read-only)

**Accessibility:** WCAG AA; rich-text editor keyboard-accessible; auto-save status announced

## Edge Cases & Error Handling

- Two Providers editing same Plan → optimistic concurrency; second save shows conflict prompt
- Auto-save failure → prominent error; manual save retry; do-not-clear local content
- Network drop mid-session → local draft preserved; resync on reconnect
- Encounter closed before Plan saved → block close (per AC-4)
- Plan with action items assigned to deactivated user → flagged for reassignment
- Long Plan (50+ action items) → paginate items in UI, full export available

## Security, Privacy & Compliance

- **PHI:** clinical narrative + structured items
- **Provenance:** Plan inherits member's tag
- **Consent:** Plan authoring requires valid Telehealth/CHI consent (CD-05)
- **RBAC:** Provider can author on assigned encounters; CHW can edit per CD-14; supervisor view scoped per assignment
- **Audit:** every version write
- **Lock-on-supervision:** when CD-09 flips to Pending Provider Sign-Off, edits are blocked

## Observability

- Metrics: plans authored per Provider per day, mean items per plan, auto-save success rate, edit-to-save latency
- Alerts: auto-save failure rate >1%, plans saved without items (data quality)

## Performance Budget

- Auto-save round-trip <500ms p95
- Plan load <1s

## Dependencies & Sequencing

**Blocked by:** CM-02, CD-05 (consent), CD-06 (visit started), DA-13
**Blocks:** CD-09 (sign-off acts on Plan), CD-10 (billing requires Plan), CD-13/14 (review/edit consume Plan), CM-13 (CHW renders Plan card)

## Test Strategy

**Unit:** versioning logic (no lost saves); diff computation; close-without-plan rule
**Integration:** Provider authors → CHW reads → version history correct
**E2E:** Track 1 demo flow (visit → author → save → CHW reviews)
**Compliance:** audit emitted per save
**Performance:** large-plan rendering, auto-save under load
**Fixtures:** plan with rich narrative + 10 action items, plan with 50 items, plan with multiple versions

## Rollout

- **Feature flag:** `plan_of_care_authoring_v1`
- Pilot with internal Providers
- Rollback trigger: data loss event, save failures >2%

## Definition of Done

- [ ] All ACs pass
- [ ] Auto-save reliable (no lost data scenario in test)
- [ ] Versioning + diff verified
- [ ] Encounter-close gate enforced
- [ ] Audit log emitted
- [ ] RBAC enforced for author and reader roles
- [ ] Performance budget met
- [ ] CD-13/14 consumers integrated and verified

## Success Metric in Production

- **Adoption:** ≥95% of completed encounters have a non-empty Plan
- **Reliability:** zero data-loss incidents
- **Quality:** mean items per plan ≥3 (vs. blob narratives)
- **Downstream use:** ≥80% of action items reach a terminal state (Complete or Cancelled) within 90 days

## Stop-and-Ask-the-Human Triggers

- Schema change to **Plan of Care** or **Action Item** (downstream consumers — CD-09, CD-13, CD-14, CM-13 — depend on shape)
- Changes to **versioning model** (immutable history, append-only)
- Changes to **close-without-plan rule** (relaxing or tightening)
- Adding new **action item statuses**
- Lock-on-supervision logic changes
- Any change that affects **billing eligibility** of Plan content (CD-10 dependency)

## Open Questions

1. Templating — bare-bones Phase 1, full template library Phase 2? Which templates? (e.g., "ECM intake template", "CCM standard")
2. Categories — admin-configurable list or hardcoded?
3. Action items assigned to external parties (PCP, supplier) — supported here or via Referrals (CM-05 / SUP-13)?
4. Plan archiving — when a Plan is "done", what's the closure model?
5. Member-visible Plan — what fields surface to the patient (CD-03 visit summary delivery)?

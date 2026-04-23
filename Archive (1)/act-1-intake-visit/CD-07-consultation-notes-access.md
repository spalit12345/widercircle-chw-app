---
id: CD-07
title: "Consultation Notes Access (Pre-Visit Chart)"
source_requirement: CD-07
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: provider
secondary_personas: [clinical-staff, chw]
labels: [demo-5-5, track-1, persona-provider, pre-visit, chart-review]
blocked_by: [CM-02, CM-03]
blocks: [CD-06, CD-08]
parallel_safe_with: [CD-05, CD-11]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-07 — Consultation Notes Access (Pre-Visit Chart)

## Background & User Context

The Provider has back-to-back telehealth visits. Before the camera turns on, they need a fast, structured pre-visit summary: why the patient is here, what the CHW noted at intake, prior encounter notes, active Action Plans, SDoH flags, and recent interactions. Healthie buries some of this; the platform has to surface it on a single pre-visit screen.

In the demo: the Provider opens the pre-visit chart 30 seconds before launching the telehealth session. They see Maria's CHW-conducted SDoH assessment, prior visit history, and a snapshot of where she is in care.

## User Story

As a Provider, I want a pre-visit chart screen that gives me Maria's full clinical context — prior notes, active Action Plan, recent interactions, and SDoH flags — so I walk into the visit prepared and don't waste her time asking what's already known.

## Scope

**In scope:**
- Pre-visit chart route (e.g., `/encounters/{id}/pre-visit`) accessible from Provider's daily schedule
- Composed view: chief complaint / reason for visit, prior encounter notes, current Action Plan, SDoH assessment (CD-19) results, recent interactions (CM-09), allergies/meds/conditions snapshot, eligibility status (CD-11)
- Available 30+ minutes prior to scheduled visit
- Read-only — authoring happens in CD-08 once the visit starts
- Quick actions: launch telehealth (CD-06), open consent flow (CD-05), open Action Plan editor (CD-08)

**Out of scope / Non-goals:**
- Authoring of any notes — read-only here
- Telehealth video — CD-06
- Consent capture — CD-05

## Functional Requirements

1. Provider's daily schedule (CD-18) shows a "Pre-Visit Chart" link for each scheduled encounter, enabled ≥30 min before scheduled start.
2. Pre-visit screen renders consolidated view with all sections visible without scrolling on a desktop.
3. Sections load in parallel (independent queries) so a slow section doesn't block.
4. Quick-action bar at top: Launch Visit, Capture Consent, Edit Action Plan (Plan locked until visit starts).
5. Prints/exports cleanly for fallback use.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Available 30 min prior**
- *Given* a Provider with a visit scheduled at 10am
- *When* it is 9:30am
- *Then* the "Pre-Visit Chart" link is enabled on the schedule

**AC-2 — Composed view renders**
- *Given* the Provider opens the pre-visit chart
- *When* the page loads
- *Then* all sections (chief complaint, prior notes, Action Plan, SDoH, interactions, meds/allergies/conditions, eligibility) render within <2s

**AC-3 — Read-only**
- *Given* a Provider on the pre-visit screen
- *When* they attempt to edit any field
- *Then* edits are not permitted; they are directed to the appropriate authoring surface (CD-08 / CD-05)

**AC-4 — Launch visit transitions to authoring**
- *Given* a Provider clicks "Launch Visit"
- *When* the encounter status moves to In Progress
- *Then* the Action Plan and Notes become editable (CD-08); telehealth video launches (CD-06)

**AC-5 — Audit logged**
- *Given* a Provider opens a pre-visit chart
- *When* the page loads
- *Then* DA-13 audit event written with member_id, encounter_id, user_id, purpose=`care_delivery_pre_visit`

## Data Model

- Reads from Member, Encounter, Note, Action Plan, Interaction, SDoH Assessment (CD-19), Eligibility Check (CD-11)
- No writes (display-only)

## API Contract

- `GET /v1/encounters/{id}/pre-visit` → composed pre-visit payload
- Each section also independently fetchable for partial-data resilience
- RBAC: Provider role with assignment to this Encounter

## UI / UX Specification

- Single page, dense layout: 4-quadrant grid on desktop (clinical history, plan, SDoH, interactions); single column on mobile
- Quick-action bar sticky at top
- "Launch Visit" prominent CTA
- Print-friendly stylesheet for fallback

**States:** loading (per-section skeleton), default, partial-data, error per section, visit-in-progress (read-only history stays, "Return to Authoring" CTA appears)

## Edge Cases & Error Handling

- Pre-visit accessed before 30-min window → graceful "Available at 9:30am" message
- Pre-visit accessed after visit closed → read-only post-visit summary view
- Patient has no prior history → empty-state per section ("First visit")
- Encounter assigned to different provider → RBAC denial (logged)
- Late-added information after pre-visit was opened → optional manual refresh; banner if data changed since open

## Security, Privacy & Compliance

- **PHI:** all clinical history rendered
- **Provenance:** badge inherited from member
- **RBAC:** scoped to Provider with explicit Encounter assignment
- **Audit:** every pre-visit view logged
- **Anti-steering:** AC-sourced data (alignment) not displayed

## Observability

- Metrics: pre-visit-chart open rate (% of encounters with pre-visit-opened ≥5 min before visit), section load p95, composed-payload latency

## Performance Budget

- Composed view <2s p95 (per §5.1)

## Dependencies & Sequencing

**Blocked by:** CM-02, CM-03
**Blocks:** CD-06, CD-08 (the visit flow that follows)

## Test Strategy

**Unit:** time-window enable logic; section composition
**Integration:** all sections render with realistic data
**E2E:** Provider opens pre-visit → launches visit (Track 1 demo)
**Compliance:** audit event emitted
**Performance:** load with 5-year history
**Fixtures:** member with rich clinical history, member with no history (first visit)

## Rollout

- **Feature flag:** `pre_visit_chart_v1`
- Pilot with internal Providers before broader rollout

## Definition of Done

- [ ] All ACs pass
- [ ] Performance budget met
- [ ] Audit log verified
- [ ] RBAC enforced (cross-Provider blocked)
- [ ] Print-friendly stylesheet works
- [ ] Provider runbook published

## Success Metric in Production

- **Adoption:** ≥80% of visits preceded by pre-visit-chart open within 30 days
- **Provider satisfaction:** Provider reports "I had the context I needed" on >85% of post-visit pulses

## Stop-and-Ask-the-Human Triggers

- Adding/removing sections
- Changes to RBAC scoping logic
- Any change that would expose AC-sourced or anti-steering data
- Changes to time-window-enable rules

## Open Questions

1. Time window — is 30 min the right default, or per-program configurable?
2. Mobile pre-visit — needed, or desktop-only?
3. AI pre-visit summary — generate a 3-sentence "what to expect" on top? Phase 2/3.
4. How long is "history" — full lifetime, last 12 months, configurable?

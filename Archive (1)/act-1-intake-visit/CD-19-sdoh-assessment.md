---
id: CD-19
title: "SDoH Assessment (CHW-Conducted)"
source_requirement: CD-19
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: chw
secondary_personas: [clinical-staff, case-manager]
labels: [demo-5-5, track-1, hero, sdoh, intake, structured-data, case-trigger]
blocked_by: [CM-02, CM-13, DA-13]
blocks: [CM-05, CM-21, CD-08]
parallel_safe_with: [CD-11]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-19 — SDoH Assessment (CHW-Conducted)

## Background & User Context

Per the §3.1 narrative, the SDoH assessment is the **first part** of the intake visit — conducted by the CHW before the Provider begins the clinical encounter. It captures Social Determinants of Health: food security, housing, transportation, utilities, safety, employment, family. Risk thresholds in answers automatically trigger Cases for follow-up.

In the demo: CHW Maria's intake visit opens with the SDoH form. A "no, I sometimes don't have enough food" answer auto-creates a follow-up SDoH Case visible in CM-05 / CM-21. The Provider then sees this surfaced in CD-07 pre-visit chart.

## User Story

As a CHW, I want a structured SDoH assessment I can administer at intake — with the system auto-creating follow-up cases for anything risky — so I capture the full picture without losing details and without manual case creation.

## Scope

**In scope:**
- Configurable assessment form (admin-managed; e.g., PRAPARE-aligned default)
- CHW administration UI (mobile + desktop, offline-capable per CM-13)
- Question types: single-select, multi-select, scale, free-text
- Configurable risk thresholds per question/answer combination
- Auto-trigger Case creation when threshold met (delegates to CM-21)
- Responses stored as structured Survey Response (per §1.5 entity)
- Visible in member profile + pre-visit chart (CD-07)

**Out of scope / Non-goals:**
- Patient self-administration via portal — Phase 2 (different surface)
- General Case Surveys (CM-04) — that's a CM-flow survey; this is the intake-visit SDoH specifically
- Survey designer / authoring — admin tool; spec'd lightly here
- SDoH referral creation → CM-05 (consumer of this)

## Functional Requirements

1. CHW launches "SDoH Assessment" from member profile or intake-visit flow.
2. Form renders configured questions; supports branching.
3. Each answer evaluated against risk-threshold rules; matching answers tag the response and trigger Case auto-creation.
4. Responses save per question (auto-save) + on-completion submit.
5. Completed assessment visible in member profile and CD-07 pre-visit chart.
6. Re-assessment supported (annual or program-cadence); previous responses retained.
7. Offline mode: full assessment can be administered offline; syncs per CM-13 contract.

## Acceptance Criteria (Given/When/Then)

**AC-1 — CHW administers and submits**
- *Given* a CHW with a member ready for intake
- *When* they launch and complete the SDoH assessment
- *Then* responses save as a Survey Response linked to member, timestamp, administered_by

**AC-2 — Risk threshold triggers Case**
- *Given* the question "In the last 12 months, did you ever worry about running out of food?" has threshold rule "answer=Often → trigger Food Insecurity Case"
- *When* CHW records "Often"
- *Then* a Case is auto-created (type=Food Insecurity, priority=High); CHW sees confirmation; assigned per routing rules

**AC-3 — Branching works**
- *Given* a question whose follow-up depends on the answer
- *When* CHW records the answer
- *Then* only the relevant follow-up question(s) appear

**AC-4 — Visible in pre-visit chart**
- *Given* CHW completed SDoH assessment for a member
- *When* Provider opens pre-visit chart (CD-07)
- *Then* the SDoH summary section shows the latest assessment with high-risk answers highlighted

**AC-5 — Offline administration**
- *Given* CHW administers assessment with no connectivity
- *When* device reconnects
- *Then* assessment syncs to server within 60s; any auto-triggered Cases are created on sync (not duplicated if retried)

**AC-6 — Audit logged**
- *Given* an assessment is administered
- *When* it submits
- *Then* DA-13 audit event written with member_id, assessment_id, administered_by, count of risk triggers fired

## Data Model

**Survey Definition (read; admin-owned):** survey_def_id, name, version, questions[], branching_rules, risk_thresholds[]

**Survey Instance (write):** instance_id, survey_def_id, member_id, administered_by, started_at, completed_at, source (intake | follow-up | re-assessment), provenance_tag

**Survey Response (write):** response_id, instance_id, question_id, answer_value, answered_at

**SDoH Risk Trigger (write):** trigger_id, instance_id, question_id, threshold_rule_id, triggered_case_id

**Case (write via CM-21):** auto-generated case linked back to trigger

## API Contract

- `POST /v1/members/{id}/survey-instances` → start instance
- `PATCH /v1/survey-instances/{id}/responses/{question_id}` → save response
- `POST /v1/survey-instances/{id}/submit` → finalize; runs threshold rules, creates triggered Cases
- `GET /v1/members/{id}/survey-instances?type=sdoh&latest=true` → latest assessment (consumed by CD-07, CM-02)

## UI / UX Specification

- Mobile-first form (CHW field use); also desktop responsive
- Question-by-question or page-of-questions layout (configurable per assessment)
- Branching: hidden questions appear inline as needed
- Risk-trigger preview: when answering, if a trigger fires, gentle inline notification "This will create a Food Insecurity case"
- Completion summary: list of triggered cases + member-relevant summary
- Save-as-you-go indicator

**States:** in-progress, paused, completed, syncing (offline), conflict (re-assessment of recent assessment)

**Accessibility:** WCAG AA; large touch targets for mobile; assessment readable at 6th-grade level

## Edge Cases & Error Handling

- Member declines to answer some questions → partial assessment allowed; flagged
- Member ends visit before completion → partial saved; can resume
- Re-assessment within X days of last → confirm with CHW (may be unintentional)
- Risk-trigger rule changes after instance started → use rule snapshot at start time
- Auto-Case creation fails (downstream) → trigger record retained; admin retry
- Offline submit duplicates on retry → idempotency key prevents

## Security, Privacy & Compliance

- **PHI:** SDoH responses are PHI (sensitive health info)
- **Provenance:** instance inherits member's tag
- **Consent:** SDoH assessment requires care-coordination consent
- **RBAC:** administration restricted to CHW / Clinical Staff with care-team assignment
- **Audit:** every administration, every triggered Case, every re-assessment

## Observability

- Metrics: assessments-per-day, mean completion time, trigger-rate per question, auto-Case creation success rate, partial-completion rate
- Alerts: trigger-rule failure, auto-Case-creation downstream failures

## Performance Budget

- Form load <1s
- Per-response auto-save <500ms
- Submission with rule evaluation <2s

## Dependencies & Sequencing

**Blocked by:** CM-02, CM-13 (CHW surface), DA-13
**Blocks:** CM-05 (SDoH referrals consume assessment data), CM-21 (auto-Case creation), CD-08 (Provider Plan informed by assessment)

## Test Strategy

**Unit:** branching logic, threshold rule evaluation, idempotent submit
**Integration:** assessment → trigger → Case created with correct routing
**E2E:** Track 1 demo intake flow (Maria's "Often run out of food" → Case created)
**Compliance:** audit emitted, RBAC enforced
**Performance:** large assessment (50 questions) load + submit
**Fixtures:** assessment with multiple branches, multiple thresholds, multi-trigger member

## Rollout

- **Feature flag:** `sdoh_assessment_v1`
- Default assessment template (PRAPARE-aligned) ships with feature
- Pilot CHWs

## Definition of Done

- [ ] All ACs pass
- [ ] Branching works
- [ ] Threshold rules → Case auto-creation verified
- [ ] Offline administration + sync verified
- [ ] Audit log emitted
- [ ] Pre-visit chart (CD-07) integration verified
- [ ] Performance budget met
- [ ] Default SDoH assessment template approved by clinical leadership

## Success Metric in Production

- **Coverage:** ≥95% of intake visits include a completed SDoH assessment
- **Action conversion:** ≥80% of triggered SDoH Cases reach a "Worked" status within 30 days
- **Re-assessment cadence:** ≥60% of active members re-assessed annually

## Stop-and-Ask-the-Human Triggers

- Schema changes to Survey Definition / Response
- Changes to **threshold rule engine**
- Default assessment content changes (clinical review needed)
- Auto-Case creation logic changes
- Changes to RBAC for administration

## Open Questions

1. Default assessment template — PRAPARE alignment exact, or WC-customized?
2. Patient self-administration — Phase 2? Same instance schema?
3. Re-assessment cadence — annual default, configurable per program?
4. Risk-tier integration — does assessment feed CM-16 prioritization scoring?
5. Translation — assessment in Spanish minimum for Phase 1?

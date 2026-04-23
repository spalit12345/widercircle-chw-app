---
id: CM-04
title: "Case Surveys (Branching, Consent, Auto-Trigger)"
source_requirement: CM-04
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw, compliance-officer]
labels: [demo-5-5, track-1, surveys, branching, consent, auto-case-trigger]
blocked_by: [CM-02, DA-12, DA-13]
blocks: []
parallel_safe_with: [CM-21]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-04 — Case Surveys (Branching, Consent, Auto-Trigger)

## Background & User Context

CMs administer surveys during cases — clinical questionnaires, consent capture, member feedback, risk assessments. These need branching logic, embedded consent capture, and auto-trigger of follow-up cases when responses meet thresholds (similar mechanism to CD-19 SDoH but for case-context surveys).

In the demo: CHW administers a brief follow-up survey on Maria; one answer triggers a follow-up case for transportation support.

## User Story

As a CM, I want to administer surveys in case workflows that capture consent and clinical data, with branching logic and auto-triggers for follow-up cases — so I capture structured data efficiently without manual case creation.

## Scope

**In scope:**
- Survey administration UI (CM-side; member-self-service is separate)
- Branching logic per question
- Embedded consent capture with e-signature
- Risk-threshold rules → auto-trigger follow-up cases (similar engine to CD-19)
- Responses stored structured per Survey Response entity
- Per-program survey configs
- Versioned survey content

**Out of scope / Non-goals:**
- SDoH-specific intake assessment → CD-19
- Patient self-administration → out of scope this ticket
- Survey designer (admin) → minimal Phase 1; richer in Phase 2

## Functional Requirements

1. CM/CHW launches survey from case or member profile.
2. Survey renders configured questions; supports branching.
3. Embedded consent steps within survey are captured per DA-12 (saves Consent records).
4. Risk-threshold rules trigger auto-Case creation (same engine pattern as CD-19).
5. Responses persist structured; visible in case + member profile.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Survey administration**
- *Given* CM on Maria's case
- *When* they launch and complete a configured survey
- *Then* Survey Response saved; visible in case timeline + member profile

**AC-2 — Embedded consent captured**
- *Given* a survey with a step that captures HIPAA Authorization consent
- *When* CM completes that step
- *Then* a Consent record is created (DA-12, type=hipaa_authorization, method per capture); auditable

**AC-3 — Auto-trigger case**
- *Given* a survey with rule "answer to Q5=High → trigger Transportation Case"
- *When* CM records "High"
- *Then* Transportation Case is auto-created; CM sees confirmation

**AC-4 — Branching**
- *Given* survey with branching question
- *When* answer dictates next path
- *Then* irrelevant questions hidden; only relevant ones presented

**AC-5 — Versioning**
- *Given* a survey instance was administered with version 2 of the survey
- *When* a future user views the response
- *Then* the v2 question wording is shown alongside the answer (not v3 wording)

**AC-6 — Audit logged**
- *Given* survey administration, consent capture, or auto-trigger
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

- Survey Definition / Instance / Response (per §1.5 — same model as CD-19)
- Consent records via DA-12 (when embedded consent step)
- Auto-Case via CM-21 endpoint
- Threshold rules per question/answer

## API Contract

- `POST /v1/cases/{cid}/surveys/{survey_def_id}/instances` → start
- `PATCH /v1/survey-instances/{id}/responses/{q_id}` → save response
- `POST /v1/survey-instances/{id}/submit` → finalize, run rules, create cases/consents

## UI / UX Specification

- Survey form embedded in case detail
- Branching: hidden Qs appear inline when triggered
- Consent step: clearly delineated, explicit confirmation
- Completion summary: list of triggered cases + consents captured

**States:** in-progress, paused, completed, error

## Edge Cases & Error Handling

- Member declines mid-survey → partial response saved, flagged
- Consent declined within survey → consent NOT created; survey continues with branch
- Survey config changes during in-progress instance → snapshot at instance start
- Auto-Case downstream failure → trigger record retained for retry

## Security, Privacy & Compliance

- **PHI:** survey responses
- **Provenance:** inherits member's tag
- **Consent:** survey administration may require care-coordination consent; embedded consent steps capture additional types
- **RBAC:** CM/CHW with case access
- **Audit:** every administration, consent capture, auto-trigger

## Observability

- Metrics: surveys completed/CM/week, completion rate, embedded-consent capture rate, auto-trigger rate
- Alerts: trigger rule failures, consent capture failures

## Performance Budget

- Form load <1s
- Per-response save <500ms
- Submission <2s

## Dependencies & Sequencing

**Blocked by:** CM-02, DA-12 (consent), DA-13
**Blocks:** none direct

## Test Strategy

**Unit:** branching, threshold rules, embedded consent
**Integration:** administer → consent + auto-Case correctly
**E2E:** Track 1 Act 2 supporting flow
**Compliance:** audit emitted; consent immutability respected
**Fixtures:** surveys with branching, embedded consent steps, multiple thresholds

## Rollout

- **Feature flag:** `case_surveys_v1`
- At least 2 launch surveys configured

## Definition of Done

- [ ] All ACs pass
- [ ] Branching + thresholds + consent + auto-trigger all working
- [ ] Audit log emitted
- [ ] Survey versioning preserved on response display

## Success Metric in Production

- **Adoption:** ≥1 survey/CM/week
- **Auto-trigger value:** ≥30% of triggered follow-up cases reach a positive resolution

## Stop-and-Ask-the-Human Triggers

- Schema changes to Survey/Response model
- Changes to threshold rule engine
- Embedded consent rules change
- Adding new survey-administration sources

## Open Questions

1. Self-administration — Phase 2?
2. Survey designer admin UI scope (versioning, preview, branching designer)
3. Multi-language surveys — Phase 1 minimum (EN+ES)?
4. Auto-Case routing rules — survey-specific or use CM-21 defaults?

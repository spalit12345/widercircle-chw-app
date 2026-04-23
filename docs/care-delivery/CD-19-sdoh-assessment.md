# CD-19 — SDoH Assessment (CHW-Conducted)

**Phase 1 · Must · Persona: CHW · Demo role: ⭐ hero (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-19-sdoh-assessment.md`

## Goal
First part of intake visit per §3.1. CHW administers structured SDoH assessment (food, housing, transport, utilities, safety, employment, family). Risk-threshold answers auto-create follow-up Cases.

## In scope
- Admin-managed assessment definition (PRAPARE-aligned default)
- CHW administration UI, mobile + desktop, offline-capable per CM-13
- Question types: single-select, multi-select, scale, free-text; branching logic
- Configurable risk-threshold rules → auto-trigger Case (delegates to CM-21)
- Per-question auto-save + submission
- Visible on member profile + CD-07 pre-visit chart
- Re-assessment (annual/program cadence); previous responses retained
- Rule snapshot at instance start (rule changes don't retro-apply)

## Out of scope
Patient self-admin via portal (P2), general Case Surveys (CM-04), survey designer, referral creation (CM-05).

## Key acceptance criteria
- Admin/submit → Survey Response saved w/ member, timestamp, administered_by (AC-1)
- Threshold match → Case auto-created w/ correct type + priority + routing (AC-2)
- Branching shows only relevant follow-ups (AC-3)
- Latest assessment visible in CD-07 pre-visit chart with high-risk highlighted (AC-4)
- Offline admin syncs <60s on reconnect; idempotent (no dup Cases) (AC-5)

## Data model
**Survey Definition** (survey_def_id, name, version, questions[], branching_rules, risk_thresholds[])
**Survey Instance** (instance_id, survey_def_id, member_id, administered_by, started_at, completed_at, source, provenance_tag)
**Survey Response** (response_id, instance_id, question_id, answer_value, answered_at)
**SDoH Risk Trigger** (trigger_id, instance_id, question_id, threshold_rule_id, triggered_case_id)

## API
- `POST /v1/members/{id}/survey-instances`
- `PATCH /v1/survey-instances/{id}/responses/{question_id}`
- `POST /v1/survey-instances/{id}/submit` (runs thresholds, creates Cases)
- `GET /v1/members/{id}/survey-instances?type=sdoh&latest=true` (consumed by CD-07, CM-02)

## Depends on
CM-02, CM-13 (CHW surface), DA-13

## Blocks
CM-05, CM-21, CD-08

## Performance
Form load <1s; per-response save <500ms; submit w/ rule evaluation <2s

## Stop-and-ask triggers
Survey Definition/Response schema · threshold rule engine · default assessment content (clinical review) · auto-Case creation logic · RBAC for administration

## UI

Shared DS: [README](./README.md#design-system-shared).

**Launch points**:

- CM-13 member view → "Start SDoH assessment" brand `Btn md` with `Icon.heart` leading.
- Patient 360 **SDoH & Social** tab: `Empty` "No recent assessment · Start" CTA.
- CD-18 Today view: surfaced as a task if assigned.

**Assessment runner** — full-page route `/members/{id}/assessments/{instance_id}` (also usable in offline mode).

### Desktop layout (page-of-questions)

- **Header strip** (sticky, white, border-bottom): "SDoH Assessment · {member name}" · progress bar 4px brand-500 fill on `base-100` track · "Question 4 of 18" mono · `Badge` offline/online indicator.
- **Body** scrollable: section cards grouping related questions (Food · Housing · Transport · Utilities · Safety · Employment · Family). Each question rendered as:
  - Question number + text in `wc-h3-input` (16/600 Montserrat).
  - Helper/plain-language rewording below in 13px `base-600`.
  - Answer control by type:
    - **single-select** → `Chip` row (radius 30, selected = black).
    - **multi-select** → `Chip` row with multi-state (`Badge tone="brand"` when selected).
    - **scale** → custom 5-button pill group, Likert-style.
    - **free-text** → `Textarea rows=3`.
- **Risk-trigger indicator** — when an answer crosses threshold, the card gains a `warning-300` left accent bar + inline `Badge tone="warning" dot` "This will open a {case type} case" beneath the control.
- **Branching** — follow-ups fade in below triggering question within the same card.
- **Footer sticky bar**: "Save & continue later" tertiary · "Next section" brand `Btn lg` (primary action); at last section becomes "Review & submit".

### Mobile (question-by-question)

One question per screen, 44px min tap targets, back/forward chevs at top, progress bar sticky. Chips enlarged (min-height 44). Free-text uses native iOS/Android keyboard.

### Review & submit screen

`SectionCard` list of answered questions with edit links per row, plus a **Risk triggers** summary card (warning bg): "{N} cases will be created" with list of case types. Bottom: brand `Btn lg` "Submit assessment".

### Post-submit state

Success screen (`success-100` bg banner, `Icon.check`): "Assessment submitted" + list of created cases as links (routes to CM-21). CTA "Return to {member}".

### Offline state

Banner top of page (`warning-100`, `Icon.alert`): "Offline — responses saved locally; will sync when connected." Progress bar still works; all questions still answerable. On reconnect → banner flips green "Synced" briefly then dismisses. If idempotency conflict → "Assessment already synced by another device" with conflict-resolution UI.

### Pre-visit chart integration (CD-07)

In `SectionCard` "Latest SDoH assessment": instance summary card (date + administered_by Avatar + triggered-case count) + list of high-risk answers with `Badge tone="error" dot` so Provider sees them at a glance.

### Admin (light)

Admin-facing survey designer is out of scope here; note that risk-threshold rules must be versioned — when viewing an instance, show rule-version chip (mono "rules v3") in the footer audit line.

**Tokens used** — `--wc-warning-300` / `--wc-error-500` (risk triggers), `--wc-success-100` (submit success), `--wc-radius-xl` (section cards), `--wc-radius-2xl` (answer chips). Montserrat `wc-h3-input` for questions, Inter body for helpers.

## Open questions
1. PRAPARE-exact vs WC-customized default?
2. Patient self-admin (P2) — same schema?
3. Re-assessment cadence — annual default, per-program configurable?
4. Feeds CM-16 prioritization scoring?
5. Spanish translation required for P1?

# CD-07 — Consultation Notes Access (Pre-Visit Chart)

**Phase 1 · Must · Persona: Provider · Demo role: ✓ in-flow (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-07-consultation-notes-access.md`

## Goal
Single pre-visit screen composing all clinical context for the Provider before launching a telehealth visit. Read-only — authoring is CD-08.

## In scope
- Route `/encounters/{id}/pre-visit` accessible from CD-18 schedule
- Composed sections: reason for visit, prior notes, current Action Plan, latest SDoH assessment (CD-19), recent interactions (CM-09), meds/allergies/conditions, eligibility status (CD-11)
- Enabled ≥30 min before scheduled start
- Quick-action bar: Launch Visit (CD-06), Capture Consent (CD-05), Edit Plan (CD-08, locked until visit starts)
- Print/export fallback

## Out of scope
Any authoring, video, consent capture.

## Key acceptance criteria
- Link enabled 30 min prior (AC-1)
- All sections render <2s (AC-2)
- Fully read-only (AC-3)
- Launch → transitions to authoring mode (AC-4)

## API
- `GET /v1/encounters/{id}/pre-visit` → composed payload
- Each section independently fetchable (partial-data resilience)

## Depends on
CM-02, CM-03

## Blocks
CD-06, CD-08

## Stop-and-ask triggers
Adding/removing sections · RBAC scoping changes · any AC-sourced data exposure · time-window rule changes

## UI

Shared DS: [README](./README.md#design-system-shared). Backbone: [`Design/src/patient360.jsx`](../../Design/src/patient360.jsx).

**Route** `/encounters/{id}/pre-visit` — rendered as a dedicated tab-variant of Patient 360 with the standard `MemberTopHeader` or `MemberSidePanel`.

- **Sticky quick-action bar** (64px, white, border-bottom, `shadow-sm`): left = encounter meta ("Intake · 10:00am · Maria L. · CCM"); right = `Btn brand lg` **Launch Visit** (with `Icon.phone`) · `Btn secondary md` **Capture Consent** · `Btn secondary md` **Edit Plan** (disabled badge "Starts at visit"). All three buttons read from `Badge` chips confirming gate state (consent ✓, member present ✓).
- **Body grid**: `display: grid; grid-template-columns: 1fr 1fr; gap: 20px` (4 quadrants on desktop, single column mobile) using `SectionCard` primitives:
  1. **Reason & chief complaint** + recent notes — P2 body text, last-3 prior encounter notes w/ clinician avatar + date.
  2. **Current Plan of Care** — shows narrative excerpt (clamp 4 lines) + top 3 action items (PriorityChip accent + status `Badge` + due chip). Link "Open full Plan".
  3. **Latest SDoH assessment** (from CD-19) — completion timestamp, risk-trigger `Badge tone="error" dot` for high-risk answers, mini list of triggered items.
  4. **Recent interactions** — 3 rows of `ChannelGlyph` + actor + when + summary (reuses `Timeline` row primitive).
- **Right sidebar** (or second row on mobile): **Meds · Allergies · Active conditions** `SectionCard`, **Eligibility status** banner (consumes CD-11 last check, stale → gold "Re-check" tertiary `Btn`).
- **Time-window gate**: when >30 min out, Launch Visit button disabled; hover tooltip "Available at 9:30am". At T-5min, button gets subtle pulse animation (same keyframe as incoming-call pulse in TopBar).
- **Print view** (`?print=1`): single column, no chrome, letterhead, sections stacked.
- **States**: loading (per-section skeletons via `Card` with shimmering `base-100` blocks) · partial-data (section shows `Empty` component with retry icon) · visit-in-progress (banner "Visit in progress — open Workspace" with CTA) · error.

**Tokens used** — `--wc-base-50` (page bg), `--wc-shadow-sm` (action bar), `--wc-radius-xl` (section cards), `--wc-brand-500` (Launch CTA pulse).

## Open questions
1. 30-min window — default, or per-program configurable?
2. Mobile pre-visit required?
3. AI pre-visit summary (Phase 2/3)
4. History window — lifetime, 12mo, configurable?

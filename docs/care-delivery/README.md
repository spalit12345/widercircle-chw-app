# Care Delivery Module — Task Index

Source: Unified Internal Platform (CMS) §3.1 + 5/5 Demo Track 1. Full tickets in `Archive (1)/act-{1,2}-*/CD-*.md`.

## Demo storyline
"Maria's first 60 days at Wider Circle." Act 1 = intake visit (SDoH → Care Plan → CHW review). Act 2 = ongoing CHW engagement with time tracking + sign-off pipeline.

## Build order (strict)

Gate: **DA-14 RBAC v1** and **CM-02 Unified Member Context** must land before any CD ticket. These are outside this module but required.

### Phase A — Foundations (parallel-safe, no internal CD deps)
1. [CD-18](./CD-18-task-schedule.md) — Today view (landing screen)
2. [CD-11](./CD-11-eligibility-check.md) — Bridge eligibility check

### Phase B — Intake Visit (Act 1)
3. [CD-07](./CD-07-consultation-notes-access.md) — Pre-visit chart (read-only composer)
4. [CD-19](./CD-19-sdoh-assessment.md) — SDoH assessment (CHW intake first step)
5. [CD-05](./CD-05-consent-management.md) — Telehealth/CHI consent (verbal + e-sig)
6. [CD-06](./CD-06-telehealth-visit-conduct.md) — Embedded video visit
7. [CD-08](./CD-08-action-plan-authoring.md) — Plan of Care authoring (Provider)
8. [CD-13](./CD-13-care-plan-review.md) — CHW review + acknowledge
9. [CD-14](./CD-14-care-plan-editing.md) — CHW ongoing edits

### Phase C — Ongoing + Billing Pipeline (Act 2)
10. [CD-17](./CD-17-time-tracking.md) — CCM stopwatch + threshold dashboard
11. [CD-15](./CD-15-provider-review-submission.md) — Submit-for-review + lock
12. [CD-09](./CD-09-supervision-signoff.md) — Provider sign-off queue
13. [CD-10](./CD-10-billing-sync-candid.md) — Candid sync (terminal node)

## Critical revenue path
`CD-17 → CD-08 → CD-15 → CD-09 → CD-11 → CD-10` (also blocked by DA-08 billing rules + DA-02 interaction validation). Any slip delays revenue.

## External dependencies (must be negotiated before build)
- **Bridge** API contract (270/271 or REST), SLA, auth — blocks CD-11
- **Candid** API contract, sandbox, BAA — blocks CD-10
- **Telehealth vendor** selection (Zoom Health / Doxy.me / Twilio Video / Daily.co) + BAA — blocks CD-06
- **DA-08** billing rule config schema — blocks CD-10 and CD-17 threshold config
- **DA-12** unified consent model — blocks CD-05
- **DA-13** audit event contract — blocks every ticket

## Cross-cutting requirements (apply to every ticket)
- **Provenance tag** (CE/BA/Dual) on every PHI record (DA-11)
- **Audit event** (DA-13) on every read/write/export
- **RBAC** gate (DA-14) on every API and UI action
- **WCAG 2.1 AA** on member-facing surfaces
- **Page load <2s**, API p95 <500ms (NFR §5.1)
- **Offline mode** for CHW-used surfaces (CM-13 sync contract)

## Out of scope for this module
- Self-serve patient scheduling (CD-01), reminders (CD-02), visit summary delivery (CD-03), post-visit feedback survey (CD-04), staff-initiated scheduling (CD-12), patient prioritization (CD-16) — not in Track 1 archive, deferred.
- SMA / group visits (CD-20) — Phase 3.

## Legend
- ⭐ hero (on-stage demo moment)
- ✓ in-flow (must work)
- ◯ supporting (thin-slice OK)

## Design system (shared)
Every CD ticket builds on the prototype in [Design/](../../Design/):
- **Tokens** — [`Design/assets/wc-tokens.css`](../../Design/assets/wc-tokens.css). Color (neutral spine `--wc-base-0…900`; brand orange `--wc-brand-500` #F27321, gold `--wc-brand-200` #FCB713; semantic error/warning/success/info). Typography (Montserrat display, Inter body, Azeret Mono for IDs/numbers). Radii: buttons 15, cards 20, pills/badges 30. Spacing scale 4/8/10/12/16/20/24/32.
- **Primitives** — [`Design/src/primitives.jsx`](../../Design/src/primitives.jsx): `Btn` (primary/brand/secondary/tertiary/danger/ghost · sm/md/lg), `Badge` (8 tones + optional dot), `Avatar`, `Tabs` (underline / pill), `Card`, `Field` + `Input`/`Select`/`Textarea`, `Chip`, `Toggle`, `ChannelGlyph`, plus 30+ stroke-style icons (`Icon.*`).
- **Shell** — [`Design/src/shell.jsx`](../../Design/src/shell.jsx): 72px dark **LeftRail** (Home · My queue · Members · Events · Messaging · Billing · Reporting · Admin), 60px **TopBar** (⌘K search, incoming-call pulse, Tweaks, persona role badge, bell).
- **Patient 360 backbone** — [`Design/src/patient360.jsx`](../../Design/src/patient360.jsx): 320px left sticky member panel (avatar 72 + name + pronouns/age/DOB + RiskBadge + Consent badge + Ask Claire badge + Call/SMS actions + KeyInfoRows + Quick-context box) **or** alternative top sticky header. Body = tabs (**Overview · Activity · Cases · Clinical · SDoH & Social · Events**). Each CD ticket specifies what it adds to which tab or modal.

**Ship rules** — do not introduce alternative buttons/badges/cards. Compose from primitives. Preserve token names in CSS (no hardcoded hex). Sticky member panel is the default layout (Tweak `headerLayout='left'`).

**Cross-cutting UI** — every surface: WCAG AA focus ring (2px `brand-500` + 2px offset), skeleton per-section loading, inline error alerts with retry, provenance chip (CE/BA/Dual monospace) in member header and any PHI export, animated fade-in + 1px left accent for 3s on real-time updates.

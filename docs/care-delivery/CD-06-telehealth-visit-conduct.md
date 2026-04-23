# CD-06 — Telehealth Visit Conduct

**Phase 1 · Must · Persona: Provider · Demo role: ⭐ hero (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-06-telehealth-visit-conduct.md`

## Goal
Launch and conduct a video visit embedded alongside the clinical chart. No context switch to external Zoom/Healthie. Session metadata feeds billing duration.

## In scope
- "Launch Visit" gated by valid consent (CD-05) + present member
- Embedded/deep-linked vendor video panel + CD-08 chart pane side-by-side
- Session metadata: actual start/end, participant join/leave, billable duration (excludes reconnect gaps)
- Connection error + reconnect UX
- Optional session recording gated by recording-consent (DA-12)

## Out of scope
Plan authoring (CD-08), billing sync (CD-10), patient waiting-room UX (vendor).

## Key acceptance criteria
- Invalid consent → consent block appears; no video (AC-1)
- Video + chart both interactive side-by-side (AC-2)
- Duration accurate ±2s (AC-3); gaps excluded from billable (AC-4)
- Recording blocked without recording-consent (AC-6)

## API
- `POST /v1/encounters/{id}/video-sessions` → vendor session token/deep-link
- `POST /v1/encounters/{id}/video-sessions/{sid}/end`
- Vendor webhook → platform for participant/recording events

## Depends on
CM-02, CD-05, CD-07, DA-13

## Blocks
CD-08, CD-10

## Performance
Launch → first frame <5s p95; reconnect <10s

## Stop-and-ask triggers
Vendor change · BAA modification · recording-consent enforcement logic · duration calculation · cross-state licensure checks · recording retention

## UI

Shared DS: [README](./README.md#design-system-shared). Primitives: [`Design/src/primitives.jsx`](../../Design/src/primitives.jsx).

**New surface — "Visit Workspace"** (route `/encounters/{id}/workspace`, replaces Patient 360 tabs while encounter is In Progress).

- Layout: **60/40 vertical split**, resizable divider (8px hit, hover brand-500). Left = video pane; right = Plan of Care editor (CD-08) + inline notes.
- Top strip (sticky, 56px, white, border-bottom `base-200`): Avatar 40 + member name (Montserrat 16/700) + mono Plan ID + `Badge tone="success" dot` "Consent on file" + `Icon.timer` billable-duration live counter (mono MM:SS) + encounter status `Badge tone="info"` ("In Progress").
- **Launch CTA** on CD-07 pre-visit chart: brand `Btn size="lg"` "Launch Visit" with `Icon.phone`. Disabled until consent valid + member present; hover tooltip explains blockers.
- **Video pane**: full-bleed vendor SDK iframe inside a `base-800` panel, radius 15. Controls (vendor-provided) appear bottom-center on hover. Top-right: quality indicator dot (green/warning/error) + `Icon.more` menu. Participant count chip top-left. "Leave" = secondary; "End visit" = danger `Btn` (confirms before firing).
- **Reconnect state**: video pane shows a centered `Icon.alert` warning card on `warning-100` background with "Reconnecting…" and a subtle `Icon.activity` animated line. Billable-timer pauses and chips warning.
- **Recording banner**: when program enables recording and consent on file, pinned strip at top of video pane shows `Icon.mic` + "Recording" + `Badge tone="error"`. If recording-consent missing when user tries to record → inline prompt to capture recording-consent (reuses CD-05 modal pattern) or proceed without.
- **States**: scheduled-not-launched (Launch button active in CD-07) · launching (spinner) · connecting (skeleton video + vendor placeholder) · in-progress · paused (network drop) · reconnecting · ended (transition back to Patient 360 with summary card) · error.

**Tokens used** — `--wc-base-800` (video panel), `--wc-brand-500` (Launch), `--wc-success-500` (quality good), `--wc-warning-500` (reconnect), `--wc-error-700` (End/record), `--wc-radius-lg` (panel).

## Open questions
1. **Vendor selection** (Zoom Health / Doxy.me / Twilio Video / Daily.co) — blocks build
2. State licensure automated check vs manual confirm
3. Recording retention policy
4. Mobile Provider support Phase 1?

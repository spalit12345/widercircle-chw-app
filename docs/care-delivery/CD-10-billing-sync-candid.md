# CD-10 — Billing Documentation Sync (Candid)

**Phase 1 · Must · Persona: Provider/Biller · Demo role: ◯ supporting (Act 2)**
Full ticket: `Archive (1)/act-2-ongoing-chw/CD-10-billing-documentation-sync.md`

## Goal
Terminal node of revenue pipeline. On encounter close with approved sign-off, build billing payload, re-check eligibility if stale, push to Candid. Idempotent; failures retry.

## Revenue critical path
`CD-17 → CD-08 → CD-15 → CD-09 → DA-08 → DA-02 → CD-10`

## In scope
- Trigger: encounter close + Plan Approved (CD-09)
- Pre-sync validation per DA-08 rules; missing-field → flagged for review
- Eligibility re-check via CD-11 if >7d stale; Inactive → blocks sync
- Payload construction per Candid contract; idempotent by encounter_id + version hash
- Sync status: Pending → Submitted → Accepted | Rejected
- Retry queue + ops dashboard

## Out of scope
DA-08 rule config, DA-02 validation, CD-17 time tracking, CD-11 checks themselves, claim status/adjustments.

## Key acceptance criteria
- Happy path submits within 30s (AC-1)
- Missing required field → blocked + ops alert (AC-2)
- Inactive eligibility → blocked + alert (AC-3)
- Re-sync on re-close does not double-bill (AC-4)
- Sync status visible per encounter in ops dashboard (AC-6)

## Data model
**Sync Record** (sync_id, encounter_id, payload_hash, vendor=`candid`, vendor_response, status, submitted_at, accepted_at, latency_ms, retry_count, error_code, provenance_tag)

## API
- Internal: encounter-close hook → background orchestrator
- External: Candid REST (contract TBD)
- `GET /v1/billing/sync-records?status=&from=`
- `POST /v1/billing/sync-records/{id}/retry`

## Depends on
CD-08, CD-09, CD-11, CD-17, DA-08, DA-02, DA-13

## Performance
Encounter close → submit <30s p95; Candid latency tracked separately

## Rollout
Shadow mode (compute + log, no submit) before enabling live. Per-program cutover.

## Stop-and-ask triggers
Candid contract change · payload PHI scope · idempotency keying · auto-resubmit beyond explicit retry rules · provenance enforcement in payload · manual bypass of validation

## UI

Shared DS: [README](./README.md#design-system-shared).

Mostly backend. UI surfaces are (a) ops dashboard, (b) informational badge on the encounter detail, (c) alert toasts.

**Ops billing dashboard** — under LeftRail **Billing** nav. Route `/billing/sync`.

- **Page header**: H1 "Billing sync" · date range picker (reuse `Select`) · status filter `Chip` group (All · Pending · Submitted · Accepted · Rejected · Blocked · Manual review). Right: KPI strip — 4 `VitalTile`-style cards (Today submitted / Accepted rate / Rejected / Queue depth) using `success-700` / `error-700` deltas.
- **Sync record table** — dense `SectionCard pad={0}` with rows:
  - Status `Badge dot` (tone per state), encounter ID (mono), member Avatar 24 + name, Provider, program chip, amount, submitted-at, latency (mono ms).
  - Kebab: View payload · Retry · Send to manual review.
- **Detail drawer** — right 640 panel: Payload JSON (monospace block in `base-50` bg, radius 12, copy button), vendor response section, sync history timeline (reuse `Timeline` primitive — each attempt is a row with `ChannelGlyph channel="system"`).
- **Blocked-validation** state row: `Icon.alert` warning + "Missing CPT code" + "Open encounter" link.
- **Blocked-eligibility** state row: `Icon.alert` error + "Eligibility inactive — re-check" with inline `Btn` that fires CD-11 re-check.
- **Provider-facing** (informational, in Patient 360 Clinical tab "Billing" `SectionCard`): row per encounter with sync-status `Badge` · "Pending / Submitted / Accepted / Rejected" — non-actionable for Provider.
- **Toasts**: success (`success-100` bg, `Icon.check`) on submit; error (`error-100`, `Icon.alert`) on rejection, click → opens detail drawer.
- **States**: pending, submitted, accepted, rejected, blocked-validation, blocked-eligibility, retry-queued, manual-review.

**Tokens used** — `--wc-base-50` (JSON blob bg), `--wc-success-700` / `--wc-error-700` (status tones), mono font for all IDs/amounts.

## Open questions
1. **Candid API** — REST/SOAP, auth, rate limit, sandbox (§4 TBD)
2. ICD-10 source — from Plan or external chart?
3. Multi-program split logic?
4. Resubmit policy — auto vs ops-driven?
5. Late documentation merge with submitted claim?

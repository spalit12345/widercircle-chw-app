# CD-11 — Eligibility Check (Bridge)

**Phase 1 · Must · Persona: Clinical Staff · Demo role: ✓ in-flow (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-11-eligibility-check.md`

## Goal
One-click real-time payer eligibility lookup via Bridge. Results stored on member; history retained.

## In scope
- "Check Eligibility" button on member profile + scheduling flows
- Sync Bridge API call (270/271-equivalent) with 5s timeout
- Display: Active/Inactive/Pending/Error + plan, effective/termination dates, copay/deductible
- Persist most-recent result on member; full history retained (no overwrite)
- Status surfaced in CM-03 member header
- Re-checks allowed; staleness indicator after 7 days

## Out of scope
Batch eligibility (pipeline), claim submission (CD-10), eligibility-driven case auto-creation (CM-01).

## Key acceptance criteria
- Successful lookup <5s, displayed inline (AC-1)
- Result persists + shows checked_by/timestamp (AC-2)
- Timeout → retry CTA + logged (AC-3)
- RBAC: CHW without permission sees status but no Check button (AC-4)

## Data model
**Eligibility Check** (check_id, member_id, checked_by, checked_at, source=Bridge, status, plan_name, plan_id, effective_date, termination_date, copay, deductible, raw_response_blob_id, latency_ms, error_code)

## API
- `POST /v1/members/{id}/eligibility-checks`
- `GET /v1/members/{id}/eligibility-checks?limit=10`

## Depends on
CM-02, DA-13; **Bridge** API contract + SLA + auth (TBD — §4)

## Blocks
CD-12, CD-10, CM-22

## Performance
Round-trip <5s p95 (Bridge-bound); render <500ms post-response

## Stop-and-ask triggers
Bridge contract change · expanded PHI sent to Bridge · retention policy change · adding eligibility check to new flows

## UI

Shared DS: [README](./README.md#design-system-shared).

**Check button** — surfaced in two places:

1. **Member profile / sidebar** (`MemberSidePanel`) — inside the "Quick context" box or as a dedicated `SectionCard` "Eligibility" with secondary `Btn size="sm"` **Check eligibility** (`Icon.shield` leading). If never checked, shows `Empty` "No eligibility check on file yet." If last check stale (>7d), button becomes gold-tone `Chip` "Last checked 9d ago — Re-check".
2. **Scheduling modal** (CD-12) — inline `Btn secondary` at top of the form; result auto-populates before allowing save.

**Result display** — inline expandable card (not a modal) rendered beneath the button:

- **Active**: `success-100` bg, 1px `success-300` border, radius 15. `Icon.check` success-700 + "Active · {Plan name}". Sub-line: effective date · termination date · copay · deductible. Right-aligned meta: checked at / checked by avatar. Monospace for IDs.
- **Inactive**: `error-100` bg, `Icon.alert` error-700, "Inactive eligibility" + reason if Bridge returned one. `Btn` "Verify member identity" · "Re-check".
- **Pending**: `info-100` bg, spinner + "Eligibility pending — try again shortly".
- **Error / timeout**: neutral card with error-700 `Badge` + "Service slow" + "Retry" tertiary `Btn`.
- **Member not found**: error tint + "Member not found at Bridge" + "Verify identity" flow.

**Header chip** — `MemberTopHeader` / `MemberSidePanel` shows a small `Badge dot` next to name: "Active · {plan}" (success) or "Inactive" (error) or gold "Eligibility stale". Click scrolls to the Eligibility card.

**History drawer** — opened via "View history" link: right-side 480 drawer, rows of past checks (most recent first) with status dot + plan + date + checked_by avatar + "View raw" (opens payload monospace block).

**Loading state** — button flips to a 14×14 `Icon.activity` animated spinner + "Checking…"; expected to resolve <5s.

**Tokens used** — `--wc-success-*` / `--wc-error-*` / `--wc-warning-*` semantic tints, mono font for plan/member IDs, `--wc-radius-lg` for the result card.

## Open questions
1. REST vs X12 270/271, auth model, vendor SLA
2. Staleness threshold — 7d, 30d?
3. Multi-plan member display rules
4. Self-pay path
5. Retroactive eligibility changes (re-flag historical claims)

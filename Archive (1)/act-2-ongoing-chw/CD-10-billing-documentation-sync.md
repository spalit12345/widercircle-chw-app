---
id: CD-10
title: "Billing Documentation Sync (Candid)"
source_requirement: CD-10
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: care-delivery
phase: 1
priority: must
persona: provider
secondary_personas: [biller, ops-manager, system-admin]
labels: [demo-5-5, track-1, billing, integration-candid, integration-bridge, revenue]
blocked_by: [CD-08, CD-09, CD-11, CD-17, DA-08, DA-02]
blocks: []
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-10 — Billing Documentation Sync (Candid)

## Background & User Context

The end of the clinical chain. After Plan is authored (CD-08), staff time tracked (CD-17), Provider has signed off (CD-09), and eligibility verified (CD-11), the structured billing data needs to push to Candid (RCM) without manual re-entry. Today this is a manual export — slow and error-prone.

The dependency chain in the v2 doc (CD-10 AC): CD-17 → CD-08 → CD-09 → DA-08 → DA-02 → CD-10. Anything slipping upstream delays revenue.

## User Story

As a Provider, I want clinical documentation to sync automatically with the RCM system (Candid) on encounter close, with eligibility pre-checked via Bridge — so claims submit without manual entry and billing is timely.

## Scope

**In scope:**
- On encounter close (visit ended + Plan signed off): construct billing payload (CPT, duration, provider, member, dates, ICD codes if applicable)
- Eligibility pre-check via Bridge (CD-11) before sync if not recently checked
- Push payload to Candid API
- Sync status visible in admin / billing dashboard
- Failed syncs alert and queue for retry / manual review
- Idempotency: re-sync of same encounter does not double-bill

**Out of scope / Non-goals:**
- Billing rule configuration → DA-08
- Interaction validation → DA-02
- Time tracking → CD-17
- Eligibility checks themselves → CD-11
- Claim status visibility / write-offs / adjustments — billing-team workflows beyond scope here

## Functional Requirements

1. Trigger: encounter close with Plan in Approved sign-off state.
2. Pre-sync: validate per DA-08 billing rules (required fields present, time threshold met, etc.); if fails, encounter status flagged for review.
3. Eligibility re-check via CD-11 if last check >7 days old; if Inactive, sync blocked with alert.
4. Construct payload per Candid contract; submit via Candid API.
5. Sync status persisted: Pending → Submitted → Accepted | Rejected.
6. Failures alert ops; retry queue.
7. Idempotency: encounter_id + version hash prevents duplicate submission.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Successful sync on close**
- *Given* Maria's encounter closed with signed-off Plan and active eligibility
- *When* close action triggers
- *Then* payload constructed and submitted to Candid within 30s; sync status = Submitted

**AC-2 — Validation failure flagged**
- *Given* an encounter close with missing required field (e.g., no CPT code)
- *When* close triggers
- *Then* sync blocked; encounter flagged "Pending billing review"; ops notified

**AC-3 — Inactive eligibility blocks**
- *Given* an encounter close where re-check returns Inactive eligibility
- *When* sync attempted
- *Then* sync blocked; alert raised; manual review path

**AC-4 — Idempotent re-sync**
- *Given* an encounter previously synced successfully
- *When* sync re-attempted (e.g., re-close)
- *Then* no duplicate submission to Candid; existing sync record returned

**AC-5 — Audit logged**
- *Given* any sync attempt (success or fail)
- *When* it occurs
- *Then* DA-13 audit event written with encounter_id, payload hash, outcome, latency

**AC-6 — Sync status visible**
- *Given* an ops user viewing billing dashboard
- *When* they look at recent encounters
- *Then* sync status visible per encounter; failures highlighted

## Data Model

**Sync Record (write):**
- sync_id, encounter_id, payload_hash, vendor=`candid`, vendor_response, status (pending/submitted/accepted/rejected), submitted_at, accepted_at (nullable), latency_ms, retry_count, error_code (nullable), provenance_tag

**Encounter (update):** billing_sync_status, last_sync_id

## API Contract

- Internal: encounter close hook fires sync orchestrator (background job)
- External: Candid REST API per vendor contract (TBD — see Open Questions)
- Bridge re-check via CD-11 endpoint
- `GET /v1/billing/sync-records?status={...}&from={...}` → ops dashboard
- `POST /v1/billing/sync-records/{id}/retry` → manual retry

## UI / UX Specification

- Ops billing dashboard: list of recent encounters with sync status, filter by status / date / provider
- Per-encounter detail: sync history, payload (with PHI handling), retry button
- Provider-facing: sync status visible on encounter detail (informational; not actionable)

**States:** pending, submitted, accepted, rejected, blocked-validation, blocked-eligibility, retry-queued, manual-review

## Edge Cases & Error Handling

- Candid API down → retry with exponential backoff; queue persists
- Candid rejects payload → status=Rejected, payload + reason captured, ops notified
- Encounter closed before Plan signed → sync blocked until sign-off (CD-09)
- Time entry edits after sync (CD-17 supervisor edit) → flag for re-sync evaluation
- Multi-program encounter → split into multiple Candid submissions per program rules
- Late-arriving documentation → re-evaluate billing; allow re-sync with version hash

## Security, Privacy & Compliance

- **PHI:** payload contains member identity + clinical codes
- **Provenance:** sync respects provenance tag; CE/BA rules enforced (don't sync BA-only data via WC-as-CE pipeline)
- **Consent:** assumes Telehealth/CHI consent verified upstream (CD-05)
- **RBAC:** sync-record read scoped to billing/ops roles
- **Audit:** every sync attempt; payload hash for forensics
- **Vendor BAA:** required for Candid

## Observability

- Metrics: sync success rate, mean latency, rejection rate by reason, queue depth, retry success rate
- Alerts: success rate <95% (10min), Candid outage, queue depth >X, validation-block spike (data quality)
- Dashboards: billing pipeline health

## Performance Budget

- Encounter close → sync submitted <30s p95
- Candid API call latency tracked separately (vendor-bounded)

## Dependencies & Sequencing

**Blocked by:** CD-08, CD-09, CD-11, CD-17, DA-08, DA-02
**External:** Candid API + BAA; Bridge for re-check

## Test Strategy

**Unit:** payload construction, validation rules, idempotency
**Integration:** end-to-end encounter close → Candid sandbox → status update; eligibility-blocked path
**E2E:** Track 1 Act 2 supporting flow (Provider sees sync status post-visit)
**Compliance:** audit emitted, RBAC enforced, payload PHI handling
**Performance:** burst of 100 encounter closes
**Fixtures:** Candid sandbox responses (success, rejection scenarios), eligibility-inactive scenario

## Rollout

- **Feature flag:** `billing_sync_candid_v1`
- Pilot: shadow mode (compute payloads, log only) before live submission to Candid
- Cutover: enable for one program first, expand
- Rollback: disable sync, fall back to manual export

## Definition of Done

- [ ] All ACs pass
- [ ] Candid sandbox + production endpoints validated
- [ ] BAA executed
- [ ] Idempotency proven under retry / re-close
- [ ] Validation rules from DA-08 integrated
- [ ] Eligibility re-check integrated
- [ ] Audit log emitted
- [ ] Ops dashboard live for billing team
- [ ] Bridge SLA + Candid SLA documented in §4

## Success Metric in Production

- **Reliability:** sync success rate ≥95%
- **Speed:** median encounter-close → Candid-submit <60s
- **Revenue:** % of billable encounters synced ≥98% (vs. manual gap baseline)
- **Quality:** rejection rate <5%

## Stop-and-Ask-the-Human Triggers

- **Candid contract change** (auth, payload, endpoints)
- Changes to **payload PHI scope** (minimum-necessary)
- Changes to **idempotency keying** (impacts duplicate-prevention)
- Adding any **auto-resubmit on rejection** beyond explicit retry rules
- Changes to **provenance enforcement** in payload construction
- Adding **manual override** that bypasses validation

## Open Questions

1. Candid API specifics — REST/SOAP, auth model, rate limit, sandbox availability — TBD per §4
2. ICD-10 / problem-list source — Plan has it? Pulled from external chart?
3. Multi-program billing rules — splitting logic per program?
4. Resubmit policy on rejection — automatic vs. ops-driven?
5. Late documentation — how does it merge with already-submitted claim?

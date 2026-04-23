---
id: CD-11
title: "Eligibility Check (Bridge Integration)"
source_requirement: CD-11
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: clinical-staff
secondary_personas: [chw, provider]
labels: [demo-5-5, track-1, integration-bridge, eligibility, billing-prereq]
blocked_by: [CM-02, DA-13]
blocks: [CD-12, CD-10, CM-22]
parallel_safe_with: [CD-07, CD-05]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-11 — Eligibility Check (Bridge Integration)

## Background & User Context

Before scheduling a visit or starting time-based billing work, clinical staff need to confirm the member's payer eligibility is currently active. Today this is a separate Bridge lookup outside the platform — slow, error-prone, and not stored alongside the rest of the member context. Inactive eligibility caught after the fact means uncompensated care.

This requirement is part of the demo intake-visit setup: the CHW (or clinical staff) verifies eligibility right before the Provider opens the telehealth visit.

## User Story

As a clinical staff member, I want a one-click eligibility check that calls Bridge and stores the result on the member record, so I know in seconds whether the member is in-network and billing is justified.

## Scope

**In scope:**
- "Check Eligibility" button on member profile and scheduling flows
- Real-time Bridge API call (270/271-equivalent transaction)
- Result display: Active / Inactive / Pending / Error, with plan name, effective date, termination date, copay/deductible if returned
- Persistence of last check result + timestamp on member record
- Audit trail of every check

**Out of scope / Non-goals:**
- Batch eligibility checks (handled by data ingestion pipeline)
- Claim submission → CD-10
- Eligibility-driven case auto-creation → CM-01 (lives downstream)
- Bridge integration infrastructure → engineering platform scope

## Functional Requirements

1. "Check Eligibility" button visible to authorized roles on member profile and scheduling UI.
2. Check fires Bridge API call (synchronous, with timeout).
3. Result displayed inline within 5s (or timeout error with retry option).
4. Result saved to member record: status, plan, effective/termination dates, check timestamp, checked_by.
5. Most-recent eligibility status visible in member header (CM-03) when configured.
6. Re-checks allowed; full history retained (not overwritten).
7. Failed/timeout checks logged with error context for diagnostics.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Successful eligibility check**
- *Given* an authorized clinical staff user on a member profile
- *When* they click "Check Eligibility"
- *Then* the Bridge API is called and result returns in <5s, displayed inline with status, plan, dates

**AC-2 — Result persisted**
- *Given* a successful eligibility check
- *When* the user navigates away and returns
- *Then* the most recent result is visible with timestamp and checked-by attribution

**AC-3 — Timeout handled gracefully**
- *Given* Bridge API does not respond within 5s
- *When* the check is attempted
- *Then* user sees "Eligibility service slow — retry?" with retry button; failed attempt logged

**AC-4 — RBAC scoped**
- *Given* a CHW with no clinical-eligibility permission
- *When* viewing the member profile
- *Then* the "Check Eligibility" button is absent; eligibility status is still visible if previously checked

**AC-5 — Audit logged**
- *Given* any user performs an eligibility check
- *When* the API call completes (success or fail)
- *Then* a DA-13 audit event is written with member_id, user_id, result, latency, source=Bridge

## Data Model

**Eligibility Check (write):**
- check_id, member_id, checked_by, checked_at, source=Bridge, status (Active/Inactive/Pending/Error), plan_name, plan_id, effective_date, termination_date, copay, deductible, raw_response_blob_id, latency_ms, error_code (nullable)

**Member (update):** last_eligibility_check_id reference

**PHI:** member identity (sent to Bridge), plan details (returned)

## API Contract

- `POST /v1/members/{id}/eligibility-checks` → fires Bridge call, returns result + check_id
- `GET /v1/members/{id}/eligibility-checks?limit=10` → history
- Backend uses outbound integration service to call Bridge with retry/idempotency

## UI / UX Specification

- Button placement: member profile (in clinical-summary section), scheduling modal (pre-booking)
- Success: inline panel with status (color-coded: green/red/yellow), plan, dates
- Error: inline alert with retry, error code visible to admins (not patient-facing language)
- Loading: button → spinner; <5s expected
- Result staleness: if last check >7 days old, "Re-check" CTA prominent

## Edge Cases & Error Handling

- Bridge returns "Member not found" → display clearly; offer to verify member identity
- Bridge returns plan info that disagrees with member record → flag for admin reconciliation
- Bridge returns multiple plans → display all; primary shown in header
- Network error or timeout → retry available; failure logged; previous result retained
- Member has no insurance on file → button disabled with explanation
- Rate limit hit on Bridge → exponential backoff; user-visible "high traffic, retrying"

## Security, Privacy & Compliance

- **PHI:** member identity sent to Bridge; result PHI stored
- **Provenance:** eligibility result inherits member's provenance tag
- **Consent:** N/A — eligibility check is part of care/payment operations under HIPAA TPO
- **RBAC:** check action gated to clinical-eligible roles
- **Audit:** every check logged; raw Bridge response retained for compliance

## Observability

- **Logs:** every Bridge call with latency, status, member (hashed in non-prod)
- **Metrics:** check rate, success rate, p95 latency, error-rate by error code
- **Alerts:** Bridge error rate >5% (10min), latency p95 >5s, total Bridge unavailable
- **Dashboards:** Bridge integration health

## Performance Budget

- Eligibility check round-trip <5s p95 (constrained by Bridge SLA)
- Display render <500ms after API response

## Dependencies & Sequencing

**Blocked by:** CM-02 (member context), DA-13 (audit)
**Blocks:** CD-12 (scheduling depends on eligibility), CD-10 (billing depends on eligibility), CM-22 (ECM depends on eligibility status)
**External contracts:** Bridge API (270/271 or REST equivalent); SLA, rate limit, auth model needed before build

## Test Strategy

**Unit:** result-mapping logic; error-code translation
**Integration:** Bridge sandbox round-trip (success, inactive, error, timeout cases)
**E2E:** intake-visit demo flow (Track 1)
**Compliance:** audit emission verified
**Performance:** Bridge timeout simulation
**Fixtures:** mocked Bridge responses for each status case

## Rollout

- **Feature flag:** `eligibility_check_v1`
- **Rollout:** internal pilot with synthetic members against Bridge sandbox before production
- **Rollback trigger:** Bridge error rate >10%, false-active results detected

## Definition of Done

- [ ] All ACs pass
- [ ] Bridge sandbox + production endpoints validated
- [ ] Audit log emitted per check
- [ ] RBAC enforced
- [ ] Performance budget met
- [ ] Bridge integration runbook published (rate limit, auth refresh, error escalation)
- [ ] Bridge contract / SLA documented in §4
- [ ] PHI handling reviewed

## Success Metric in Production

- **Reliability:** check success rate ≥99% (excluding Bridge-side outages)
- **Adoption:** ≥80% of new visits preceded by an eligibility check within 30 days
- **Revenue protection:** zero billed claims for inactive members (false-positive rate = 0)

## Stop-and-Ask-the-Human Triggers

- Bridge API contract change (auth, payload, endpoints)
- Any change that would store or transmit additional PHI to Bridge beyond the agreed minimum-necessary set
- Any change to eligibility-result retention policy
- Adding eligibility check to a flow that previously didn't require it (workflow scope change)

## Open Questions

1. Bridge API specifics — REST or X12 270/271? Auth model? Vendor SLA? (Open question §4 — TBD)
2. Eligibility-result staleness threshold — when to require a re-check? 7 days? 30?
3. Multi-plan members — primary plan display rules?
4. Self-pay members — workflow path when no insurance returned
5. Retroactive eligibility changes — how to handle (re-flag historical claims)?

---
id: CM-22
title: "ECM Outreach Attempt Tracking & Billable Cap Enforcement"
source_requirement: CM-22
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: case-management
phase: 1
priority: must
persona: chw
secondary_personas: [case-manager, ops-manager, biller]
labels: [demo-5-5, track-1, hero, ecm, billing, revenue, per-client-config]
blocked_by: [CM-09, CM-02, DA-08, DA-12, DA-13]
blocks: []
parallel_safe_with: [CD-17]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-22 — ECM Outreach Attempt Tracking & Billable Cap Enforcement

## Background & User Context

ECM (Enhanced Care Management, California Medi-Cal) is a per-member-per-month (PMPM) billable program with strict outreach attempt rules. Different MCO clients impose different caps: 10 attempts for one, 15 for another. Different time windows: 60 days, 90 days. Without per-client visibility, CHWs either undercount billable work (lost revenue) or keep outreaching past the cap (wasted non-billable effort).

In the demo: Maria is an ECM-eligible member. CHW sees a clear "8 of 10 attempts used, 22 days remaining in window" indicator on Maria's profile. Each attempt logged via CM-09 communication channels feeds the counter. ECM consent (DA-12) gates billability.

## User Story

As a CHW working ECM members, I want the system to track every outreach attempt against the per-client billing cap and time window, so I know which attempts will be billable and stop wasting effort on non-billable attempts after the cap is hit.

## Scope

**In scope:**
- ECM cap counter: per-member display showing attempts used / cap, days remaining in window, billable vs. non-billable breakdown, consent status
- Per-client billing rule configuration (admin-managed via DA-08): max billable attempts, time window from referral/eligibility, eligible attempt types, terminating-attempt definition
- Counter derives from CM-09 communication history filtered by attempt-type rules
- ECM consent (DA-12) gating: attempts before consent are non-billable but logged
- Cap-reached / window-expired flag (no hard block per design choice)
- Reporting dashboards: ECM utilization across caseload, members approaching cap, billable revenue captured vs. potential, per-client breakouts

**Out of scope / Non-goals:**
- General outreach logging → CM-09 is the source
- Time-based billing → CD-17 (different rule)
- ECM enrollment / eligibility — handled at member-record level (program tagging)
- Hard-stop enforcement at cap (design choice: flag-only; see Open Questions)

## Functional Requirements

1. ECM-eligible members display an "ECM Tracking" panel in member profile (CM-02) and in CHW view (CM-13).
2. Panel content: cap (e.g., 8 of 10), window remaining ("22 days remaining of 90-day window"), consent status, billable/non-billable counter, visual indicator (green pre-cap, orange near-cap, red post-cap or window-expired).
3. Each new outreach attempt logged via CM-09 is evaluated against ECM rules: counts toward cap if (a) attempt type is eligible per client config, (b) consent on file, (c) within time window, (d) cap not reached.
4. Cap-reached behavior: further attempts allowed; flagged "non-billable — cap reached" in logs and panel.
5. Window-expired behavior: same flag pattern.
6. Reporting: ops dashboard shows utilization, near-cap members, captured revenue vs. potential, per-client breakouts.
7. Per-client config (admin via DA-08): cap, window length, eligible attempt types, terminating-attempt code (defines what counts as "successful enrollment" — terminates further billable attempts).

## Acceptance Criteria (Given/When/Then)

**AC-1 — Counter visible on ECM member**
- *Given* an ECM member with 8 attempts in CM-09 history
- *When* CHW opens member view
- *Then* ECM panel shows "8 of 10 attempts used", "22 days remaining", consent status, color-coded indicator

**AC-2 — Attempt counts when valid**
- *Given* ECM member with consent on file, within window, cap not reached
- *When* CHW logs a phone call attempt (eligible type per client config)
- *Then* counter increments to 9; attempt flagged "billable"

**AC-3 — Attempt does not count without consent**
- *Given* ECM member without ECM consent on file
- *When* CHW logs an outreach attempt
- *Then* attempt logged, flagged "non-billable — no consent"; counter does not increment

**AC-4 — Cap-reached behavior**
- *Given* ECM member at 10 of 10 cap
- *When* CHW logs an 11th attempt
- *Then* attempt logged, flagged "non-billable — cap reached"; CHW sees clear indicator; outreach not blocked

**AC-5 — Window expiration**
- *Given* ECM member, day 91 of 90-day window
- *When* CHW logs an attempt
- *Then* attempt flagged "non-billable — window closed"

**AC-6 — Per-client config respected**
- *Given* MCO Client A with cap=10/90d, MCO Client B with cap=15/60d
- *When* CHW views members from each client
- *Then* each member's panel reflects their client's specific rules

**AC-7 — Reporting dashboard**
- *Given* an Ops Manager
- *When* they open the ECM dashboard
- *Then* they see: caseload utilization (% of cap used per cohort), members approaching cap, captured revenue vs. potential, breakouts by client

**AC-8 — Audit logged**
- *Given* any attempt logged or counter recompute
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

**ECM Member Tag (read on Member):** ecm_eligible bool, ecm_client_id, ecm_referral_date, ecm_window_end_date

**ECM Rule Config (read; admin-managed via DA-08):** client_id, max_billable_attempts, window_days, eligible_attempt_types[], terminating_attempt_code

**ECM Attempt View (computed from CM-09 Interactions):** filters Interactions matching eligible_attempt_types for ECM members; flags each as billable/non-billable per rule evaluation

**No new entity** — derives counter from existing Interaction (CM-09) + Consent (DA-12) + Member program enrollment.

## API Contract

- `GET /v1/members/{id}/ecm-summary` → returns counter, window, consent status, recent attempt list with billable flags
- `GET /v1/ecm/dashboard?cohort={...}` → ops dashboard data
- Attempt logging happens via CM-09 endpoints; ECM evaluation is a side-effect computation (background job or read-time compute)

## UI / UX Specification

- **ECM panel** in member profile and CM-13 view: card with cap counter (large numeric), window remaining, consent indicator, recent-attempts mini-list with billable badges
- Color states: green (sub-80% cap, in window, consent), orange (≥80% cap, in window), red (cap reached or window expired)
- Click-through to full ECM history view
- Ops dashboard: cohort table with sortable columns, utilization chart over time, drill-down to member

**States:** loading, default, near-cap warning, cap-reached, window-expired, no-consent, not-ecm-eligible (panel hidden)

## Edge Cases & Error Handling

- Member transitions out of ECM mid-window → window stops; historical counter retained
- Re-enrollment in ECM (new period) → new window starts; previous period preserved
- Multiple ECM clients per member (rare) → not supported initially; flag as data issue
- Retroactive Interaction added (e.g., late-logged call from 5 days ago) → recompute counter; if it crosses cap, prior subsequent attempts flagged appropriately
- Client config change mid-window → new rule applies prospectively; in-progress members keep their period's rules
- Consent revoked mid-window → future attempts non-billable; prior billable attempts retained

## Security, Privacy & Compliance

- **PHI:** all attempt data (member-level interactions)
- **Provenance:** inherits member's tag
- **Consent:** ECM consent (DA-12 type) gates billability — central to feature
- **RBAC:** ECM panel visible to CHW/CM with assignment, ops dashboard scoped to managers
- **Audit:** counter recomputes, attempt evaluations, configuration changes
- **Billing integrity:** attempts flagged non-billable cannot be re-classified as billable without supervisor + reason

## Observability

- Metrics: ECM members tracked, mean utilization per cohort, % at-cap per month, captured-vs-potential revenue, evaluation latency
- Alerts: counter computation failures, configuration mismatches per client

## Performance Budget

- Panel render <500ms
- Ops dashboard <2s
- Attempt evaluation in background <5s after Interaction creation

## Dependencies & Sequencing

**Blocked by:** CM-09 (Interaction source), CM-02 (panel surface), DA-08 (rule config), DA-12 (consent), DA-13 (audit)
**Blocks:** ECM revenue reporting (future Phase 2 ticket)

## Test Strategy

**Unit:** rule evaluation matrix (eligible type × consent × window × cap), counter computation
**Integration:** attempt logged → counter updated → panel reflects
**E2E:** Track 1 Act 2 demo (Maria's ECM panel, log attempt, see counter increment)
**Compliance:** audit emitted, billing flag integrity
**Performance:** large caseload dashboard, retroactive attempt recompute
**Fixtures:** members at each cap state, consent variants, multi-client rule configs

## Rollout

- **Feature flag:** `ecm_tracking_v1`
- Per-client rules must be configured before enabling for that client
- Rollback: counter accuracy issues, billing-impact errors

## Definition of Done

- [ ] All ACs pass
- [ ] Per-client rule config integrated with DA-08
- [ ] Consent gating verified
- [ ] Cap-reached and window-expired flags reliable
- [ ] Reporting dashboard live for ops
- [ ] Audit log emitted
- [ ] Performance budget met
- [ ] At least 2 client rule configs (e.g., one 10/90, one 15/60) verified in staging

## Success Metric in Production

- **Revenue:** ECM billable attempts captured up vs. baseline (target: ≥40% increase via cap visibility)
- **Efficiency:** non-billable attempts after cap drop ≥50% (CHW behavior change visible in logs)
- **Compliance:** zero billed ECM attempts without valid consent
- **Adoption:** ≥90% of ECM-eligible members have ECM panel viewed by CHW weekly

## Stop-and-Ask-the-Human Triggers

- Adding **hard-stop at cap** (current design = flag-only)
- Changes to **per-client rule config schema**
- Changes to **billable evaluation logic** (consent + window + type + cap)
- Changes to **ECM consent type** (DA-12 model dependency)
- Adding new **attempt sources** beyond CM-09 channels
- Multi-client-per-member support
- Any retroactive billing flag change

## Open Questions

1. Hard-stop at cap as configurable behavior per program?
2. Multi-program members (ECM + CCM) — how do counters interact? (Already raised; needs decision)
3. Coordination with Ask Claire outreach (AC-02) — should AC outreach attempts count against ECM cap, or kept separate?
4. Reporting depth — what specific metrics beyond utilization do ops actually need?
5. Re-enrollment edge cases — same client re-refers same member, new period rules?

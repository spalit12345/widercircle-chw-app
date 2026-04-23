---
id: CD-17
title: "Time-Based Billing Tracking (CCM Stopwatch)"
source_requirement: CD-17
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: care-delivery
phase: 1
priority: must
persona: chw
secondary_personas: [clinical-staff, ops-manager]
labels: [demo-5-5, track-1, hero, time-tracking, ccm-billing, revenue]
blocked_by: [CM-02, DA-13, DA-08]
blocks: [CD-10, CM-22, CD-16]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-17 — Time-Based Billing Tracking (CCM Stopwatch)

## Background & User Context

CCM (Chronic Care Management) bills on cumulative monthly minutes per patient across the clinical team — typical thresholds at 20, 40, 60 min. PCM and other programs have their own time-based codes. Today, CHWs track time on paper or in their head, then re-enter for billing — error-prone and revenue-leaking.

Per §3.1 narrative, the CHW tracks time spent on engagement throughout the month. They need a stopwatch, a roll-up dashboard showing who's near a threshold, and clean billing-data export.

## User Story

As a CHW (or Clinical Staff), I want a stopwatch that tracks time spent with each member and a dashboard that shows me who is approaching billing thresholds, so I can prioritize outreach to maximize billable revenue without doing manual math.

## Scope

**In scope:**
- Per-member start/stop timer (starts within member context; surfaces in member header CM-03)
- Aggregation: cumulative minutes per member per calendar month
- Dashboard view of caseload showing time-this-month + threshold proximity
- Manual time entry (with justification) for forgotten timers
- Per-program threshold configuration (CCM 20/40/60 min, PCM equivalents, ECM, etc.)
- Time entries feed billing pipeline (DA-08 rules → DA-04 export → CD-10 sync)

**Out of scope / Non-goals:**
- ECM outreach attempt cap → CM-22 (separate revenue rule)
- Billing rule configuration UI → DA-08
- Billing export → DA-04

## Functional Requirements

1. Stopwatch UI present in the member context header (CM-03 area) for users with billable-time permission.
2. Start/stop pattern: one timer per user per member at a time; switching members auto-stops previous timer with prompt.
3. Time entries persist with: member_id, staff_user_id, start_time, end_time, duration_seconds, encounter_id (nullable), justification (required if manually entered), program (per member's enrolled program).
4. Auto-stop after configurable idle timeout (default 30 min) with notification.
5. Caseload dashboard: per-member row showing this-month minutes, next threshold, % to next threshold, days remaining in calendar month, sortable.
6. Threshold alerts: visual indicators (e.g., orange ≥80% of threshold, green hit, gray pre-threshold).
7. Manual entry requires: start time, duration, justification text; flagged for supervisor review.
8. Read-only widget on member profile shows this-month time across all team members.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Start/stop timer**
- *Given* CHW on member Maria's profile
- *When* they click "Start Timer"
- *Then* timer begins; visible in member header; member has an active time entry

**AC-2 — Switching member auto-stops**
- *Given* CHW has active timer on Maria
- *When* they navigate to member John
- *Then* prompt asks to stop Maria's timer (default Yes); on confirm, Maria's entry saves with end_time and duration

**AC-3 — Auto-stop idle**
- *Given* an active timer with no user activity for 30 min
- *When* the idle timeout fires
- *Then* timer auto-stops at last-activity timestamp; CHW notified and prompted to confirm or correct duration

**AC-4 — Manual entry with justification**
- *Given* CHW forgot to start a timer for a 15-min call
- *When* they manually enter time with justification "Forgot to start timer for call at 10:15"
- *Then* entry saves flagged for supervisor review

**AC-5 — Threshold dashboard**
- *Given* a CHW caseload of 25 members
- *When* they open the time-tracking dashboard
- *Then* members are sorted by proximity to next threshold; visual indicator clear; sub-threshold members visible separately

**AC-6 — Time feeds billing**
- *Given* member Maria reaches 20 min CCM threshold
- *When* DA-08 billing rules evaluate
- *Then* CCM 99490 (or appropriate code) becomes billable for the month; DA-04 export includes it

**AC-7 — Audit logged**
- *Given* any timer start, stop, manual entry, or edit
- *When* the action occurs
- *Then* DA-13 audit event written with member_id, staff_user_id, action, duration

## Data Model

**Time Entry (write):**
- entry_id, member_id, staff_user_id, program, start_time, end_time, duration_seconds, encounter_id (nullable), source (timer | manual), justification (nullable), supervisor_review_status (nullable), provenance_tag

**Threshold Config (read; per program):** program, code (CCM 99490, etc.), threshold_seconds, billing_window (calendar month default)

**Computed view:** member_id × month → cumulative_minutes (materialized or computed on demand)

## API Contract

- `POST /v1/members/{id}/time-entries/start` → start timer (idempotent on user+member)
- `POST /v1/members/{id}/time-entries/{eid}/stop` → stop timer
- `POST /v1/members/{id}/time-entries/manual` → manual entry with justification
- `GET /v1/staff/{uid}/caseload-time-summary?month=YYYY-MM` → dashboard data
- `GET /v1/members/{id}/time-summary?month=YYYY-MM` → per-member summary (read by CM-22, CD-16)

## UI / UX Specification

- Stopwatch in member header: small badge with running timer when active
- Caseload dashboard: table view with sortable columns (member, this-month minutes, threshold proximity, last activity)
- Threshold visualization: progress bar per member
- Manual entry: modal with start time, duration, justification fields
- Timer state persists across page navigations within session

**States:** no-timer, timer-running, timer-paused (idle warning), saved, error, conflict (concurrent timer attempt)

## Edge Cases & Error Handling

- Timer running when user logs out → auto-stops with notification; entry preserved
- Network drop while timer running → continues locally; resyncs on reconnect
- Two staff members start timer on same member simultaneously → both allowed (both legitimate); each user's time tracked separately
- Member's program changes mid-month → time entries before change attributed to old program; clear demarcation
- Time entry edits after billing has occurred → require supervisor + reason; audit prominent
- Clock skew → server time authoritative; client time stored for diagnosis

## Security, Privacy & Compliance

- **PHI:** time entries are PHI (linked to member, indicate engagement)
- **Provenance:** entries inherit member's tag
- **Consent:** care-coordination consent required to log time
- **RBAC:** start/stop restricted to billable-time roles; supervisor can edit with reason; member can view their own time? (Open question)
- **Audit:** every entry, edit, manual addition, supervisor review

## Observability

- Metrics: active timers count, mean session duration, manual-entry rate (signal of UX friction), threshold-hit rate per CHW per month, billing-revenue-captured trend
- Alerts: manual-entry rate >30% (UX problem), timer-without-activity (data integrity)

## Performance Budget

- Timer start/stop ack <300ms
- Dashboard load <2s for 200-member caseload
- Per-member summary <500ms

## Dependencies & Sequencing

**Blocked by:** CM-02, DA-13, DA-08 (threshold config schema)
**Blocks:** CD-10 (billing sync uses time data), CM-22 (ECM reads time), CD-16 (Provider prioritization uses time data)

## Test Strategy

**Unit:** timer state machine, idle-timeout, aggregation logic, manual-entry validation
**Integration:** start → stop → dashboard updates → DA-04 export includes
**E2E:** Track 1 Act 2 demo (CHW timer + dashboard view)
**Compliance:** audit emitted; RBAC enforced
**Performance:** 200-member caseload dashboard
**Fixtures:** members at each threshold proximity, manual entries pending review

## Rollout

- **Feature flag:** `time_tracking_v1`
- Pilot CHWs first
- Rollback: data integrity issues, billing-impact errors

## Definition of Done

- [ ] All ACs pass
- [ ] Timer reliable across navigation, logout, network drops
- [ ] Threshold config integrated with DA-08
- [ ] Dashboard performs at scale
- [ ] Audit log emitted
- [ ] Billing pipeline integration verified (DA-04 includes time)
- [ ] Manual-entry supervisor-review workflow live

## Success Metric in Production

- **Adoption:** ≥85% of billable engagement captured via timer (vs. manual)
- **Revenue:** monthly CCM-billable members up vs. baseline (target: ≥30% increase from time-tracking visibility)
- **Quality:** manual-entry rate ≤20%; supervisor-corrected entries <5%

## Stop-and-Ask-the-Human Triggers

- Changes to **threshold configuration schema** (impacts DA-08 and downstream billing)
- Changes to **time-entry data model** (downstream billing depends)
- Changes to **idle-timeout default** or behavior
- Edits to time entries after billing has occurred
- Adding new time-tracking source (e.g., auto-track from call duration)
- Changes to RBAC for time editing

## Open Questions

1. Member visibility — does the patient have a right to see time tracked on them? (HIPAA right of access implications)
2. Idle timeout default — 30 min reasonable? Per-program configurable?
3. Auto-track from call duration (CC-04) — Phase 2 enhancement?
4. Multiple programs per member — how is time apportioned?
5. Year-end edits — lock period?

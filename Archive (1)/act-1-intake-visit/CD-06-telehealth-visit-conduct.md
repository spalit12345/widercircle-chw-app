---
id: CD-06
title: "Telehealth Visit Conduct"
source_requirement: CD-06
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: provider
secondary_personas: [clinical-staff, patient]
labels: [demo-5-5, track-1, hero, telehealth, video, integration-vendor-tbd]
blocked_by: [CM-02, CD-05, CD-07, DA-13]
blocks: [CD-08, CD-10]
parallel_safe_with: [CD-11]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-06 — Telehealth Visit Conduct

## Background & User Context

Providers need to launch and conduct a video visit *from inside the patient chart*, not in a separate browser tab. Switching contexts loses focus, costs time, and breaks the demo flow. Today, video happens in Healthie or external Zoom; the platform replaces this with embedded video alongside the live charting surface.

In the demo: Provider clicks "Launch Visit" from the pre-visit chart (CD-07), consent is captured (CD-05), video opens alongside the Action Plan editor (CD-08), and the visit happens with all clinical surfaces visible.

## User Story

As a Provider, I want to launch a telehealth video session from within the member chart and conduct the visit without losing access to clinical context, so I can focus on the patient and document in real time.

## Scope

**In scope:**
- Embedded or deep-linked video session launchable from the encounter view
- Side-by-side layout: video panel + clinical chart (Action Plan, Notes)
- Session metadata logged (start/end times, participants, duration) for billing duration validation
- Connection error handling with reconnection
- Session recording (if enabled per program) with consent prerequisite

**Out of scope / Non-goals:**
- Action Plan authoring → CD-08
- Clinical note authoring → CD-08
- Billing sync → CD-10
- Patient-facing waiting room UX (vendor-handled)

## Functional Requirements

1. "Launch Visit" CTA on encounter view; gated by valid consent (CD-05) and present member.
2. Video session opens in embedded or deep-linked vendor surface (vendor TBD — see Open Questions).
3. Layout: video panel (resizable) + clinical chart pane (CD-08 editor).
4. Session metadata captured: actual start time (when both parties connect), end time, participant join/leave events, duration.
5. Connection failures: graceful error with reconnect; session metadata captures interruption.
6. Encounter status auto-updates: Scheduled → In Progress (on connect) → Completed (on Provider-end-session) — billable duration = sum of connected time.
7. Optional recording (per program config); requires recording-consent (DA-12) before session start.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Launch Visit gated by consent**
- *Given* a Provider on the pre-visit chart
- *When* they click "Launch Visit" without valid consent on file
- *Then* the consent block (CD-05) appears; video does not start

**AC-2 — Video launches with chart visible**
- *Given* valid consent and member ready
- *When* Provider clicks "Launch Visit"
- *Then* video panel opens within the platform UI, side-by-side with the Action Plan editor; video and chart both interactive

**AC-3 — Session metadata logged**
- *Given* a completed visit
- *When* Provider ends the session
- *Then* encounter metadata records actual start, end, total connected duration; values are accurate within ±2s

**AC-4 — Connection failure handled**
- *Given* a video connection drops mid-visit
- *When* the network recovers
- *Then* session can be re-joined; the gap is recorded as a non-billable interval; total billable duration excludes the gap

**AC-5 — Audit logged**
- *Given* a video session is launched
- *When* the session starts
- *Then* DA-13 audit event written with member_id, encounter_id, provider_id, vendor, session_id

**AC-6 — Recording requires consent**
- *Given* a program where recording is enabled
- *When* Provider attempts to start a recorded session without valid recording-consent (DA-12)
- *Then* recording does not start; Provider sees prompt to capture recording consent or proceed without recording

## Data Model

**Encounter (update):** status transitions, actual_start, actual_end, billable_duration_seconds
**Video Session (write):** session_id, vendor, vendor_session_id, encounter_id, started_at, ended_at, participants[], interruptions[], recording_uri (nullable)
**Audit Event (write):** session start/end, recording start/stop

**PHI:** session metadata, recording (if any) treated as full PHI

## API Contract

- `POST /v1/encounters/{id}/video-sessions` → starts session; returns vendor session token / deep-link
- `POST /v1/encounters/{id}/video-sessions/{sid}/end` → ends session, finalizes duration
- Webhook from vendor → platform for participant events (join/leave/recording status)
- Vendor SDK or iframe embedded in UI

## UI / UX Specification

- Encounter view layout: 60/40 split (video left, chart right by default; resizable)
- Video controls (mute, camera, end) standard from vendor SDK
- Chart pane = CD-08 Action Plan editor + notes
- Connection-quality indicator
- Reconnect UI on drop

**States:** scheduled-not-launched, launching, connecting, in-progress, paused (network drop), reconnecting, ended, error

## Edge Cases & Error Handling

- Vendor SDK fails to load → fallback to deep-link in new tab; visit continues, metadata captured manually for duration
- Patient never joins → encounter remains Scheduled; no-show flow triggered
- Provider drops, patient stays → session pauses; reconnect window
- Recording fails mid-session → visit continues, alert fires to admin
- Browser denies camera/mic → user-actionable error
- Cross-state telehealth-licensure issue (Provider not licensed in patient's current state) → see Open Questions; for v2 there is no automated check, but visit-start could surface a manual confirm

## Security, Privacy & Compliance

- **PHI:** video stream contents (treated as PHI), recordings (PHI), metadata (PHI)
- **Provenance:** session record inherits member's tag
- **Consent:** Telehealth consent (CD-05) required to launch; Recording consent required for recording
- **RBAC:** session launch restricted to Provider on the assigned encounter
- **Audit:** session start/end/recording all logged
- **Vendor BAA:** required for any HIPAA-eligible vendor (Zoom Health, Doxy.me, Twilio Video)

## Observability

- Metrics: launch-success rate, mean session duration, drop rate, reconnect rate, recording-success rate
- Alerts: launch-failure rate >2%, vendor outages
- Vendor health dashboard

## Performance Budget

- Launch click → video first frame <5s p95
- Reconnect after drop <10s

## Dependencies & Sequencing

**Blocked by:** CM-02, CD-05 (consent), CD-07 (pre-visit context), DA-13
**Blocks:** CD-08 (authoring during visit), CD-10 (billing duration depends on session metadata)
**External contracts:** Telehealth vendor SDK + BAA — vendor TBD (see Open Questions §7)

## Test Strategy

**Unit:** session state machine; duration calculation with interruptions
**Integration:** vendor SDK round-trip; webhook event handling
**E2E:** Track 1 demo flow (pre-visit → consent → launch → visit → end)
**Compliance:** audit emitted; consent gate enforced; recording requires recording-consent
**Performance:** launch latency under load
**Fixtures:** mocked vendor responses

## Rollout

- **Feature flag:** `telehealth_v1`
- **Vendor selection** must close before build (TBD per §7)
- Pilot Provider cohort before broader
- Rollback trigger: launch-failure rate >5%, duration discrepancies, BAA issues

## Definition of Done

- [ ] All ACs pass
- [ ] Vendor SDK integration tested end-to-end
- [ ] Vendor BAA executed
- [ ] Audit log verified
- [ ] Recording-consent enforcement verified
- [ ] Reconnect flow tested
- [ ] Performance budget met
- [ ] Provider runbook published (network issues, vendor escalation)

## Success Metric in Production

- **Reliability:** session-success rate ≥99%
- **Speed:** launch-to-first-frame median <4s
- **Adoption:** ≥90% of telehealth visits conducted via embedded surface (vs. external Zoom fallback)

## Stop-and-Ask-the-Human Triggers

- **Vendor change** — any switch from chosen telehealth vendor mid-implementation
- **BAA modification**
- Changes to **recording-consent enforcement** logic
- Changes to **session-duration calculation** (impacts billing)
- Adding any cross-state-licensure check (legal-review required)
- Changes to **video data retention** policy (recordings)

## Open Questions

1. **Telehealth vendor selection** — Zoom Health, Doxy.me, Twilio Video, Daily.co? (Listed in v2 §7 as TBD)
2. **State licensure check** — automated (CD-21 in earlier draft) or manual confirm? Earlier discussion proposed a Provider Licensure Registry; v2 does not include this
3. **Recording retention** — how long are session recordings stored?
4. **Multi-party visits** — group SMA support (CD-20) deferred to Phase 3, but vendor choice impacts feasibility
5. **Mobile (Provider on phone) support** — required Phase 1 or later?

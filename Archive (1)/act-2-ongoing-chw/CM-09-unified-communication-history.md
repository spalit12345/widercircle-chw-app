---
id: CM-09
title: "Unified Communication History"
source_requirement: CM-09
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw, contact-center-agent, provider]
labels: [demo-5-5, track-1, hero, conversation-feed, omnichannel]
blocked_by: [CM-02, DA-13]
blocks: [CC-04, CM-22]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-09 — Unified Communication History

## Background & User Context

Today, calls live in Five9, SMS in Twilio/Tellescope, emails in some other system, in-person interactions in CHW notes — disconnected. Staff cannot answer "what's the most recent communication with this member?" without checking 4 places. The unified Conversation Feed is the answer: chronological, omnichannel, automatically-logged, on the member profile.

In the demo: CHW opens Maria's profile and sees a single feed mixing CHW visit notes, SMS reminders, the recent call from CC, and an email confirmation — all in order, all clickable.

## User Story

As a CM, CHW, Agent, or Provider on a member's profile, I want a single chronological feed of all communications with the member across every channel — calls, SMS, MMS, email, in-person, portal — so I can see the full conversation without switching tools.

## Scope

**In scope:**
- Chronological feed component embedded in member profile (CM-02)
- Channels: phone calls (Five9), SMS/MMS (Twilio), email, in-person (CM-13 field visits), portal messages, virtual event attendance (EV-06 for the Phase 2 case)
- Per-item display: channel icon, direction (in/out), staff user, timestamp, brief preview, expand-for-detail
- Filters: channel, direction, date range, staff member
- Click-through: open call recording (Five9), open SMS thread, open email body, open in-person visit details
- Auto-logging — no manual entry required for any channel

**Out of scope / Non-goals:**
- Authoring of any channel — handled by source ticket (CC-04 for calls, CM-12 for SMS, MSG-01 for SMS storage, etc.)
- Communication preference management → MSG-03

## Functional Requirements

1. Feed renders inside member profile (CM-02) and CHW view (CM-13).
2. Default view: most recent 50 items, paginate older.
3. Per-item display: channel icon (color-coded), direction arrow, timestamp (relative + absolute on hover), staff user attribution, content preview (first ~80 chars or summary).
4. Click-through behavior per channel: call → embedded recording player + transcript link if available; SMS → expand thread; email → expand body; in-person → expand visit detail.
5. Filters: channel multi-select, direction, date range, staff member; URL-shareable filter state.
6. Real-time update: new communications appear within 30s without page refresh.
7. RBAC: full feed for assigned care team; supplier sees their slice only; compliance can view all (audit trail).

## Acceptance Criteria (Given/When/Then)

**AC-1 — Feed shows all channels chronologically**
- *Given* a member with: 2 SMS, 1 call, 1 email, 1 in-person visit in last 30 days
- *When* CHW opens member profile
- *Then* all 5 items appear in correct chronological order with channel-icon distinct per item

**AC-2 — Call playback inline**
- *Given* a member with a recorded Five9 call
- *When* user clicks the call item in the feed
- *Then* an embedded player loads the recording (RBAC permitting); transcript link visible if available

**AC-3 — SMS thread expands**
- *Given* an SMS item in the feed
- *When* user clicks
- *Then* the full back-and-forth thread expands inline (consumes MSG-01 storage)

**AC-4 — Filters work**
- *Given* a member with 200 historical interactions
- *When* user filters to "Channel: Calls only, Last 7 days"
- *Then* feed shows only matching items; URL reflects filter state

**AC-5 — Real-time update**
- *Given* CHW viewing member profile
- *When* a new SMS arrives from member
- *Then* it appears at top of feed within 30s without manual refresh

**AC-6 — Supplier sees only their slice**
- *Given* a MediCircle supplier user viewing a member
- *When* feed renders
- *Then* only MediCircle-tagged interactions are visible; other interactions absent (not redacted)

**AC-7 — Audit logged**
- *Given* feed view, filter use, or item click-through
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

- **Interaction (read; canonical entity defined in §1.5):** every channel uses this entity; channel-specific extension data linked
- **Call (read; CC-* + Five9 integration):** call metadata + recording URI
- **Message (read; MSG-01):** SMS/MMS body + thread linkage
- **Email (read; future):** stored email bodies
- **Field Visit (read; CM-13):** in-person interaction details

This ticket aggregates and renders; does not own write-side schema for any individual channel.

## API Contract

- `GET /v1/members/{id}/communications?channels[]={...}&direction={...}&from={...}&to={...}&staff_user={...}&limit=50&cursor={...}` → paginated unified feed
- Server-Sent Events or WebSocket: `/v1/members/{id}/communications/stream` for real-time updates
- `GET /v1/communications/{interaction_id}/details?channel={call|sms|email|in_person}` → channel-specific detail payload

## UI / UX Specification

- Feed: vertical list, channel icons left, content right
- Per-item compact (default) → expand on click
- Filter bar: chip-style multi-select (channel), date range, staff dropdown
- Real-time indicator: subtle pulse / new-item badge
- "Back to top" affordance on long feeds

**States:** loading (skeleton), default, empty ("No communications yet"), filtered-empty ("No results for filters — clear?"), error per item, real-time-update animation

**Accessibility:** WCAG AA; keyboard navigation through items; new-item announcements via aria-live

## Edge Cases & Error Handling

- Call recording not yet ready (Five9 still processing) → show "Recording processing" placeholder; refresh on availability
- SMS thread spans 200+ messages → collapsed by default with "Show all" expand
- Channel temporarily unavailable (e.g., Five9 outage) → degraded indicator on call items; rest of feed renders fine
- Real-time stream drops → reconnect; missing items pulled on next render
- Out-of-order arrival (e.g., call processed late) → re-sort on render; visual indicator on newly-inserted-back-in-time items
- Very large attachments (MMS images) → lazy-load; click-to-load full image

## Security, Privacy & Compliance

- **PHI:** all communication content
- **Provenance:** each item carries the source's provenance tag
- **Consent:** view does not require consent; specific actions on items (e.g., reply) check consent
- **RBAC:** scope per role; supplier slicing strict; recording playback gated separately from item visibility
- **Audit:** view, filter, item open, recording playback all logged
- **PHI-in-channel policy:** displayed content respects MSG-01 no-PHI-in-external-channel rule (member-app delivery patterns observed elsewhere)

## Observability

- Metrics: feed load p95, real-time-update latency, filter-use rate, recording-playback rate
- Alerts: real-time stream failure, recording playback failure rate, channel-source latency

## Performance Budget

- Feed load <1s p95 for 50 items
- Real-time update latency <30s
- Recording load on click <2s

## Dependencies & Sequencing

**Blocked by:** CM-02 (profile surface), DA-13
**Blocks:** CC-04 (notes feed back into here), CM-22 (counts attempts from here)
**External contracts:** Five9 (calls + recordings), Twilio (SMS), email provider

## Test Strategy

**Unit:** feed composition logic, filter application, channel-icon mapping
**Integration:** all channels render correctly; RBAC slicing per role
**E2E:** Track 1 Act 2 demo (CHW views Maria's full feed)
**Compliance:** audit emitted, RBAC slicing enforced, PHI-policy respected
**Performance:** feed with 1000+ historical items; load + filter + paginate
**Fixtures:** member with all channel types, supplier-scoped member, member with active real-time stream

## Rollout

- **Feature flag:** `unified_comm_feed_v1`
- Ships with CM-02
- Real-time channel can be deferred (poll fallback)

## Definition of Done

- [ ] All ACs pass
- [ ] All channels render
- [ ] RBAC slicing verified per role
- [ ] Real-time updates verified
- [ ] Recording playback works
- [ ] Performance budget met under load
- [ ] Audit log emitted
- [ ] PHI policy respected in displayed content

## Success Metric in Production

- **Adoption:** ≥90% of profile views include a feed scroll/click within 30 days of GA
- **Time saved:** median time-to-most-recent-comm drops vs. baseline (target: <5s)
- **No miss:** zero incidents of staff missing critical communications because they checked the wrong system

## Stop-and-Ask-the-Human Triggers

- Adding a new **channel type** (impacts data model)
- Changes to **RBAC slicing** per role
- Changes to **recording playback** access policy
- Changes to **real-time stream contract**
- Anything that would cause a channel's content to render outside the source's PHI policy

## Open Questions

1. Email channel — Phase 1 or Phase 2? (Tickets reference but spec is thin)
2. Transcript availability — auto-transcribed calls? Vendor (e.g., AssemblyAI)?
3. Search within feed — Phase 1 or later?
4. Ask Claire summary visibility (AC-06) — surfaces here as a separate channel or merged?
5. Aging policy — feed shows full history, or roll-off after N months with archive accessible?

---
id: CM-12
title: "Individual & Bulk SMS (Case Management)"
source_requirement: CM-12
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw, ops-manager]
labels: [demo-5-5, track-1, sms, twilio, bulk, opt-out]
blocked_by: [CM-02, CM-09, MSG-03, DA-13]
blocks: []
parallel_safe_with: [CM-05]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-12 — Individual & Bulk SMS (Case Management)

## Background & User Context

CMs and CHWs send SMS routinely — appointment nudges, follow-up confirmations, brief check-ins. Today this happens in Tellescope or via copy-paste, with no automatic logging on the member record. The platform has to support both individual SMS from a member's profile and bulk SMS to a defined cohort, with everything logged to CM-09 history and respecting opt-out rules.

In the demo: CHW sends Maria a quick SMS check-in from her profile; the message appears immediately in the CM-09 feed.

## User Story

As a CM (or CHW), I want to send individual or bulk SMS to members directly from the platform — with all messages auto-logged to the member record, opt-outs respected, and delivery status visible — so I can stay in touch without copy-pasting between tools.

## Scope

**In scope:**
- Individual SMS from member profile (compose, send, status)
- Bulk SMS to a segment / cohort (defined via DA-05 segment or ad-hoc list)
- Auto-logging of all sends + replies to CM-09
- Opt-out enforcement (TCPA STOP keyword + member preference per MSG-03)
- Delivery status tracking (queued, sent, delivered, failed, opted-out-blocked)
- Template support (basic Phase 1; richer template management is MSG-tier)
- Rate limiting to protect Twilio sender reputation
- Per-day per-member frequency cap (anti-spam guardrail)

**Out of scope / Non-goals:**
- SMS storage and viewing on profile → MSG-01
- Member communication preferences → MSG-03
- Marketing journey SMS → MSG-02 (Klaviyo)
- Transactional SMS like appointment reminders → CD-02 (different channel governance)
- Two-way SMS conversation engine → MSG-01 owns the inbox; CM-12 produces sends

## Functional Requirements

1. Individual SMS compose UI on member profile; pre-fills template selector and variable insertion (member name, etc.).
2. Bulk SMS UI for CMs/CHWs with segment-builder permission: pick segment, compose, preview send count, schedule or send-now.
3. Pre-send check: opt-out status (block sends to opted-out members), preference channel (warn if SMS not preferred), quiet hours (prevent late-night sends per TCPA defaults).
4. Send goes through MSG-tier engine (CM-12 is consumer; engine enforces rate limit, frequency cap).
5. All sends + replies log automatically to CM-09 communication feed.
6. Delivery status visible per recipient (and aggregated for bulk).
7. Audit logs every send (who sent, what content, who recipient(s), outcome).

## Acceptance Criteria (Given/When/Then)

**AC-1 — Individual SMS sends and logs**
- *Given* CHW on Maria's profile with valid SMS opt-in
- *When* they compose and send "Hi Maria, checking in"
- *Then* SMS sends via Twilio; appears in Maria's CM-09 feed within 5s; delivery status updates

**AC-2 — Opt-out enforced**
- *Given* member with SMS opt-out flag
- *When* CHW attempts individual send
- *Then* send is blocked; CHW sees clear reason; no API call to Twilio made

**AC-3 — Bulk send to segment**
- *Given* CM with a saved segment of 500 members
- *When* they compose and bulk send
- *Then* preview shows 500 (or 487 after opt-out filter); send queues; per-recipient delivery status accumulates

**AC-4 — Quiet hours enforced**
- *Given* CHW attempts to send at 9:30pm member-local time
- *When* TCPA quiet hours block applies
- *Then* send held; CHW notified; option to schedule for next morning

**AC-5 — STOP keyword opts out**
- *Given* member replies "STOP" to a CMS SMS
- *When* MSG-tier inbound handler fires
- *Then* member's SMS opt-out flag set to True (MSG-03); confirmation auto-reply sent per TCPA

**AC-6 — Frequency cap**
- *Given* a member who already received 3 SMS today (cap=3)
- *When* CHW attempts a 4th send
- *Then* send blocked or held; CHW notified with override option (supervisor approval required)

**AC-7 — Audit logged**
- *Given* any send
- *When* it transmits
- *Then* DA-13 audit event written; bulk send records aggregated audit + per-recipient outcome

## Data Model

- Reads: Member, Communication Preference (MSG-03), Segment (DA-05)
- Writes: Interaction (channel=SMS, direction=outbound) + Message via MSG-01
- New: Bulk Send Job (job_id, sender_user_id, segment_id, template_id, scheduled_at, status, recipient_count, success_count, opt_out_filtered_count)

## API Contract

- `POST /v1/members/{id}/sms` → individual send (validates opt-out, frequency, quiet hours)
- `POST /v1/sms/bulk` → bulk send job with segment_id + template_id; returns job_id
- `GET /v1/sms/bulk/{job_id}` → status with per-recipient outcomes
- `POST /v1/sms/bulk/{job_id}/cancel` → cancel pending job

## UI / UX Specification

- Individual: small composer in member profile; template picker, variable insertion, char count
- Bulk: dedicated UI with segment picker, template picker, preview count, scheduled-send option
- Pre-send confirmation modal showing recipient count, template preview, opt-out filter result
- Status: per-message delivery indicator inline; bulk job status page

**States:** compose, sending, sent, delivered, failed, blocked-opt-out, blocked-frequency, blocked-quiet-hours, scheduled, cancelled

## Edge Cases & Error Handling

- Twilio API failure → retry with backoff; failed status if retries exhausted
- Member's phone number invalid → mark failed, alert CM
- Bulk send hits Twilio rate limit → queue, throttle, completion may take longer than expected
- Long message (>160 chars) → multipart SMS; counted as multiple messages for cost/cap
- Member responds during bulk send → reply lands in CM-09 normally; doesn't pause bulk
- Segment dynamically updates during bulk send → snapshot recipients at send-start; updates after don't affect in-flight

## Security, Privacy & Compliance

- **PHI:** message content can include PHI; subject to MSG-01 PHI policy (no PHI in clear-text SMS — content review at template approval; ad-hoc sends should warn)
- **Provenance:** message inherits member's tag
- **Consent:** TCPA-compliant — must have SMS opt-in; STOP propagates to opt-out across all channels
- **RBAC:** individual send by assigned care team; bulk send requires explicit bulk-permission
- **Audit:** every send

## Observability

- Metrics: send rate, delivery rate, failure rate, opt-out blocks, frequency-cap blocks, quiet-hours holds
- Alerts: delivery rate <95%, Twilio errors, sender reputation issues

## Performance Budget

- Individual send ack <500ms
- Bulk send job creation <1s
- Bulk job throughput (Twilio-bounded) ≥10,000/hr per §5.1

## Dependencies & Sequencing

**Blocked by:** CM-02, CM-09 (logging), MSG-03 (preferences), DA-13
**External:** Twilio SMS API + sender phone numbers; sender reputation hygiene

## Test Strategy

**Unit:** opt-out check, quiet-hours check, frequency-cap check
**Integration:** end-to-end send + log to CM-09; opt-out reply flow; bulk job lifecycle
**E2E:** Track 1 Act 2 demo (CHW SMS to Maria)
**Compliance:** TCPA — STOP/HELP/INFO keywords, quiet hours, opt-in verification
**Load:** bulk send 10K members
**Fixtures:** opt-out member, quiet-hours scenario, frequency-cap scenario

## Rollout

- **Feature flag:** `cms_sms_individual_v1`, `cms_sms_bulk_v1`
- Bulk gated by separate permission and rollout
- Twilio sender pool warmed before bulk enable

## Definition of Done

- [ ] All ACs pass
- [ ] TCPA keywords (STOP/HELP/INFO) verified end-to-end
- [ ] Opt-out propagation across channels verified
- [ ] Quiet hours + frequency cap enforced
- [ ] CM-09 logging verified
- [ ] Audit log emitted
- [ ] Bulk performance meets §5.1 throughput

## Success Metric in Production

- **Adoption:** ≥80% of CMs use SMS weekly within 30 days
- **Compliance:** zero TCPA violations
- **Reliability:** delivery rate ≥97%

## Stop-and-Ask-the-Human Triggers

- Changes to **opt-out propagation** logic
- Changes to **quiet-hours / frequency-cap** defaults
- Adding any **bypass** to opt-out / quiet hours / frequency cap
- Changes to **STOP keyword** behavior (TCPA-mandated)
- Any change that could send PHI in clear-text SMS

## Open Questions

1. Frequency cap default — 3/day? per-program configurable?
2. Quiet hours default — 8am–9pm member-local? Honors member preference if set?
3. Template approval workflow — same as MSG-tier? Or separate for CM-tier?
4. Long-code vs short-code sender numbers — strategy?
5. Multi-language template handling — MSG-tier owns?

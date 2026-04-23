---
id: CM-13
title: "CHW Workflows (Mobile + Desktop)"
source_requirement: CM-13
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: case-management
phase: 1
priority: must
persona: chw
secondary_personas: [supervisor]
labels: [demo-5-5, track-1, persona-chw, mobile, plan-of-care, e-signature, offline]
blocked_by: [DA-14, CM-02, CM-03]
blocks: [CD-19, CM-22, CM-09, CM-12, CM-05, CD-13, CD-14, CD-18]
parallel_safe_with: [CC-*]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-13 — CHW Workflows (Mobile + Desktop)

## Background & User Context

The CHW is the member's primary point of contact after the intake visit. Per the §3.1 narrative: the CHW conducts the SDoH assessment as part of the intake visit, then takes over as the lead engagement role — building trust, helping the member execute the Plan of Care, tracking time toward billable thresholds, and re-surfacing needs back to the clinical team.

Today, CHWs juggle field visits, mobile follow-ups, and desktop documentation across multiple disconnected tools. The CHW Workflows feature is the unified surface they operate from. Field-first means it works on mobile (iOS/Android) for in-home visits and on desktop for documentation-heavy days. Connectivity is unreliable in many member homes — offline capture is non-negotiable.

This feature is the spine of the CHW persona's day. Almost every other CM and CD requirement is reached *through* this surface (the CHW navigates from here to time tracking, ECM tracking, communication, referrals, Care Plan editing, etc.).

## User Story

As a CHW, I want a unified mobile and desktop surface where I can manage my member relationships, work the Plan of Care, capture signatures, and document field visits — including offline — so I can do my job in homes, in clinics, and at my desk without switching tools.

## Scope

**In scope:**
- Member list (assigned caseload) with quick filters (today's visits, overdue tasks, members near billing threshold)
- Member detail view (consumes CM-02 unified context, but CHW-tailored summary up top)
- Plan of Care viewing and editing (consumes CD-08, CD-13, CD-14)
- Referral creation and status tracking (consumes CM-05)
- Relationship management (caregiver, family, PCP)
- E-signature capture for Plan of Care, consents (camera + finger/stylus)
- Field-visit logging (note, disposition, photo capture)
- Offline mode with sync-on-reconnect for all CHW-authored content
- Mobile (iOS + Android) and responsive web/desktop parity for everything except offline (offline = mobile only)

**Out of scope / Non-goals:**
- ECM cap visualization → CM-22
- Time-tracking stopwatch → CD-17
- SMS / messaging interface → CM-12
- Communication history feed → CM-09 (consumed inside the member view but not authored here)
- Telehealth video → CD-06
- Survey administration → CM-04
- Push notifications design (handled by platform notification service; CHW just receives them)
- Canvasser-specific door-to-door workflows → CM-14

## Functional Requirements

1. CHW signs in via SSO (web) or biometric+passcode (mobile) per platform auth.
2. Default landing view shows: today's schedule (CD-18), member list filtered to assigned caseload, count of overdue items, count of members approaching CCM threshold.
3. Member list supports search by name, phone, MRN; filters: assigned to me, today, overdue, near billing threshold, has open SDoH need, has unsigned Plan of Care.
4. Tapping a member opens member detail with: highlighted attributes (CM-03), Plan of Care card, recent interactions (CM-09), open referrals (CM-05), open cases, relationships, time-this-month bar (CD-17 read-only).
5. Plan of Care card supports: view current version, edit (CD-14 — adds a new version), assign owner, set due date, mark complete, attach evidence (photo, document).
6. E-signature capture: signature pad (touch / mouse / stylus), captured signature stored as image with timestamp, signer name, IP/device fingerprint, witnessed-by (if applicable). Saved as a Document linked to the Plan of Care or Consent record.
7. Field visit logging: structured fields (date, location, duration, disposition from configurable list, free-text note); optional photo capture from device camera; saves as an Interaction (channel: in-person).
8. Offline mode (mobile only): all CHW-authored content (notes, Plan of Care edits, signatures, photos, field visits) writes to local encrypted store; sync indicator shows pending count; auto-sync when connection restored.
9. Conflict resolution on sync: if a record was edited on the server during the offline window, user is prompted to review both versions and explicitly merge before the record commits; unresolved conflicts go to a supervisor review queue.
10. Performance: mobile cold-start to member list ≤4s; member detail view loads ≤2s on 3G.

## Acceptance Criteria (Given/When/Then)

**AC-1 — CHW sees their caseload on login**
- *Given* a CHW with 25 assigned members
- *When* they sign in
- *Then* the home view shows their 25 members, today's schedule, and overdue counts within the page-load NFR (<2s)

**AC-2 — Plan of Care edit is versioned and attributed**
- *Given* an existing Plan of Care for a member
- *When* the CHW edits an action item's status to "Complete"
- *Then* a new Plan of Care version is saved with the CHW's user ID, timestamp, and previous-version diff is retrievable

**AC-3 — E-signature is captured and bound to the Plan of Care**
- *Given* a CHW reviewing a Plan of Care with the member in person
- *When* the member signs on the device
- *Then* the signature image is stored, linked to the Plan of Care version, timestamped, and the Plan of Care state moves to "Signed by Member"

**AC-4 — Field visit creates an Interaction**
- *Given* a CHW completing an in-home visit
- *When* they save the field visit form (note, disposition, optional photo)
- *Then* an Interaction record is created (channel: in-person, direction: outbound, duration: as entered) and linked to the member; visit is visible in CM-09 communication history within 5 seconds (online) or on next sync (offline)

**AC-5 — Offline edit syncs cleanly when connection returns**
- *Given* a CHW makes 3 Plan of Care edits, 2 field-visit logs, and captures 1 signature while offline
- *When* the device reconnects
- *Then* all 6 items sync to the server within 60s and appear on web view; no records are silently dropped; sync log entry created

**AC-6 — Offline edit conflicts prompt the CHW**
- *Given* a CHW edits a Plan of Care item offline at 10am, and a Provider edits the same item on web at 11am, and CHW reconnects at 12pm
- *When* the sync runs
- *Then* the CHW sees a conflict prompt showing both versions, can choose merge / take-mine / take-server / escalate-to-supervisor; no automatic overwrite

**AC-7 — Unauthorized access blocked**
- *Given* a CHW assigned to caseload A
- *When* they search for a member outside caseload A
- *Then* the member is not visible (RBAC scope per DA-14); attempted access is logged to DA-13

**AC-8 — Lost device → remote wipe**
- *Given* a CHW reports a lost device
- *When* admin triggers remote wipe
- *Then* on next device wake-attempt, the app deletes local data and signs the user out

## Data Model

**Entities touched (not all owned here):**

- **Member** (read; CM-02 owns)
- **Plan of Care** (read/write; CD-08 owns the schema; CM-13 is a major editor) — versioned, includes action items array
- **Plan of Care Version** (write) — fields: version_number, parent_plan_id, edited_by, edited_at, change_summary, content_snapshot (JSON), signature_id (nullable)
- **Interaction** (write) — channel: `in-person`, direction, member_id, staff_user_id, duration_minutes, disposition_code, note_text, photo_attachment_ids[], created_at, location (optional lat/long), provenance_tag
- **Document** (write) — type: signature | photo | attachment, file_uri (S3), member_id, linked_entity_type, linked_entity_id, captured_by, captured_at
- **Signature Record** (write) — image_blob_id, signer_name, signer_role (member | guardian | witness), ip_address (when online), device_fingerprint, captured_at, linked_entity_type, linked_entity_id
- **Sync Operation** (write — offline support) — operation_id, staff_user_id, device_id, operation_type (create/update), entity_type, entity_id, payload, created_offline_at, synced_at, conflict_status, conflict_resolved_by
- **Audit Event** (write per DA-13) — every read/write logged

**Indexes / migrations:**
- Index on `member.assigned_chw_id` (caseload queries)
- Index on `plan_of_care.member_id, version_number desc` (latest-version lookup)
- Index on `interaction.member_id, created_at desc` (history feed)
- Index on `sync_operation.staff_user_id, conflict_status` (supervisor queue)

**PHI fields touched:** member name, DOB, address, phone, clinical notes, signatures, photos (potentially of PHI documents). All PHI fields carry the Data Provenance Tag (DA-11) inherited from the Member record.

## API Contract

**Endpoints (REST, JSON, JWT auth):**

- `GET /v1/chw/caseload?filter={today|overdue|near_threshold|...}` → list of Member summaries (page-load NFR)
- `GET /v1/members/{id}` → full member detail (consumes CM-02 unified service)
- `GET /v1/members/{id}/plan-of-care/current` → current PoC with action items
- `PATCH /v1/plan-of-care/{id}/items/{item_id}` → update item; returns new PoC version
- `POST /v1/plan-of-care/{id}/signatures` → attach signature; body includes signature image (base64), signer info
- `POST /v1/members/{id}/interactions` → create field-visit interaction
- `POST /v1/members/{id}/referrals` → create referral (delegates to CM-05)
- `POST /v1/sync/batch` → offline-batch sync endpoint; body is array of Sync Operations; response includes per-op status (success | conflict | error) and any conflict resolution requirements
- `GET /v1/sync/conflicts` → list of unresolved conflicts for current user
- `POST /v1/sync/conflicts/{id}/resolve` → submit resolution (merge | take_mine | take_server | escalate)

**Idempotency:** All write endpoints accept `Idempotency-Key` header. Offline-batch sync uses client-generated UUIDs as natural idempotency keys.

**Auth:** JWT bearer; mobile uses biometric-unlock + refresh token; web uses SSO. RBAC enforced server-side per DA-14 — caseload filtering applied even if client requests broader scope.

**Error codes:**
- 401 unauthorized, 403 RBAC scope violation (logged to DA-13), 409 sync conflict, 422 validation error, 5xx with retry-after for transient

## UI / UX Specification

**Mobile (iOS + Android):**
- Native or React Native — implementation choice deferred to platform team, but must support biometric unlock, secure local storage, background sync
- Bottom nav: Today | Caseload | Tasks | More
- Member detail: scrollable, sticky highlighted attributes header (CM-03)
- Plan of Care card: collapsible items, inline edit, swipe-to-complete on items
- Signature capture: full-screen modal with signature pad, signer-name field, "Confirm" button
- Offline indicator: persistent badge at top showing pending sync count; tap to see queue

**Desktop (responsive web):**
- Same data, denser layout
- Member detail uses two-column layout (highlighted info left, detail right)
- No offline mode on desktop (online required)

**States to specify for every screen:**
- Default
- Loading (skeleton, not spinner)
- Empty (e.g., "No members assigned yet — talk to your supervisor")
- Error (network, server, permission denied — distinct messaging)
- Partial-data (some sections loaded, others still loading)
- Offline mode (visual treatment when disconnected)
- Sync-in-progress
- Conflict-pending (member has unresolved sync conflicts → banner)
- Read-only (e.g., supervisor viewing another CHW's caseload — RBAC enforced)
- Disabled (e.g., locked Plan of Care because pending provider review)

**Accessibility:** WCAG 2.1 AA on web (per §5.5); mobile platform accessibility (VoiceOver, TalkBack) supported for all primary flows.

## Edge Cases & Error Handling

- Member transferred to another CHW mid-edit → save permitted, returns warning, supervisor notified
- Plan of Care locked by Provider for sign-off (CD-09) → CHW edits disabled with explanation
- Signature capture interrupted (call comes in, app backgrounds) → in-progress signature preserved on resume
- Photo capture device permission denied → graceful fallback (manual document upload)
- Offline storage full → oldest non-pending data evicted; user notified
- Clock skew on offline device → server timestamps overwrite client timestamps on sync (with client time preserved as `device_recorded_at`)
- Stale offline data >7 days old → sync requires re-auth (per platform policy)
- Member opt-out / consent revoked while CHW is offline → on sync, CHW sees alert; outreach attempts during offline window flagged for review
- Member deceased flag set on server → on sync, CHW sees prominent banner; offline outreach flagged
- Sync conflict on a Plan of Care that's been signed in the meantime → conflict cannot auto-resolve, escalates to supervisor

## Security, Privacy & Compliance

- **PHI handled:** all member identity, clinical, and contact data plus signatures and any photos (which may contain PHI documents)
- **Provenance tag:** every record written carries Data Provenance Tag (DA-11) inherited from the Member record (CE / BA / Dual)
- **Consent enforcement:** PoC editing requires the member to have a valid Care Coordination consent on file (DA-12); blocked if revoked
- **RBAC:** CHW can only access members assigned to them or to a caseload they share with their supervisor (DA-14); supervisor-mode access is explicitly elevated and logged
- **Audit log entries (DA-13):** every member-record read, every write to Plan of Care / Interaction / Document / Signature, every sync operation, every conflict resolution. Purpose code: `care_coordination`. Actor: CHW user ID. Target: member ID.
- **Mobile device security:** MDM enrollment required for production sign-in; local PHI encrypted at rest (device secure enclave); offline cache TTL ≤7 days; remote wipe on account deactivation; biometric+passcode required; ≤5min session idle timeout; jailbreak/root detection blocks sign-in; screen-capture and screen-recording disabled for PHI-bearing views
- **Anti-steering (AC-10 readiness):** CHWs cannot view AC-sourced plan-selection data; v2 Phase 1 enforces via DA-14 partitioning

## Observability

- **Structured logs:** every API call logged with user_id, member_id (hashed in non-prod), action, latency, outcome. PHI never in log payloads.
- **Metrics:** sign-in success/failure rates, page-load p50/p95, sync-batch size distribution, sync-success rate, conflict rate per CHW, offline-duration distribution, photo-upload success rate
- **Alerts:** sync-failure rate > 1% (5min window); conflict rate > 5% per CHW per day; remote-wipe failure; offline-storage-full events
- **Dashboards:** CHW productivity dashboard (member touches per day, time per member, unsigned PoCs aging); ops dashboard for sync health

## Performance Budget

- Inherits §5.1: mobile cold-start to member list ≤4s; member detail ≤2s; sync-batch ack ≤500ms p95; signature-save ≤1s
- Offline-to-online sync of typical day's work (≤30 ops) completes in ≤60s

## Dependencies & Sequencing

**Blocked by:**
- DA-14 RBAC v1 (caseload scoping)
- CM-02 Unified Member Context (data backbone)
- CM-03 Key Member Info Display (header pattern)

**Blocks (consumers of this surface):**
- CD-19 SDoH Assessment (CHW reaches assessment from this surface)
- CM-22 ECM Outreach Tracking (cap visualization shown inside member view)
- CM-09 Communication History (rendered inside member view)
- CM-12 Bulk SMS (launched from member view)
- CM-05 SDoH Referrals (created from member view)
- CD-13/14 Care Plan Review/Editing (opened from PoC card)
- CD-18 Task & Schedule Management (today view consumed here)

**Parallel-safe with:** all CC-* tickets (different module entirely), CD-06/CD-07 (Provider-side flows)

**External contracts:**
- Mobile push notification service (provider TBD)
- Photo storage in S3 with PHI-safe lifecycle policy
- MDM provider for managed devices (vendor TBD)

## Test Strategy

**Unit:**
- Caseload-filter query correctness
- Plan of Care versioning logic (no lost updates)
- Sync-operation conflict-detection logic (simulated time-skewed edits)
- Signature image storage and retrieval
- RBAC scope filter applied even if client requests broader scope

**Integration:**
- End-to-end PoC edit → version → sign → render
- Field visit → Interaction creation → CM-09 feed render
- Offline batch sync round-trip with no conflicts
- Offline batch sync with conflicts (3 scenarios: take-mine, take-server, escalate)
- Remote wipe end-to-end

**E2E (mobile + web):**
- CHW completes an in-home visit (sign-in → member → field visit log → PoC update → signature → offline submit)
- Conflict resolution flow on sync

**Compliance tests:**
- Audit log emitted for every PHI access (DA-13 verification)
- RBAC denial logged and not silent
- Provenance tag set correctly on every new record (DA-11)

**Performance / load:**
- Caseload of 200 members loads within budget
- Sync of 100 offline operations within budget

**Accessibility:**
- Automated axe-core scan on every web view
- Manual screen-reader pass on mobile

**Fixtures:**
- Synthetic CHW with 25-member caseload, 5 with open PoCs, 3 with overdue items, 2 with unsigned consents, 1 with active conflict

## Rollout

- **Feature flag:** `chw_workflows_mobile_v1` (mobile), `chw_workflows_web_v1` (web)
- **Cohort:** internal CHW pilot (5 users, 1 supervisor) for 2 weeks before broader rollout
- **Rollback trigger:** sync failure rate >2% sustained for 30min, or any data-loss incident, or remote-wipe failure
- **Comms plan:** training session for pilot CHWs; brief recorded walkthrough; in-app onboarding for general rollout
- **Data backfill:** none (new feature, no historical data to migrate)

## Definition of Done

- [ ] All ACs pass in staging on both iOS and Android plus web
- [ ] Unit + integration + E2E tests written and green; coverage ≥80% on new code
- [ ] Audit log entries verified in log store for read, write, sync, conflict, RBAC denial
- [ ] RBAC scope test with cross-caseload member (denial + DA-13 entry confirmed)
- [ ] DA-11 provenance tag present on every record type written by this feature
- [ ] Mobile a11y manual pass complete (VoiceOver iOS, TalkBack Android)
- [ ] Web a11y axe-core scan passes
- [ ] Performance budgets met under load test (caseload 200, sync 100 ops)
- [ ] Feature flags configured with default state documented
- [ ] Runbook / on-call doc updated (sync failures, conflict queue, remote wipe)
- [ ] PHI handling reviewed by security
- [ ] MDM integration verified end-to-end including remote wipe
- [ ] Pilot training material delivered
- [ ] API spec published

## Success Metric in Production

- **Adoption:** ≥80% of active CHWs use the mobile app weekly within 30 days of GA
- **Reliability:** sync success rate ≥99.5%, conflict rate ≤2%
- **Productivity:** median time-from-visit-to-signed-PoC drops from baseline (target: 50% reduction)
- **Compliance:** zero PHI-in-logs incidents, zero unauthorized cross-caseload access incidents
- **Adoption signal:** ≥60% of in-home visits logged via mobile (vs. desktop after-the-fact)

## Stop-and-Ask-the-Human Triggers (for subagents)

The subagent MUST pause and ask the human operator before proceeding if it encounters:

- Any change to the **Plan of Care schema** beyond what this ticket explicitly authorizes (touches CD-08/09/13/14 contracts)
- Any change to the **Consent model** (DA-12) — even read patterns
- Any change to the **Audit log** (DA-13) emission contract
- Any change to **RBAC scoping logic** (DA-14) — even adding a new scope dimension
- Any **mobile device security control** modification (MDM, encryption, remote wipe, biometric)
- Any **offline conflict-resolution policy** change (the user-prompted-merge model is intentional and policy-anchored)
- Any **photo storage / S3 policy** change (PHI lifecycle implications)
- Any UI copy in **consent prompts**, **HIPAA notices**, or **anti-steering boundaries**
- Schema migration touching production PHI
- Any **integration contract change** with mobile push, MDM, or storage providers
- Any decision that would require a member to **re-sign** an existing Plan of Care

## Open Questions

1. **Native vs React Native** for mobile? Affects offline storage, biometric APIs, photo capture quality.
2. **MDM vendor selection** (Intune, Jamf, Workspace ONE, etc.) — blocks production sign-in policy.
3. **Push notification provider** — Firebase (despite v1 v2 migration plan), APNS direct, OneSignal, other?
4. **Signature legal sufficiency** in CA, FL, TX, NY — does our signature capture meet ESIGN/UETA requirements? Legal review needed before enabling member-signed Plan of Care as a billable artifact.
5. **Caseload size assumptions** — typical CHW caseload size? (Affects caseload-list pagination and performance budget.)
6. **Photo retention policy** — how long do we keep field-visit photos? Tied to Document lifecycle.
7. **Supervisor view scope** — exactly which CHW data can a supervisor see? Direct reports only, or full team-of-teams?
8. **v2 priority/phase** — your v2 has CM-13 as Should/Phase 2, but as the demo opener this ticket needs to be Must/Phase 1. Confirm or adjust priority.

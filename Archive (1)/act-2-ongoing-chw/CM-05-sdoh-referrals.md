---
id: CM-05
title: "SDoH Referrals"
source_requirement: CM-05
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw, supplier]
labels: [demo-5-5, track-1, sdoh, referral, supplier-network]
blocked_by: [CM-02, CD-19, DA-13]
blocks: []
parallel_safe_with: [SUP-13]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-05 — SDoH Referrals

## Background & User Context

When a CM/CHW identifies a non-clinical need (housing, food, transportation, utilities), they refer the member to an internal team or external supplier (Upside for housing, food banks, transit support). Today this is email or phone; status disappears. The platform makes referrals first-class records with status tracking, supplier visibility, and feedback.

In the demo: Maria's SDoH assessment (CD-19) flagged food insecurity → CHW creates an SDoH referral to a food-bank partner; status tracks Referred → Accepted → Fulfilled.

## User Story

As a CM (or CHW), I want to refer a member to an internal team or supplier for a non-health service and track the status from referral through fulfillment, so I know whether the need was met and the member doesn't fall through the cracks.

## Scope

**In scope:**
- Referral form linked to member + supplier directory
- Supplier directory (admin-managed; includes external partners + internal teams)
- Status lifecycle: Referred → Accepted → Fulfilled / Closed (with substates for declined, no-response)
- Supplier notification (integration if supplier is on platform; email/SFTP if external)
- Status visible in member case file and supplier view (per RBAC)
- Linkage to SDoH Case (auto if originated from CD-19 trigger)
- Audit on every state change

**Out of scope / Non-goals:**
- General supplier referrals (non-SDoH) → SUP-13 uses same model but different surface
- Supplier directory CRUD UI → admin tooling
- Member self-service referral request → out of scope this ticket

## Functional Requirements

1. From a member profile or open SDoH Case, "Create SDoH Referral" launches a form: pick referral type (food, housing, etc.), pick supplier from directory, add notes, submit.
2. Referral creates a Referral record + assigns owner per supplier rules.
3. Supplier notified per integration mode (in-platform notification for on-platform suppliers; email/SFTP for external).
4. Status lifecycle: Referred → Accepted → Fulfilled / Closed; substates: Declined, No-Response (after configurable timeout), Cancelled.
5. Status updates by supplier reflect on member case file in near real time.
6. Member-level view: all referrals open + closed visible in member profile.
7. CM/CHW notified on status change; auto-create follow-up case if status = Declined / No-Response per CM rules.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Create referral**
- *Given* CHW on a member with an open Food Insecurity Case
- *When* they create an SDoH referral picking a food-bank supplier
- *Then* Referral record created (status=Referred); supplier notified; visible in case + member profile

**AC-2 — Supplier accepts**
- *Given* a Referred-status referral
- *When* supplier marks Accepted
- *Then* status updates; CHW notified; member profile reflects

**AC-3 — Auto-link to SDoH Case**
- *Given* an SDoH Case with origin=CD-19 trigger
- *When* CHW creates a referral from this Case
- *Then* referral auto-linked to the Case; visible in Case detail

**AC-4 — No-response timeout**
- *Given* a referral in Referred status for 7 days with no supplier action (configurable)
- *When* timeout fires
- *Then* status auto-transitions to No-Response; CHW alerted; follow-up case auto-created per rule

**AC-5 — Status visible to supplier**
- *Given* a supplier user (e.g., food-bank partner)
- *When* they view their referral queue
- *Then* they see their assigned referrals with member context (minimum-necessary scope)

**AC-6 — Audit logged**
- *Given* any referral creation or state change
- *When* the change occurs
- *Then* DA-13 audit event written

## Data Model

**Referral (write):**
- referral_id, member_id, type (food/housing/etc.), supplier_id, originating_case_id (nullable), originating_user_id, notes, status, status_history[], created_at, last_status_change_at, provenance_tag

**Supplier (read; admin-managed):** supplier_id, name, type, integration_mode (in-platform / email / sftp), accepted_referral_types[], geographic_scope, contact_info

**No-response timer config:** per-supplier or per-type timeout duration

## API Contract

- `POST /v1/members/{id}/referrals` → create
- `GET /v1/members/{id}/referrals` → list per member
- `PATCH /v1/referrals/{id}/status` → update status (supplier or CM)
- `GET /v1/suppliers/{id}/referral-queue` → supplier view
- `GET /v1/suppliers?type={...}&geography={...}` → directory search

## UI / UX Specification

- Create referral: modal with type, supplier picker (filtered by type + geography), notes
- Member-profile referral list: status badges, click to detail
- Supplier view: queue table with sortable status, click to detail with member context
- Notification: in-platform + optional email per user preferences

**States:** referral form, draft, submitting, created, accepted, fulfilled, declined, no-response, cancelled, error

## Edge Cases & Error Handling

- Supplier directory has no match for type+geography → fallback "Refer to internal team" or manual entry
- Referral to external supplier via email — supplier non-responsive → no-response timer fires
- Supplier marks Fulfilled then member reports unmet need → CHW can re-open or create new referral; original record immutable
- Member opt-out of referrals to a specific supplier → preference stored; future referrals blocked
- Bulk referral creation (multiple members to one supplier) — out of scope; single referrals only

## Security, Privacy & Compliance

- **PHI:** referral notes + member context shared with supplier (minimum necessary)
- **Provenance:** referral inherits member's tag; cross-entity transmission rules apply per AC-05 (consent-backed transfer for AC-tagged)
- **Consent:** SDoH consent / data-sharing consent required for transmission to external supplier
- **RBAC:** CM/CHW with assignment can create; supplier sees only assigned referrals
- **Audit:** every transition

## Observability

- Metrics: referrals/week per CM, mean time-to-acceptance, fulfillment rate, no-response rate by supplier
- Alerts: no-response rate >X% for any supplier (supplier-quality signal)

## Performance Budget

- Create referral <1s
- Member-referral-list load <500ms

## Dependencies & Sequencing

**Blocked by:** CM-02, CD-19 (auto-link from triggers), DA-13
**Parallel-safe with:** SUP-13 (general supplier referrals share data model)

## Test Strategy

**Unit:** state machine, no-response timer, auto-link logic
**Integration:** create → supplier notify → status updates → CM notified → auto-follow-up Case
**E2E:** Track 1 Act 2 demo (Maria food-insecurity referral)
**Compliance:** audit emitted, RBAC enforced
**Fixtures:** suppliers of each integration mode, no-response scenario, declined scenario

## Rollout

- **Feature flag:** `sdoh_referrals_v1`
- Supplier directory pre-populated with launch partners

## Definition of Done

- [ ] All ACs pass
- [ ] State machine + no-response timer reliable
- [ ] Supplier notification (each integration mode) verified
- [ ] CM-09 logging of referral activity verified
- [ ] Audit log emitted

## Success Metric in Production

- **Volume:** mean SDoH referrals/CHW/week ≥5
- **Resolution:** ≥70% of referrals reach a terminal state within 30 days
- **Closing the loop:** ≥85% of triggered SDoH Cases have at least one referral

## Stop-and-Ask-the-Human Triggers

- Adding new **integration mode** for suppliers
- Changes to **PHI minimum-necessary set** sent to suppliers
- Changes to **status lifecycle** (state machine)
- Adding any **bulk referral** capability
- Cross-entity transmission policy changes (AC-05 dependency)

## Open Questions

1. Supplier directory governance — admin-managed; vendor onboarding workflow?
2. Member opt-out per supplier — surface where?
3. Referral notes — PHI minimization rules; reviewed?
4. Outcome reporting from suppliers — beyond status, capture qualitative outcomes?
5. SLA expectations per supplier type?

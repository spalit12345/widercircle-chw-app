---
id: CD-05
title: "Consent Management (Telehealth Visit)"
source_requirement: CD-05
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: care-delivery
phase: 1
priority: must
persona: provider
secondary_personas: [clinical-staff, chw, compliance-officer]
labels: [demo-5-5, track-1, hero, consent, billing-prereq, e-signature]
blocked_by: [DA-12, DA-13, CM-02]
blocks: [CD-06, CD-08, CD-10]
parallel_safe_with: [CD-07, CD-11]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-05 — Consent Management (Telehealth Visit)

## Background & User Context

The Provider cannot legally bill for an initiating telehealth visit without explicit member consent for CHI/PIN services. The capture must be tamper-proof, timestamped, attributable, and auditable. The v2 narrative explicitly added the **verbal consent path** for cases where the member did not complete pre-visit forms — Provider captures verbal consent in the meeting itself.

In the demo, this is the moment right before the telehealth visit starts: Provider sees consent missing, captures verbal consent in flow, then proceeds.

## User Story

As a Provider, I want a frictionless way to capture and store consent for telehealth services during the visit — either via e-signature if the member completed forms ahead, or via verbal consent in the meeting if they didn't — so I can begin care without administrative drag and stay billing-compliant.

## Scope

**In scope:**
- Consent UI block embedded in the visit-start flow (CD-06 launches into this if no valid consent)
- Two capture methods: pre-visit e-signature (member portal) and verbal-consent-attestation (Provider checkbox + spoken script)
- Storage as Consent records per DA-12 unified consent model
- Immutable audit trail via DA-13
- Renders consent gap warning in member header (CM-03) when missing
- Re-consent workflow for expired consents

**Out of scope / Non-goals:**
- Other consent types (TCPA, recording, data sharing) — different captures, same DA-12 model
- Member portal e-signature UI itself — patient-facing surface
- Anti-steering enforcement — AC-10

## Functional Requirements

1. Telehealth visit start (CD-06) checks for valid Telehealth/CHI consent on file (DA-12); blocks if missing.
2. Provider sees consent block with two capture options: (a) "Member already signed via portal" (auto-confirmed if valid), (b) "Capture verbal consent now" — script displayed, Provider checks acknowledgment.
3. Verbal consent capture records: provider_id, member_id, timestamp (UTC), encounter_id, script version, attestation method = `verbal`.
4. E-signature path: signature image, IP, device, timestamp.
5. Consent record is immutable once saved (DA-12 contract).
6. Visit cannot proceed to In Progress status until consent is captured.
7. Member header (CM-03) shows consent gap warning when required consents are missing.
8. Consent expiration: per program config (default 12 months for Telehealth/CHI); expiration triggers re-consent prompt.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Consent gap blocks visit start**
- *Given* a member with no valid Telehealth consent on file
- *When* the Provider clicks "Launch Visit"
- *Then* the consent block appears; visit status remains Scheduled until consent is captured

**AC-2 — Verbal consent captured in flow**
- *Given* the Provider in the consent block, member on video
- *When* Provider reads script and checks "Verbal consent obtained"
- *Then* a Consent record is created (DA-12) with method=verbal, script version, encounter linkage, attribution; visit can proceed

**AC-3 — Pre-visit e-signature recognized**
- *Given* a member who signed Telehealth consent via portal yesterday
- *When* the Provider arrives at the consent block
- *Then* the block auto-confirms with "Consent on file (signed YYYY-MM-DD)" — no extra capture required

**AC-4 — Consent immutable**
- *Given* a saved Consent record
- *When* anyone (including admin) attempts to modify it
- *Then* the modification is rejected; revocation is the only allowed downstream action (separate record)

**AC-5 — Audit logged with capture method**
- *Given* any consent capture (verbal or e-sig)
- *When* the record is written
- *Then* DA-13 audit event emitted with capture method, script version, actor, member_id

**AC-6 — Expired consent re-prompts**
- *Given* a consent that expired 30 days ago
- *When* Provider attempts to start visit
- *Then* the consent block appears as if no consent on file; new capture required

**AC-7 — Compliance can audit**
- *Given* a Compliance Officer reviewing a member's consent history
- *When* they open the consent panel
- *Then* full history is visible with timestamps, methods, script versions, and the raw record (signature blob or verbal attestation)

## Data Model

**Consent (write per DA-12):**
- consent_id, consent_type=`telehealth_chi`, member_id, effective_date, expiration_date, method (`e_signature` | `verbal`), captured_by (provider_id), capture_context (encounter_id), script_version, source_system=`platform`, signature_blob_id (nullable, for e-sig), provenance_tag, created_at

**Consent Script Version (read):** versioned consent script content for legal traceability

**Audit Event (write):** every capture, every read

## API Contract

- `GET /v1/members/{id}/consents?type=telehealth_chi&status=active` → returns active consent or empty
- `POST /v1/members/{id}/consents` → captures new consent (idempotency key required)
- Body for verbal capture: `{type, method:'verbal', script_version, encounter_id, attestation_text}`
- Body for e-sig capture: `{type, method:'e_signature', signature_blob_b64, signer_info}`

## UI / UX Specification

- Modal embedded in visit-start flow
- Two clear paths visible: "Member signed ahead" (auto-confirmed) vs. "Capture verbal consent"
- Verbal flow: script displayed in large readable type; checkbox "I read this script and member consented verbally"; explicit confirmation button
- E-sig flow: signature pad, member name confirmation, "Sign and continue"
- Cannot dismiss without capturing or canceling visit start

**States:** loading (consent check), no-consent-on-file, expired-consent, valid-consent (auto-pass), capturing-verbal, capturing-esig, error (storage failure — retry)

**Accessibility:** WCAG AA; script is readable text (not image); attestation requires explicit click (not just focus)

## Edge Cases & Error Handling

- Network drops mid-capture → in-progress capture retried on reconnect; visit blocked until success
- Member revokes consent during visit → visit pauses; Provider notified; revocation logged
- Multiple Providers attempting same encounter consent simultaneously → idempotency key prevents duplicate
- Wrong consent type captured (e.g., HIPAA auth instead of telehealth) → does not satisfy block
- Member is a minor → guardian-consent path required (deferred — see Open Questions)

## Security, Privacy & Compliance

- **PHI:** consent records contain member identity, encounter context, signature image
- **Provenance:** consent record inherits member's provenance tag
- **Immutability:** consent records cannot be modified; revocations are separate records
- **RBAC:** capture restricted to Provider role on the assigned encounter; viewing scoped per role
- **Audit:** every capture, every read by non-routine roles, every revocation
- **Legal:** verbal consent script versioning ensures legal traceability of exact wording used

## Observability

- Metrics: consent-block-encountered rate, verbal vs e-sig split, time-from-block-to-capture, capture failure rate
- Alerts: capture failure rate >1%, expired-consent spike (re-consent backlog), script version mismatch

## Performance Budget

- Consent check on visit start <500ms
- Capture save <1s

## Dependencies & Sequencing

**Blocked by:** DA-12 (consent model), DA-13 (audit), CM-02 (member context)
**Blocks:** CD-06 (visit launch gated), CD-08 (action plan locked until consent), CD-10 (billing requires consent)
**External contracts:** none — internal capture

## Test Strategy

**Unit:** consent-validity checker; script versioning; immutability enforcement
**Integration:** visit-start flow with each consent state (none, valid, expired, revoked)
**E2E:** Provider verbal-consent flow (Track 1 demo); pre-visit e-sig flow
**Compliance:** audit emitted, script version recorded, immutability enforced
**Performance:** capture under load
**Fixtures:** members with each consent state; multiple script versions

## Rollout

- **Feature flag:** `consent_management_v1`
- **Cohort:** Provider pilot before broader
- **Rollback trigger:** capture failures, audit gaps, billing claim rejections traced to consent issues

## Definition of Done

- [ ] All ACs pass
- [ ] Verbal and e-sig paths both green
- [ ] Audit log emitted with script version
- [ ] Immutability enforced (test attempts to modify rejected)
- [ ] Visit-start blocked when consent invalid (no bypass)
- [ ] Performance budget met
- [ ] Legal review of verbal script and attestation flow complete
- [ ] DA-12 unified model integration verified

## Success Metric in Production

- **Compliance:** zero billed visits without valid consent on file
- **Friction:** verbal-consent capture <30s median during visit start
- **Audit-readiness:** any consent record fully reconstructable (script version + attestation + actor + timestamp) within 1 click

## Stop-and-Ask-the-Human Triggers

- Any change to the **DA-12 consent model contract**
- Adding a new **capture method** beyond verbal and e-signature
- Changes to the **verbal script content** (legal review required)
- Changes to **consent expiration default** for any consent type
- Changes to the **immutability rule** (e.g., allowing edits)
- Adding **bypass workflows** for visit start without consent
- Any **minor / guardian** consent flow design

## Open Questions

1. Minor consent / guardian flow — out of Phase 1 scope, but when/how?
2. Verbal script translation — required for non-English members? (Likely yes — needs translation + version tracking per language)
3. Consent expiration durations per type — admin-configurable? Defaults?
4. Witness requirement for verbal consent — single Provider sufficient, or witness needed?
5. Re-consent UX — full flow or abbreviated for renewal?

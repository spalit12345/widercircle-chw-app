---
id: CM-03
title: "Key Member Info Display (Header Pattern)"
source_requirement: CM-03
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-1-intake-visit
module: case-management
phase: 1
priority: must
persona: case-manager
secondary_personas: [chw, provider, contact-center-agent, supervisor]
labels: [demo-5-5, track-1, member-profile, header, ui-pattern]
blocked_by: [CM-02, DA-11, DA-14]
blocks: [CM-13, CC-03, CC-04, CD-07]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-03 — Key Member Info Display (Header Pattern)

## Background & User Context

When a CM, Agent, or Provider is on a call or about to engage a member, they need critical attributes visible *immediately* without scrolling or hunting — health plan, Plan ID, primary language, state, ZIP, preferred contact method, risk tier, plus case-type-specific fields like PCP info or prescription details. Today this is buried across screens; the result is staff opening conversations cold or fumbling for context.

This is a UI primitive. It renders inside CM-02 (member profile), at the top of CC-04 (call screen), and inside CM-13 (CHW view). Same data, same component, slightly different density per surface.

## User Story

As a CM, Agent, or Provider opening a member's record, I want the most critical attributes for the situation visible at a glance — so I am prepared the moment I engage with the member.

## Scope

**In scope:**
- Reusable header component with two display modes: compact (call screens) and expanded (profile pages)
- Core attribute set always shown: name, member ID, Plan name + Plan ID, primary language, state, ZIP, preferred contact method, risk tier, provenance tag (DA-11)
- Case-type-aware extension: when on a case, additional fields surface (PCP name/phone for clinical case; Rx info for MediCircle case; Population of Focus for ECM; etc.)
- Quick-action buttons: call, SMS, schedule (when supported by role)
- Visible warnings: deceased flag, opt-out status, consent gaps, sequential-case-blocked indicator

**Out of scope / Non-goals:**
- The member profile body sections — owned by CM-02
- Quick-action implementations — they delegate to CC-01, CM-12, CD-12

## Functional Requirements

1. Component renders in two modes: compact (height ~48-60px for call screens) and expanded (full header for profile pages).
2. Core attributes (8 fields) always present in a known visual layout.
3. Case-type-aware fields render based on the member's currently-open case context (admin-configurable per case type).
4. Provenance badge renders per DA-11 visibility rules.
5. Warning banners render above the header when applicable: deceased, opt-out, consent gap, sequential-case-blocked.
6. Quick actions visible/enabled per RBAC scope.
7. Header must remain sticky on scroll in expanded mode.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Compact mode in CC call screen**
- *Given* an Agent answers an inbound call
- *When* CC-03 screen-pop opens the member context
- *Then* the header renders in compact mode with all 8 core attributes within the screen-pop NFR (<3s)

**AC-2 — Expanded mode in profile**
- *Given* a CM opens a member profile
- *When* the profile loads
- *Then* the header renders in expanded mode with core attributes + case-type-specific fields if a case is active

**AC-3 — Case-type extension**
- *Given* a member with an open MediCircle Rx case
- *When* the header renders
- *Then* prescription bundle status surfaces in the header per the MediCircle case-type config

**AC-4 — Deceased banner**
- *Given* a member with the deceased flag set
- *When* any user opens the profile
- *Then* a prominent banner renders above the header; outreach quick-actions disabled

**AC-5 — Provenance visible to compliance**
- *Given* a Compliance Officer viewing the profile
- *When* the header renders
- *Then* the BA/CE/Dual badge is visible

## Data Model

- Reads from Member, Plan, Case, Consent, Communication Preference, Provenance Tag (all owned elsewhere)
- No writes (display-only component)

## API Contract

- Consumes `GET /v1/members/{id}` and `GET /v1/members/{id}/case-context?caseId={id}` from CM-02
- Quick-action buttons fire local events that delegate to CC-01, CM-12, CD-12 endpoints

## UI / UX Specification

**Compact mode:**
- Single line: name | plan abbrev | language | risk | quick actions
- Hover/tap reveals full data

**Expanded mode:**
- Two rows: row 1 = name, plan, member ID, language, state, ZIP, contact pref, risk tier, provenance badge; row 2 = case-type-specific
- Quick-action button group right-aligned
- Warning banners stack above

**States:** loading, default, with-warnings (deceased / opt-out / consent gap / sequential blocked), case-active vs no-case-active, role-restricted quick actions

**Accessibility:** WCAG 2.1 AA; warning banners are role="alert"; sticky behavior preserves keyboard focus

## Edge Cases & Error Handling

- Member with no plan on file → show "No plan" placeholder
- Member with multiple active plans → show primary, indicator that more exist
- Risk tier not yet computed → show "Pending"
- Multiple active cases → header shows the contextually-relevant case (the one being viewed)
- Quick action user lacks permission → button absent (not disabled-with-error)

## Security, Privacy & Compliance

- **PHI:** name, plan, contact, clinical risk tier
- **Provenance:** badge per DA-11
- **Consent:** consent-gap warning surfaces when required consents missing for member's program
- **RBAC:** quick actions gated; some attributes (e.g., risk tier) hidden from roles without clinical scope
- **Audit:** header render logged as part of profile view event (CM-02), not separately

## Observability

- Metrics: header render p95, warning-banner display frequency, quick-action click-through rate

## Performance Budget

- Header render <300ms (it's part of the broader profile budget)
- Compact mode in CC screen pop must not extend beyond the <3s screen-pop NFR

## Dependencies & Sequencing

**Blocked by:** CM-02 (data backbone), DA-11 (provenance), DA-14 (RBAC)
**Blocks:** CM-13, CC-03, CC-04, CD-07 (all of which embed this header)

## Test Strategy

**Unit:** rendering matrix per role × case type; warning banner trigger conditions
**Integration:** header in CM-02 profile, header in CC-03 call screen
**E2E:** demo flow for CHW (Track 1) and Agent (Track 2)
**Accessibility:** axe-core; banner announcement timing
**Fixtures:** member with each warning condition; member with each case type variant

## Rollout

- **Feature flag:** `member_header_v1`
- **Rollout:** ships with CM-02 (atomic); cannot enable independently

## Definition of Done

- [ ] All ACs pass
- [ ] Unit/integration/E2E green
- [ ] axe-core scan passes
- [ ] Header verified in all consuming surfaces (profile, call, CHW view)
- [ ] Performance budget met
- [ ] Configurable case-type field map defined for at least: clinical, ECM, MediCircle Rx, Upside housing
- [ ] Warning-banner copy reviewed by compliance

## Success Metric in Production

- **Time-to-context drops:** Agent reports "I knew enough to start the call" on >90% of inbound calls within 30 days
- **No miss errors:** zero incidents of staff outreaching to a deceased or opted-out member due to header miss

## Stop-and-Ask-the-Human Triggers

- Adding/removing core attribute fields
- Changes to warning banner trigger conditions (deceased, opt-out, consent gap)
- RBAC changes to quick-action visibility
- Any change to the case-type field configuration schema

## Open Questions

1. Exact case-type field map — needs business input per case type (ECM, MediCircle, Upside, etc.)
2. Risk tier source — CD or CM owned? Refresh cadence?
3. Should header expose any AI insights ("members with similar profile completed CCM at X rate")? Likely Phase 3.
4. Compact vs expanded — is there a third mode for mobile?

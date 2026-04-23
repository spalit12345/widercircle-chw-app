# CD-05 — Consent Management (Telehealth)

**Phase 1 · Must · Persona: Provider · Demo role: ⭐ hero (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-05-consent-management.md`

## Goal
Capture and store Telehealth/CHI consent in-flow at visit start. Two paths: pre-visit e-sig (portal) or verbal consent attestation by Provider. Block visit start if no valid consent.

## In scope
- Consent block in CD-06 visit-launch flow
- Verbal-consent capture: script (versioned), Provider attestation checkbox
- E-sig recognition from portal submissions
- Consent records stored per DA-12 (immutable)
- Consent gap warning in CM-03 member header
- Expiration → re-consent prompt (default 12mo for Telehealth/CHI)

## Out of scope
Other consent types (TCPA, recording, data sharing — same DA-12 model, different captures). Patient portal e-sig UI. Anti-steering (AC-10).

## Key acceptance criteria
- No valid consent → visit-start blocked (AC-1)
- Verbal capture writes Consent with `method=verbal`, script_version, encounter_id, attribution (AC-2)
- Pre-visit e-sig auto-confirms (AC-3)
- Consent record immutable — revocation is a separate record (AC-4)
- Expired consent re-prompts as if missing (AC-6)

## API
- `GET /v1/members/{id}/consents?type=telehealth_chi&status=active`
- `POST /v1/members/{id}/consents` (idempotency key required)

## Depends on
DA-12 (consent model), DA-13 (audit), CM-02 (member context)

## Blocks
CD-06, CD-08, CD-10

## Stop-and-ask triggers
DA-12 contract changes · new capture methods · verbal script content changes (legal) · expiration defaults · immutability rule · visit-start bypass · minor/guardian flow

## UI

Shared DS reference: [UI conventions in README](./README.md#design-system-shared). Prototype file: [`Design/src/primitives.jsx`](../../Design/src/primitives.jsx).

**Consent block** — centered modal launched from Visit Workspace (CD-06) pre-start.

- Container: `Card` radius 20, 24 pad, over a tint-100 backdrop.
- Heading: `wc-h2` "Telehealth & CHI consent required".
- Member summary row: Avatar 40 + name + `Badge tone="neutral"` (Plan ID mono).
- **Two paths** rendered as radio `Chip` group (selected=black):
  1. **"Member signed via portal"** — if valid e-sig on file, the chip auto-selects with a success `Badge dot` "Signed YYYY-MM-DD · e-signature" and the primary CTA becomes "Continue".
  2. **"Capture verbal consent now"** — reveals script card (`base-50` bg, radius 15, P2 Inter body, 16 pad) showing the exact versioned script text. Below: `Toggle` "I read this script and the member consented verbally" + final brand `Btn` "Confirm & continue" (disabled until toggle on).
- If consent **expired**: inline warning strip (warning-100 bg, `Icon.alert` warning-700) showing last consent date + "Capture new consent".
- **Cannot dismiss** without capturing or explicit "Cancel visit start" tertiary.

**Member header consent badge** — on `MemberSidePanel`/`MemberTopHeader`, show `Badge tone="success" dot` "Consent on file" when valid, or `Badge tone="error" dot` "Consent needed" with `Icon.lock` when missing. Clicking opens the consent block.

**Compliance officer view** — a sub-section added to the Patient 360 **Clinical tab** `SectionCard` titled "Consent history": table rows with consent type, method badge (`e_signature` info / `verbal` neutral), effective date, expiration, script version (mono), actor. "View record" → opens modal with raw attestation / signature blob.

**States** — loading (section skeleton), no-consent, valid-consent, expired, capturing-verbal, capturing-esig, error (inline alert with retry). Focus lock inside the modal.

**Tokens used** — `--wc-brand-500` (Continue button), `--wc-tint-100` (backdrop), `--wc-success-500` (on-file badge), `--wc-error-500` (expired), `--wc-radius-xl` (modal).

## Open questions
1. Minor/guardian consent flow — deferred
2. Non-English verbal script translation (and versioning per language)
3. Consent expiration admin-configurable per type?
4. Witness requirement for verbal?
5. Re-consent UX — full or abbreviated?

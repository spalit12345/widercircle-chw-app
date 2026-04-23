# CD-09 — Clinical Staff Supervision (Provider Sign-Off Queue)

**Phase 1 · Must · Persona: Provider · Demo role: ◯ supporting (Act 2)**
Full ticket: `Archive (1)/act-2-ongoing-chw/CD-09-clinical-staff-supervision.md`

## Goal
Provider's queue of clinical-staff documentation pending sign-off. One-click Approve or Request Revision with note. Enables Incident-To billing.

## In scope
- Per-Provider sign-off queue (+ supervisor team view)
- Submission detail with read-only doc render
- Approve (immutable sign-off, lock retained) or Request Revision (status flips, lock releases)
- Separation of duties (Provider cannot sign their own submission)
- Multiple cycles supported; full history retained

## Out of scope
Submission action (CD-15), Plan editing (CD-14), billing sync (CD-10).

## Key acceptance criteria
- Queue loads <2s (AC-1)
- Approve = immutable sign-off + notify submitter (AC-2)
- Revision Requested releases lock with note (AC-3)
- Sign-off records immutable (AC-4)
- Approved Plan → eligible for billing export (AC-5)

## Data model
**Sign-Off Record** (signoff_id, submission_id, plan_id, plan_version_id, signed_by_provider_id, signed_at, action, note, provenance_tag)

## API
- `GET /v1/providers/{uid}/signoff-queue`
- `GET /v1/submissions/{id}`
- `POST /v1/submissions/{id}/approve`
- `POST /v1/submissions/{id}/request-revision`

## Depends on
CD-15, DA-13

## Blocks
CD-10

## Stop-and-ask triggers
Immutability/sep-of-duties rules · bulk approve without per-item confirmation · any auto-approve

## UI

Shared DS: [README](./README.md#design-system-shared).

**Surface** — accessible from LeftRail **My queue** nav item (badge count = pending sign-offs) and from Provider's Today view (CD-18) as "Sign-off queue (N)". Route `/queue/signoff`.

- **Page header**: H1 "Sign-off queue" + age-sort toggle (`Tabs pill`: "Oldest first" / "Recent") + filter `Chip` row (All · >24h · By submitter · By member). Right: `Badge tone="error"` with aged->48h count if any.
- **Queue list** — one `SectionCard pad={0}` containing dense rows (8/0 padding per row, border-bottom `base-100`). Each row:
  - Age chip left (mono number + "h"/"d"; tone: success <12h · warning 12-24h · error >24h).
  - Submitter Avatar 32 + name + role (`wc-caption`).
  - Member: Avatar 24 + name + Plan ID mono (13px).
  - Submission summary: encounter type · Plan version (mono) · cycle # if >1.
  - Right actions: brand `Btn md` **Approve** · secondary `Btn md` **Request revision** · `Icon.chevR` to open detail.
- **Detail drawer** (slides in from right, width 640, `shadow-lg`): Plan rendered read-only using the CD-08 card layout (no edit affordances). Submitter note at top; cycle history accordion below. Bottom sticky action bar: **Approve** brand lg · **Request revision** secondary lg (opens note modal required).
- **Request revision modal**: `Field` label "What needs to change?" + `Textarea rows=4` required · brand `Btn` "Send revision request".
- **Bulk approve** — checkbox column on rows; sticky action bar appears on selection: "Approve 3 selected" — opens confirmation list (each Plan gets a preview + individual `Toggle` confirm) before commit. No silent batching.
- **Separation-of-duties**: if current user was submitter, row shows `Icon.lock` disabled state with tooltip "You cannot sign off on your own submission".
- **Empty state**: `Empty` "Nothing pending. Nice work." with `Icon.check` success tint.
- **States**: queue (loading / list / empty), detail (loading / displayed), approving, approved (row fades out, success toast), revision-requesting, error.

**Tokens used** — `--wc-error-700` (aged rows), `--wc-base-700` (Approve primary), `--wc-radius-xl` (drawer).

## Open questions
1. Auto-assignment — same Provider as encounter, or any available?
2. Bulk approve UX — per-Plan explicit or single batch confirm?
3. Coverage rules when assigned Provider unavailable
4. Mobile sign-off Phase 1?

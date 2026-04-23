# CD-15 — Provider Review Submission

**Phase 1 · Must · Persona: Clinical Staff · Demo role: ◯ supporting (Act 2)**
Full ticket: `Archive (1)/act-2-ongoing-chw/CD-15-provider-review-submission.md`

## Goal
NP/CHW submits documentation to Provider for sign-off. Lock the Plan between submit and Provider response so sign-off is deterministic. Full cycle history retained.

## In scope
- "Submit for Provider Review" action on completed Plan
- State machine: Draft → Submitted → Approved | Revision Requested
- Lock on Submitted (editing blocked for all); released on Revision Requested or Approved (retained for audit)
- Provider notification on submission
- Supervisor unlock-with-reason workflow (for Provider unavailability)
- Multiple cycles; full history

## Out of scope
Sign-off action (CD-09), Plan editing (CD-14), billing sync (CD-10).

## Key acceptance criteria
- Submit → locks + notifies Provider (AC-1)
- Approved → lock retained (immutable for audit/billing) (AC-2)
- Revision Requested → lock released + note sent; cycle increments (AC-3)
- Full cycle history visible (AC-4)

## Data model
**Submission Record** (submission_id, plan_id, plan_version_id, submitted_by, submitted_at, status, provider_user_id, provider_responded_at, revision_note, cycle_number)
**Plan** update: review_status, current_submission_id, locked bool

## API
- `POST /v1/plan-of-care/{id}/submissions`
- `GET /v1/plan-of-care/{id}/submissions`
- `POST /v1/submissions/{id}/unlock` (supervisor w/ reason)

## Depends on
CD-08, CD-14, DA-13

## Blocks
CD-09, CD-10

## Stop-and-ask triggers
Lock policy/unlock workflow · Provider-unavailable bypass · bulk submission

## UI

Shared DS: [README](./README.md#design-system-shared). Paired with CD-09 sign-off queue.

**Submit action** — lives on the Plan editor (CD-08/14). When Plan has content and no open submission:

- **Primary CTA** in editor header: brand `Btn md` **Submit for review** (`Icon.send` leading).
- **Confirm modal** (450 width, `Card` radius 20): "Submit this Plan to {Provider name} for sign-off?" · Provider `Select` (default = encounter Provider) · optional `Textarea` "Note to Provider (optional)" · brand `Btn lg` "Submit" · tertiary "Cancel".

**Status badge** — rendered prominently in the Plan header as `Badge dot`:

- Draft → neutral
- Submitted → info "Submitted · awaiting {Provider name}"
- Approved → success "Approved {date} · {Provider name}"
- Revision Requested → warning "Revision requested — read note"

**Lock treatment** — while Submitted: editor controls disabled, rows render read-only, top strip = info-100 "Submitted for review · locked" with `Icon.lock` and tertiary "Request unlock (supervisor)".

**Revision-requested state** — warning-100 strip at top: shows Provider avatar + note text + "Resume editing" brand `Btn` to advance to next cycle. Cycle counter chip (mono "Cycle 2") added beside status badge.

**Submission history panel** — accessible via `Icon.clock` tertiary → opens right drawer 480: chronological cycles, each as a collapsible card with submitter + Provider + dates + note + plan-version link + outcome `Badge`. Current cycle highlighted with brand left accent.

**Supervisor unlock modal** — triggered from locked-state tertiary; requires `Field required` reason `Textarea` + brand `Btn` "Unlock". Audit logged.

**Empty / no submission state** — Plan header shows "Draft" badge only; Submit CTA enabled.

**Tokens used** — `--wc-info-100` / `--wc-warning-100` for state strips, `--wc-radius-xl` modal/drawer, mono for cycle counter.

## Open questions
1. Auto-route to assigned/on-call/any Provider?
2. Timeout if no response within X days?
3. Can submitter cancel before Provider acts?

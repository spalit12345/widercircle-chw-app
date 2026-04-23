# CD-13 — Care Plan Review (CHW/Clinical Staff)

**Phase 1 · Must · Persona: CHW · Demo role: ✓ in-flow (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-13-care-plan-review.md`

## Goal
CHW's read-only view of the Plan post-visit. Assigned-to-me items prominent. Acknowledge → notifies Provider. Status-only inline edits (delegates to CD-14).

## In scope
- CHW-tailored read-only Plan view (from CM-13)
- Assigned-to-me section (top) + all items grouped by owner
- "Acknowledge Plan" writes acknowledgment record
- Status-only quick edits (Open → In Progress) via CD-14
- Member-facing PDF export

## Out of scope
Full edit (CD-14), authoring (CD-08), sign-off (CD-09).

## Key acceptance criteria
- Assigned-to-me prominent; rest grouped (AC-1)
- Ack writes record + notifies Provider <1min (AC-2)
- Status-only edit delegates to CD-14 versioning (AC-3)
- Patient-friendly PDF export (AC-4)

## Data model
Reads CD-08 Plan/Versions. Writes:
**Plan Acknowledgment** (acknowledgment_id, plan_id, plan_version_id, acknowledged_by, acknowledged_at)

## API
- `GET /v1/plan-of-care/{id}/review-view?for_user={uid}`
- `POST /v1/plan-of-care/{id}/acknowledgments`
- `PATCH /v1/plan-of-care/{id}/items/{item_id}/status` (→ CD-14)
- `GET /v1/plan-of-care/{id}/export?format=pdf`

## Depends on
CD-08, CM-02, CM-13

## Blocks
CD-14, CM-22

## Stop-and-ask triggers
Acknowledgment data model · status-only edit policy · exposing Plan to non-care-team roles

## UI

Shared DS: [README](./README.md#design-system-shared).

**Route** — Patient 360 → "Open full Plan" link in Overview's Active-cases/Plan section, or CHW landing via CM-13 Member view. New tab-style page `/plan-of-care/{id}/review?for_user={uid}`.

- **Hero card** (`Card raised`) at top: H2 "Care Plan for {member name}" + status `Badge` (Active/Pending Sign-Off/Approved) + version chip + "Last updated {when} by {Provider avatar}".
- **"Assigned to you" section** — prominent `SectionCard` with warm tint border (`tint-200` bg strip top). Items listed as Plan action-item rows (reuse CD-08 styling). Each row: status quick-edit `Select` (Open / In Progress / Complete) · Due chip · "Open item" chev. Count badge next to section title.
- **All items by owner** — collapsed `SectionCard` (chev open). Groups titled by owner role (Provider / CHW / Clinical Staff / PCP) with sub-avatar row + item count. Expand shows items in read-only mode.
- **Narrative panel** — right column on desktop, below on mobile. Rendered rich-text, no edit affordances.
- **Acknowledge footer** (sticky bottom): left = consent reminder text; right = brand `Btn lg` **Acknowledge with member** (`Icon.check` leading). On click → short confirmation modal ("Confirm you reviewed this Plan with {member} on {date}") → commits acknowledgment and emits notification.
- **Post-acknowledgment state** — button collapses to success `Badge dot` "Acknowledged {date}" with `Btn tertiary` "Re-acknowledge" if a new version supersedes.
- **Export / Print actions** — `Icon.file` tertiary button in header with menu: **Print for patient** (opens print-stylesheet PDF preview) · **Send to patient** (opens SMS/email channel picker — reuses CM-12 composer).
- **Locked for supervision** — warning-100 strip at top of the page, `Icon.lock` + "Plan locked for Provider sign-off — reviewing only, status edits blocked".
- **States**: loading, default, acknowledged, locked-pending-supervision, re-ack-required (when Provider revised after prior ack — banner prompt).

**Tokens used** — `--wc-tint-200` (Assigned-to-you accent), `--wc-success-500` (ack badge), `--wc-radius-xl` (cards).

## Open questions
1. PDF template — plain-language? Translated?
2. Member digital acknowledgment (→ CM-13 e-sig)?
3. Re-ack on every revision vs material-only?

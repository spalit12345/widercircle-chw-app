# CD-14 — Care Plan Editing (CHW/Clinical Staff)

**Phase 1 · Must · Persona: CHW · Demo role: ✓ in-flow (Act 1 → Act 2)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-14-care-plan-editing.md`

## Goal
Daily-use editor for the Plan once Provider authoring (CD-08) is complete. CHW updates status, adds items, attaches evidence. Every save = new version. Locked during CD-09 supervision-pending.

## In scope
- Edit existing items: title, description, owner, due date, status, category
- Add new items; soft-delete (status=Cancelled)
- Evidence attach (photo, document) linked to Document entity
- Versioning via CD-08 model (diff retrievable)
- Admin-configurable rule: certain edits flag Plan for Provider review (e.g., completing a billable item)
- Lock enforced when Plan in supervision-pending (CD-09)

## Out of scope
Authoring (CD-08), acknowledgment (CD-13), sign-off (CD-09), e-sig (CM-13).

## Key acceptance criteria
- Status edit → new version + diff + audit (AC-1)
- New item adds with all fields; owner notified if different user (AC-2)
- Completing billable item flags Plan for Provider review (AC-3)
- Edit blocked during supervision-pending (AC-4)
- Evidence attaches via Document entity; visible in version history (AC-5)

## API
- `PATCH /v1/plan-of-care/{id}/items/{item_id}`
- `POST /v1/plan-of-care/{id}/items`
- `DELETE /v1/plan-of-care/{id}/items/{item_id}` (soft)
- `POST /v1/plan-of-care/{id}/items/{item_id}/evidence`
- `GET /v1/plan-of-care/{id}/review-rules`

## Depends on
CD-08, CD-13

## Blocks
CM-22

## Performance
Edit save <500ms; evidence upload <5s for typical photo

## Stop-and-ask triggers
Plan/Item schema · review-flag rule engine · lock policy (supervision-pending) · lock bypasses · versioning/diff model

## UI

Shared DS: [README](./README.md#design-system-shared). Inherits CD-08 editor layout.

Same Plan editor surface as CD-08, but reached from CM-13 "Edit Plan" affordance rather than during a live visit. Key UI differences:

- **Mode toggle** in header: `Tabs pill` **Review · Edit** — Review is the CD-13 view; Edit unlocks inline fields (still within CD-08 card/row styling).
- **Edit affordances per row**:
  - Title / description → click-to-edit inline (turns row into Field with Input + Textarea).
  - Owner → Avatar dropdown (search-as-you-type `Select` with people search).
  - Due date → date picker popover.
  - Status → `Badge`-styled `Select` (inline, no modal).
  - Category → `Chip` row picker (admin-config list).
- **Evidence attach** — per-row `Icon.link` button + paperclip area; drag-drop target on desktop turns row `base-50` on hover. Uploaded evidence renders as a thumbnail strip below the row (`Badge` with filename + `Icon.x` remove). Documents open in a preview drawer.
- **Add item** — always-visible inline row at list bottom with Input placeholder "Add action item…" + `Icon.plus` brand; expands on focus.
- **Soft delete** — kebab menu → "Cancel item"; row gets line-through + base-400 text + `Badge tone="neutral"` "Cancelled". Stays in list for history unless filter toggles it off.
- **Locked banner** — warning-100 strip persistent at top during CD-09 supervision-pending: "Plan locked for Provider sign-off" + tertiary `Btn` "Request unlock" opening a reason modal (routes to CD-15 unlock flow).
- **Conflict dialog** — when optimistic concurrency fails: modal shows side-by-side your-version / their-version with per-field radio to choose, plus brand `Btn` "Apply merged save". Never silently discard.
- **Review-flag visual** — rows that trigger Provider-review rule show a `Badge tone="warning" dot` "Needs review after save" before saving; after save, Plan header flips to status "Pending Provider Review".
- **Autosave / save status** — same indicator as CD-08 (top-right of editor).
- **Bulk actions** (deferred P2) — `Toggle` "Select mode"; checkboxes appear per row; bulk complete/cancel with per-item confirmation.

**Tokens used** — `--wc-warning-100` (locked banner), `--wc-base-50` (drop hover), `--wc-tint-100` (evidence attached accent).

## Open questions
1. Default review-flag rules per program
2. Bulk edit (close 5 items at once)?
3. AI-suggested edits from CHW notes (P2/3)?
4. Plan archiving/closure?

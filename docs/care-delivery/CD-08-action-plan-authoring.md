# CD-08 — Action Plan Authoring (Plan of Care)

**Phase 1 · Must · Persona: Provider · Demo role: ⭐ hero (Act 1)**
Full ticket: `Archive (1)/act-1-intake-visit/CD-08-action-plan-authoring.md`
Canonical name: **Plan of Care** (§1.5).

## Goal
Provider authors the structured Plan during the telehealth visit. Rich-text narrative + discrete action items (owner, due, status). Versioned, auto-saving.

## In scope
- Plan of Care editor in encounter view (alongside CD-06 video)
- Rich-text narrative section
- Action items: title (req), description, owner (role + optional user), due date, status (Open/In Progress/Complete/Cancelled/Blocked), category
- Auto-save every 30s + manual save; new version only on meaningful change (debounced)
- Version history + diffs
- Encounter cannot Close without a non-empty Plan

## Out of scope
Review/edit/sign-off (CD-13/14/09), patient-facing delivery (CD-03), e-sig (CM-13).

## Key acceptance criteria
- Auto-save persists within 30s (AC-1)
- All item fields captured (AC-2)
- Edit → new version + diff (AC-3)
- Close blocked without Plan (AC-4)
- CHW sees saved Plan in CM-13 immediately (AC-5)

## Data model
**Plan** (plan_id, member_id, encounter_id, current_version_id, status, provenance_tag)
**Plan Version** (version_id, plan_id, version_number, edited_by, edited_at, narrative_richtext, action_items[], previous_version_id)
**Action Item** (item_id stable across versions, title, description, owner_role, owner_user_id, due_date, status, category)

## API
- `POST /v1/encounters/{id}/plan-of-care`
- `PATCH /v1/plan-of-care/{id}` (debounced auto-save, idempotency key on draft cycle)
- `GET /v1/plan-of-care/{id}` · `/versions` · `/versions/{vid}` · `/diff?from=&to=`

## Depends on
CM-02, CD-05, CD-06, DA-13

## Blocks
CD-09, CD-10, CD-13, CD-14, CM-13

## Performance
Auto-save round-trip <500ms p95; plan load <1s

## Stop-and-ask triggers
Schema changes to Plan/Item · versioning model · close-without-plan rule · new statuses · lock-on-supervision logic · anything affecting billing eligibility

## UI

Shared DS: [README](./README.md#design-system-shared).

**Surface** — right pane of the Visit Workspace (CD-06) at 40% width; also standalone route `/plan-of-care/{id}` post-visit (opens inside Patient 360 Overview → "Open full Plan").

- **Header row** (sticky inside pane): H3 Montserrat "Plan of Care" · status `Badge` (Draft/In Progress/Pending Sign-Off/Approved) · version chip (`Badge neutral` mono "v3") · auto-save indicator (13px `wc-caption` "Saved 3s ago" / "Saving…" / "Save failed — retry" with `Icon.alert` error-700).
- **Narrative editor**: full-width rich-text area (reuse `Textarea` token palette — radius 12, `base-200` border, 14 Inter). Toolbar minimal: bold/italic/list/link. Focus ring brand-500 2px.
- **Action items list** — stacked cards (1px `base-100` separator rows, not full Cards to save space). Each row:
  - Left: 6px PriorityChip-style accent bar colored by item category (neutral default).
  - Middle: title (14/600) · description (13/500 `base-600`) · meta chips: owner Avatar 24 + name, due-date `Chip` (red tint if overdue), category `Badge tone="neutral"`.
  - Right: status `Badge` (Open=neutral · In Progress=info · Complete=success · Cancelled=base-400 · Blocked=warning) · `Icon.more` kebab (edit / cancel / attach evidence).
- **Add-item inline form**: sticky at bottom of list — single-row input (title) + `Icon.plus` brand button; expanding to full form on focus (Field primitives for description/owner/due/category).
- **Version history** — `Icon.clock` tertiary `Btn` top-right opens popover (`shadow-lg`, radius 20, width 360): chronological list of versions with author Avatar 24 + timestamp + change-summary line; "View diff" link per entry opens a split-pane diff modal.
- **Locked state** (during CD-09 supervision-pending): entire pane dims to `base-50` with a persistent strip at top — warning-100 bg, `Icon.lock` + "Locked for Provider sign-off" + tertiary "Request unlock".
- **Encounter close gate**: if Plan empty, clicking "End Visit" in CD-06 fires an inline error toast `error-100` "Plan of Care required before closing encounter" with focus jump to the Plan pane.
- **States**: new (empty state `Empty` "Start with a template or blank") · draft-with-content · saving · saved · save-error · locked · conflict (merge dialog).

**Tokens used** — `--wc-radius-md` (inputs), `--wc-radius-lg` (inline buttons), `--wc-base-100` (item separator), status tones match `Badge` palette.

## Open questions
1. Templating — bare-bones P1, library P2; which templates (ECM intake, CCM standard)?
2. Categories admin-configurable vs hardcoded?
3. External-party item owners (PCP, supplier) — here or via CM-05/SUP-13?
4. Plan archiving/closure model?
5. Member-visible Plan fields (→ CD-03)?

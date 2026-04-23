# CD-18 — Task & Schedule Management

**Phase 1 · Must · Persona: Clinical Staff/CHW · Demo role: ✓ in-flow (Act 2 opener)**
Full ticket: `Archive (1)/act-2-ongoing-chw/CD-18-task-schedule-management.md`

## Goal
Unified "Today" landing view. Appointments, assigned Plan action items, manual tasks, overdue items — in one place for the user's day.

## In scope
- Today view default landing for clinical roles
- Sections: appointments today (chronological), action items due today/overdue, tasks (manual), recent updates
- Manual task creation (member-linked optional) — title, description, due date, priority, owner (default self)
- Snooze → push due date (audit logged)
- Filters + date-range picker
- Real-time updates (<30s for newly assigned items)

## Out of scope
Provider sign-off queue (CD-09), plan editing (CD-14), encounter scheduling (CD-12), cross-team workload (CM-17), recurring tasks.

## Key acceptance criteria
- Today view renders all sections within NFR (AC-1)
- Manual task creates + audited (AC-2)
- Snooze updates due date, preserves creation history (AC-3)
- New assigned task surfaces <30s (AC-4)

## Data model
**Task** (task_id, owner_user_id, member_id, title, description, due_date, priority, status, created_by, created_at, source, provenance_tag)
Today view composes Tasks + Encounters + Action Items — no dedicated "today" entity.

## API
- `GET /v1/staff/{uid}/today`
- `POST /v1/tasks` · `PATCH /v1/tasks/{id}` · `GET /v1/staff/{uid}/tasks?filter=`

## Depends on
CM-02, DA-13

## Blocks
CM-13 (embeds Today view), CD-07 (consumes Provider schedule)

## Performance
Today view <1s; task action <500ms

## Stop-and-ask triggers
Recurring tasks (different scope) · RBAC scoping · bulk operations (→ CM-17)

## UI

Shared DS: [README](./README.md#design-system-shared).

**Route** `/` (default clinical landing) — reached via LeftRail **Home**. Also embedded in `MemberSidePanel` of CM-13 and Provider's CD-07 quick-action context.

- **Page header**: greeting (Montserrat "Good morning, Alicia.") · date chip · quick-add `Btn brand md` with `Icon.plus` "New task". Right: filter `Chip` row (All · Mine · Member-linked · Overdue) + date-range `Select` (Today / This week / Custom).
- **Three stacked `SectionCard`s**:

### 1. Schedule today
Chronological list with time labels on left (mono 13px) + event card rows: `ChannelGlyph channel="event"` · title · member Avatar 24 + name link · encounter type `Badge`. Current slot highlighted with brand-50 bg + 2px brand-500 left accent and a "Now" pulse dot. Click → routes to encounter or pre-visit chart (CD-07).

### 2. Due today
Action-item + task rows, reuses Plan action-item row styling:

- Checkbox left (round radius-full, 20px, completes inline with strikethrough animation).
- Title · member link chip · due chip (neutral if today) · owner Avatar 24 · kebab.
- `Icon.alert` warning dot if high priority.

### 3. Overdue
Same row pattern with:

- Red age chip (mono "2d overdue") in error-100.
- Row bg `error-100` tint at 30% opacity to keep readable.
- Section title ends with a `Badge tone="error" dot` showing count.

**Quick-add task modal** — `Card` 500 width:

- Fields: title (Input, required), description (Textarea optional), member `Select` (search-as-you-type, optional), due date picker, priority `Chip` row (Low/Med/High), owner `Select` (default self).
- Footer: brand `Btn lg` "Add task" + tertiary "Cancel".

**Snooze popover** — `Icon.clock` kebab option opens a `shadow-md` popover with presets as `Chip` list: **1 hour · Tomorrow · Next week · Custom…**. Custom opens inline date/time picker. On commit, row animates out and a toast appears with "Undo".

**Real-time add** — new tasks fade in at top of their section with a 3s 1px left brand-500 accent (per cross-cutting rule).

**Empty states** — `Empty` component per section with friendly text: "Clear day." "Nothing due today — nice." "No overdue items 🎉" (no emoji unless approved).

**Mobile** — single column, sections stack; quick-add becomes a FAB (brand `Btn` radius-full, `Icon.plus`, bottom-right, 56×56 with `shadow-lg`).

**Tokens used** — `--wc-brand-50` (Now slot), `--wc-error-100` (overdue tint), `--wc-success-500` (completed anim), mono for times/dates.

## Open questions
1. Recurring tasks (P2)?
2. Cross-user task assignment or self-only?
3. Google/Outlook calendar export (P2)?
4. Task templates (paired with CM-20 Workflow Builder)?

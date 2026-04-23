# CD-17 — Time-Based Billing Tracking (CCM Stopwatch)

**Phase 1 · Must · Persona: CHW · Demo role: ⭐ hero (Act 2)**
Full ticket: `Archive (1)/act-2-ongoing-chw/CD-17-time-based-billing-tracking.md`

## Goal
Per-member stopwatch + cumulative monthly aggregation feeding CMS time-based billing (CCM 20/40/60 min, PCM, ECM). Caseload dashboard shows threshold proximity so CHWs prioritize billable engagement.

## In scope
- Stopwatch in member header (CM-03); one active timer per user
- Switching members auto-stops previous timer (prompt)
- Idle auto-stop after 30 min (configurable)
- Manual entry with required justification + supervisor review flag
- Per-program threshold config (CCM/PCM/ECM codes)
- Caseload dashboard: per-member cumulative minutes, % to next threshold, days remaining, sortable, visual proximity indicators
- Read-only per-member widget (this-month time, all team members)
- Feeds DA-08 rules → DA-04 export → CD-10 sync

## Out of scope
ECM attempt cap (CM-22), billing rule config UI (DA-08), billing export (DA-04).

## Key acceptance criteria
- Start/stop reliable + visible in header (AC-1)
- Member switch auto-stops with confirm (AC-2)
- Idle auto-stop @ 30min with correction prompt (AC-3)
- Manual entry requires justification + flagged for review (AC-4)
- Caseload dashboard sorted by threshold proximity (AC-5)
- Reaching threshold → CPT code billable via DA-08 evaluation (AC-6)

## Data model
**Time Entry** (entry_id, member_id, staff_user_id, program, start_time, end_time, duration_seconds, encounter_id, source=timer|manual, justification, supervisor_review_status, provenance_tag)
**Threshold Config** (program, code [CCM 99490, …], threshold_seconds, billing_window)
Computed: member × month → cumulative_minutes

## API
- `POST /v1/members/{id}/time-entries/start` (idempotent on user+member)
- `POST /v1/members/{id}/time-entries/{eid}/stop`
- `POST /v1/members/{id}/time-entries/manual`
- `GET /v1/staff/{uid}/caseload-time-summary?month=YYYY-MM`
- `GET /v1/members/{id}/time-summary?month=YYYY-MM` (read by CM-22, CD-16)

## Depends on
CM-02, DA-13, DA-08 (threshold schema)

## Blocks
CD-10, CM-22, CD-16

## Performance
Start/stop ack <300ms; dashboard <2s for 200-member caseload

## Stop-and-ask triggers
Threshold config schema (DA-08 downstream) · time-entry data model · idle-timeout default · edits after billing occurred · new time-tracking sources (e.g., auto from call duration) · RBAC for time editing

## UI

Shared DS: [README](./README.md#design-system-shared).

### Stopwatch chip — in-member header

Lives inside `MemberSidePanel` / `MemberTopHeader`. Compact when idle, expanded when running.

- **Idle state**: `Btn size="sm" variant="ghost"` with `Icon.timer` leading + "Start timer". `base-50` bg.
- **Running state**: `Badge tone="brand"` pill (radius 30, 22h) with `Icon.timer` + live `MM:SS` (mono, 600 weight) + `Icon.pause` icon-btn + `Icon.x` stop icon-btn inline. Shows "{member name}" when stopwatch is for a different member than the one viewed (warning border if cross-member active).
- **Idle-paused**: same pill, `warning` tone + "Idle — still with member?" tooltip; confirmation modal on stop.
- **Manual entry button** — `Btn tertiary size="sm"` with `Icon.plus` "Log time" beside the stopwatch.

### Manual-entry modal

`Card` radius 20, 500 width.

- Fields: start date/time pickers, duration number + unit `Select` (min/hr), required `Textarea` "Justification" (helper hint: "Why wasn't the timer running?"), program `Select`.
- Info strip: `info-100` bg, `Icon.alert` info-700: "Manual entries are flagged for supervisor review."
- Footer: brand `Btn lg` "Log time" + secondary "Cancel".

### Caseload time dashboard

Route `/time-tracking` from LeftRail (under **Billing** or as "My caseload" sub-nav).

- **KPI strip** at top: 4 `VitalTile`s — "This month minutes", "Members hit threshold", "Members at risk (>80%)", "Avg per member". Deltas in `success-700` / `error-700`.
- **Table** — dense `SectionCard pad={0}` with sortable columns:
  - Member (Avatar 32 + name + Plan ID mono)
  - Program `Badge` (CCM / PCM / ECM)
  - **This month** mono minutes
  - **Threshold progress** — 8px-tall bar track `base-100`, filled by tone: success (hit), warning (≥80%), info (below). Label right: "32 / 40 min · CCM 99490".
  - Days left in month (mono)
  - Last activity (wc-caption with relative time)
  - Row actions: Start timer icon-btn · kebab (view entries, manual entry)
- **Sort presets** as `Chip` row above table: "Closest to threshold" (default) · "Days remaining" · "Newest" · "Name".
- **Filter chips**: program · threshold-hit · threshold-approaching · unengaged.

### Supervisor review queue for manual entries

Sub-tab within the dashboard: table of pending manual entries — entry summary + justification text + approve/flag actions. Same row pattern as CD-09 sign-off rows.

### Read-only per-member widget

Rendered on `MemberSidePanel` Quick context box when the caseload view is off-screen:

- Mini progress bar + "32 / 40 min this month · CCM 99490" (mono).
- Link "View timeline" → opens right drawer with time entries list (timeline rows with staff avatar + duration chip + timestamp + source badge).

### Threshold-reached toast

Global `success-100` toast (`Icon.check`) "Maria hit CCM 99490 threshold — billable this month" with action "View billing".

**Tokens used** — `--wc-brand-500` (active timer), `--wc-warning-500` (idle), `--wc-success-500` (threshold hit), `--wc-base-100` (progress track), mono font for all time values and thresholds.

## Open questions
1. Patient right-of-access to their own time data (HIPAA)
2. Idle timeout default (30 min) — per-program configurable?
3. Auto-track from call duration (CC-04) in P2?
4. Multi-program members — apportionment rules?
5. Year-end lock period for edits?

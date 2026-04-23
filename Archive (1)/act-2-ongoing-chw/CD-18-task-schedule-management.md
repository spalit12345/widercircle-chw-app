---
id: CD-18
title: "Task & Schedule Management"
source_requirement: CD-18
parent_epic: epic-cd-care-delivery
demo_track: track-1-cd-cm
demo_act: act-2-ongoing-chw
module: care-delivery
phase: 1
priority: must
persona: clinical-staff
secondary_personas: [chw, provider]
labels: [demo-5-5, track-1, daily-view, tasks, calendar]
blocked_by: [CM-02, DA-13]
blocks: [CM-13, CD-07]
parallel_safe_with: []
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CD-18 — Task & Schedule Management

## Background & User Context

Clinical Staff and CHWs need a single landing view: appointments today, tasks owed by them, overdue follow-ups, member-linked work. Today this is split between Healthie schedule, Tellescope reminders, and personal tracking. The platform consolidates into one daily-view that drives the user's day.

In the demo: CHW logs in → Today view shows Maria's intake at 10am, follow-up call due tomorrow with another member, two overdue items.

## User Story

As a Clinical Staff or CHW, I want a unified daily view of my appointments, tasks, and overdue items so I know what to do next without checking multiple tools.

## Scope

**In scope:**
- "Today" / daily view for current user
- Aggregated view: scheduled appointments (CD-12 + others), assigned action plan items (CD-08), tasks (manual + auto-created), overdue items
- Task creation: manual task linked to a member or standalone
- Filters: status, member, type, date range
- Snooze / reschedule a task
- Visible from CHW workflow (CM-13) and Provider pre-visit chart (CD-07)

**Out of scope / Non-goals:**
- Provider sign-off queue → CD-09 (separate queue)
- Action plan editing → CD-14
- Encounter scheduling → CD-12
- Cross-team workload management → CM-17

## Functional Requirements

1. Today view default landing for clinical roles after sign-in.
2. Sections: Appointments today (chronological), Action items due today/overdue, Tasks (manual), Recently created/updated.
3. Each item is clickable → opens detail (member profile, encounter, plan, task detail).
4. Task creation: link to member optional; fields title, description, due date, priority, owner (default self).
5. Snooze: push due date to a chosen later time/day; logged in audit.
6. Filters and date-range picker.
7. Real-time update: new tasks/appointments appear within 30s.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Today view renders**
- *Given* CHW with 2 appointments + 5 tasks + 2 overdue items
- *When* they sign in
- *Then* Today view shows all sections with correct counts within page-load NFR

**AC-2 — Manual task creation**
- *Given* CHW remembers to follow up on a referral
- *When* they create a task with member-link, title, due date
- *Then* task is created, appears in their list, audit logged

**AC-3 — Snooze**
- *Given* CHW with overdue task
- *When* they snooze to tomorrow
- *Then* due date updates; task moves out of "today"; original creation history preserved

**AC-4 — Real-time update**
- *Given* CHW viewing Today view
- *When* a new task assigned to them is created (e.g., from RF-02 SDoH escalation routing)
- *Then* it appears within 30s

**AC-5 — Audit logged**
- *Given* task creation, edit, snooze, complete
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

**Task (write):**
- task_id, owner_user_id, member_id (nullable), title, description, due_date, priority, status, created_by, created_at, source (manual / auto-from-{rule}), provenance_tag (if member-linked)

**Aggregation:** Today view composes Tasks + Encounters + Action Items + auto-from triggers; no dedicated "today" entity

## API Contract

- `GET /v1/staff/{uid}/today` → composed Today payload
- `POST /v1/tasks` → create
- `PATCH /v1/tasks/{id}` → update (snooze/complete/edit)
- `GET /v1/staff/{uid}/tasks?filter={...}` → filtered task list

## UI / UX Specification

- Today view: top section schedule, then tasks grouped by due, then overdue
- Manual task quick-add (header button)
- Snooze: picker (1h, tomorrow, next week, custom)
- Mobile-first responsive

**States:** loading, default, empty ("Clear day"), error, real-time-update

## Edge Cases & Error Handling

- Task on member CHW no longer assigned to → task remains until reassigned
- Member archived/deceased → tasks linked surface with banner; actionable per role
- Recurring tasks → out of Phase 1 scope; one-shot only
- Time zone handling for due dates → store UTC; display in user's local time
- Bulk complete → not supported Phase 1

## Security, Privacy & Compliance

- **PHI:** task may include member-linked PHI in title/description
- **Provenance:** if member-linked, inherits member's tag
- **RBAC:** tasks only visible to owner + supervisor scope per DA-14
- **Audit:** every task action

## Observability

- Metrics: tasks/user/day, completion rate, snooze rate, overdue accumulation
- Alerts: spike in overdue (workload imbalance signal)

## Performance Budget

- Today view <1s
- Task action <500ms

## Dependencies & Sequencing

**Blocked by:** CM-02, DA-13
**Blocks:** CM-13 (Today view embedded), CD-07 (Provider's schedule consumed)

## Test Strategy

**Unit:** filter/aggregation logic; snooze; date math
**Integration:** Today view composes correctly; new task auto-from-rule appears
**E2E:** Track 1 demo opener (CHW logs in → sees day)
**Performance:** caseload of 50 + 100 tasks
**Fixtures:** users with various task volumes; overdue spreads

## Rollout

- **Feature flag:** `task_schedule_v1`
- Internal pilot

## Definition of Done

- [ ] All ACs pass
- [ ] Today view performant
- [ ] Real-time update works
- [ ] Audit log emitted

## Success Metric in Production

- **Adoption:** ≥85% of clinical staff use Today view daily
- **Completion:** mean task completion rate ≥80% within due date

## Stop-and-Ask-the-Human Triggers

- Adding **recurring tasks** (different scope)
- Changes to RBAC scoping
- Bulk operations (workload-management territory — CM-17)

## Open Questions

1. Recurring tasks — Phase 2?
2. Cross-user task assignment — supported, or only self-assigned?
3. Calendar integration (export to Google/Outlook) — Phase 2?
4. Task templates — Phase 2 (paired with Workflow Builder CM-20)?

---
id: CM-20
title: "Workflow Builder / Task Automation"
source_requirement: CM-20
parent_epic: epic-cm-case-management
demo_track: track-1-cd-cm
demo_act: act-3-closer
module: case-management
phase: 1
priority: must
persona: system-admin
secondary_personas: [ops-manager]
labels: [demo-5-5, track-1, no-code, automation, workflow, bonus]
blocked_by: [CM-21, CM-04, DA-01, DA-13]
blocks: []
parallel_safe_with: [DA-14]
estimate: TBD
status: draft
assignee_type: subagent-with-human-review
---

# CM-20 — Workflow Builder / Task Automation

## Background & User Context

Ops keeps creating new processes — "for member X with status Y, create a survey, route it, escalate if not completed in N days." Today these are coded one-off. The Workflow Builder lets ops build these as no-code automations: trigger → action(s) → conditions → escalations.

In the demo (Act 3 bonus): admin shows "look, I can build a new workflow live in 60s without engineering" — visible value for an external leadership audience.

## User Story

As an Admin (or Ops Manager), I want to build no-code workflows that create tasks, surveys, or cases and route them through multi-step processes with conditional logic, SLA timers, and escalation rules — so I can launch new operational processes without engineering involvement.

## Scope

**In scope:**
- Workflow definition: trigger + steps (sequential / branching) + conditions + SLA timers + escalation rules
- Trigger types: event-based (case created, member-state change, survey-response threshold), time-based (scheduled), manual
- Step actions: create task (CD-18), create case (CM-21), create survey instance (CM-04), assign to user/role, send notification, send SMS (CM-12)
- Conditional branching on member attributes / case state / response data
- SLA timers per step; escalation rule on timer breach
- Workflow versioning (draft → published → archived)
- Workflow run history (visible per workflow definition)
- Per-program workflow library

**Out of scope / Non-goals:**
- Marketing journey workflows → MSG-tier (Klaviyo handles those)
- Cross-entity workflows (AC ↔ WC) — Phase 3
- Visual flow-chart canvas designer in v1 — table/form-based config first; canvas later

## Functional Requirements

1. Workflow Definition entity stores name, description, trigger config, steps[], conditions, version, status (draft/published/archived).
2. Designer UI: form-based builder for trigger + steps (Phase 2 enhancement: visual canvas).
3. Trigger types implemented: event (e.g., "case_created" + filters), scheduled (cron-style), manual.
4. Step types: create_task, create_case, create_survey, assign_to_user/role, send_notification, send_sms.
5. Conditional branching: per-step conditions evaluated against member/case/response data.
6. SLA timer per step; escalation rule triggers when timer breaches.
7. Test mode: dry-run a workflow against a test member without producing real records.
8. Versioning: published workflows can be edited only as new versions; running instances continue on their version.
9. Run history: each workflow execution recorded with steps taken, branches, outcomes.

## Acceptance Criteria (Given/When/Then)

**AC-1 — Build and publish workflow**
- *Given* an admin in the designer
- *When* they configure trigger + 3 steps + 1 escalation and Publish
- *Then* workflow is live; new triggering events execute it

**AC-2 — Trigger fires execution**
- *Given* published workflow with trigger "case_created (type=SDoH-Food)"
- *When* a Food Insecurity case is created (e.g., from CD-19)
- *Then* workflow executes; first step performs (e.g., assign to CHW)

**AC-3 — Conditional branching**
- *Given* a workflow with branch: "if priority=High, route to Supervisor; else route to assigned CHW"
- *When* trigger fires with priority=High
- *Then* the High branch executes only

**AC-4 — SLA escalation**
- *Given* a step with SLA=24h and escalation "notify supervisor if breached"
- *When* SLA elapses without step completion
- *Then* escalation fires; supervisor notified; step status reflects breach

**AC-5 — Test mode**
- *Given* an admin authoring a workflow
- *When* they run test against a test member
- *Then* simulated execution shows what would happen without producing real records

**AC-6 — Versioning**
- *Given* published workflow v1 with running instances
- *When* admin publishes v2
- *Then* running v1 instances complete on v1; new triggers use v2

**AC-7 — Audit logged**
- *Given* workflow create/edit/publish/execute
- *When* the action occurs
- *Then* DA-13 audit event written

## Data Model

**Workflow Definition (write):**
- workflow_id, name, description, trigger_config, steps[], status, version, published_at, created_by

**Workflow Step (embedded):**
- step_id (stable across versions), type (create_task/case/survey/etc.), action_config, conditions[], sla_minutes (nullable), escalation_rule (nullable)

**Workflow Instance (write per execution):**
- instance_id, workflow_id, version, triggered_by_event, started_at, current_step_id, status (running/completed/failed/escalated), context_data

**Workflow Step Execution (write):**
- execution_id, instance_id, step_id, started_at, completed_at, outcome, branch_taken, errors

## API Contract

- `POST /v1/workflows` → create draft
- `POST /v1/workflows/{id}/publish` → version-publish
- `POST /v1/workflows/{id}/test-run` → dry-run
- `GET /v1/workflows/{id}/runs?status={...}` → run history
- Trigger ingestion via internal event bus (events from CM-21, CD-19, etc.)

## UI / UX Specification

- Designer: form-based; trigger config, steps list (drag-reorder), per-step config (action + conditions + SLA + escalation)
- Test mode panel
- Version history dropdown
- Run history table with drill-down per execution

**States:** draft, published, archived; designer states: editing, testing, publishing, error

## Edge Cases & Error Handling

- Step action target user/role no longer exists → escalate to supervisor; instance flagged
- Workflow references a deprecated entity field → publish blocked with clear error
- Infinite loop risk (workflow triggers itself) → static analysis at publish time blocks
- Trigger fires for archived workflow → ignored
- Escalation rule references missing user → fallback to a default supervisor (configurable)
- Permission denied on step action (e.g., creating case in scope user lacks) → instance fails with clear reason

## Security, Privacy & Compliance

- **PHI:** workflow context can contain member PHI
- **Provenance:** instances inherit context member's tag
- **RBAC:** designer restricted to admin role; instance execution actions inherit acting-user permissions; system-actions inherit a system role with constrained permissions
- **Audit:** definition CRUD, publish, test-run, instance-run all logged
- **Anti-loop:** static analysis at publish

## Observability

- Metrics: workflows published, instances/day per workflow, success rate, escalation rate, mean step duration
- Alerts: failure rate >X% per workflow, SLA breach spike, infinite-loop attempts at publish

## Performance Budget

- Step execution start <2s after trigger
- Designer load <2s

## Dependencies & Sequencing

**Blocked by:** CM-21 (case creation action), CM-04 (survey creation action), DA-01 (assignment rules pattern), DA-13
**Blocks:** future automation-heavy features

## Test Strategy

**Unit:** trigger matching, condition evaluation, SLA timer, escalation logic, version semantics
**Integration:** end-to-end execution per step type
**E2E:** Track 1 Act 3 demo (admin builds workflow live, triggers, executes)
**Compliance:** audit emitted, RBAC enforced
**Security:** infinite-loop test, permission-escalation attempts
**Performance:** 100 concurrent instances
**Fixtures:** workflow library across step types and conditions

## Rollout

- **Feature flag:** `workflow_builder_v1`
- Internal admin pilot
- Workflow templates seeded for common patterns

## Definition of Done

- [ ] All ACs pass
- [ ] All step types implemented
- [ ] Test mode works
- [ ] Versioning + run history reliable
- [ ] Anti-loop static analysis live
- [ ] Audit log emitted
- [ ] Performance budget met
- [ ] Admin documentation + workflow template library ready

## Success Metric in Production

- **Adoption:** ≥5 published workflows in production within 90 days
- **Value:** ≥30% of routine ops processes operationalized via Workflow Builder vs. ad hoc
- **Reliability:** workflow success rate ≥95%

## Stop-and-Ask-the-Human Triggers

- Adding new **step type** (impacts security model — new permissions to enforce)
- Adding new **trigger type** (impacts event ingestion contract)
- Changes to **versioning policy** (running instances migration)
- Adding **cross-entity workflows** (AC ↔ WC — Phase 3)
- Removing **anti-loop** static analysis
- Changes to **system role** that workflows execute under

## Open Questions

1. Visual canvas designer — Phase 2 enhancement?
2. Marketplace / template sharing across programs — Phase 2/3?
3. Custom code blocks (JavaScript snippets) — Phase 3?
4. Workflow performance limits — max steps, max nesting, max concurrent instances?
5. Cross-workflow coordination — workflows triggering workflows; allowed pattern?

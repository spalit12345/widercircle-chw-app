# 5/5 Demo Scope - Track 1: Partial 3.1 CD & 3.2 CM Modules

## Artifacts:

Full tickets in .md:

[Archive.zip](5%205%20Demo%20Scope%20-%20Track%201%20Partial%203%201%20CD%20&%203%202%20CM%20M/Archive.zip)

Design system: [https://claude.ai/design/p/ac24594e-d95c-412a-a3aa-109d6ec2e20c?via=share](https://claude.ai/design/p/ac24594e-d95c-412a-a3aa-109d6ec2e20c?via=share)

Prototype (*in progress*): [https://claude.ai/design/p/ac24594e-d95c-412a-a3aa-109d6ec2e20c?file=ui_kits%2Fcms_platform%2Findex.html&via=share](https://claude.ai/design/p/ac24594e-d95c-412a-a3aa-109d6ec2e20c?file=ui_kits%2Fcms_platform%2Findex.html&via=share)

Initiating Visit Billable Note, and CHI/PIN Monthly Note: 

- [https://claude.ai/artifacts/latest/5c2fd22a-f500-4f72-8406-422a4ba0ddbb](https://claude.ai/artifacts/latest/5c2fd22a-f500-4f72-8406-422a4ba0ddbb)

[c9a46966-b9c2-40b9-8bf8-9857d283dc8a_CHI_Initiating_Visit_Note_Example (1).pdf](5%205%20Demo%20Scope%20-%20Track%201%20Partial%203%201%20CD%20&%203%202%20CM%20M/c9a46966-b9c2-40b9-8bf8-9857d283dc8a_CHI_Initiating_Visit_Note_Example_(1).pdf)

[a95dc8b6-4828-4be1-ae7f-977b1d32f26c_CHI_Monthly_60_Note_Example.pdf](5%205%20Demo%20Scope%20-%20Track%201%20Partial%203%201%20CD%20&%203%202%20CM%20M/a95dc8b6-4828-4be1-ae7f-977b1d32f26c_CHI_Monthly_60_Note_Example.pdf)

## Demo storyline

<aside>
🎬

**"Maria's first 60 days at Wider Circle"** — single member journey, two tracks built independently:

- **Track 1 — Care Delivery + Case Management.** Spine = §3.1 narrative: intake visit (SDoH by CHW → Care Plan by Provider → CHW review) → ongoing CHW engagement with time tracking and ECM cap accounting → bonus closer (RBAC + Workflow Builder).
- **Track 2 — Contact Center.** Standalone arc: Maria calls in → screen pop + recording consent + campaign script → warm transfer to clinician with context handoff → AI summary at wrap-up.

Both tracks built for 5/5; either can be presented independently.

</aside>

---

**For Claude Code / subagent execution:**

1. Each ticket is self-contained; subagents can pick them up in dependency order (see `blocked_by` in YAML frontmatter)
2. Stop-and-Ask triggers in every ticket — subagents must pause and prompt the human at those boundaries
3. Open Questions surface unresolved decisions per ticket — should be answered before implementation begins on that ticket

**For demo orchestration:**

- Hero ⭐ tickets are the on-stage moments — build them first
- In-flow ✓ tickets enable the hero moments — must work but not the spotlight
- Supporting ◯ tickets are "good if shown, fine if mentioned" — build last, possibly with thin slices
- Optional CC tickets (CC-06, CC-11) are the supervisor / admin half of the CC story — show only if time allows

**Sequencing guidance:**

- DA-14 (RBAC) blocks almost everything — implement first, ahead of cohort builds
- CM-02 (Unified Member Context) is the data backbone for both tracks — implement second
- Per-track Act 1 features should be ready before Act 2; Act 2 before Act 3 closer
- Track 2 can build entirely in parallel to Track 1 after DA-14 + CM-02 land

---

## Track 1 — Care Delivery + Case Management

### Act 1 — Intake Visit

*The §3.1 narrative core: CHW SDoH assessment → Provider Care Plan → CHW review.*

| Ticket | Persona | Demo role |
| --- | --- | --- |
| CM-13 CHW Workflows (Desktop) | CHW | ⭐ hero — the surface CHW lives in |
| CD-19 SDoH Assessment | CHW | ⭐ hero — structured SDoH capture, risk-triggered cases |
| CD-11 Eligibility Check | Clinical Staff | ✓ Bridge real-time check pre-visit |
| CD-07 Consultation Notes Access | Provider | ✓ provider sees CHW pre-work + history |
| CD-05 Consent Management | Provider | ⭐ hero — verbal consent path in flow |
| CD-06 Telehealth Visit Conduct | Provider | ⭐ hero — embedded video + chart |
| CD-08 Action Plan Authoring | Provider | ⭐ hero — structured Care Plan |
| CD-13 Care Plan Review | CHW | ✓ CHW reviews post-visit |
| CD-14 Care Plan Editing | CHW | ✓ CHW updates as they go |
| CM-02 Unified Member Context | All | ◯ member profile sidebar everywhere |
| CM-03 Key Member Info Display | All | ◯ highlighted attributes |

### Act 2 — Ongoing CHW engagement

*Time tracking + ECM = the revenue/compliance story.*

| Ticket | Persona | Demo role |
| --- | --- | --- |
| CD-17 Time-Based Billing Tracking | CHW | ⭐ hero — stopwatch toward CCM threshold |
| CM-22 ECM Outreach Tracking & Cap | CHW | ⭐ hero — per-client cap enforcement |
| CM-09 Unified Communication History | CHW | ✓ all channels in one feed |
| CM-12 Individual & Bulk SMS | CHW | ✓ quick text from member profile |
| CM-05 SDoH Referrals | CHW | ✓ refer to supplier; track status |
| CD-18 Task & Schedule Management | CHW | ✓ daily view |
| CM-21 Manual Case Creation | CHW | ◯ ad-hoc case |
| CM-04 Case Surveys | CHW | ◯ branching survey w/ embedded consent |
| CD-15 Provider Review Submission | Clinical Staff | ◯ submit docs for MD sign-off |
| CD-09 Clinical Staff Supervision | Provider | ◯ MD review queue |
| CD-10 Billing Documentation Sync | System | ◯ auto-push to Candid |

### Act 3 — Closer

*Access control + bonus.*

| Ticket | Persona | Demo role |
| --- | --- | --- |
| DA-14 RBAC v1 | All | ⭐ hero — role-switch on stage |
| CM-20 Workflow Builder | Admin | ⭐ bonus — admin builds workflow live |
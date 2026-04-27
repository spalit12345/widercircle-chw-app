# Unified Internal Platform (CMS)

**WIDER CIRCLE**

**Unified Internal Platform**

Care & Case Management System

Draft | April 2026

# 1. Executive Summary

Wider Circle is a community health organization dedicated to improving health outcomes for Medicare and Medicaid members through community-driven care programs, provider services, and benefits navigation. This document defines the functional requirements for a Unified Internal Platform (Care & Case Management System), intended to consolidate Wider Circle's current fragmented operational stack into a single, integrated solution.

It describes the business context, user personas, module-level requirements, integration expectations, non-functional requirements, migration scope, and phased delivery expectations.

## 1.1 Business Context

Wider Circle currently operates across a constellation of point solutions including Salesforce (CRM, lightweight CMS), Tellescope (patient engagement and CRM platform), Healthie (virtual EHR / charting platform), Candid (claims/RCM automation) and Bridge (eligibility verification), Five9 (call center), Twilio (SMS), Tableau (reporting), Firebase, and numerous legacy applications. This fragmented architecture creates:

- Manual handoffs between systems that slow care delivery and increase error rates
- Inability to provide case managers and care providers with a unified member view
- Significant double-entry and reconciliation burden on clinical and operations staff
- Bottlenecks in billing documentation and revenue cycle management
- Limited real-time visibility into member engagement, team workload, and care outcomes

The Unified Internal Platform must eliminate these gaps by providing a single source of truth for all member interactions, clinical documentation, case management, event operations, and contact center workflows.

## 1.2 Project Goals

- **Replace Salesforce CRM and related automations as the primary case management backbone**
- Integrate or replace Tellescope, Healthie, and the patient-facing application
- Consolidate communication channels (SMS, email, voice) into a unified interaction record
- Enable automated billing documentation and RCM sync with Candid/Bridge
- Support telehealth-based care delivery workflows end-to-end
- Provide real-time dashboards to replace reliance on Tableau for daily operations
- Support mobile-first workflows for field staff (CHWs, Canvassers)

![](Unified%20Internal%20Platform%20(CMS)/image1.png)

## 1.3 Prioritization Framework

All requirements are classified using a combined MoSCoW + Phase model:

| **Label** | **MoSCoW Definition** | **Phase Assignment** | **Delivery Expectation** |
| --- | --- | --- | --- |
| **Must** | Non-negotiable; platform cannot launch without this | Phase 1 (MVP) | Required at go-live |
| **Should** | High value; significant operational impact if absent | Phase 2 | Required within 6 months of go-live |
| **Could** | Desirable; enhances efficiency but not critical | Phase 3 / Future | Post-stabilization roadmap item |
| **Won't** | Out of scope for this engagement | Not planned | Explicitly excluded |

## 1.4 Glossary / Vendor Dictionary

This glossary defines internal and third-party vendor terminology referenced throughout this document. It is the single authoritative source for vendor naming and role; when a module references any of these terms, interpret them per the definitions below.

- Salesforce (CRM, lightweight CMS) — Current case management backbone. To be replaced by the Unified Internal Platform in Phase 1. References to “Salesforce” in this document refer to Wider Circle’s CRM, lightweight CMS unless otherwise noted.
- Tellescope — Patient engagement and CRM platform. Currently handles member-facing communications, scheduling widgets, messaging journeys, and lightweight charting on Care Delivery operations. Candidate for integration or replacement.
- Healthie — Virtual EHR / charting platform used by clinical staff for telehealth visit notes, care plans, and multidisciplinary collaboration on Care Deliver operations.
- Candid — Revenue cycle management (RCM) and claims automation platform. Handles outbound claim submission and billing workflows.
- Bridge — Eligibility verification service. Handles payer eligibility checks (e.g., 270/271-equivalent transactions) prior to care delivery and billing.
- Five9 — Cloud contact center (CCaaS) platform integrated with Salesforce. Powers power-dialing, inbound routing, IVR, and agent desktop for the Contact Center module.
- Twilio — Communications platform used for SMS (and potentially voice and email via SendGrid). Primary channel provider for member outreach and bulk messaging.
- Tableau — Business intelligence / reporting platform currently used for operational dashboards. Targeted for replacement by in-platform real-time dashboards (see DA-09).
- Firebase — Google BaaS used as today’s mobile backend (offline sync, push notifications) for field-staff applications. Migration scope TBD.
- Neustar / TransUnion TruContact — Consumer identity and contact-enrichment service (Neustar’s consumer identity business was acquired by TransUnion and rebranded starting 2022). Referenced in DA-10 for phone/contact enrichment; target the current TransUnion product or an equivalent.
- MediCircle — Supplier partner focused on speciality Rx, prescription delivery / medications-to-home fulfillment for members.
- Upside — Supplier partner focused on consumer rewards and engagement incentives.
- TruConnect — Supplier partner providing Lifeline / ACP wireless service for eligible Medicaid members.
- Covered Entity (CE) / Business Associate (BA) — HIPAA designations. Wider Circle is assumed to operate in a dual-status posture: as a CE for members it serves directly, and as a BA for members served under delegated agreements with health-plan partners. Every PHI record and interaction log must carry a Data Provenance & Legal Basis tag identifying which status governs that record. → need to check with Ken
- Initiating Visit — The first billable encounter establishing a care-management relationship under CMS programs (e.g., CCM 99490/99491, PCM, RPM). Triggers eligibility for subsequent time-based billing codes.
- SDOH — Social Determinants of Health. Non-clinical factors (housing, food security, transportation, etc.) captured as structured data on the member record.
- Hank — a community platform used by Wider Circle for member engagement (scope of integration TBD). Referenced in EV-07 for unaligned dual engagement tracking.
- Clutch — member engagement, loyalty, and rewards platform used for behavior nudges across services and platforms. Referenced in MSG-02.
- Klaviyo — journey-building and marketing-automation platform used for email and SMS campaigns. Complements Clutch (which handles cross-platform behavior nudges). Referenced in MSG-02.
- SendGrid — Email delivery service, typically used for transactional email independent of a marketing campaign platform. [TBD: in scope for transactional email in Phase 1?]

## 1.5 Domain Entity Dictionary

The following entity definitions are the canonical references for objects that appear across modules. When requirements use these terms, they refer to the definitions below.

**People & relationships**

- **Member** — a person WC has a member record for, whether active or historical. Covers patients in care delivery, duals in case management, and community participants in events. Single canonical record per person.
- **Lead / Prospective Patient** — a person who has expressed interest but does not yet have an enrolled member relationship. Converted to Member on enrollment.
- **Staff User** — a WC or Ask Claire employee (clinical, CM, CC, CHW, canvasser, admin, ops, compliance, etc.).
- **External Contact** — PCP, pharmacy, caregiver, family contact, or other non-member party.
- **Relationship** — links Member ↔︎ External Contact or Member ↔︎ Member (e.g., caregiver, spouse).

**Care & cases**

- **Program** — a care or service offering (e.g., CCM, PCM, SDoH, community); has a client / payer and associated rules.
- **Case** — an operational work item tracking a member's need (clinical, SDoH, benefits, referral) from open to resolution. Has a type, owner, state history, and related documents.
- **Case State History** — immutable state-transition log for a Case.
- **Need** — a member-reported or system-identified concern (e.g., SDoH need from RF). A Need becomes a Case when work is initiated to resolve it.
- **Appointment** — a scheduled time slot with a provider. Has a planned start / end, a type (Initiating Visit, follow-up, SMA, etc.), a member, and a provider.
- **Encounter (synonym: Visit)** — the actual occurrence of care associated with an Appointment (or ad hoc). Produces clinical notes, billable time, and potentially triggers billing. "Visit" is the UI term; "Encounter" is the data-model term.
- **Care Plan (or Action Plan, Plan of Care)** — the structured plan for a member's care, captured at an Encounter or managed longitudinally by a CHW. Tracks clinical and non-clinical goals, owner, due date, and status. "Action Plan" (used in Care Delivery; CD-08) and "Plan of Care" (used in CHW workflows; CM-13) refer to the same underlying entity. Prefer **Plan of Care** as the canonical name in the data model; UI copy may use either term contextually.
- **Time Entry** — billable or non-billable time per staff per member per day (CD-17).
- **Survey Definition / Survey Instance / Survey Response** — configurable surveys (CM-04, CD-19) and their member responses.

**Communication**

- **Interaction** — any logged touchpoint with a member across channels (call, SMS, MMS, email, in-person, telehealth, portal message, event attendance). Has channel, direction, timestamp, staff user, duration, disposition, and optional case / encounter linkage.
- **Message** — SMS / MMS / email body. PHI-scrubbed externally; full content internal.
- **Call** — Five9 call metadata + recording URI.
- **Communication Preference** — per-channel opt-in / opt-out, preferred times, language (MSG-03).
- **Notification** — staff-facing in-product notification.

**Compliance & access**

- **Consent** — captured member agreement for a specific purpose (telehealth, data sharing, recording, etc.). See §3.7 / F-S5-02.
- **Data Provenance Tag** — CE | BA | Dual designation carried on every PHI record; see glossary and F-S5-01.
- **Role, Permission, Role Assignment** — RBAC primitives.
- **Audit Event** — an immutable record of a PHI access or cross-entity data transfer.

**Events & community**

- **Event** — in-person or virtual community event.
- **RSVP** — a member's response to an Event.
- **Event Attendance Record** — observed attendance (may differ from RSVP).

**External integrations**

- **Eligibility Check** — a Bridge response record.
- **Claim** — a Candid submission record.
- **Referral** — a directed handoff of a member to an internal team or external supplier for a specific service.
- **Supplier** — MediCircle, Upside, TruConnect, etc., with access scope.
- **Dial List** — a Contact Center queue of members to call.
- **Document** — an uploaded or signed artifact, scoped by provenance.

**Configuration**

- **Rule Definition** — segmentation, assignment, billing, or workflow rule.
- **Segment** — a materialized member group.
- **Dashboard Definition** — config for a DA-09 dashboard.

# 2. User Personas

The following personas represent the primary users of the Unified Internal Platform. Requirements throughout this document are anchored to these personas.

| **Persona** | **Role** | **Primary Platform Needs** |
| --- | --- | --- |
| **Patient / Member** | End beneficiary receiving care or case management | Appointment scheduling, reminders, visit summaries, feedback submission, self-serve event RSVP |
| **Care Provider (MD)** | Physician conducting telehealth initiating visits | Consultation notes, telehealth visit, action plan authoring, clinical staff supervision, billing doc sync, eligibility checks, follow-up visits |
| **Clinical Staff** | Clinical care coordinators/operators | Eligibility checks, appointment scheduling, action plan management, time-based billing tracking, task management, assessments |
| **Case Manager (CM)** | Staff conducting member outreach and case resolution | Integrated intake, member context, surveys, referrals, PCP verification, communication history, SMS |
| **CM / Ops Manager** | Supervisors overseeing case team performance | Workload management, funnel dashboards, reporting, member-to-staff assignment rules |
| **Community Health Worker (CHW)** | Field workers managing referrals and member relationships | Member engagement, referral tracking, Plan of Care signatures, offline documentation |
| **Canvasser / Home Visitor** | Field staff conducting door-to-door outreach | Mobile app with offline mode, note-taking, disposition tracking, secure document capture |
| **Auxiliary Personnel** | Staff conducting ad-hoc outreach and lead scheduling | Lead outreach, consultation scheduling |
| **Contact Center Agent** | Call center staff handling inbound/outbound member calls | Power dialing, inbound routing, member record access, survey support, warm transfers |
| **Contact Center Supervisor** | Manages agent dial lists and assignments | Dynamic dial list creation and agent assignment |
| **Community Lead** | Manages community events, RSVPs, and member groups | Roster management, bulk SMS, event reporting, virtual platform management |
| **System Admin** | Configures business logic, automations, and integrations | No-code rule management, RBAC management, rule-engine config, integration monitoring |
| **Data Engineer** | Ensures data integrity, ingestion, and billing exports | Interaction validation, claims file ingestion, billing data export |
| **Supplier (MediCircle, Upside, TruConnect)** | External supplier partners with member-level workflow needs | MediCircle (Specialty Rx), UpsideHom (Housing), TruConnect (Lifeline/ACP wireless) |
| **Biller / Billing Team** | Revenue cycle ops (RCM) partner to clinical team | Billable interaction export, claim status visibility, write-off / adjustment workflows |
| **Supervisor** | Line supervisor across clinical, CM, and CC teams (role, not fixed persona) | Monitors, exception handling, shadowing, coaching |
| **Medicare Liaison (Ask Claire)** | Ask Claire agent who contacts members with a valid Permission to Contact (PTC) to secure a Scope of Appointment (SOA) | PTC-gated dial list, agent desktop with TPMO-compliant scripts, SOA capture workflow tied to the unified consent model, call recording with long-retention tier, scheduled handoff to Medicare Sales Agent once SOA is on file |
| **Medicare Sales Agent (Ask Claire)** | Licensed Ask Claire agent who contacts members with a valid SOA to present carrier plans and complete alignment/enrollment | SOA-gated dial list, carrier-specific plan-presentation scripts, real-time dual-eligibility verification, electronic enrollment application capture, carrier enrollment submission & status tracking, book-of-business management and retention outreach; licensing / AHIP / carrier-certification gates enforced before dialing |
| **Compliance Officer** | Regulatory & audit oversight across business units | Cross-entity audit log access, RBAC review, policy enforcement monitoring, breach response |

# 3. Functional Requirements by Module

Requirements are organized by platform module. Each requirement includes a unique ID, user story origin, acceptance criteria, MoSCoW priority, and delivery phase.

## 3.1 Care Delivery Module

The Care Delivery module covers the end-to-end clinical workflow: from prospective patient scheduling through telehealth visits, action plan management, billing documentation sync, and clinical staff supervision.

This workflow starts when the patient is doing the intake visit. The intake visit consists of 3 parts: 1. The SDoH assessment done by the CHW; 2. The Care Plan, diagnosis, and coding done by the Provider; 3. The reviewal of the Care Plan and next steps by the CHW. After that visit, the CHW will be the main point of contact with the Patient. Their main goals are to assist in achieving the goals of the Care Plan, build trust, and create a relationship with the Patient. The CHW needs to track the time spent on engagement with the patient throughout the month.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **CD-01** | **Prospective Patient Scheduling** | As a prospective patient, I want to schedule an initiating visit online without staff assistance. | Patient-facing scheduling UI available; calendar syncs with provider availability; confirmation email/SMS sent; supports self-serve and staff-assisted booking. | **Must** | **Phase 1** |
| **CD-02** | **Appointment Reminders** | As a patient or prospective patient, I want automated appointment reminders so I do not miss a visit. | Reminders sent via SMS and/or email at configurable intervals (e.g., 48h and 2h before); channel preference stored per member; reminder log accessible in member record. | **Must** | **Phase 1** |
| **CD-03** | **Visit Summary & Action Plan Delivery** | As a patient, I want to receive a visit summary and action plan so I can act on my care goals. | Visit summary auto-generated on encounter close; delivered via patient-facing portal and/or SMS/email; action plan items are structured and shareable. | **Must** | **Phase 1** |
| **CD-04** | **Appointment Feedback** | As a patient, I want to submit feedback on my care experience. | Post-visit survey triggered automatically; responses captured in member record; aggregated reporting available for ops review. | **Should** | **Phase 2** |
| **CD-05** | **Consent Management** | As a care provider, I want to capture and store CHI/PIN service consents during the telehealth initiating visit to remain billing-compliant. | Consent workflow embedded in telehealth visit flow; e-signature captured and timestamped; stored in member record; auditable consent log available for compliance review; verbal consent for participation in the CHI/PIN program is captured in the initiating visit. | **Must** | **Phase 1** |
| **CD-06** | **Telehealth Visit Conduct** | As a provider, I want to conduct appointments via telehealth so I can provide care virtually. | Integrated telehealth video solution or deep-link to approved platform (e.g., Zoom Health, Doxy.me); video session launches from within member record; session metadata logged. | **Must** | **Phase 1** |
| **CD-07** | **Consultation Notes Access** | As a provider, I want to see consultation notes before meeting a patient so I have context. | Pre-visit chart available in provider view; includes prior notes, action plans, and interaction history; accessible at least 30 minutes before appointment. | **Must** | **Phase 1** |
| **CD-08** | **Action Plan Authoring** | As a provider, I want to document clinical notes and create an action plan for my patient. | Structured action plan template available; free-text notes supported; plan items include owner, due date, and status; linked to member record. | **Must** | **Phase 1** |
| **CD-09** | **Clinical Staff Supervision** | As a provider, I want to review and sign off on clinical staff documentation. | Supervisor review queue shows pending notes/plans from clinical staff; one-click approve or request revision; audit trail of sign-offs maintained. | **Must** | **Phase 1** |
| **CD-10** | **Billing Documentation Sync** | As a provider, I want charting notes and clinical staff documentation to auto-sync with the RCM system (Candid) so claims are submitted without manual entry. | On encounter close, structured billing data (CPT codes, duration, provider ID, member ID) pushed to the Candid API; eligibility pre-check performed via Bridge API before scheduling (ref CD-11); sync status visible in admin; failed syncs trigger alert. Billing backbone dependency chain: CD-17 (time tracking) → CD-08 (action plan) → CD-09 (supervision sign-off) → DA-08 (billing rules) → DA-02 (interaction validation) → CD-10 (this). Any predecessor slipping delays revenue. | **Must** | **Phase 1** |
| **CD-11** | **Eligibility Check** | As a clinical staff member, I want to check member eligibility via Bridge so I can identify if they are in-network before scheduling. | Real-time eligibility lookup integrated with Bridge API; result displayed in scheduling workflow; eligibility status stored in member record with date of check. | **Must** | **Phase 1** |
| **CD-12** | **Initiating Visit Scheduling (Staff)** | As a clinical staff member, I want to schedule an initiating visit with the MD on behalf of a prospective patient. | Staff scheduling UI allows provider selection, time slot booking, and patient linkage; confirmation sent to patient; appointment visible in provider and staff calendars. | **Must** | **Phase 1** |
| **CD-13** | **Care Plan Review (Clinical Staff)** | As a clinical staff member, I want to review the provider's notes and action plan to know what services to provide. | Clinical staff view shows action plan items assigned to them; status updates trigger provider notification; full note history accessible. | **Must** | **Phase 1** |
| **CD-14** | **Care Plan Editing** | As a clinical staff member, I want to edit or update the action plan to document patient needs and progress. | Edit history tracked with author and timestamp; edits flagged for provider review if configured; action plan versioned. | **Must** | **Phase 1** |
| **CD-15** | **Provider Review Submission** | As a clinical staff member, I want to submit my documentation for billable services to the provider for sign-off. | Submission workflow with status (Draft → Submitted → Approved/Revision Requested); notification sent to provider on submission; lock mechanism prevents editing after submission. | **Must** | **Phase 1** |
| **CD-16** | **Patient Prioritization** | As a care delivery manager, I want to prioritize patients based on CPT time requirements to maximize clinical impact and revenue. | Priority score calculated from CPT time thresholds, billing windows, and engagement status; sortable worklist displayed; priority recalculates daily. | **Should** | **Phase 2** |
| **CD-17** | **Time-Based Billing Tracking** | As a clinical staff member, I want to track time spent with each member and see who is approaching a billing threshold so I can prioritize outreach. | Per-member time tracker with start/stop; dashboard shows members approaching CPT billing thresholds; alerts configurable by threshold percentage. | **Must** | **Phase 1** |
| **CD-18** | **Task & Schedule Management** | As a clinical staff member, I want to manage my tasks and daily schedule in one place including upcoming appointments, overdue follow-ups, and member-linked tasks. | Unified task/calendar view; tasks linked to member records; overdue items flagged; filters by status, member, and date; supports manual task creation. | **Must** | **Phase 1** |
| **CD-19** | **SDoH Assessment** | As a clinical staff member, I want my patient to complete an SDoH assessment. | Assessment form (configurable per program) sent to patient via portal or SMS link; responses captured in structured format; triggers case creation if risk thresholds met. | **Must** | **Phase 1** |

## 3.2 Case Management Module

The Case Management module is the operational backbone for member outreach, case resolution, survey administration, and referral management. It must replace existing Salesforce CRM workflows with full audit trails.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **CM-01** | **Integrated Case Intake** | As a Case Manager, I want cases to appear in my queue automatically when new members become eligible or when claims indicate a need, so I can begin outreach without waiting for a manual handoff. | When cases are auto-created per opportunity engine, cases routed to the assigned CM; CM notified in-product. | **Must** | **Phase 1** |
| **CM-02** | **Unified Member Context** | As a Case Manager, I want to see the member's full history, including notes, closed cases, relationships, all interactions and outreach attempts with Wider Circle in one view. | Single member profile shows: case history, interaction log, communication history (calls, SMS, email), referrals, consents, notes, relationships (caregiver, spouse, child, etc.), and clinical data. No switching between systems. | **Must** | **Phase 1** |
| **CM-03** | **Key Member Info Display** | As a Case Manager, I want to see health plan name, Plan ID, primary language, State, ZIP code prominently so I am prepared before a call. | Highlighted member attributes panel visible on case open; fields include Plan ID, language, ZIP, preferred contact method, and risk tier. Also key info specific to the case type (e.g. PCP name/phone, Rx info, Population of Focus, etc.) | **Must** | **Phase 1** |
| **CM-04** | **Case Surveys** | As a Case Manager, I want to conduct surveys that capture consents and/or clinical data and member feedback, and trigger follow-up cases if risks are identified. | Configurable survey engine; supports branching logic; consent capture with e-signature; auto-triggers follow-up case if response meets defined threshold; responses stored structurally. | **Must** | **Phase 1** |
| **CM-05** | **SDoH Referrals** | As a Case Manager, I want to refer a member to another team and/or third-party supplier for non-health services and track referral status. | Referral form linked to supplier network; status tracked (Referred → Accepted → Fulfilled/Closed); status visible in member case file; supplier notified via integration or email. | **Must** | **Phase 1** |
| **CM-06** | **PCP Verification** | As a Case Manager, I want to verify a member's PCP and schedule an appointment within the case flow. | PCP lookup tool in case UI; verified PCP stored in member record; appointment scheduling modal allows staff to book on member's behalf; resolution captured in case notes. | **Must** | **Phase 1** |
| **CM-07** | **Appointment Scheduling on Behalf** | As a Case Manager, I want to call doctor offices and schedule either A) assist members in scheduling their appointment (3-way call and I can drop off), or B) call doctor and schedule member appointments on their behalf without the member. | External call can be logged within case, 3-way calling feature; appointment details entered manually; integration or smart entry for common provider networks; scheduled appointment visible in member timeline. | **Should** | **Phase 2** |
| **CM-08** | **Member Availability Preferences** | As a Case Manager, I want to capture and store member availability preferences for scheduling. | Preference fields: days, times, modality (phone, in-person); stored on member profile; surfaced in scheduling and outreach workflows. | **Should** | **Phase 2** |
| **CM-09** | **Unified Communication History** | As a Case Manager, I want a unified Conversation Feed showing SMS, MMS, email, and recorded phone calls. | All communication channels aggregated in chronological feed on member profile; Five9 call recordings linked or embedded; SMS/email sent and received visible; no manual logging required. | **Must** | **Phase 1** |
| **CM-10** | **SDoH Needs Feed** | As a Case Manager, I want a real-time feed of new SDoH needs identified from other parts of the business. | Cross-module feed shows SDoH flags from Benefits Navigation, Community Events, and Resource Finder; each item links to member profile; timestamps and source displayed. | **Should** | **Phase 2** |
| **CM-11** | **Funnel Management Dashboard** | As a CM Manager, I want a visual dashboard of the member engagement funnel with notifications, stage-stagnation alerts, and per-CM performance comparison metrics. | Canonical funnel stages (configurable per program): Available → Attempted → Reached → Interested → Enrolled → Engaged → Graduated / Declined / Unreachable. Kanban or funnel visualization with real-time counts per stage; transition-rate analytics; per-CM performance metrics; notification on stage stagnation (threshold per stage, admin-configurable). | **Should** | **Phase 2** |
| **CM-12** | **Individual & Bulk SMS** | As a Case Manager, I want to send individual and bulk SMS messages with all communications auto-logged. | Individual SMS from member profile; bulk SMS by segment/cohort; all messages logged to member profile automatically; opt-out handling; delivery status tracking. | **Must** | **Phase 1** |
| **CM-13** | **CHW Workflows** | As a CHW, I want to manage referrals, track member relationships, and capture Plan of Care details and signatures on my mobile and desktop devices. | Mobile-responsive app (or native) with: referral management, member relationship tracking, Plan of Care form with multiple touchpoints to enter details, e-signature capture; real-time sync to server when connected. | **Should** | **Phase 2** |
| **CM-14** | **Canvasser Mobile / Offline** | As a Canvasser, I want a mobile app with offline mode for door-to-door visit documentation, notes, dispositions, and secure photo capture. | Offline data capture with sync-on-reconnect; note and disposition fields; camera integration for signed document capture; secure cloud storage; field visit logged to member record. | **Should** | **Phase 2** |
| **CM-15** | **Admin Logic Management** | As an Admin, I want to configure business logic without code deployments across: member segmentation, staff assignment, billable interaction rules, and multi-step workflows. | No-code rule builder for: member segmentation, assignment rules, billing thresholds, case creation triggers, and metrics; changes auditable; effective date scheduling. | **Must** | **Phase 1** |
| **CM-16** | **Gamification Metrics** | As a CM Manager, I want gamification metrics on the funnel dashboard to motivate team performance. | Gamification metrics definition is out of scope for CM-11a; CM-11b tracks the specification of gamification rules (points, leaderboards, rewards) and their surfacing on the funnel dashboard. | **Could** | **Phase 3** |
| **CM-17** | **Workload Management** | As a CM Manager, I want a unified view of all unassigned cases and aging tasks to rebalance team workload. | Dashboard of unassigned/overdue cases with age indicators; drag-and-drop or bulk reassignment; filters by language, priority, and geography; exportable. | **Should** | **Phase 2** |
| **CM-18** | **Ops / CM Reporting** | As a CM/Ops Manager, I want real-time dashboards for case throughput and member engagement directly in the CMS. | Built-in dashboards: case volume, open/closed/aging, CM productivity, engagement rate by program; configurable date ranges; replaces Tableau for daily ops. | **Should** | **Phase 2** |
| **CM-19** | **Case Dependency Rules** | As an Admin, I want to define rules that prevent a second or subsequent case from opening for a member until a specified prior case reaches a terminal status, so suppliers and case managers do not step on each other. | Case dependency rules configurable per workflow and per supplier scope (e.g., Upside); dependent case creation blocked or queued until predecessor reaches Closed; blocked-case queue visible to assigned team and supplier; dependency rules auditable and versioned. | **Should** | **Phase 2** |
| **CM-20** | **Workflow Builder / Task Automation** | As an Admin, I want to create tasks, surveys, or cases that can be assigned and automatically routed through multi-step workflows. | No-code workflow builder supporting: task creation, survey embedding, conditional routing, multi-assignee handoffs, SLA timers, and escalation rules. | **Must** | **Phase 1** |
| **CM-21** | **Manual Case Creation** | As a case manager, I want to create new cases as I identify adhoc needs, such as a housing need, so that I can track and document assistance provided to member until it’s resolved. | CM user can create a new case ad hoc with a need type (e.g., SDoH needs, needs new PCP, etc.), associating it to a member, capturing documentation and status updates over time, and supporting state transitions through resolution with an auditable history. | **Must** | **Phase 1** |
| **CM-22** | **ECM Outreach Attempt Tracking & Billable Cap Enforcement** | As a CHW working ECM members, I want the system to track every outreach attempt against the per-client billing cap and time window, so I know which attempts will be billable and stop wasting effort on non-billable attempts after the cap is hit. | For ECM-eligible members, the platform tracks every outreach attempt (call, SMS, email, in-person visit) with: timestamp, channel, outcome, agent, and whether it counts toward the billable cap. Per-client billing rules are admin-configured: max billable attempts (e.g., 10 or 15), time window from referral / eligibility (e.g., 60 / 90 days), eligible attempt types, and what counts as a "successful" terminating attempt. ECM consent is captured and required before any attempt is billable; attempts before consent are tracked as non-billable but logged for compliance. Member-level dashboard panel shows: attempts used / cap, days remaining in window, consent status, billable vs. non-billable breakdown, and a clear visual indicator when approaching cap (e.g., 8 of 10) or cap reached. Cap-reached behavior: further attempts are still allowed (CHW may still be ethically obligated to outreach) but flagged "non-billable — cap reached"; system does not block outreach. Time-window-expired behavior: same — flagged "non-billable — window closed." Member-level outreach history is the source of truth; ECM cap counter derives from it with the per-client rule applied. Reporting: ECM-specific dashboards show attempt utilization across the caseload, members approaching cap, billable revenue captured vs. potential, and per-client breakouts. | **Must** | **Phase 1** |

## 3.3 Contact Center Module

The Contact Center module manages inbound and outbound call operations, integrated with Five9 and Twilio, ensuring agents have immediate member context and supervisors can manage dial lists and agent performance.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **CC-01** | **External Dialing** | As a Call Center Agent, I want to dial phone numbers outside our system (e.g., doctor offices) to coordinate care. | Click-to-dial from any phone number field in the platform; call logged automatically to active case/member record; manual entry option for unlisted numbers. | **Must** | **Phase 1** |
| **CC-02** | **Power Dialing** | As a Call Center Agent, I want a Power Dialer mode that automatically dials the next member in my queue when I finish a call. | Power dialer presents next dial in queue without manual initiation; configurable delay between calls; agent can pause/stop queue; disposition required before auto-advance. | **Should** | **Phase 2** |
| **CC-03** | **Inbound Call Screen Pop** | As a Call Center Agent, I want inbound calls to automatically surface the most likely matching member record based on caller ID, with disambiguation when multiple members share the number. | On call answer, the system matches ANI against: (1) members, (2) caregivers and relationships, (3) leads; within 3s returns a ranked match list (1..N). Single unambiguous match auto-opens the profile. Multiple matches presented in a compact picker ordered by recency of interaction. Blocked / withheld ANI shows a "manual search" pane, pre-focused on the phone number field. Calls from a number matching a lead record offer a one-click "convert to member" flow (ref CC-07). All match decisions (auto-open, agent selection, manual search) logged to the interaction record. | **Must** | **Phase 1** |
| **CC-04** | **Member Record Access & Notes** | As a Call Center Agent, I want to quickly access a member's full profile during a call and save interaction notes that sync immediately. | Full member profile accessible during active call; interaction note field auto-opened on call answer; notes save in real time; interaction logged with timestamp, duration, and disposition. | **Must** | **Phase 1** |
| **CC-05** | **Warm Transfer with Real-Time Context Handoff** | As a Call Center Agent, I want to warm-transfer a member to a clinician (or another internal team or external party) and have my notes, the reason for transfer, and the member's collected context arrive with the call in real time, so the receiving party doesn't have to ask the member to start over. | When the agent initiates a warm transfer, the agent confirms the transfer reason and selects the recipient (internal team / individual / external party); a structured context payload travels with the transfer including: (a) caller identity and member profile link, (b) reason for transfer, (c) the agent's in-call notes, (d) any consents captured this call (ref CC-09), (e) member's stated needs and any survey responses from this interaction (ref CC-05), (f) open cases relevant to the transfer; recipient sees the context in their UI before answering the call (or within seconds of answering for fast-handoff cases); transfer event and context payload logged to the interaction record on both sides; receiving party can edit / append notes that link back to the same interaction. (Today, notes don't transfer and clinicians often pick up cold — this requirement explicitly closes that gap.) | **Must** | **Phase 1** |
| **CC-06** | **Dial List Management** | As a Contact Center Supervisor, I want to create and assign dynamic dial lists to agents based on member attributes. | List builder with filters: plan type, language, clinical priority, geography; lists assigned to specific agents or groups; list refreshes dynamically based on filter criteria; supervisor dashboard shows list progress. | **Must** | **Phase 1** |
| **CC-07** | **Ad-hoc Outreach (Auxiliary)** | As auxiliary personnel, I want to perform ad-hoc outreach to leads from existing members or purchased lead lists. | Lead record type distinct from member; ad-hoc call/SMS logging; consultation scheduling from lead record; lead-to-member conversion workflow on enrollment. | **Should** | **Phase 2** |
| **CC-08** | **Call Recording & Consent Capture** | As a Call Center Agent, I want the platform to record the call and inform the member on call recording so I'm always compliant without having to remember state-by-state rules. | Call recording and standardized recording consent at the beginning of the call. | **Must** | **Phase 1** |
| **CC-09** | **AI-Generated Call Summary** | As a Call Center Agent, I want the platform to generate a concise summary of my call automatically so I don't have to spend post-call time writing it up and so the next person who reads the member's record can understand what happened quickly. | After call disposition, an AI-generated summary is produced from the call recording / transcript; summary includes: (a) reason for call, (b) key topics discussed, (c) member's stated needs, (d) agreed next steps and owners, (e) consent and disposition; agent reviews and edits the summary before saving (default state: editable draft, not auto-saved as final); summary saved to the interaction record alongside the raw notes; summary respects the no-PHI-in-external-channels policy when surfaced anywhere outside the platform (ref MSG-01); confidence indicators flag low-confidence summary sections for agent attention; admins can configure summary length / format per program; AI provider and prompt template versioned and auditable. | **Should** | **Phase 2** |
| **CC-10** | **Program and Campaign-Driven Agent Script Flows** | As a Call Center Agent, I want a guided script to appear automatically when I'm on a call for a specific campaign so I follow the right flow without juggling separate documents, and I capture the right info structured into the right fields. | When an agent answers an inbound call or initiates an outbound call from a dial list, the platform identifies the associated campaign and automatically surfaces the relevant script flow in the agent UI alongside the member profile; the script presents step-by-step prompts (opening, questions, statements); each step can require: a verbal script the agent reads, a structured response the agent captures (single-select, multi-select, free text, numeric, date), a consent capture, an embedded survey, or a disposition assignment; agent advances through steps with one click; structured responses save in real time to the interaction record and to dedicated campaign data fields (queryable for reporting); script completion is required before the call can be dispositioned (configurable per campaign); skipped steps are logged with reason. | **Must** | **Phase 1** |
| **CC-11** | **Script Designer (Admin)** | As an Ops Manager, I want a no-code designer to author and version script flows for each campaign so I can launch new campaigns and iterate on existing ones without engineering involvement. | Web-based designer with: (a) step builder (verbal text + response capture + step type), (b) branching configuration (ref CC-13), (c) variable insertion (member name, plan, etc.), (d) preview / test-run mode against a synthetic or test member before publish, (e) versioning — each script has a version number; running calls keep the version they started with even if a newer version publishes mid-call, (f) draft / published / archived states with audit trail of who changed what when, (g) script assignment to one or more campaigns / dial lists; published scripts available to agents within seconds; rollback to prior version supported. | **Should** | **Phase 2** |

## 3.4 Community Events Module

The Events module supports Community Leads in managing virtual and in-person events, member RSVPs, bulk communications, and event-based engagement tracking.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **EV-01** | **Roster & RSVP Management** | As a Community Lead, I want to see members most likely to attend a specific event and manage RSVPs efficiently. | Event roster shows predicted attendees based on location, interests, and history; RSVP status (Yes/No/Maybe) manageable per member; bulk RSVP updates; print/export roster. | **Must** | **Phase 1** |
| **EV-02** | **Bulk Event Communications** | As a Community Lead, I want to send a group text to members in a specified grouping for event updates. | Bulk SMS with member group filter (chapter, geography, program); message preview before send; delivery status report; all messages logged to member records. | **Must** | **Phase 1** |
| **EV-03** | **Event Reporting** | As a Community Lead, I want to see attendance rates and engagement trends by event type. | Dashboard shows: attendance rate, RSVP vs. actual, engagement by event type (Virtual vs. In-person), trend over time; exportable to CSV. | **Should** | **Phase 2** |
| **EV-04** | **Virtual Event Platform** | As a Community Lead, I want to manage townhalls and teleconference events including attendance, hand-raise, mute/unmute, notes, and banning. | Integrated or deeply linked virtual event tool; attendance log auto-captured; moderator controls (mute/unmute/ban); hand-raise queue visible; session notes and attendance synced to platform post-event. | **Should** | **Phase 2** |
| **EV-05** | **Member Event Finder** | As a Member or Community Lead, I want an integrated Event Finder to discover local or virtual events by location and interests. | Member-facing or staff-assisted event search with location and interest filters; event details, RSVP, and calendar add; results personalized by member profile. | **Should** | **Phase 2** |
| **EV-06** | **Member Self-Serve Event Portal** | As a Member, I want a self-serve portal to update my RSVP and view scheduled activities without calling a Community Lead. | Member portal with: upcoming events list, RSVP management, activity history; accessible via web or SMS link; changes reflected in staff-facing roster in real time. | **Could** | **Phase 3** |
| **EV-07** | **Unaligned Dual Engagement Tracking** | As an Ops Manager, I want to track which unaligned dual members are engaging with Hank and Resource Finder platforms. | Member engagement data from Hank and RF; engagement flags visible on member profile; ops dashboard shows engagement rates by platform and segment. | **Could** | **Phase 3** |

## 3.5 Communication & Messaging

This module covers all member-facing and staff-facing communication channels: SMS (individual and bulk), MMS, email, and integration with Marketing Cloud for automated campaigns.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **MSG-01** | **SMS / MMS Storage & Viewing** | As a staff, I want to view and engage in back-and-forth SMS conversations and review/upload MMS images from members. | Two-way SMS thread visible on member profile; MMS images stored in AWS S3 or equivalent with secure link; images viewable inline; all communication auto-logged to member record. | **Must** | **Phase 1** |
| **MSG-02** | **Marketing Messaging, Journey Building & Automations** | As a System Admin, I want the CMS to sync member segments and interaction data with our marketing automation platforms to trigger personalized email and SMS campaigns and cross-platform behavior nudges. | Bidirectional sync with two platforms: (a) Klaviyo — journey building and marketing campaigns (email and SMS); (b) Clutch — broader behavior nudges, rewards, and loyalty across services and platforms. Segments pushed on update; campaign triggers supported: reactive (event-based), time-based, scheduled recurring; unsubscribe / opt-out honored across both platforms; transactional vs. marketing channel split preserved. | **Must** | **Phase 1** |
| **MSG-03** | **Member Communication Preferences** | As a system, I want to store robust member communication preferences including modality and best contact times. | Member profile stores: preferred channel (SMS/email/phone), preferred days/times, language, opt-in/out status per channel; preferences surfaced in all outreach workflows. | **Must** | **Phase 1** |

## 3.6 Supplier Network Module

The Supplier Network module manages workflows for external supplier partners — specifically MediCircle (prescription management) and Upside (housing/field CE coordination). These partners interact with the platform on behalf of their assigned member caseloads.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **SUP-01** | **Prescription Queue Alerts (MediCircle)** | As MediCircle CE, I want to be informed when a member's prescription is X days from being ready so the patient can be notified. | Configurable alert threshold (e.g., 3 days); alert surfaced in MediCircle supplier view and optionally sent via SMS/email to member; alert log maintained per member. | **Must** | **Phase 1** |
| **SUP-02** | **Dial Tracking & Interaction Logging (MediCircle)** | As MediCircle CE, I want every interaction with a member, pharmacy, or provider tracked and all attempts logged in the member record. | All outreach attempts (call, SMS) logged to member record with timestamp, outcome, and contact type (member/pharmacy/provider); attempt history visible to WC staff. | **Must** | **Phase 1** |
| **SUP-03** | **Multi-RX Bundle Management (Medicircle)** | As MediCircle CE, I want to be informed when a member's entire bundle of prescriptions is ready and be able to track each status. | Multi-prescription view per member; each Rx has individual status; bundle-ready alert triggered when all active Rx statuses are fulfilled; status history maintained. | **Should** | **Phase 2** |
| **SUP-04** | **Consent Bypass (MediCircle)** | As MediCircle CE, I want to know if a member has already consented so I can bypass the consent call and focus on pharmacist coordination. | Consent status visible in supplier member view; consent date and type displayed; workflow branches automatically if valid consent on file. | **Must** | **Phase 1** |
| **SUP-05** | **Task Notifications** | As a CE, I want to be notified of updates and tasks assigned to members in my caseload. | In-platform notifications and/or email alerts on: new assignments, case status changes, required tasks; notification preferences configurable per supplier user. | **Must** | **Phase 1** |
| **SUP-06** | **Data Verification** | As a CE, I want member details in the WC system verified automatically against Upside data and flagged if discrepancies exist. | Automated reconciliation on Upside data feed receipt; discrepancies (name, DOB, address) flagged in member record; resolution workflow for admin review. | **Should** | **Phase 2** |
| **SUP-07** | **Shadow Tracking (Upside)** | As Upside CE, I want the member profile to display assignment and status so I know where the member is in the end-to-end workflow. | Member profile shows Upside-specific status field (e.g., Assigned, Visit Scheduled, Completed); status synced from Upside workflow; visible to both WC and Upside users. | **Must** | **Phase 1** |
| **SUP-08** | **Sequential Case Enforcement (Upside)** | As Upside CE, I want to wait until a member's first case is fully closed before their second or third case can be opened. | Case dependency rules enforced by workflow engine; next case creation blocked until prior case status = Closed; visible queue of pending cases per member. | **Should** | **Phase 2** |
| **SUP-09** | **Team Assignment & Outreach Tracking (Upside)** | As Upside CE, I want to assign members to my team and be automatically informed when outreach is not happening. | Upside team management view; member-to-CE assignment; outreach inactivity alert (configurable threshold); alert sent to Upside supervisor. | **Should** | **Phase 2** |
| **SUP-010** | **Smart Route Creation for in-person meetings (Upside)** | As an Upside CE, I want to see my prioritized members/cases and use that to plan and create the most efficient routes for in-person meetings with members in nearby areas | the system displays their assigned members/cases ranked by priority score, supports filtering by geographic proximity (zip/radius/lat-long), allows multi-select to generate a route optimized for travel time between selected locations, and returns a deep link or export (e.g., Google Maps URL) for navigation. | **Should** | **Phase 2** |
| **SUP-10** | **Location Discovery Support (Upside)** | As Upside CE, I want the member profile to support capture of current location for unhoused members identified during a call. | Location field editable per encounter; address type flag (permanent/temporary/unknown); location updated in real time during or after call; location history maintained. | **Should** | **Phase 2** |
| **SUP-11** | **Document Relay Automation (Upside)** | As Upside, I want signed housing documents to automatically route to the designated Case Manager without manual email forwarding. | Document upload by CE triggers routing workflow; target CM identified from assignment; notification sent; document stored in member record with type classification. | **Could** | **Phase 3** |
| **SUP-12** | **Automated Outcome Reporting (Upside)** | As Upside, I want all visit summaries within the outcome report to automatically send to Upside. | Configurable report template; visit summaries aggregated per reporting period; automated delivery via email or SFTP to Upside; send log maintained. | **Should** | **Phase 2** |
| **SUP-13** | **Supplier Referral Tracking (General)** | As a Case Manager, I want to refer a member to a specific partner in our supplier network and track fulfillment status. | Supplier directory searchable from case; referral record created with supplier, service type, and date; status tracked through lifecycle (Referred → Accepted → Fulfilled); member record updated. | **Must** | **Phase 1** |

## 3.7 Reporting, Data & Administration

This module covers system-wide data management, administrative configuration, reporting capabilities, and cross-cutting concerns such as billing data exports and member journey visibility.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **DA-01** | **Member-to-Staff Assignment Rules** | As an Ops Manager, I want to define rules for automatically assigning members to staff based on geography, language, or plan type. | No-code rule builder for assignment logic; rules applied on member creation or update; manual override available; assignment log maintained per member. | **Must** | **Phase 1** |
| **DA-02** | **Interaction Validation** | As a Data Engineer, I want an interaction validation process to ensure all recorded member touches meet compliance and billing standards before finalization. | Validation rules engine checks required fields (CPT code, duration, provider signature); failed validations flagged in review queue; cannot be billed until resolved. | **Must** | **Phase 1** |
| **DA-03** | **Interaction Data Ingestion** | As a System, I want to ingest interaction data from external sources (eligibility updates, monthly claims files) to auto-refresh member status. | Automated ingestion pipeline (SFTP or API); file format validation; member matching; new cases or status updates triggered on ingestion; ingestion log with error reporting. | **Must** | **Phase 1** |
| **DA-04** | **Billing Data Export** | As a Data Engineer, I want all billable activity data exported in a standardized format for the billing team. | Scheduled or on-demand export in defined schema (CSV or HL7/JSON); covers CPT code, duration, provider, member, date, program; delivered to billing team or RCM system; export log. | **Must** | **Phase 1** |
| **DA-05** | **Member Grouping & Segmentation** | As an Admin, I want to define and update member grouping and segmentation rules for outreach program automation. | Segment builder with logical conditions (plan, geography, clinical risk, engagement status); segments auto-refresh; segments usable in dial lists, bulk SMS, and marketing triggers. | **Must** | **Phase 1** |
| **DA-06** | **Member Journey View** | As a staff member, I want to see where a member is in their journey with Wider Circle and what actions provide the most value. | Visual timeline or status map of member journey stages; recommended next actions surfaced based on journey position; linked to case, clinical, and engagement data. | **Should** | **Phase 2** |
| **DA-07** | **Salesforce Automation Migration** | As an Admin, I want all major Salesforce automations replicated in the new platform without loss of business logic. | Inventory of all active Salesforce flows, triggers, and process builders documented; equivalent logic implemented in new platform; UAT validation checklist per automation. | **Must** | **Phase 1** |
| **DA-08** | **Billable Interaction Rules (Per Program)** | As an Admin, I want to set rules for billable interactions based on program or client. | Per-program billing rule configuration: CPT codes, time thresholds, required documentation; rules applied at interaction creation; overrides require supervisor role. | **Must** | **Phase 1** |
| **DA-09** | **Real-Time Operational Dashboards** | As a CM/Ops Manager, I want real-time dashboards for case throughput and member engagement to replace Tableau. | Pre-built dashboards: case volume, CM productivity, engagement rate, billing pipeline; configurable filters; refresh interval ≤ 5 minutes; role-based access to dashboard views. | **Should** | **Phase 2** |
| **DA-10** | **Member Info Enrichment (TransUnion (formerly Neustar))** | As a system, I want member communication preferences enriched via TransUnion (formerly Neustar) or equivalent to identify best contact modalities and times. | Integration with TransUnion (formerly Neustar) or third-party data enrichment; enrichment fields: best phone, best time, channel preference; applied to member profile; enrichment date logged. | **Could** | **Phase 3** |
| **DA-11** | **Data Provenance & Legal Basis Tagging** | As a Compliance Officer, I want every PHI record and interaction log to carry a Data Provenance & Legal Basis tag identifying whether Wider Circle is operating as Covered Entity, Business Associate, or Dual-status for that record, so access rules, retention, consent scope, and breach notification obligations can be applied correctly. | Every Member, Case, Encounter, Interaction, Referral, Consent, and Communication record carries a provenance tag (CE | BA | Dual) sourced at record creation from member enrollment context; tag is immutable once set; access rules enforce tag-appropriate policies (e.g., BA records cannot be used for WC-as-CE marketing outreach); provenance visible in admin for any record; bulk operations respect provenance boundaries. (Platform policy: every new table storing PHI MUST include a provenance column validated in schema review.) |  |  |
| **DA-12** | **Unified Consent Model** | As a Compliance Officer, I want all member consents captured, versioned, and queryable through a single model so every workflow can check consent validity before acting. | Consent entity stores: consent type (from canonical list), member, effective date, expiration / revocation date, method (e-sig / verbal / written), source system, source document reference, scope, consent language version. Canonical consent types (initial list, extensible): Telehealth, CCM / PCM enrollment, HIPAA authorization, Communications (TCPA), Data Sharing (AC ↔︎ WC), Call Recording, Research / Aggregate Use. Every workflow that requires consent queries this model and blocks if no valid consent on file; consent revocations propagate and block dependent workflows. |  |  |
| **DA-13** | **Intra-WC Audit Log** | As a Compliance Officer, I want every PHI read and every PHI write within Wider Circle logged so we can demonstrate HIPAA minimum-necessary compliance and investigate access incidents. | Immutable audit log records: user ID, user role, entity (CE / BA / Dual per DA-11), data type accessed (member profile, case, encounter, clinical note, communication, consent, etc.), member ID, action (read / write / export / bulk-query), timestamp, purpose code (care delivery, case management, reporting, admin, etc.). Retention ≥6 years. Tamper-evident storage. Exportable for audit. Accessible only to compliance officers and system admins. Log access itself logged (meta-audit). (Parallel to AC-11 for cross-entity events.) |  |  |
| **DA-14** | **RBAC v1** | As a System Admin, I want role-based access control governing every read and write in the platform, scoped by entity (WC / AC / Supplier), function (clinical / case mgmt / community / ops / compliance / analytics), and data scope (program / geography / member-assignment). | Roles defined as a combination of entity × function × data-scope; role assignments auditable and time-bounded; role changes logged; every API and UI action gated by explicit permission check; default-deny for unrecognized actions. Phase 3 extensions (AC-09 unified platform access, AC-10 anti-steering enforcement) build on this model. (Foundational for AC-11 and all access-scoped requirements.) | **Must** | **Phase 1** |

## 3.8 Application Surfaces Module

This module defines requirements for the four patient- and member-facing application surfaces that are part of this engagement. Three of these (Member App, Self Serve Portal, Resource Finder) are Phase 1 deliverables; the Virtual Platform is a Phase 2 deliverable.

### Application Surface Overview

| **Application** | **Primary Users** | **Current State** | **Target State** | **Phase** |
| --- | --- | --- | --- | --- |
| **Virtual Platform** | Community Leads, Members |  |  |  |
| **Member App** | Patients / Members |  |  |  |
| **Self Serve Portal** | Members (self-directed) |  |  |  |
| **Resource Finder (RF)** | Members, Case Managers |  |  |  |

### 3.8.1 Virtual Platform

The Virtual Platform enables Community Leads to manage large-scale townhalls and teleconference events directly within the platform — replacing ad-hoc tooling with an integrated, documented, and analytics-connected experience.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **VP-01** | **Virtual Event Hosting** | As a Community Lead, I want to host townhalls and teleconference events from within the platform so I can manage attendance and interactions at scale. | Integrated or deeply embedded video conferencing solution (e.g., Zoom, Daily.co, Twilio Video); sessions launchable from an event record; session metadata (start/end time, host, participant count) auto-logged. | **Must** | **Phase 2** |
| **VP-02** | **Attendance Management** | As a Community Lead, I want to see who has joined and track attendance in real time during a virtual event. | Live attendee list with join/leave timestamps; auto-reconciled against RSVP list; attendance record written to each member's profile on session close. | **Must** | **Phase 2** |
| **VP-03** | **Moderator Controls** | As a Community Lead, I want to mute/unmute, recognize speakers, and remove disruptive attendees during a virtual event. | Moderator panel with: mute all, individual mute/unmute, hand-raise queue, spotlight speaker, remove/ban participant; controls accessible without leaving the platform UI. | **Must** | **Phase 2** |
| **VP-04** | **Hand-Raise & Speaker Queue** | As a Community Lead, I want to see who raises their hand and manage a speaker queue during the event. | Hand-raise indicator on attendee list; queue displayed in order of raise; Community Lead can promote, dismiss, or skip queue entries; queue log saved post-session. | **Should** | **Phase 2** |
| **VP-05** | **Session Notes** | As a Community Lead, I want to document notes during the virtual event that are saved to the event record. | In-session notes panel (rich text); notes saved to event record on close; notes accessible to ops managers and community leads post-event. | **Should** | **Phase 2** |
| **VP-06** | **Post-Event Attendance Sync** | As a Community Lead, I want attendance from virtual events to automatically sync to the platform as a logged interaction for each member. | On session close, attendance data creates an interaction record per attending member (type: Virtual Event Attendance); interaction visible in member timeline; used in engagement scoring. | **Must** | **Phase 2** |
| **VP-07** | **Event Recording & Storage** | As a Community Lead, I want session recordings stored securely and linked to the event record. | Recording initiated from moderator controls; stored in secure cloud storage (AWS S3 or equivalent); linked to event record; access restricted by role; storage retention policy configurable. | **Could** | **Phase 3** |
| **VP-08** | **Virtual Event Reporting** | As an Ops Manager, I want to see virtual event attendance rates and engagement trends over time. | Dashboard shows: events hosted, avg attendance, RSVP-to-attendance conversion, geographic/demographic breakdown; filterable by date range and event type; exportable. | **Should** | **Phase 2** |

### 3.8.2 Resource Finder (RF) Integration

Resource Finder is an existing standalone tool used by members and staff to locate community resources (food, housing, transportation, etc.). The platform is not replacing RF — instead, the Unified Internal Platform must expose the integration points required for seamless case creation, member context sharing, and follow-up tracking.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **RF-01** | **RF-to-CMS Case Auto-Creation** | As the RF bot, I want to automatically create a CMS case whenever a need is identified in RF so a Case Manager can follow up. | Webhook or REST endpoint in CMS receives RF case payload (member ID, need type, timestamp); CMS case created with appropriate follow-up timing rule (next day: food; 3 days: other); assigned CM notified; case visible in member record. | **Must** | **Phase 1** |
| **RF-02** | **RF Case Escalation Routing** | As a Case Manager, I want RF escalations to automatically route to the right CM based on need type or geography. | Escalation flag in RF payload triggers priority case type in CMS; routing rules applied (geography, language, need type); supervisor notified if no CM available; SLA timer started on case creation. | **Must** | **Phase 1** |
| **RF-03** | **Member Context Pre-Population in RF** | As a member or staff member accessing RF from the portal or platform, I want my profile context (ZIP, language, known needs) pre-populated so I don't have to re-enter information. | SSO or token-based handoff from CMS/portal to RF carries: member ZIP, preferred language, and any open SDoH flags; RF uses context to pre-filter results; handoff logged to member interaction record. | **Should** | **Phase 2** |
| **RF-04** | **RF Interaction Logging** | As a Case Manager, I want RF sessions initiated by a member to be logged in the member's interaction history. | RF session start/end, resources viewed, and needs submitted logged to member timeline in CMS; log entry includes timestamp, source (member self-serve vs. staff-assisted), and resource types accessed. | **Should** | **Phase 2** |
| **RF-05** | **RF Referral Status Tracking** | As a Case Manager, I want to track the status of RF-initiated referrals within the member's case file. | RF referral outcomes (resource contacted, confirmed, declined) fed back to CMS via webhook or daily sync; status visible in member case file; CM can manually update if RF status unavailable. | **Should** | **Phase 2** |
| **RF-06** | **SDoH Feed from RF to Case Management** | As a Case Manager, I want a real-time feed of new SDoH needs identified via RF so I can initiate timely outreach. | RF-identified SDoH needs surfaced in CM's SDoH Needs Feed (see CM-10) with member ID, need type, and urgency flag; feed updates in real time or near-real-time (< 5 min latency). | **Must** | **Phase 1** |
| **RF-07** | **RF Feedback Follow-Up Case** | As the RF system, I want the CMS to automatically schedule a follow-up case to collect feedback after an RF referral is fulfilled. | Follow-up case created with timing rule (next day: food; 3 days: other); case type: RF Feedback Follow-Up; survey triggered on case open; responses stored in member record and reported in RF analytics. | **Must** | **Phase 1** |

## 3.9 Ask Claire Integration & Compliance Module

Ask Claire is a fully owned Wider Circle subsidiary operating as a Medicare brokerage focused on duals alignment for underserved populations. Ask Claire is an independent business entity — not a technology product — and must be treated as a distinct operational unit within the platform with its own compliance requirements, data boundaries, and workflow considerations.

**Strategic Intent**

The long-term goal is for Ask Claire agents and Wider Circle staff to operate within the same Unified Internal Platform instance. However, because Ask Claire operates as a Medicare broker and Wider Circle operates as a provider and community services organization, strict data isolation, access control, and compliance guardrails must be designed and legally validated before shared access is enabled. Phase 1 and Phase 2 treat Ask Claire as an integrated external partner. Phase 3 introduces unified platform access with enforced RBAC boundaries.

---

### 3.9.1 Entity Relationship & Compliance Boundary

The diagram below illustrates the operational boundary between Ask Claire and Wider Circle, the data flows permitted across that boundary, and the shared layer planned for Phase 3.

| **Ask Claire (Medicare Brokerage)** |  | **Wider Circle (Provider / Community Services)** |
| --- | --- | --- |
| • Medicare brokerage & enrollment
• Duals alignment & plan selection
• Benefits navigation & education
• Agent/broker workflows
• Commission & compliance tracking | ⚠
**Compliance Boundary** | • Value-based care & case management
• Clinical care delivery (telehealth)
• Community events & CHW programs
• SDoH referrals & resource navigation
• Supplier network (MediCircle, Upside) |
| **Shared (Phase 3 — Unified Platform with role-based data isolation):** Member record, interaction history, eligibility data, communication log, reporting layer |  |  |

### 3.9.2 Data Flows & Workflow Integration

The following table defines all data flows and workflows that must be supported between Ask Claire and the Unified Internal Platform, organized by direction, compliance sensitivity, and delivery phase.

| **Data / Workflow** | **Direction** | **Description** | **Compliance Note** | **Phase** |
| --- | --- | --- | --- | --- |
| **Member Referral (AC → WC)** | Ask Claire → WC CMS | When a member is enrolled or aligned via Ask Claire, a referral record is created in the WC CMS to initiate case management outreach. | Referral payload contains only minimum necessary data; no brokerage commission or plan selection data shared with WC staff. | **Phase 1** |
| **Duals Eligibility & Alignment Status** | Bidirectional | Eligibility and duals alignment status shared between Ask Claire and WC CMS to prevent duplicate outreach and ensure coordinated care. | Data shared at member level only; no plan-level or commission data crosses boundary. | **Phase 1** |
| **Communication History Sharing** | Bidirectional | Outreach attempts and interaction logs from Ask Claire agents visible to WC Case Managers (and vice versa) to prevent duplicate member contact and inform next best action. | Call recordings and full transcripts not shared across boundary; only disposition and contact date/type. | **Phase 2** |
| **Member Assignment & Handoff** | Ask Claire → WC CMS | Formal handoff workflow when a duals member transitions from Ask Claire enrollment to WC care management; assigned CM notified; handoff record created in member timeline. | Handoff must be member-consented; consent captured in Ask Claire system before data transfer. | **Phase 1** |
| **Cross-Entity Reporting & Analytics** | Aggregate / Read-only | Leadership-level dashboards showing combined view of duals member journey: alignment (Ask Claire) → case management (WC) → care delivery (WC Clinical). No individual PHI exposed in cross-entity reports. | Aggregated data only; no individual record cross-exposure in reporting layer until Phase 3 RBAC is validated. | **Phase 2** |
| **Unified Platform Access (Ask Claire Staff)** | Shared (isolated) | Ask Claire agents and WC staff operate in the same platform instance but with strict role-based data isolation. Ask Claire users cannot access WC clinical notes; WC staff cannot access AC brokerage or commission data. | Requires legal and compliance sign-off on data isolation architecture before Phase 3 implementation. | **Phase 3** |

Ask Claire 1) Benefits navigation (MA enrollment, T65, etc.) 2) Duals alignment

### 3.9.3 Compliance Guardrails

The following guardrails are non-negotiable requirements that must be validated by Wider Circle's legal and compliance team before any cross-entity data flows are enabled in production. Must demonstrate how their platform architecture supports each guardrail.

| **Guardrail Area** | **Requirement** |
| --- | --- |
| **Data Isolation** | Brokerage data (plan selection, commission, enrollment records) must be logically isolated from provider/community service data at the database and application layer. No WC clinical staff user role may access AC brokerage data, and vice versa. |
| **HIPAA / CMS Compliance** | Ask Claire operates under CMS Medicare marketing and communication regulations (42 CFR Part 422/423). Data flows between Ask Claire and WC must be reviewed to ensure they do not trigger CMS marketing guardrails or constitute impermissible data sharing under HIPAA. |
| **Member Consent for Handoff** | Any transfer of member data from Ask Claire to WC CMS (and vice versa) must be backed by explicit member consent captured in the originating system. Consent record must be included in the handoff payload. |
| **Audit Trail** | All cross-entity data access and transfers must be logged with: user ID, entity (Ask Claire or WC), data type accessed, timestamp, and purpose code. Logs retained for 6 years. Accessible only to compliance officers and system admins. |
| **Role-Based Access Control (RBAC)** | Phase 3 unified platform access requires a validated RBAC model reviewed by legal and compliance before go-live. Roles must be defined at the entity level (Ask Claire vs. WC) and at the function level (brokerage, clinical, community, ops). No shared roles permitted across entity boundaries. |
| **Anti-Steering & Independence** | Platform workflows must not create pathways for WC clinical staff to influence a member's plan selection (a CMS anti-steering violation), or for Ask Claire agents to influence clinical care decisions. Workflow design must be reviewed by compliance before Phase 3 launch. |

### 3.9.4 Functional Requirements — Ask Claire Module

Requirements are coded AC-XX. IDs are colored teal to distinguish Ask Claire-specific requirements from standard WC requirements throughout the document.

| **ID** | **Feature** | **User Story** | **Acceptance Criteria** | **Priority** | **Phase** |
| --- | --- | --- | --- | --- | --- |
| **AC-01** | **Member Referral Intake (AC → WC)** | As a WC Case Manager, I want to receive a structured referral from Ask Claire when a duals member is enrolled or aligned so I can initiate case management without duplicate outreach. | On member enrollment/alignment confirmation in Ask Claire, a referral record is auto-created in WC CMS; contains: member ID, Plan ID, alignment date, preferred language, ZIP; CM assigned per routing rules; CM notified; referral logged in member timeline. | **Must** | **Phase 1** |
| **AC-02** | **Duplicate Outreach Prevention** | As a WC Case Manager or Ask Claire agent, I want to see whether a member has been recently contacted by the other entity so I do not make duplicate calls. | Member contact log shows last outreach date and entity (Ask Claire vs. WC); configurable suppression window (e.g., 48 hours) blocks duplicate outreach attempt; suppression alert shown to agent attempting contact. | **Must** | **Phase 1** |
| **AC-03** | **Duals Eligibility Data Sharing** | As a WC Case Manager, I want to see a member's duals alignment status and Medicare plan as confirmed by Ask Claire so I have full context before outreach. | Alignment status field on member profile sourced from Ask Claire data feed; fields: alignment status, plan name, effective date, Ask Claire agent ID (masked); updated on eligibility change; WC staff view is read-only for AC-sourced fields. | **Must** | **Phase 1** |
| **AC-04** | **Member Handoff Workflow (AC → WC)** | As an Ask Claire agent, I want to formally hand off a duals member to a WC Case Manager once enrollment is complete so the member receives coordinated care without a gap. | Handoff form in Ask Claire workflow captures: member consent acknowledgment, handoff reason, recommended program; creates handoff task in WC CMS; assigned CM receives notification with member context; handoff record visible in both entity views. | **Must** | **Phase 1** |
| **AC-05** | **Consent-Backed Data Transfer** | As a system, I want all cross-entity member data transfers to include a consent reference so we remain compliant with HIPAA and CMS requirements. | Every data transfer payload (referral, handoff, eligibility update) includes: consent timestamp, consent type, and consent source system; transfers without valid consent reference are rejected and flagged in admin integration log. | **Must** | **Phase 1** |
| **AC-06** | **Communication History Visibility** | As a WC Case Manager, I want to see a summary of Ask Claire's recent outreach to a member (date, channel, disposition) so I can calibrate my own outreach timing and tone. | Shared interaction summary panel on member profile shows Ask Claire contacts: date, channel, disposition; full call recordings and transcripts not exposed; WC staff cannot see AC agent identity beyond masked ID; Ask Claire can see equivalent WC summary. | **Must** | **Phase 1** |
| **AC-07** | **Cross-Entity Member Journey Dashboard** | As a Wider Circle / Ask Claire leadership user, I want to see an aggregated view of the duals member journey from alignment through care management so I can measure end-to-end program performance. | Executive dashboard shows: duals aligned (AC), referred to WC (AC→WC), enrolled in care program (WC), engaged in care (WC); funnel view with conversion rates; no individual PHI in cross-entity view; accessible to compliance-approved leadership roles only. | **Should** | **Phase 2** |
| **AC-08** | **Cross-Entity Reporting & Analytics** | As an Ops Manager, I want combined reporting across Ask Claire and WC interactions so I can measure the total impact of the duals program. | Reporting layer aggregates Ask Claire outreach metrics and WC care engagement metrics at program and cohort level; exportable; individual-level data accessible only within each entity's own reporting boundary. | **Should** | **Phase 2** |
| **AC-09** | **Unified Platform — Ask Claire Staff Access** | As an Ask Claire agent, I want to access the Unified Internal Platform with a role scoped to brokerage workflows so I can operate within the same system as WC staff without accessing clinical or community data. | Ask Claire agent role defined in RBAC with explicit exclusions: no access to WC clinical notes, action plans, case surveys, or CHW workflows; WC staff roles explicitly exclude AC brokerage, plan, and commission data; data isolation validated by compliance review before go-live. | **Could** | **Phase 3** |
| **AC-10** | **Anti-Steering Workflow Guardrails** | As a Compliance Officer, I want the platform to enforce workflow boundaries that prevent WC clinical staff from influencing plan selection and Ask Claire agents from influencing clinical care decisions. | Platform enforces: AC agent role cannot view or create clinical notes; WC clinical role cannot view plan selection history or communicate about plan options; guardrail violations trigger compliance alert; all near-boundary actions logged. | **Must** | **Phase 3** |
| **AC-11** | **Cross-Entity Audit Log** | As a Compliance Officer, I want a unified audit log of all cross-entity data accesses and transfers so I can demonstrate compliance in CMS audits. | Immutable audit log records: user entity, user ID, data type accessed, member ID, timestamp, purpose code; log spans both Ask Claire and WC access events; retained 6 years; exportable for CMS audit; accessible to compliance officers and system admins only. | **Must** | **Phase 1** |
| **AC-12** | **Ask Claire Member Outreach Tracking** | As an Ask Claire agent, I want all my member interactions logged in the platform so I have a complete record of outreach attempts and outcomes. | Ask Claire agent interaction log captures: call/SMS/email attempts, outcome (reached/no answer/left voicemail/declined), follow-up task creation; log visible within AC entity boundary; summary (not detail) visible to WC per AC-06. | **Should** | **Phase 2** |

## 3.10 Shared Medical Appointment (SMA) Module

TBD

# 4. Integration Requirements

TBD

This section defines every external system the Unified Internal Platform integrates with, along with the shape and compliance posture of each integration. All integrations are classified by phase and criticality. Detailed per-integration specifications (endpoints, schemas, error semantics, SLAs) will be authored.

Bridge

Candid

Five9

Twilio

Klaviyo and/or Clutch

TransUnion

Resource Finder

# 5. Non-Functional Requirements

## 5.1 Performance

| **Metric** | **Requirement** |
| --- | --- |
| **Page load time** | < 2 seconds for all core views (member profile, case view, task list) under normal load |
| **Inbound call screen pop** | < 3 seconds from call answer to member profile display |
| **Dashboard refresh** | Real-time or ≤ 5 minutes for operational dashboards |
| **Concurrent users** | Support ≥ 200 simultaneous users without degradation |
| **API response time** | < 500ms for 95th percentile of all API calls |
| **Bulk SMS throughput** | Able to dispatch ≥ 10,000 SMS messages per hour via Twilio integration |

## 5.2 Security & Compliance

- TBD

## 5.3 Reliability & Availability

- Platform uptime SLA: ≥ 99.9% excluding scheduled maintenance
- Scheduled maintenance performed outside business hours (M–F 8am–8pm local); 48-hour advance notice required
- Disaster recovery RTO ≤ 4 hours; RPO ≤ 1 hour
- Mobile application must support offline data capture with full sync on reconnect (Canvasser and CHW personas)

## 5.4 Scalability

- Must support Wider Circle member population growth to 500,000+ members without architectural changes
- Multi-tenant architecture preferred to support multiple health plan clients with data isolation
- Configurable per client/program for: billing rules, segmentation, workflow logic, branding

## 5.5 Usability

- Accessibility: WCAG 2.1 Level AA compliance required for all member-facing surfaces

# 6. Data Migration Requirements

The implementation partner is expected to scope and lead data migration from the current system stack. The following records and data types must be migrated with full historical fidelity.

## 6.1 Source Systems for Migration

TBD

Salesforce

Tellescope

Healthie

For each source, spec should define: record counts, data owner, PHI scope, historical retention window required for migration, transformation/mapping rules, deduplication strategy (MPI — see glossary), cutover approach (big-bang vs parallel run), and rollback criteria.

## 6.2 Migration Standards

TBD

# Links

[5/5 Demo Scope - Track 1: Partial 3.1 CD & 3.2 CM Modules](https://www.notion.so/5-5-Demo-Scope-Track-1-Partial-3-1-CD-3-2-CM-Modules-34bb51e686388075b5eed29faf5f2a8c?pvs=21)

[5/5 Demo Scope - Track 2: 3.3 CC Module](https://www.notion.so/5-5-Demo-Scope-Track-2-3-3-CC-Module-34bb51e6863880689e3dfef22d8a708a?pvs=21)

[Ask Claire Module — Functional Requirements (Revised + Related Stories)](https://www.notion.so/Ask-Claire-Module-Functional-Requirements-Revised-Related-Stories-34bb51e68638818ebe69d3a82067bbe2?pvs=21)
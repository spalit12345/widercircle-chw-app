// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DA-13 audit shim — every hero ticket has an "AC-X audit logged" criterion.
// Until a server-side audit pipeline is wired, we write FHIR AuditEvent
// resources directly. Failures are swallowed so the user-facing action never
// blocks on audit success — the audit is best-effort, the underlying mutation
// is the source of truth. Production should mirror these to an immutable
// store with retention ≥ 6 years per the spec.

import type { MedplumClient, ProfileResource } from '@medplum/core';
import type { AuditEvent, Reference } from '@medplum/fhirtypes';

export type AuditAction =
  | 'consent.captured'
  | 'visit.launched'
  | 'visit.ended'
  | 'visit.recording-started'
  | 'careplan.saved'
  | 'careplan.signed'
  | 'sdoh.submitted'
  | 'sdoh.case-triggered'
  | 'case.created'
  | 'fieldvisit.logged'
  | 'encounter.closed-without-plan';

export interface EmitAuditArgs {
  action: AuditAction;
  patientRef?: Reference;
  encounterRef?: Reference;
  carePlanRef?: Reference;
  taskRef?: Reference;
  questionnaireResponseRef?: Reference;
  consentRef?: Reference;
  /** Free-form payload for the action — script versions, override flags, etc. */
  meta?: Record<string, string | number | boolean | undefined>;
}

const SUBTYPE_DISPLAY: Record<AuditAction, string> = {
  'consent.captured': 'Consent captured',
  'visit.launched': 'Telehealth visit launched',
  'visit.ended': 'Telehealth visit ended',
  'visit.recording-started': 'Recording started',
  'careplan.saved': 'Care Plan saved',
  'careplan.signed': 'Care Plan signed by member',
  'sdoh.submitted': 'SDoH assessment submitted',
  'sdoh.case-triggered': 'SDoH risk threshold triggered case',
  'case.created': 'Manual case created',
  'fieldvisit.logged': 'CHW field visit logged',
  'encounter.closed-without-plan': 'Encounter closed without active Plan of Care',
};

const META_EXT_BASE = 'https://widercircle.com/fhir/StructureDefinition/audit-meta-';

export async function emitAudit(
  medplum: MedplumClient,
  args: EmitAuditArgs
): Promise<AuditEvent | undefined> {
  try {
    const profile = medplum.getProfile() as ProfileResource | undefined;
    const actorRef = profile
      ? {
          reference: `${profile.resourceType}/${profile.id}`,
          display:
            (profile as { name?: { given?: string[]; family?: string }[] }).name?.[0]?.given?.[0] ??
            profile.resourceType,
        }
      : undefined;

    const entityRefs: Reference[] = [
      args.patientRef,
      args.encounterRef,
      args.carePlanRef,
      args.taskRef,
      args.questionnaireResponseRef,
      args.consentRef,
    ].filter((r): r is Reference => Boolean(r));

    const metaExtensions = Object.entries(args.meta ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => ({
        url: `${META_EXT_BASE}${k}`,
        valueString: String(v),
      }));

    const event: AuditEvent = {
      resourceType: 'AuditEvent',
      type: {
        system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
        code: 'rest',
        display: 'RESTful Operation',
      },
      subtype: [
        {
          system: 'https://widercircle.com/fhir/CodeSystem/audit-action',
          code: args.action,
          display: SUBTYPE_DISPLAY[args.action],
        },
      ],
      action: args.action.startsWith('encounter.closed-without-plan') ? 'U' : 'C',
      recorded: new Date().toISOString(),
      outcome: '0',
      agent: [
        {
          who: actorRef,
          requestor: true,
        },
      ],
      source: {
        observer: { display: 'WiderCircle CHW App' },
        type: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
            code: '4',
            display: 'Application Server',
          },
        ],
      },
      entity: entityRefs.map((ref) => ({ what: ref })),
      ...(metaExtensions.length > 0 ? { extension: metaExtensions } : {}),
    };

    return await medplum.createResource<AuditEvent>(event);
  } catch {
    // Swallow — best-effort audit. Never block a clinical action on a failed
    // audit write. Server-side mirroring + retention is tracked separately.
    return undefined;
  }
}

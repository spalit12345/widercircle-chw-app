// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CarePlan, MedplumClient } from '@medplum/core';
import type { Reference } from '@medplum/fhirtypes';

/**
 * Looks up a patient's most-recent active CarePlan and returns a
 * reference suitable for stamping on `Task.basedOn` (CD-08 task↔plan link).
 *
 * Returns undefined when the patient has no active plan — callers should
 * still create the Task, just without the linkage. Errors are swallowed
 * so a transient lookup failure never blocks task creation.
 */
export const getActiveCarePlanRef = async (
  medplum: MedplumClient,
  patientId: string | undefined
): Promise<Reference<CarePlan> | undefined> => {
  if (!patientId) {
    return undefined;
  }
  try {
    const plans = await medplum.searchResources(
      'CarePlan',
      `subject=Patient/${patientId}&status=active&_count=1&_sort=-_lastUpdated`
    );
    const plan = plans[0];
    if (!plan?.id) {
      return undefined;
    }
    return { reference: `CarePlan/${plan.id}` };
  } catch {
    return undefined;
  }
};

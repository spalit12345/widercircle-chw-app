// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-22 ECM outreach tracking & billable cap. Per-client rules (max billable
// attempts, window length, eligible attempt types, consent gating) are
// admin-configurable per the spec; v1 ships with the most common defaults so
// the demo can run end-to-end. Real rule lookup belongs to DA-08; that
// integration lands separately.

import type { Communication, Patient } from '@medplum/fhirtypes';

export const ECM_CATEGORY_CODE = 'ecm-outreach';
export const ECM_BILLABLE_EXT = 'https://widercircle.com/fhir/StructureDefinition/ecm-billable';
export const ECM_CHANNEL_EXT = 'https://widercircle.com/fhir/StructureDefinition/ecm-channel';
export const ECM_OUTCOME_EXT = 'https://widercircle.com/fhir/StructureDefinition/ecm-outcome';

// Defaults for the demo — admin-configurable per program/client in production.
export const ECM_CAP_DEFAULT = 10;
export const ECM_WINDOW_DAYS_DEFAULT = 60;
export const ECM_APPROACHING_CAP_AT = 8;

export type EcmChannel = 'call' | 'sms' | 'email' | 'in-person';
export type EcmOutcome =
  | 'reached'
  | 'voicemail'
  | 'no-answer'
  | 'refused'
  | 'wrong-number'
  | 'successful-terminating';

export const ECM_CHANNELS: Array<{ value: EcmChannel; label: string }> = [
  { value: 'call', label: 'Phone call' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'in-person', label: 'In-person visit' },
];

export const ECM_OUTCOMES: Array<{ value: EcmOutcome; label: string; billable: boolean }> = [
  { value: 'reached', label: 'Reached member', billable: true },
  { value: 'voicemail', label: 'Voicemail', billable: true },
  { value: 'no-answer', label: 'No answer', billable: true },
  { value: 'refused', label: 'Refused', billable: false },
  { value: 'wrong-number', label: 'Wrong number', billable: false },
  { value: 'successful-terminating', label: 'Successful terminating attempt', billable: true },
];

export interface EcmStatus {
  /** Date the window opened — first ECM-related event we have, or member creation date. */
  windowStart: string;
  /** Date the window closes (windowStart + windowDays). */
  windowEnd: string;
  /** Cap configured for this client. */
  cap: number;
  /** Total attempts this window. */
  attempts: number;
  /** Of the attempts, how many counted as billable per the outcome map. */
  billable: number;
  /** Of the attempts, how many were non-billable (refused / wrong-number). */
  nonBillable: number;
  /** True when window has expired. */
  windowClosed: boolean;
  /** True when billable count has reached the cap. */
  capReached: boolean;
  /** True when billable count is within ECM_APPROACHING_CAP_AT of the cap (and not past). */
  approachingCap: boolean;
  /** Days remaining in the window (0 when closed or past). */
  daysRemaining: number;
}

export const isEcmCommunication = (c: Communication): boolean =>
  Boolean(
    c.category?.some((cat) => cat.coding?.some((coding) => coding.code === ECM_CATEGORY_CODE))
  );

export const ecmAttemptIsBillable = (c: Communication): boolean => {
  const flag = c.extension?.find((e) => e.url === ECM_BILLABLE_EXT)?.valueBoolean;
  if (typeof flag === 'boolean') return flag;
  // Fall back to outcome lookup if the extension is missing.
  const outcome = c.extension?.find((e) => e.url === ECM_OUTCOME_EXT)?.valueString;
  return ECM_OUTCOMES.find((o) => o.value === outcome)?.billable ?? false;
};

export const evaluateEcmStatus = (
  attempts: Communication[],
  patient: Patient | undefined,
  options?: { cap?: number; windowDays?: number; now?: number }
): EcmStatus => {
  const cap = options?.cap ?? ECM_CAP_DEFAULT;
  const windowDays = options?.windowDays ?? ECM_WINDOW_DAYS_DEFAULT;
  const now = options?.now ?? Date.now();

  const startBaseline =
    patient?.meta?.lastUpdated ??
    patient?.meta?.versionId ??
    attempts[attempts.length - 1]?.sent ??
    new Date(now - windowDays * 24 * 3600 * 1000).toISOString();
  const windowStart = patient?.meta?.lastUpdated ?? startBaseline;
  const windowStartMs = Date.parse(windowStart);
  const windowEndMs = windowStartMs + windowDays * 24 * 3600 * 1000;

  const inWindow = attempts.filter((c) => {
    const sentMs = c.sent ? Date.parse(c.sent) : Number.NaN;
    return Number.isFinite(sentMs) && sentMs >= windowStartMs && sentMs <= windowEndMs;
  });

  const billable = inWindow.filter(ecmAttemptIsBillable).length;
  const nonBillable = inWindow.length - billable;
  const windowClosed = now > windowEndMs;
  const capReached = billable >= cap;
  const approachingCap = !capReached && billable >= ECM_APPROACHING_CAP_AT;
  const daysRemaining = Math.max(0, Math.ceil((windowEndMs - now) / (24 * 3600 * 1000)));

  return {
    windowStart,
    windowEnd: new Date(windowEndMs).toISOString(),
    cap,
    attempts: inWindow.length,
    billable,
    nonBillable,
    windowClosed,
    capReached,
    approachingCap,
    daysRemaining,
  };
};

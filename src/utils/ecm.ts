// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-22 ECM outreach tracking & billable cap. Per-client rules (max billable
// attempts, window length, eligible attempt types, consent gating) are
// admin-configurable per the spec; v1 ships with the most common defaults so
// the demo can run end-to-end. Real rule lookup belongs to DA-08; that
// integration lands separately.

import type { Communication, Consent, Patient } from '@medplum/fhirtypes';

export const ECM_CATEGORY_CODE = 'ecm-outreach';
export const ECM_CONSENT_CATEGORY_CODE = 'ecm-enrollment';
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
  /** CM-22 AC-3 — true when an active ECM enrollment Consent is on file. */
  consentOnFile: boolean;
  /**
   * Of the in-window attempts, how many were captured BEFORE the active ECM
   * consent date and therefore must be flagged non-billable per spec — they
   * are still tracked for compliance.
   */
  preConsentAttempts: number;
}

export const isEcmConsent = (c: Consent): boolean =>
  Boolean(
    c.category?.some((cat) => cat.coding?.some((coding) => coding.code === ECM_CONSENT_CATEGORY_CODE))
  );

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
  options?: {
    cap?: number;
    windowDays?: number;
    now?: number;
    /**
     * CM-22 AC-3 — pass the patient's Consent records so we can filter to the
     * ECM-enrollment ones and disqualify pre-consent attempts from billable.
     * Optional for backwards-compat; when omitted, consentOnFile defaults to
     * true so existing call sites keep their old behavior.
     */
    consents?: Consent[];
  }
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

  // CM-22 AC-3 — find the earliest active ECM enrollment Consent.
  let earliestEcmConsentMs: number | undefined;
  let consentOnFile = false;
  if (options?.consents !== undefined) {
    const ecmConsents = options.consents
      .filter((c) => c.status === 'active')
      .filter(isEcmConsent)
      .sort((a, b) => (a.dateTime ?? '').localeCompare(b.dateTime ?? ''));
    if (ecmConsents.length > 0 && ecmConsents[0].dateTime) {
      earliestEcmConsentMs = Date.parse(ecmConsents[0].dateTime);
      consentOnFile = earliestEcmConsentMs <= now;
    }
  } else {
    // Backwards compat — when callers don't pass consents, treat as on-file.
    consentOnFile = true;
  }

  // Pre-consent attempts: in window, with sent date < earliest ECM consent.
  // Spec: "ECM consent is captured and required before any attempt is
  // billable; attempts before consent are tracked as non-billable but logged
  // for compliance."
  const preConsentAttempts = earliestEcmConsentMs
    ? inWindow.filter((c) => {
        const sentMs = c.sent ? Date.parse(c.sent) : Number.NaN;
        return Number.isFinite(sentMs) && sentMs < (earliestEcmConsentMs as number);
      }).length
    : options?.consents !== undefined
      ? inWindow.length // consents passed but none active → all attempts pre-consent
      : 0;

  const billable = inWindow.filter((c) => {
    if (!ecmAttemptIsBillable(c)) return false;
    if (!consentOnFile) return false;
    if (earliestEcmConsentMs !== undefined) {
      const sentMs = c.sent ? Date.parse(c.sent) : Number.NaN;
      if (Number.isFinite(sentMs) && sentMs < (earliestEcmConsentMs as number)) {
        return false;
      }
    }
    return true;
  }).length;
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
    consentOnFile,
    preConsentAttempts,
  };
};

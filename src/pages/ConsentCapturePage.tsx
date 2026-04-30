// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, Group, Select, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Consent, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConsentBlock } from '../components/consent/ConsentBlock';

export const CONSENT_SCRIPT_VERSION = 'telehealth-chi-v1';
export const CONSENT_SCRIPT_TEXT = `I'm going to confirm your consent for a telehealth visit and for Community Health Integration (CHI) services with Wider Circle. A telehealth visit is a video or phone visit — the same as an in-person visit for privacy, record-keeping, and billing purposes. CHI means a community health worker may contact you by phone, text, or home visit to help coordinate care and social needs. Your care is not contingent on consenting. You can revoke at any time. Do you consent to the telehealth visit and CHI outreach?`;
export const CONSENT_CATEGORY_CODE = 'telehealth-chi';
export const CONSENT_EXPIRATION_MONTHS = 12;

// CM-22 — ECM enrollment consent (Enhanced Care Management). Distinct
// category from telehealth-chi; gates billability on the ECM tracking panel.
export const ECM_CONSENT_SCRIPT_VERSION = 'ecm-enrollment-v1';
export const ECM_CONSENT_SCRIPT_TEXT = `I'd like to confirm your enrollment in Enhanced Care Management (ECM) under Medi-Cal. ECM is a no-cost benefit where a community health worker may contact you by phone, text, email, or in person to help connect you to care, social services, and follow up on your goals. We may make several outreach attempts over the next two months. You can decline or revoke at any time without affecting your other Medi-Cal benefits. Do you consent to ECM enrollment?`;
export const ECM_CONSENT_CATEGORY_CODE = 'ecm-enrollment';
export const ECM_CONSENT_EXPIRATION_MONTHS = 12;

/**
 * A consent "type" the ConsentBlock can capture. Each WC consent (telehealth,
 * ECM, future programs) plugs in the same component with different copy,
 * category coding, and expiration.
 */
export interface ConsentTypeConfig {
  /** Code stored in Consent.category[].coding[].code (also used as the policy code). */
  categoryCode: string;
  /** Heading text on the block: "Telehealth + CHI consent", "ECM enrollment consent". */
  blockTitle: string;
  /** Short label rendered inside the category coding's `display` field. */
  shortLabel: string;
  /** Versioned script identifier; bumped whenever the script text changes. */
  scriptVersion: string;
  /** Verbal-attestation script the CHW reads to the member. */
  scriptText: string;
  /** Display text for the policy code on the Consent record. */
  policyDisplay: string;
  /** How long the captured consent stays valid. */
  expirationMonths: number;
  /** Body copy for the "consent missing" alert. */
  missingBody: string;
  /** Body copy for the visit-start footer when consent is on file. */
  visitFooterOk?: string;
  /** Body copy for the visit-start footer when consent is not on file. */
  visitFooterBlocked?: string;
}

export const TELEHEALTH_CHI_CONSENT_CONFIG: ConsentTypeConfig = {
  categoryCode: CONSENT_CATEGORY_CODE,
  blockTitle: 'Telehealth + CHI consent',
  shortLabel: 'Telehealth + CHI',
  scriptVersion: CONSENT_SCRIPT_VERSION,
  scriptText: CONSENT_SCRIPT_TEXT,
  policyDisplay: 'Telehealth + CHI attestation policy (v1)',
  expirationMonths: CONSENT_EXPIRATION_MONTHS,
  missingBody:
    'No telehealth/CHI consent on file for this member. Capture verbal consent in the visit, or record an existing portal e-signature.',
  visitFooterOk: 'Clinician can launch the telehealth visit from the workspace.',
  visitFooterBlocked: 'Visit launch will refuse until a valid consent is captured.',
};

export const ECM_ENROLLMENT_CONSENT_CONFIG: ConsentTypeConfig = {
  categoryCode: ECM_CONSENT_CATEGORY_CODE,
  blockTitle: 'ECM enrollment consent',
  shortLabel: 'ECM enrollment',
  scriptVersion: ECM_CONSENT_SCRIPT_VERSION,
  scriptText: ECM_CONSENT_SCRIPT_TEXT,
  policyDisplay: 'ECM enrollment attestation policy (v1)',
  expirationMonths: ECM_CONSENT_EXPIRATION_MONTHS,
  missingBody:
    'No ECM enrollment consent on file. Outreach attempts are still tracked for compliance, but flagged non-billable until consent is captured.',
};

export interface ConsentStatus {
  state: 'on-file' | 'expired' | 'missing';
  latest?: Consent;
  expiresOn?: string;
}

export const evaluateConsentStatus = (consents: Consent[], now: number = Date.now()): ConsentStatus => {
  const active = consents
    .filter((c) => c.status === 'active')
    .sort((a, b) => (b.dateTime ?? '').localeCompare(a.dateTime ?? ''));
  const latest = active[0];
  if (!latest?.dateTime) {
    return { state: 'missing' };
  }
  const signedAt = new Date(latest.dateTime).getTime();
  const expiresAt = signedAt + CONSENT_EXPIRATION_MONTHS * 30 * 24 * 3600 * 1000;
  const expiresOn = new Date(expiresAt).toISOString();
  if (expiresAt < now) {
    return { state: 'expired', latest, expiresOn };
  }
  return { state: 'on-file', latest, expiresOn };
};

export const utf8ToBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

export const consentMethod = (consent: Consent | undefined): 'esig' | 'verbal' | 'unknown' => {
  const method = consent?.extension?.find(
    (e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/consent-method'
  )?.valueString;
  if (method === 'esig' || method === 'verbal') {
    return method;
  }
  return 'unknown';
};

export function ConsentCapturePage(): JSX.Element {
  const medplum = useMedplum();

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [consents, setConsents] = useState<Consent[]>([]);
  const [historyKey, setHistoryKey] = useState(0);

  const selectedPatientLabel = patients.find((p) => p.value === selectedPatient)?.label;

  const loadPatients = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Patient', '_count=50&_sort=-_lastUpdated');
      setPatients(
        results.map((p: Patient) => ({
          value: p.id ?? '',
          label:
            `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum]);

  const loadHistory = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setConsents([]);
        return;
      }
      try {
        const results = await medplum.searchResources(
          'Consent',
          `patient=Patient/${patientId}&_sort=-_lastUpdated&_count=20`
        );
        const known = new Set([CONSENT_CATEGORY_CODE, ECM_CONSENT_CATEGORY_CODE]);
        setConsents(
          results.filter((c) =>
            c.category?.some((cat) => cat.coding?.some((coding) => coding.code && known.has(coding.code)))
          )
        );
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum]
  );

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    loadHistory(selectedPatient).catch(console.error);
  }, [selectedPatient, loadHistory, historyKey]);

  const consentTypeLabel = (c: Consent): string => {
    const code = c.category?.flatMap((cat) => cat.coding ?? []).find((coding) => coding.code)?.code;
    if (code === CONSENT_CATEGORY_CODE) return TELEHEALTH_CHI_CONSENT_CONFIG.shortLabel;
    if (code === ECM_CONSENT_CATEGORY_CODE) return ECM_ENROLLMENT_CONSENT_CONFIG.shortLabel;
    return code ?? 'Consent';
  };

  return (
    <Document>
      <Stack gap="lg">
        <Stack gap={2}>
          <Title order={2}>Member consents</Title>
          <Text c="dimmed" size="sm">
            Capture or verify consent for telehealth visits and ECM enrollment. Default validity{' '}
            {CONSENT_EXPIRATION_MONTHS} months from signing.
          </Text>
        </Stack>

        <Card withBorder radius="md" padding="md">
          <Stack gap="md">
            <Select
              label="Member"
              placeholder="Pick a member"
              data={patients}
              value={selectedPatient}
              onChange={(v) => setSelectedPatient(v ?? '')}
              searchable
              required
            />
          </Stack>
        </Card>

        <ConsentBlock
          patientId={selectedPatient || undefined}
          patientLabel={selectedPatientLabel}
          config={TELEHEALTH_CHI_CONSENT_CONFIG}
          onCaptured={() => setHistoryKey((k) => k + 1)}
        />

        <ConsentBlock
          patientId={selectedPatient || undefined}
          patientLabel={selectedPatientLabel}
          config={ECM_ENROLLMENT_CONSENT_CONFIG}
          onCaptured={() => setHistoryKey((k) => k + 1)}
        />

        {selectedPatient && consents.length > 0 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Consent history</Title>
                <Badge variant="light">{consents.length}</Badge>
              </Group>
              <Stack gap="xs">
                {consents.slice(0, 10).map((c) => (
                  <Group key={c.id} justify="space-between" p="xs" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <Badge
                        color={c.status === 'active' ? 'green' : 'gray'}
                        variant="light"
                        size="sm"
                      >
                        {c.status}
                      </Badge>
                      <Badge variant="outline" size="sm">
                        {consentTypeLabel(c)}
                      </Badge>
                      <Text size="sm" ff="monospace">
                        {consentMethod(c)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {c.performer?.[0]?.display ?? '—'}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {c.dateTime ? formatDateTime(c.dateTime) : ''}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </Document>
  );
}

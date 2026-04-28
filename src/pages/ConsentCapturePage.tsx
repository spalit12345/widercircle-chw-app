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
        setConsents(
          results.filter((c) =>
            c.category?.some((cat) =>
              cat.coding?.some((coding) => coding.code === CONSENT_CATEGORY_CODE)
            )
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

  return (
    <Document>
      <Stack gap="lg">
        <Stack gap={2}>
          <Title order={2}>Telehealth + CHI consent</Title>
          <Text c="dimmed" size="sm">
            Capture or verify consent before launching a telehealth visit. Default validity{' '}
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

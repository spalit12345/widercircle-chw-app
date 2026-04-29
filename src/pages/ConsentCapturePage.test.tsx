// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Consent } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CONSENT_EXPIRATION_MONTHS,
  CONSENT_SCRIPT_TEXT,
  CONSENT_SCRIPT_VERSION,
  ConsentCapturePage,
  consentMethod,
  evaluateConsentStatus,
} from './ConsentCapturePage';

const makeConsent = (dateTime: string, method: 'esig' | 'verbal' = 'verbal', status: Consent['status'] = 'active'): Consent => ({
  resourceType: 'Consent',
  status,
  scope: { coding: [{ code: 'patient-privacy' }] },
  category: [{ coding: [{ code: 'telehealth-chi' }] }],
  patient: { reference: 'Patient/p1' },
  dateTime,
  extension: [
    {
      url: 'https://widercircle.com/fhir/StructureDefinition/consent-method',
      valueString: method,
    },
  ],
});

describe('ConsentCapturePage — pure helpers', () => {
  test('evaluateConsentStatus returns "missing" when there are no active consents', () => {
    expect(evaluateConsentStatus([])).toEqual({ state: 'missing' });
    expect(
      evaluateConsentStatus([makeConsent('2026-04-01T00:00:00Z', 'verbal', 'inactive')])
    ).toEqual({ state: 'missing' });
  });

  test('evaluateConsentStatus returns "on-file" when the latest active consent is within 12 months', () => {
    const now = new Date('2026-04-24T10:00:00Z').getTime();
    const result = evaluateConsentStatus([makeConsent('2026-04-01T00:00:00Z')], now);
    expect(result.state).toBe('on-file');
    expect(result.latest?.dateTime).toBe('2026-04-01T00:00:00Z');
    expect(result.expiresOn).toBeDefined();
  });

  test('evaluateConsentStatus returns "expired" when the latest consent is older than the expiration window', () => {
    const now = new Date('2026-04-24T10:00:00Z').getTime();
    const old = new Date(now - (CONSENT_EXPIRATION_MONTHS * 30 + 1) * 24 * 3600 * 1000).toISOString();
    const result = evaluateConsentStatus([makeConsent(old)], now);
    expect(result.state).toBe('expired');
    expect(result.latest).toBeDefined();
  });

  test('evaluateConsentStatus picks the most recent when multiple active consents exist', () => {
    const older = makeConsent('2026-01-01T00:00:00Z');
    const newer = makeConsent('2026-04-01T00:00:00Z');
    const result = evaluateConsentStatus([older, newer], new Date('2026-04-24T10:00:00Z').getTime());
    expect(result.state).toBe('on-file');
    expect(result.latest?.dateTime).toBe('2026-04-01T00:00:00Z');
  });

  test('consentMethod reads the method extension and falls back to "unknown"', () => {
    expect(consentMethod(makeConsent('2026-04-01T00:00:00Z', 'verbal'))).toBe('verbal');
    expect(consentMethod(makeConsent('2026-04-01T00:00:00Z', 'esig'))).toBe('esig');
    expect(consentMethod(undefined)).toBe('unknown');
    const noExt = { ...makeConsent('2026-04-01T00:00:00Z'), extension: undefined };
    expect(consentMethod(noExt)).toBe('unknown');
  });
});

describe('ConsentCapturePage — render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <ConsentCapturePage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title, description, and member picker before any patient is selected', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Telehealth + CHI consent')).toBeInTheDocument();
      expect(screen.getByText(/Capture or verify consent before launching/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Pick a member')).toBeInTheDocument();
    });
  });

  test('exposes the versioned verbal-consent script so legal can audit it', () => {
    // The exported constants are what the script card renders. Asserting on them
    // catches accidental in-place edits to the attestation text without version bump.
    expect(CONSENT_SCRIPT_VERSION).toBe('telehealth-chi-v1');
    expect(CONSENT_SCRIPT_TEXT).toContain('telehealth visit');
    expect(CONSENT_SCRIPT_TEXT).toContain('Community Health Integration');
    expect(CONSENT_SCRIPT_TEXT).toContain('revoke at any time');
  });
});

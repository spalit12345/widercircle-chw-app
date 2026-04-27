// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type {
  AllergyIntolerance,
  Condition,
  CoverageEligibilityResponse,
  Encounter,
  MedicationRequest,
  Patient,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { eligibilityIsStale, isLaunchAllowed, minutesUntil, patientName, PreVisitPage } from './PreVisitPage';

describe('PreVisitPage helpers', () => {
  test('minutesUntil computes signed integer minutes relative to now', () => {
    const now = new Date('2026-04-24T10:00:00Z').getTime();
    expect(minutesUntil('2026-04-24T10:30:00Z', now)).toBe(30);
    expect(minutesUntil('2026-04-24T09:45:00Z', now)).toBe(-15);
    expect(minutesUntil(undefined, now)).toBeUndefined();
    expect(minutesUntil('not-a-date', now)).toBeUndefined();
  });

  test('isLaunchAllowed gates Launch button on the 30-minute window', () => {
    const now = new Date('2026-04-24T10:00:00Z').getTime();
    // 31 min out -> not allowed (just past the gate)
    expect(isLaunchAllowed('2026-04-24T10:31:00Z', now)).toBe(false);
    // 30 min out -> allowed (inclusive boundary)
    expect(isLaunchAllowed('2026-04-24T10:30:00Z', now)).toBe(true);
    // 5 min out -> allowed
    expect(isLaunchAllowed('2026-04-24T10:05:00Z', now)).toBe(true);
    // already started -> allowed
    expect(isLaunchAllowed('2026-04-24T09:55:00Z', now)).toBe(true);
    // unscheduled -> allowed (no gate)
    expect(isLaunchAllowed(undefined, now)).toBe(true);
  });

  test('eligibilityIsStale flags ≥7 days and missing data', () => {
    const now = new Date('2026-04-24T10:00:00Z').getTime();
    const sevenDaysAgo: CoverageEligibilityResponse = {
      resourceType: 'CoverageEligibilityResponse',
      status: 'active',
      purpose: ['benefits'],
      outcome: 'complete',
      patient: { reference: 'Patient/x' },
      request: { display: 'x' },
      insurer: { display: 'x' },
      created: '2026-04-17T10:00:00Z',
    };
    const sixDaysAgo: CoverageEligibilityResponse = { ...sevenDaysAgo, created: '2026-04-18T10:00:00Z' };
    expect(eligibilityIsStale(sevenDaysAgo, now)).toBe(true);
    expect(eligibilityIsStale(sixDaysAgo, now)).toBe(false);
    expect(eligibilityIsStale(undefined, now)).toBe(true);
  });

  test('patientName handles missing names', () => {
    expect(patientName(undefined)).toBe('—');
    expect(patientName({ resourceType: 'Patient' })).toBe('Unnamed patient');
    expect(
      patientName({ resourceType: 'Patient', name: [{ given: ['Maria'], family: 'Garcia' }] })
    ).toBe('Maria Garcia');
  });
});

describe('PreVisitPage render', () => {
  let medplum: MockClient;

  const setup = (encounterId = 'enc-1'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[`/encounters/${encounterId}/pre-visit`]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/encounters/:encounterId/pre-visit" element={<PreVisitPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const bootstrapEncounter = (encounter: Encounter, patient?: Patient): void => {
    vi.spyOn(medplum, 'readResource').mockImplementation((async (resourceType: string, id: string) => {
      if (resourceType === 'Encounter' && id === 'enc-1') {
        return encounter;
      }
      if (resourceType === 'Patient') {
        return patient ?? { resourceType: 'Patient', id: 'pat-1' };
      }
      throw new Error(`Unexpected read ${resourceType}/${id}`);
    }) as never);
  };

  test('renders reason, patient name, encounter type, eligibility active badge', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'pat-1',
      name: [{ given: ['Maria'], family: 'Garcia' }],
    };
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'planned',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/pat-1' },
      period: { start: new Date(Date.now() + 5 * 60 * 1000).toISOString() }, // 5 min out → launchable
      type: [{ text: 'Intake visit' }],
      reasonCode: [{ text: 'Intake + SDoH review' }],
    };
    const eligibility: CoverageEligibilityResponse = {
      resourceType: 'CoverageEligibilityResponse',
      id: 'elig-1',
      status: 'active',
      purpose: ['benefits'],
      outcome: 'complete',
      created: new Date().toISOString(),
      patient: { reference: 'Patient/pat-1' },
      request: { display: 'x' },
      insurer: { display: 'Medicare Advantage · Humana Gold Plus' },
      insurance: [{ coverage: { display: 'Medicare Advantage · Humana Gold Plus' }, inforce: true }],
    };

    bootstrapEncounter(encounter, patient);
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'CoverageEligibilityResponse') {
        return [eligibility];
      }
      return [];
    }) as never);

    setup();
    await waitFor(() => {
      expect(screen.getByText(/Intake visit · Maria Garcia/)).toBeInTheDocument();
      expect(screen.getByText('Intake + SDoH review')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Medicare Advantage · Humana Gold Plus')).toBeInTheDocument();
    });
  });

  test('shows "No active care plan on file." when CarePlan search is empty', async () => {
    const patient: Patient = { resourceType: 'Patient', id: 'pat-1', name: [{ family: 'Doe' }] };
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'planned',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/pat-1' },
      period: { start: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
      type: [{ text: 'Follow-up' }],
    };
    bootstrapEncounter(encounter, patient);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);

    setup();
    await waitFor(() => {
      expect(screen.getByText('No active care plan on file.')).toBeInTheDocument();
    });
  });

  test('Launch visit is disabled more than 30 min before start', async () => {
    const patient: Patient = { resourceType: 'Patient', id: 'pat-1', name: [{ family: 'Doe' }] };
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'planned',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/pat-1' },
      period: { start: new Date(Date.now() + 60 * 60 * 1000).toISOString() }, // 60 min out → disabled
      type: [{ text: 'Intake' }],
    };
    bootstrapEncounter(encounter, patient);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);

    setup();
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /launch visit/i });
      expect(button).toBeDisabled();
    });
  });

  test('renders medication, allergy, condition counts', async () => {
    const patient: Patient = { resourceType: 'Patient', id: 'pat-1', name: [{ family: 'Doe' }] };
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'planned',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/pat-1' },
      type: [{ text: 'Intake' }],
    };
    const med: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: 'med-1',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/pat-1' },
      medicationCodeableConcept: { text: 'Lisinopril 10 mg' },
    };
    const allergy: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      id: 'allergy-1',
      patient: { reference: 'Patient/pat-1' },
      code: { text: 'Penicillin' },
    };
    const cond: Condition = {
      resourceType: 'Condition',
      id: 'cond-1',
      subject: { reference: 'Patient/pat-1' },
      code: { text: 'Hypertension' },
    };

    bootstrapEncounter(encounter, patient);
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'MedicationRequest') return [med];
      if (resourceType === 'AllergyIntolerance') return [allergy];
      if (resourceType === 'Condition') return [cond];
      return [];
    }) as never);

    setup();
    await waitFor(() => {
      expect(screen.getByText(/Medications \(1\)/)).toBeInTheDocument();
      expect(screen.getByText('Lisinopril 10 mg')).toBeInTheDocument();
      expect(screen.getByText(/Allergies \(1\)/)).toBeInTheDocument();
      expect(screen.getByText('Penicillin')).toBeInTheDocument();
      expect(screen.getByText(/Active conditions \(1\)/)).toBeInTheDocument();
      expect(screen.getByText('Hypertension')).toBeInTheDocument();
    });
  });

  test('surfaces read-only footer copy', async () => {
    const patient: Patient = { resourceType: 'Patient', id: 'pat-1', name: [{ family: 'Doe' }] };
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'planned',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/pat-1' },
      type: [{ text: 'Intake' }],
    };
    bootstrapEncounter(encounter, patient);
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);

    setup();
    await waitFor(() => {
      expect(screen.getByText(/This chart is read-only/)).toBeInTheDocument();
    });
  });

  test('shows error alert when encounter read fails', async () => {
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Encounter not found'));

    setup('missing');
    await waitFor(() => {
      expect(screen.getByText("Couldn't load pre-visit chart")).toBeInTheDocument();
    });
  });
});


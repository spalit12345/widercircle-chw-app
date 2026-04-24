// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Consent, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { computeBillableSeconds, formatDuration, VisitWorkspacePage } from './VisitWorkspacePage';

describe('computeBillableSeconds', () => {
  const start = new Date('2026-04-24T10:00:00Z').getTime();
  const sec = (n: number): number => n * 1000;

  test('no gaps, live session: billable equals now - startedAt', () => {
    expect(computeBillableSeconds(start, [], undefined, start + sec(120))).toBe(120);
  });

  test('no gaps, ended session: billable equals end - startedAt', () => {
    expect(computeBillableSeconds(start, [], start + sec(300), start + sec(500))).toBe(300);
  });

  test('subtracts closed gaps from billable time', () => {
    const gaps = [
      { startedAt: start + sec(60), endedAt: start + sec(90) }, // 30s gap
      { startedAt: start + sec(200), endedAt: start + sec(220) }, // 20s gap
    ];
    expect(computeBillableSeconds(start, gaps, start + sec(300), start + sec(300))).toBe(250);
  });

  test('open gap clamps to now while session is live', () => {
    const gaps = [{ startedAt: start + sec(60) }]; // still open
    expect(computeBillableSeconds(start, gaps, undefined, start + sec(90))).toBe(60);
  });

  test('open gap clamps to endedAt on end-visit', () => {
    const gaps = [{ startedAt: start + sec(60) }]; // open when end fires
    expect(computeBillableSeconds(start, gaps, start + sec(120), start + sec(120))).toBe(60);
  });

  test('zero duration if end <= start', () => {
    expect(computeBillableSeconds(start, [], start, start)).toBe(0);
    expect(computeBillableSeconds(start, [], start - 10, start + 10)).toBe(0);
  });

  test('gap fully outside window does not subtract', () => {
    // gap ended before session started — shouldn't happen in practice but should not go negative
    const gaps = [{ startedAt: start - sec(20), endedAt: start - sec(10) }];
    expect(computeBillableSeconds(start, gaps, start + sec(60), start + sec(60))).toBe(60);
  });
});

describe('formatDuration', () => {
  test('pads minutes and seconds to two digits', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3600)).toBe('60:00');
  });
});

describe('VisitWorkspacePage render', () => {
  let medplum: MockClient;

  const setup = (encounterId = 'enc-1'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[`/encounters/${encounterId}/workspace`]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/encounters/:encounterId/workspace" element={<VisitWorkspacePage />} />
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

  const stubEncounter = (enc: Encounter, patient?: Patient, consents: Consent[] = []): void => {
    vi.spyOn(medplum, 'readResource').mockImplementation((async (resourceType: string, id: string) => {
      if (resourceType === 'Encounter' && id === enc.id) {
        return enc;
      }
      if (resourceType === 'Patient') {
        return patient ?? { resourceType: 'Patient', id: 'p1' };
      }
      throw new Error(`unexpected read ${resourceType}/${id}`);
    }) as never);
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'Consent') return consents;
      return [];
    }) as never);
  };

  test('no consent → phase=blocked with visit-start banner and disabled Launch button', async () => {
    stubEncounter(
      {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'planned',
        class: { code: 'AMB' },
        subject: { reference: 'Patient/p1' },
        type: [{ text: 'Intake visit' }],
      },
      { resourceType: 'Patient', id: 'p1', name: [{ given: ['Maria'], family: 'Garcia' }] },
      []
    );
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Intake visit · Maria Garcia/)).toBeInTheDocument();
      expect(screen.getByText('Consent needed')).toBeInTheDocument();
      expect(screen.getByText('Launch blocked')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /launch visit/i })).toBeDisabled();
    });
  });

  test('consent on file → phase=ready with enabled Launch button', async () => {
    stubEncounter(
      {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'planned',
        class: { code: 'AMB' },
        subject: { reference: 'Patient/p1' },
        type: [{ text: 'MD E/M Visit' }],
      },
      { resourceType: 'Patient', id: 'p1', name: [{ family: 'Davis' }] },
      [
        {
          resourceType: 'Consent',
          id: 'c1',
          status: 'active',
          scope: { coding: [{ code: 'patient-privacy' }] },
          category: [{ coding: [{ code: 'telehealth-chi' }] }],
          patient: { reference: 'Patient/p1' },
          dateTime: new Date().toISOString(),
          policyRule: { coding: [{ code: 'telehealth-chi' }] },
        },
      ]
    );
    setup();
    await waitFor(() => {
      expect(screen.getByText('Consent on file')).toBeInTheDocument();
      expect(screen.getByText('Ready to launch')).toBeInTheDocument();
      const button = screen.getByRole('button', { name: /launch visit/i });
      expect(button).not.toBeDisabled();
    });
  });

  test('ended encounter renders the ended state without a Launch button', async () => {
    const start = new Date(Date.now() - 600 * 1000).toISOString();
    const end = new Date().toISOString();
    stubEncounter(
      {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'finished',
        class: { code: 'AMB' },
        subject: { reference: 'Patient/p1' },
        type: [{ text: 'Follow-up' }],
        period: { start, end },
      },
      { resourceType: 'Patient', id: 'p1', name: [{ family: 'Thompson' }] },
      []
    );
    setup();
    await waitFor(() => {
      expect(screen.getByText('Ended')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /launch visit/i })).not.toBeInTheDocument();
    });
  });
});

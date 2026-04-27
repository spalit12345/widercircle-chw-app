// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Observation } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BillingSyncPage, dedupeByObservation, pickCptCode } from './BillingSyncPage';

describe('pickCptCode (CMS CCM tiers)', () => {
  test('under 20 min → no billable code', () => {
    expect(pickCptCode(0)).toBeUndefined();
    expect(pickCptCode(19)).toBeUndefined();
  });
  test('20–39 min → 99490 (initial 20 min)', () => {
    expect(pickCptCode(20)).toBe('99490');
    expect(pickCptCode(39)).toBe('99490');
  });
  test('40+ min → 99439 (+20 min tier)', () => {
    expect(pickCptCode(40)).toBe('99439');
    expect(pickCptCode(90)).toBe('99439');
  });
});

describe('dedupeByObservation', () => {
  const obs = (id: string): Observation => ({
    resourceType: 'Observation',
    id,
    status: 'final',
    code: { text: 'x' },
  });

  test('removes observations already acknowledged (idempotent resync)', () => {
    const all = [obs('a'), obs('b'), obs('c')];
    const done = new Set(['b']);
    expect(dedupeByObservation(all, done).map((o) => o.id)).toEqual(['a', 'c']);
  });

  test('passes everything when the ack set is empty', () => {
    const all = [obs('a'), obs('b')];
    expect(dedupeByObservation(all, new Set()).length).toBe(2);
  });

  test('skips observations without ids (defensive)', () => {
    const withUnd: Observation = { resourceType: 'Observation', status: 'final', code: { text: 'x' } };
    expect(dedupeByObservation([withUnd], new Set()).length).toBe(0);
  });
});

describe('BillingSyncPage render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <BillingSyncPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title, description, and all-caught-up alert when nothing pending', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Billing sync (Candid)')).toBeInTheDocument();
      expect(screen.getByText('All caught up')).toBeInTheDocument();
    });
  });
});

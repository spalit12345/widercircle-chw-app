// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { isPlanLocked, latestReviewState, nextCycle, SubmitForReviewPage } from './SubmitForReviewPage';

const mkTask = (overrides: { state?: string; cycle?: number; authoredOn?: string } = {}): Task => ({
  resourceType: 'Task',
  status: 'requested',
  intent: 'proposal',
  authoredOn: overrides.authoredOn ?? '2026-04-01T00:00:00Z',
  businessStatus: overrides.state ? { coding: [{ code: overrides.state }] } : undefined,
  extension: overrides.cycle !== undefined
    ? [{ url: 'https://widercircle.com/fhir/StructureDefinition/review-cycle', valueInteger: overrides.cycle }]
    : undefined,
});

describe('isPlanLocked (AC-1, AC-2)', () => {
  test('locked when submitted', () => expect(isPlanLocked('submitted')).toBe(true));
  test('locked when approved (retained for audit per AC-2)', () => expect(isPlanLocked('approved')).toBe(true));
  test('unlocked on draft', () => expect(isPlanLocked('draft')).toBe(false));
  test('unlocked on revision-requested (released per AC-3)', () => expect(isPlanLocked('revision-requested')).toBe(false));
});

describe('nextCycle', () => {
  test('starts at 1 with no prior submissions', () => {
    expect(nextCycle([])).toBe(1);
  });
  test('increments past the max existing cycle', () => {
    const tasks = [mkTask({ cycle: 1 }), mkTask({ cycle: 3 }), mkTask({ cycle: 2 })];
    expect(nextCycle(tasks)).toBe(4);
  });
  test('ignores tasks missing the cycle extension', () => {
    expect(nextCycle([mkTask(), mkTask({ cycle: 2 })])).toBe(3);
  });
});

describe('latestReviewState', () => {
  test('draft when no tasks', () => {
    expect(latestReviewState([])).toBe('draft');
  });
  test('picks the most recent task by authoredOn', () => {
    const tasks = [
      mkTask({ state: 'submitted', authoredOn: '2026-04-01T10:00:00Z' }),
      mkTask({ state: 'approved', authoredOn: '2026-04-02T10:00:00Z' }),
    ];
    expect(latestReviewState(tasks)).toBe('approved');
  });
  test('coerces unknown codes to draft', () => {
    expect(latestReviewState([mkTask({ state: 'unknown-code' })])).toBe('draft');
  });
});

describe('SubmitForReviewPage render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SubmitForReviewPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title and state-machine description', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Provider review submission')).toBeInTheDocument();
      expect(screen.getByText(/Draft → Submitted/)).toBeInTheDocument();
    });
  });
});

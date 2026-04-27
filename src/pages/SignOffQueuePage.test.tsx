// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { pendingHours, SignOffQueuePage, slaTone } from './SignOffQueuePage';

describe('pendingHours', () => {
  test('returns hours elapsed since authoredOn', () => {
    const now = new Date('2026-04-24T12:00:00Z').getTime();
    const task: Task = {
      resourceType: 'Task',
      status: 'requested',
      intent: 'proposal',
      authoredOn: '2026-04-24T06:00:00Z',
    };
    expect(pendingHours(task, now)).toBe(6);
  });

  test('returns 0 when authoredOn is missing', () => {
    const task: Task = { resourceType: 'Task', status: 'requested', intent: 'proposal' };
    expect(pendingHours(task)).toBe(0);
  });
});

describe('slaTone (SLA colouring)', () => {
  test('green under 24 hours', () => {
    expect(slaTone(0)).toBe('green');
    expect(slaTone(23)).toBe('green');
  });
  test('yellow at 24h through 71h', () => {
    expect(slaTone(24)).toBe('yellow');
    expect(slaTone(71)).toBe('yellow');
  });
  test('red at 72h or more', () => {
    expect(slaTone(72)).toBe('red');
    expect(slaTone(96)).toBe('red');
  });
});

describe('SignOffQueuePage render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SignOffQueuePage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title and queue-empty alert when no tasks pending', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Sign-off queue')).toBeInTheDocument();
      expect(screen.getByText('Nothing pending')).toBeInTheDocument();
    });
  });
});

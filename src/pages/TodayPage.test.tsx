// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Appointment, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TodayPage } from './TodayPage';

describe('TodayPage', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TodayPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders greeting and section titles', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument();
      expect(screen.getByText('Schedule today')).toBeInTheDocument();
      expect(screen.getByText('Due today')).toBeInTheDocument();
      expect(screen.getByText('Overdue')).toBeInTheDocument();
    });
  });

  test('shows empty states when nothing is scheduled or due', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Clear day.')).toBeInTheDocument();
      expect(screen.getByText('Nothing due today — nice.')).toBeInTheDocument();
      expect(screen.getByText('No overdue items.')).toBeInTheDocument();
    });
  });

  test('classifies tasks into Due today and Overdue by due date', async () => {
    const today = new Date().toISOString().split('T')[0] as string;
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0] as string;

    const dueTodayTask: Task = {
      resourceType: 'Task',
      id: 'task-due-today',
      status: 'requested',
      intent: 'order',
      code: { text: 'Call Maria about medication' },
      priority: 'routine',
      restriction: { period: { end: today } },
    };
    const overdueTask: Task = {
      resourceType: 'Task',
      id: 'task-overdue',
      status: 'requested',
      intent: 'order',
      code: { text: 'Send onboarding packet' },
      priority: 'urgent',
      restriction: { period: { end: yesterday } },
    };

    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'Task') {
        return [dueTodayTask, overdueTask];
      }
      return [];
    }) as never);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Call Maria about medication')).toBeInTheDocument();
      expect(screen.getByText('Send onboarding packet')).toBeInTheDocument();
    });
  });

  test('shows today appointments in the Schedule section', async () => {
    const today = new Date().toISOString().split('T')[0] as string;
    const appt: Appointment = {
      resourceType: 'Appointment',
      id: 'appt-1',
      status: 'booked',
      start: `${today}T15:30:00Z`,
      end: `${today}T16:00:00Z`,
      participant: [{ actor: { reference: 'Patient/abc', display: 'Maria Garcia' }, status: 'accepted' }],
      appointmentType: { coding: [{ code: 'telehealth' }] },
    };

    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'Appointment') {
        return [appt];
      }
      return [];
    }) as never);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      expect(screen.getByText('telehealth')).toBeInTheDocument();
    });
  });

  test('does not show cancelled or non-today appointments', async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0] as string;
    const today = new Date().toISOString().split('T')[0] as string;
    const cancelled: Appointment = {
      resourceType: 'Appointment',
      id: 'appt-cancel',
      status: 'cancelled',
      start: `${today}T10:00:00Z`,
      participant: [{ actor: { reference: 'Patient/x', display: 'Cancelled Patient' }, status: 'accepted' }],
    };
    const past: Appointment = {
      resourceType: 'Appointment',
      id: 'appt-past',
      status: 'booked',
      start: `${yesterday}T10:00:00Z`,
      participant: [{ actor: { reference: 'Patient/y', display: 'Yesterday Patient' }, status: 'accepted' }],
    };

    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string) => {
      if (resourceType === 'Appointment') {
        return [cancelled, past];
      }
      return [];
    }) as never);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Clear day.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Cancelled Patient')).not.toBeInTheDocument();
    expect(screen.queryByText('Yesterday Patient')).not.toBeInTheDocument();
  });
});

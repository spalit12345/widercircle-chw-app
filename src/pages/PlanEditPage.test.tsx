// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { type EditableItem, hasBillableCompletion, PlanEditPage } from './PlanEditPage';

const mk = (overrides: Partial<EditableItem> = {}): EditableItem => ({
  id: overrides.id ?? 'i1',
  title: overrides.title ?? 'Task',
  description: overrides.description ?? '',
  status: overrides.status ?? 'not-started',
  billable: overrides.billable ?? false,
});

describe('hasBillableCompletion (AC-3 flag rule)', () => {
  test('returns true when a billable item newly transitions to completed', () => {
    const before = [mk({ id: 'i1', billable: true, status: 'in-progress' })];
    const after = [mk({ id: 'i1', billable: true, status: 'completed' })];
    expect(hasBillableCompletion(before, after)).toBe(true);
  });

  test('returns false when a non-billable item transitions to completed', () => {
    const before = [mk({ id: 'i1', billable: false, status: 'in-progress' })];
    const after = [mk({ id: 'i1', billable: false, status: 'completed' })];
    expect(hasBillableCompletion(before, after)).toBe(false);
  });

  test('returns false when a billable item was already completed before', () => {
    const before = [mk({ id: 'i1', billable: true, status: 'completed' })];
    const after = [mk({ id: 'i1', billable: true, status: 'completed' })];
    expect(hasBillableCompletion(before, after)).toBe(false);
  });

  test('returns true for a brand-new billable item marked completed in the same save', () => {
    const before: EditableItem[] = [];
    const after = [mk({ id: 'i2', billable: true, status: 'completed' })];
    expect(hasBillableCompletion(before, after)).toBe(true);
  });

  test('returns false when no items completed', () => {
    const before = [mk({ id: 'i1', billable: true, status: 'not-started' })];
    const after = [mk({ id: 'i1', billable: true, status: 'in-progress' })];
    expect(hasBillableCompletion(before, after)).toBe(false);
  });
});

describe('PlanEditPage — render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <PlanEditPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title and member picker copy', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Plan edit (CHW)')).toBeInTheDocument();
      expect(screen.getByText(/Daily-use editor/)).toBeInTheDocument();
    });
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { CarePlan } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { itemsFromPlan, partitionForReview, PlanReviewPage, type ReviewItem } from './PlanReviewPage';

describe('PlanReviewPage — pure helpers', () => {
  test('partitionForReview splits assigned-to-me from all others', () => {
    const items: ReviewItem[] = [
      { id: '1', title: 'Mine A', status: 'not-started', ownerLabel: 'me', assignedToMe: true },
      { id: '2', title: 'Someone else', status: 'in-progress', ownerLabel: 'other', assignedToMe: false },
      { id: '3', title: 'Mine B', status: 'completed', ownerLabel: 'me', assignedToMe: true },
    ];
    const { mine, others } = partitionForReview(items);
    expect(mine.map((i) => i.id)).toEqual(['1', '3']);
    expect(others.map((i) => i.id)).toEqual(['2']);
  });

  test('itemsFromPlan maps CarePlan activities and flags assigned-to-me by reference', () => {
    const plan: CarePlan = {
      resourceType: 'CarePlan',
      status: 'active',
      intent: 'plan',
      subject: { reference: 'Patient/p1' },
      activity: [
        {
          detail: {
            status: 'in-progress',
            description: 'Call Maria about BP',
            code: { coding: [{ code: 'item-1', display: 'Medical' }] },
            performer: [{ reference: 'Practitioner/abc', display: 'Alicia CHW' }],
          },
        },
        {
          detail: {
            status: 'not-started',
            description: 'Send food-pantry referral',
            performer: [{ reference: 'Practitioner/xyz', display: 'Other clinician' }],
          },
        },
        {
          detail: {
            status: 'not-started',
            description: 'Unassigned task',
          },
        },
      ],
    };
    const items = itemsFromPlan(plan, 'Practitioner/abc');
    expect(items).toHaveLength(3);
    expect(items[0].assignedToMe).toBe(true);
    expect(items[0].title).toBe('Call Maria about BP');
    expect(items[0].description).toBe('Medical');
    expect(items[1].assignedToMe).toBe(false);
    expect(items[1].ownerLabel).toBe('Other clinician');
    expect(items[2].assignedToMe).toBe(false);
    expect(items[2].ownerLabel).toBe('Unassigned');
  });

  test('itemsFromPlan with no user ref flags nothing as assigned-to-me', () => {
    const plan: CarePlan = {
      resourceType: 'CarePlan',
      status: 'active',
      intent: 'plan',
      subject: { reference: 'Patient/p1' },
      activity: [
        {
          detail: {
            status: 'not-started',
            description: 'x',
            performer: [{ reference: 'Practitioner/abc' }],
          },
        },
      ],
    };
    const items = itemsFromPlan(plan, undefined);
    expect(items[0].assignedToMe).toBe(false);
  });
});

describe('PlanReviewPage — render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <PlanReviewPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title and member-required select with no plan content', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Plan review')).toBeInTheDocument();
      expect(screen.getByText(/CHW view: assigned-to-me items first/)).toBeInTheDocument();
    });
  });
});

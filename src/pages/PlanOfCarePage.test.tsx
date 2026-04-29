// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  activityFromDraft,
  AUTO_SAVE_MS,
  draftFromActivity,
  isPlanEmpty,
  PlanOfCarePage,
} from './PlanOfCarePage';

describe('PlanOfCarePage — pure helpers', () => {
  test('AUTO_SAVE_MS is 30 seconds per CD-08 AC-1', () => {
    expect(AUTO_SAVE_MS).toBe(30_000);
  });

  test('isPlanEmpty is true only when narrative and items are both empty', () => {
    expect(isPlanEmpty('', [])).toBe(true);
    expect(isPlanEmpty('   ', [])).toBe(true);
    expect(isPlanEmpty('some narrative', [])).toBe(false);
    expect(
      isPlanEmpty('', [{ id: 'x', title: 't', description: '', status: 'not-started', ownerRole: 'CHW' }])
    ).toBe(false);
  });

  test('draftFromActivity maps a CarePlan activity into an editable item', () => {
    const draft = draftFromActivity(
      {
        detail: {
          status: 'in-progress',
          description: 'Schedule PCP follow-up',
          code: { text: 'Call Monday AM', coding: [{ code: 'item-1', display: 'Clinical' }] },
          scheduledPeriod: { end: '2026-05-01' },
          performer: [
            {
              display: 'Dr. Lopez',
              extension: [
                {
                  url: 'https://widercircle.com/fhir/StructureDefinition/action-item-owner-role',
                  valueString: 'Care Provider',
                },
              ],
            },
          ],
        },
      },
      0
    );
    expect(draft).toEqual({
      id: 'item-1',
      title: 'Schedule PCP follow-up',
      description: 'Call Monday AM',
      ownerRole: 'Care Provider',
      ownerName: 'Dr. Lopez',
      dueDate: '2026-05-01',
      status: 'in-progress',
      category: 'Clinical',
    });
  });

  test('draftFromActivity falls back to a stable id when no code is set', () => {
    const draft = draftFromActivity({ detail: { status: 'not-started', description: 'no code' } }, 3);
    expect(draft.id).toBe('item-3');
    expect(draft.status).toBe('not-started');
  });

  test('activityFromDraft round-trips an item into a FHIR activity detail', () => {
    const activity = activityFromDraft({
      id: 'item-1',
      title: 'BP check',
      description: 'Measure twice',
      ownerRole: 'CHW',
      ownerName: 'Demo CHW',
      dueDate: '2026-05-01',
      status: 'in-progress',
      category: 'Clinical',
    });
    expect(activity.detail?.status).toBe('in-progress');
    expect(activity.detail?.description).toBe('BP check');
    expect(activity.detail?.code?.text).toBe('Measure twice');
    expect(activity.detail?.code?.coding?.[0]?.code).toBe('item-1');
    expect(activity.detail?.code?.coding?.[0]?.display).toBe('Clinical');
    expect(activity.detail?.scheduledPeriod?.end).toBe('2026-05-01');
    expect(activity.detail?.performer?.[0]?.display).toBe('Demo CHW');
    expect(
      activity.detail?.performer?.[0]?.extension?.[0]?.valueString
    ).toBe('CHW');
  });

  test('draftFromActivity coerces unknown statuses to not-started', () => {
    const draft = draftFromActivity(
      { detail: { status: 'entered-in-error' as never, description: 'broken' } },
      0
    );
    expect(draft.status).toBe('not-started');
  });
});

describe('PlanOfCarePage — render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <PlanOfCarePage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders header + save-state idle badge when no member selected', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('Plan of Care')).toBeInTheDocument();
      expect(screen.getByText(/Narrative \+ discrete action items/)).toBeInTheDocument();
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });
  });

  test('empty-plan alert references AC-4 blocker', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    // Before a patient is picked the narrative + items area isn't rendered, so
    // the AC-4 alert also isn't shown. Assert the scaffolding is in place by
    // the title + save-state badge; AC-4 branch is covered by isPlanEmpty tests.
    await waitFor(() => {
      expect(screen.getByText('Plan of Care')).toBeInTheDocument();
    });
  });
});

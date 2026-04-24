// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Observation } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CCM_THRESHOLDS,
  evaluateThresholdProgress,
  formatDuration,
  IDLE_AUTO_STOP_MS,
  sumObservationMinutes,
  TimeTrackingPage,
} from './TimeTrackingPage';

describe('evaluateThresholdProgress', () => {
  test('0 minutes → 0% toward 99490 at 20 min', () => {
    const p = evaluateThresholdProgress(0);
    expect(p.nextThreshold?.code).toBe('99490');
    expect(p.percentToNext).toBe(0);
    expect(p.minutesRemaining).toBe(20);
    expect(p.currentThreshold).toBeUndefined();
  });

  test('10 minutes → 50% toward first threshold', () => {
    const p = evaluateThresholdProgress(10);
    expect(p.percentToNext).toBe(50);
    expect(p.minutesRemaining).toBe(10);
  });

  test('at 20 min boundary, currentThreshold flips to 99490 and next is the +20 tier', () => {
    const p = evaluateThresholdProgress(20);
    expect(p.currentThreshold?.code).toBe('99490');
    expect(p.nextThreshold?.minutes).toBe(40);
    expect(p.percentToNext).toBe(0);
  });

  test('at 40 min boundary, next becomes the 60-min tier', () => {
    const p = evaluateThresholdProgress(40);
    expect(p.currentThreshold?.minutes).toBe(40);
    expect(p.nextThreshold?.minutes).toBe(60);
    expect(p.percentToNext).toBe(0);
  });

  test('past the top threshold → all hit, 100%, 0 remaining', () => {
    const p = evaluateThresholdProgress(75);
    expect(p.nextThreshold).toBeUndefined();
    expect(p.percentToNext).toBe(100);
    expect(p.minutesRemaining).toBe(0);
    expect(p.currentThreshold?.minutes).toBe(60);
  });
});

describe('sumObservationMinutes', () => {
  test('sums minutes when unit=min and skips other units', () => {
    const obs: Observation[] = [
      {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueQuantity: { value: 12, unit: 'min' },
      },
      {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueQuantity: { value: 8, unit: 'min' },
      },
      {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueQuantity: { value: 99, unit: 'kg' },
      },
    ];
    expect(sumObservationMinutes(obs)).toBe(20);
  });

  test('ignores observations without a valueQuantity', () => {
    expect(sumObservationMinutes([{ resourceType: 'Observation', status: 'final', code: { text: 'x' } }])).toBe(0);
  });
});

describe('formatDuration', () => {
  test('pads both minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
  });
});

describe('config constants', () => {
  test('CCM_THRESHOLDS are sorted ascending by minutes', () => {
    for (let i = 1; i < CCM_THRESHOLDS.length; i += 1) {
      expect(CCM_THRESHOLDS[i].minutes).toBeGreaterThan(CCM_THRESHOLDS[i - 1].minutes);
    }
  });

  test('IDLE_AUTO_STOP_MS is 30 minutes (AC-3)', () => {
    expect(IDLE_AUTO_STOP_MS).toBe(30 * 60 * 1000);
  });
});

describe('TimeTrackingPage — render', () => {
  let medplum: MockClient;

  const setup = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <TimeTrackingPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('renders title and member-required select', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    setup();
    await waitFor(() => {
      expect(screen.getByText('CCM time tracking')).toBeInTheDocument();
      expect(screen.getByText(/Stopwatch for CMS time-based billing/)).toBeInTheDocument();
    });
  });
});

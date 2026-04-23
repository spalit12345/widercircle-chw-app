// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { getMonthRange, getProgressColor, getStatusLabel } from './billing-utils';
import { getThresholdFromCptCodes, suggestCptFromConfig } from './useBillingConfig';

const MOCK_CPT_CODES = [
  { value: 'G0019', label: 'G0019 - CHI Initial 60 min/month', threshold: 60 },
  { value: 'G0022', label: 'G0022 - CHI Each additional 30 min', threshold: 30 },
  { value: 'G0023', label: 'G0023 - PIN Initial 60 min/month', threshold: 60 },
  { value: 'G0024', label: 'G0024 - PIN Each additional 30 min', threshold: 30 },
  { value: 'G0136', label: 'G0136 - SDoH Assessment', threshold: 0 },
];

describe('billing-utils', () => {
  describe('suggestCptFromConfig', () => {
    test('returns empty for under 60 min', () => {
      expect(suggestCptFromConfig(0, MOCK_CPT_CODES)).toBe('');
      expect(suggestCptFromConfig(30, MOCK_CPT_CODES)).toBe('');
      expect(suggestCptFromConfig(59, MOCK_CPT_CODES)).toBe('');
    });

    test('returns G0019 for CHI at 60 min', () => {
      expect(suggestCptFromConfig(60, MOCK_CPT_CODES, 'CHI')).toBe('G0019');
      expect(suggestCptFromConfig(89, MOCK_CPT_CODES, 'CHI')).toBe('G0019');
    });

    test('returns G0022 for CHI at 90+ min (add-on)', () => {
      expect(suggestCptFromConfig(90, MOCK_CPT_CODES, 'CHI')).toBe('G0022');
      expect(suggestCptFromConfig(120, MOCK_CPT_CODES, 'CHI')).toBe('G0022');
    });

    test('returns G0023 for PIN at 60 min', () => {
      expect(suggestCptFromConfig(60, MOCK_CPT_CODES, 'PIN')).toBe('G0023');
      expect(suggestCptFromConfig(89, MOCK_CPT_CODES, 'PIN')).toBe('G0023');
    });

    test('returns G0024 for PIN at 90+ min (add-on)', () => {
      expect(suggestCptFromConfig(90, MOCK_CPT_CODES, 'PIN')).toBe('G0024');
    });

    test('defaults to CHI codes when no program specified', () => {
      expect(suggestCptFromConfig(60, MOCK_CPT_CODES)).toBe('G0019');
      expect(suggestCptFromConfig(90, MOCK_CPT_CODES)).toBe('G0022');
    });
  });

  describe('getThresholdFromCptCodes', () => {
    test('returns 60 from CHI/PIN base codes', () => {
      expect(getThresholdFromCptCodes(MOCK_CPT_CODES)).toBe(60);
    });

    test('returns 60 fallback for empty array', () => {
      expect(getThresholdFromCptCodes([])).toBe(60);
    });
  });

  describe('getProgressColor', () => {
    test('returns red below 70%', () => {
      expect(getProgressColor(0)).toBe('red');
      expect(getProgressColor(50)).toBe('red');
      expect(getProgressColor(69)).toBe('red');
    });

    test('returns yellow for 70-99%', () => {
      expect(getProgressColor(70)).toBe('yellow');
      expect(getProgressColor(90)).toBe('yellow');
      expect(getProgressColor(99)).toBe('yellow');
    });

    test('returns green for 100%+', () => {
      expect(getProgressColor(100)).toBe('green');
    });
  });

  describe('getStatusLabel', () => {
    test('returns Below for under 70%', () => {
      expect(getStatusLabel(50)).toEqual({ label: 'Below', color: 'red' });
    });

    test('returns Approaching for 70-99%', () => {
      expect(getStatusLabel(85)).toEqual({ label: 'Approaching', color: 'yellow' });
    });

    test('returns Met for 100%+', () => {
      expect(getStatusLabel(100)).toEqual({ label: 'Met', color: 'green' });
    });
  });

  describe('getMonthRange', () => {
    test('returns correct range for a known date', () => {
      const result = getMonthRange(new Date(2026, 3, 15));
      expect(result.start).toBe('2026-04-01');
      expect(result.end).toBe('2026-04-30');
      expect(result.label).toContain('April');
      expect(result.label).toContain('2026');
    });

    test('handles January correctly', () => {
      const result = getMonthRange(new Date(2026, 0, 1));
      expect(result.start).toBe('2026-01-01');
      expect(result.end).toBe('2026-01-31');
    });

    test('handles December correctly', () => {
      const result = getMonthRange(new Date(2026, 11, 25));
      expect(result.start).toBe('2026-12-01');
      expect(result.end).toBe('2026-12-31');
    });
  });
});

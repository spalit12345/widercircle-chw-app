// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared billing presentation utilities.
 * Data constants (activity types, programs, CPT codes, thresholds) are now
 * fetched from the FHIR database via useBillingConfig hook.
 * Only pure presentation functions remain here.
 */

/**
 * Get the start and end dates for a given month.
 */
export function getMonthRange(date: Date = new Date()): { start: string; end: string; label: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1).toISOString().split('T')[0];
  const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
  return { start, end, label };
}

/**
 * Get progress bar color based on percentage.
 */
export function getProgressColor(progress: number): string {
  if (progress >= 100) {
    return 'green';
  }
  if (progress >= 70) {
    return 'yellow';
  }
  return 'red';
}

/**
 * Get status label and color for a progress percentage.
 */
export function getStatusLabel(progress: number): { label: string; color: string } {
  if (progress >= 100) {
    return { label: 'Met', color: 'green' };
  }
  if (progress >= 70) {
    return { label: 'Approaching', color: 'yellow' };
  }
  return { label: 'Below', color: 'red' };
}

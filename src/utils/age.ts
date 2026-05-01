// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Medplum's `calculateAgeString` returns a canonical ISO 8601 duration with
 * zero-padded units (e.g. `046Y`, `008Y`, `012M`). For display we strip the
 * leading zeros from the numeric part while preserving the unit suffix.
 *
 * `046Y` → `46Y` · `008Y` → `8Y` · `012M` → `12M` · `100Y` → `100Y` (unchanged)
 */
export const formatAgeString = (raw: string | undefined): string => {
  if (!raw) return '';
  return raw.replace(/^0+(\d)/, '$1');
};

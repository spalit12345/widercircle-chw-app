// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSet } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface CptCode extends SelectOption {
  threshold: number;
}

interface BillingConfig {
  activityTypes: SelectOption[];
  programs: SelectOption[];
  cptCodes: CptCode[];
  loading: boolean;
}

function extractOptions(valueSet: ValueSet | undefined): SelectOption[] {
  if (!valueSet?.compose?.include?.[0]?.concept) {
    return [];
  }
  return valueSet.compose.include[0].concept.map((c) => ({
    value: c.code ?? '',
    label: c.display ?? c.code ?? '',
  }));
}

function extractCptCodes(valueSet: ValueSet | undefined): CptCode[] {
  if (!valueSet?.compose?.include?.[0]?.concept) {
    return [];
  }
  return valueSet.compose.include[0].concept.map((c) => ({
    value: c.code ?? '',
    label: c.display ?? c.code ?? '',
    threshold: parseInt(c.designation?.[0]?.value ?? '60', 10),
  }));
}

export function useBillingConfig(): BillingConfig {
  const medplum = useMedplum();
  const [activityTypes, setActivityTypes] = useState<SelectOption[]>([]);
  const [programs, setPrograms] = useState<SelectOption[]>([]);
  const [cptCodes, setCptCodes] = useState<CptCode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const [actResult, progResult, cptResult] = await Promise.all([
        medplum.searchResources('ValueSet', 'name=activity-types&status=active'),
        medplum.searchResources('ValueSet', 'name=billing-programs&status=active'),
        medplum.searchResources('ValueSet', 'name=cpt-billing-codes&status=active'),
      ]);

      setActivityTypes(extractOptions((actResult as ValueSet[])[0]));
      setPrograms(extractOptions((progResult as ValueSet[])[0]));
      setCptCodes(extractCptCodes((cptResult as ValueSet[])[0]));
    } catch {
      // Silently fail — components will show empty dropdowns
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    fetchConfig().catch(console.error);
  }, [fetchConfig]);

  return { activityTypes, programs, cptCodes, loading };
}

/**
 * Get the base billing threshold (60 min for CHI/PIN).
 * Looks for G0019 or G0023 base codes first, falls back to highest threshold.
 */
export function getThresholdFromCptCodes(cptCodes: CptCode[]): number {
  // CHI/PIN base codes are G0019 and G0023 (both 60 min)
  const base = cptCodes.find((c) => c.value === 'G0019' || c.value === 'G0023');
  if (base) {
    return base.threshold;
  }
  // Fallback: find the highest base threshold
  const baseCodes = cptCodes.filter((c) => c.threshold > 0);
  if (baseCodes.length > 0) {
    return Math.max(...baseCodes.map((c) => c.threshold));
  }
  return 60; // Default 60 min for CHI/PIN
}

/**
 * Suggest a billing code based on total minutes and program.
 * CHI: G0019 (base 60 min) + G0022 (each +30 min)
 * PIN: G0023 (base 60 min) + G0024 (each +30 min)
 */
export function suggestCptFromConfig(totalMinutes: number, cptCodes: CptCode[], program?: string): string {
  const baseThreshold = getThresholdFromCptCodes(cptCodes);
  if (totalMinutes < baseThreshold) {
    return '';
  }

  // Find base and add-on codes from the DB-backed cptCodes array
  const isPIN = program === 'PIN';
  const baseCodes = cptCodes.filter((c) => c.threshold === baseThreshold);
  const addOnCodes = cptCodes.filter((c) => c.threshold > 0 && c.threshold < baseThreshold);

  // Pick program-specific codes if available
  const baseCode = baseCodes.find((c) => isPIN ? c.value.includes('G0023') || c.value.includes('023') : c.value.includes('G0019') || c.value.includes('019'));
  const addOnCode = addOnCodes.find((c) => isPIN ? c.value.includes('G0024') || c.value.includes('024') : c.value.includes('G0022') || c.value.includes('022'));

  // Check if we've accumulated enough for add-on units
  if (addOnCode && totalMinutes >= baseThreshold + addOnCode.threshold) {
    return addOnCode.value;
  }

  return baseCode?.value ?? baseCodes[0]?.value ?? '';
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSet } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';

export interface ConsentCategory {
  code: string;
  label: string;
  required: boolean;
}

interface ConsentConfig {
  categories: ConsentCategory[];
  loading: boolean;
}

export function useConsentConfig(): ConsentConfig {
  const medplum = useMedplum();
  const [categories, setCategories] = useState<ConsentCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const result = await medplum.searchResources('ValueSet', 'name=consent-categories&status=active');
      const vs = (result as ValueSet[])[0];
      if (vs?.compose?.include?.[0]?.concept) {
        const cats = vs.compose.include[0].concept.map((c) => ({
          code: c.code ?? '',
          label: c.display ?? c.code ?? '',
          required: c.designation?.[0]?.value === 'required',
        }));
        setCategories(cats);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    fetchConfig().catch(console.error);
  }, [fetchConfig]);

  return { categories, loading };
}

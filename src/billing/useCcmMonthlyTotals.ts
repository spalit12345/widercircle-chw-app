// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimer } from '../timer/TimerContext';
import { getThresholdFromCptCodes, suggestCptFromConfig, useBillingConfig } from './useBillingConfig';

export interface BillingTotalRow {
  patientId: string;
  patientName: string;
  program: string;
  totalMinutes: number;
  threshold: number;
  progress: number;
  entryCount: number;
  suggestedCpt: string;
}

export interface BillingTotalsSummary {
  totalRows: number;
  metCount: number;
  approachingCount: number;
  belowCount: number;
  threshold: number;
}

interface CcmMonthlyTotals {
  rows: BillingTotalRow[];
  summary: BillingTotalsSummary;
  loading: boolean;
  refetch: () => void;
}

/**
 * Aggregates the current calendar month's CCM time-tracking data into per-patient
 * rows + summary counts. Sums minutes from BOTH Encounter.length (closed
 * billable visits) and Observation(code=ccm-minutes) (entries written by the
 * global timer / TimerContext.stopTimer).
 *
 * Auto-refetches when a global timer transitions from running → null so newly
 * committed entries land without a manual reload.
 */
export function useCcmMonthlyTotals(): CcmMonthlyTotals {
  const medplum = useMedplum();
  const { activeTimer } = useTimer();
  const { cptCodes } = useBillingConfig();
  const [rows, setRows] = useState<BillingTotalRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Send full UTC instants computed from the LOCAL month boundary so timezones
  // don't drop late-day entries (see BillingDashboardPage.tsx for the full
  // timezone bug writeup).
  const { monthStartIso, nextMonthStartIso } = useMemo(() => {
    const now = new Date();
    return {
      monthStartIso: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString(),
      nextMonthStartIso: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).toISOString(),
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [patients, encounters, ccmObservations] = await Promise.all([
        medplum.searchResources('Patient', '_sort=-_lastUpdated'),
        medplum.searchResources('Encounter', `date=ge${monthStartIso}&date=lt${nextMonthStartIso}&_sort=-date`),
        medplum.searchResources(
          'Observation',
          `code=ccm-minutes&date=ge${monthStartIso}&date=lt${nextMonthStartIso}&_count=500&_sort=-date`
        ),
      ]);

      const patientProgramMinutes: Record<string, Record<string, { minutes: number; count: number }>> = {};
      const bump = (patId: string, program: string, minutes: number): void => {
        if (!patId || minutes <= 0) return;
        if (!patientProgramMinutes[patId]) patientProgramMinutes[patId] = {};
        if (!patientProgramMinutes[patId][program]) patientProgramMinutes[patId][program] = { minutes: 0, count: 0 };
        patientProgramMinutes[patId][program].minutes += minutes;
        patientProgramMinutes[patId][program].count += 1;
      };

      for (const enc of encounters as Encounter[]) {
        const patId = enc.subject?.reference?.replace('Patient/', '') ?? '';
        const minutes = enc.length?.value ?? 0;
        const prog = enc.serviceType?.coding?.[0]?.code ?? 'CHI';
        bump(patId, prog, minutes);
      }
      for (const obs of ccmObservations as Observation[]) {
        const patId = obs.subject?.reference?.replace('Patient/', '') ?? '';
        const minutes = obs.valueQuantity?.value ?? 0;
        bump(patId, 'CHI', minutes);
      }

      const billingRows: BillingTotalRow[] = [];
      for (const patient of patients as Patient[]) {
        const patId = patient.id ?? '';
        const name = patient.name?.[0];
        const displayName = name ? `${name.given?.[0] ?? ''} ${name.family ?? ''}`.trim() : patId;
        const programData = patientProgramMinutes[patId] ?? { CHI: { minutes: 0, count: 0 } };
        const programKeys = Object.keys(programData);
        if (programKeys.length === 0) programKeys.push('CHI');

        for (const prog of programKeys) {
          const data = programData[prog] ?? { minutes: 0, count: 0 };
          const threshold = getThresholdFromCptCodes(cptCodes);
          const progress = threshold > 0 ? Math.min(100, Math.round((data.minutes / threshold) * 100)) : 0;
          const cpt = suggestCptFromConfig(data.minutes, cptCodes, prog);

          billingRows.push({
            patientId: patId,
            patientName: displayName,
            program: prog,
            totalMinutes: data.minutes,
            threshold,
            suggestedCpt: cpt || '—',
            progress,
            entryCount: data.count,
          });
        }
      }

      billingRows.sort((a, b) => {
        const aApproaching = a.progress >= 70 && a.progress < 100;
        const bApproaching = b.progress >= 70 && b.progress < 100;
        if (aApproaching && !bApproaching) return -1;
        if (!aApproaching && bApproaching) return 1;
        return b.progress - a.progress;
      });

      setRows(billingRows);
    } catch (err) {
      console.error('Failed to load CCM monthly totals:', err);
    } finally {
      setLoading(false);
    }
  }, [medplum, monthStartIso, nextMonthStartIso, cptCodes]);

  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  // Re-fetch when the global timer transitions from "running" to null —
  // a timer was just stopped and committed to FHIR.
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !activeTimer) {
      fetchData().catch(console.error);
    }
    wasRunningRef.current = !!activeTimer;
  }, [activeTimer, fetchData]);

  const summary = useMemo<BillingTotalsSummary>(() => {
    const totalRows = rows.length;
    const metCount = rows.filter((r) => r.progress >= 100).length;
    const approachingCount = rows.filter((r) => r.progress >= 70 && r.progress < 100).length;
    const belowCount = totalRows - metCount - approachingCount;
    const threshold = rows[0]?.threshold ?? getThresholdFromCptCodes(cptCodes);
    return { totalRows, metCount, approachingCount, belowCount, threshold };
  }, [rows, cptCodes]);

  return { rows, summary, loading, refetch: () => void fetchData() };
}

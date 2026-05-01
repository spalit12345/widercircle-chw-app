// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Observation } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface ActiveTimer {
  patientId: string;
  patientName: string;
  startedAt: string;
}

interface TimerContextValue {
  activeTimer: ActiveTimer | null;
  elapsed: number;
  startTimer: (input: { patientId: string; patientName: string }) => void;
  stopTimer: () => Promise<Observation | null>;
  cancelTimer: () => void;
}

const TimerCtx = createContext<TimerContextValue>({
  activeTimer: null,
  elapsed: 0,
  startTimer: () => undefined,
  stopTimer: async () => null,
  cancelTimer: () => undefined,
});

export function useTimer(): TimerContextValue {
  return useContext(TimerCtx);
}

const STORAGE_KEY = 'wc_active_timer';

function loadPersistedTimer(): ActiveTimer | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveTimer;
  } catch {
    return null;
  }
}

function persistTimer(t: ActiveTimer | null): void {
  if (t) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function TimerProvider({ children }: { children: ReactNode }): JSX.Element {
  const medplum = useMedplum();
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(loadPersistedTimer);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeTimer) {
      setElapsed(0);
      return undefined;
    }
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000));
      setElapsed(diff);
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeTimer]);

  const startTimer = useCallback((input: { patientId: string; patientName: string }) => {
    const timer: ActiveTimer = {
      patientId: input.patientId,
      patientName: input.patientName,
      startedAt: new Date().toISOString(),
    };
    setActiveTimer(timer);
    persistTimer(timer);
  }, []);

  const cancelTimer = useCallback(() => {
    setActiveTimer(null);
    persistTimer(null);
  }, []);

  const stopTimer = useCallback(async (): Promise<Observation | null> => {
    if (!activeTimer) return null;
    const profile = medplum.getProfile();
    const startedAtMs = new Date(activeTimer.startedAt).getTime();
    const endedAtMs = Date.now();
    const minutes = Math.max(1, Math.round((endedAtMs - startedAtMs) / 60_000));
    try {
      const payload: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            {
              system: 'https://widercircle.com/fhir/CodeSystem/time-tracking',
              code: 'ccm-minutes',
              display: 'CCM clinical staff time (minutes)',
            },
          ],
          text: 'CCM clinical staff time',
        },
        subject: { reference: `Patient/${activeTimer.patientId}`, display: activeTimer.patientName },
        effectivePeriod: {
          start: activeTimer.startedAt,
          end: new Date(endedAtMs).toISOString(),
        },
        issued: new Date().toISOString(),
        performer: profile ? [{ reference: `Practitioner/${profile.id}` }] : undefined,
        valueQuantity: {
          value: minutes,
          unit: 'min',
          system: 'http://unitsofmeasure.org',
          code: 'min',
        },
      };
      const result = await medplum.createResource<Observation>(payload);
      setActiveTimer(null);
      persistTimer(null);
      return result;
    } catch (err) {
      console.error('Failed to stop timer:', err);
      setActiveTimer(null);
      persistTimer(null);
      return null;
    }
  }, [activeTimer, medplum]);

  return (
    <TimerCtx.Provider value={{ activeTimer, elapsed, startTimer, stopTimer, cancelTimer }}>
      {children}
    </TimerCtx.Provider>
  );
}

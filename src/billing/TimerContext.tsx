// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface InterventionContext {
  description: string;
  goalId: string;
  goalTitle: string;
}

interface TimerState {
  patientId: string;
  patientName: string;
  running: boolean;
  elapsed: number;
  intervention?: InterventionContext;
}

interface TimerContextValue {
  timer: TimerState | undefined;
  startTimer: (patientId: string, patientName: string, intervention?: InterventionContext) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => number;
  isRunningFor: (patientId: string) => boolean;
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined);

export function TimerProvider({ children }: { children: ReactNode }): JSX.Element {
  const [timer, setTimer] = useState<TimerState | undefined>();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timer?.running) {
      intervalRef.current = setInterval(() => {
        setTimer((prev) => (prev ? { ...prev, elapsed: prev.elapsed + 1 } : undefined));
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timer?.running]);

  const startTimer = useCallback((patientId: string, patientName: string, intervention?: InterventionContext) => {
    setTimer({ patientId, patientName, running: true, elapsed: 0, intervention });
  }, []);

  const pauseTimer = useCallback(() => {
    setTimer((prev) => (prev ? { ...prev, running: false } : undefined));
  }, []);

  const resumeTimer = useCallback(() => {
    setTimer((prev) => (prev ? { ...prev, running: true } : undefined));
  }, []);

  const stopTimer = useCallback((): number => {
    let elapsed = 0;
    setTimer((prev) => {
      elapsed = prev?.elapsed ?? 0;
      return undefined;
    });
    return elapsed;
  }, []);

  const isRunningFor = useCallback(
    (patientId: string): boolean => {
      return timer?.patientId === patientId && timer?.running === true;
    },
    [timer]
  );

  return (
    <TimerContext.Provider value={{ timer, startTimer, pauseTimer, resumeTimer, stopTimer, isRunningFor }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useGlobalTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) {
    throw new Error('useGlobalTimer must be used within TimerProvider');
  }
  return ctx;
}

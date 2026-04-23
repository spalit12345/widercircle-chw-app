// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Text } from '@mantine/core';
import { IconClock, IconPlayerPause, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useGlobalTimer } from './TimerContext';

/**
 * Global timer component — uses context so only one timer runs across the app.
 * Renders play/pause/stop controls for the given patient.
 * If a timer is active for a different patient, shows a warning.
 */
export function GlobalActivityTimer({
  patientId,
  patientName,
  onStop,
}: {
  patientId: string;
  patientName: string;
  onStop: (seconds: number) => void;
}): JSX.Element {
  const { timer, startTimer, pauseTimer, resumeTimer, stopTimer } = useGlobalTimer();
  const isThisPatient = timer?.patientId === patientId;
  const isRunning = isThisPatient && timer?.running;
  const elapsed = isThisPatient ? (timer?.elapsed ?? 0) : 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  // Timer active (running or paused) for another patient
  if (timer && !isThisPatient) {
    return (
      <Group>
        <IconClock size={20} />
        <Text size="sm" c="orange">
          Timer {timer.running ? 'active' : 'paused'} for {timer.patientName} (
          {Math.floor(timer.elapsed / 60)}:{String(timer.elapsed % 60).padStart(2, '0')})
        </Text>
      </Group>
    );
  }

  return (
    <Group>
      <IconClock size={20} />
      <Text fw={700} size="lg" ff="monospace">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </Text>
      {isThisPatient && timer?.intervention && (
        <Text size="xs" c="dimmed" maw={200} truncate>
          {timer.intervention.description}
        </Text>
      )}
      {!isRunning && elapsed === 0 && (
        <ActionIcon color="green" variant="filled" onClick={() => startTimer(patientId, patientName)} aria-label="Start timer">
          <IconPlayerPlay size={16} />
        </ActionIcon>
      )}
      {isRunning && (
        <>
          <ActionIcon color="yellow" variant="filled" onClick={pauseTimer} aria-label="Pause timer">
            <IconPlayerPause size={16} />
          </ActionIcon>
          <ActionIcon color="red" variant="filled" onClick={() => onStop(stopTimer())} aria-label="Stop timer">
            <IconPlayerStop size={16} />
          </ActionIcon>
        </>
      )}
      {!isRunning && elapsed > 0 && (
        <>
          <ActionIcon color="green" variant="filled" onClick={resumeTimer} aria-label="Resume timer">
            <IconPlayerPlay size={16} />
          </ActionIcon>
          <ActionIcon color="red" variant="filled" onClick={() => onStop(stopTimer())} aria-label="Stop timer">
            <IconPlayerStop size={16} />
          </ActionIcon>
        </>
      )}
    </Group>
  );
}

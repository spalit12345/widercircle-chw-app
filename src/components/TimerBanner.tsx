// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { IconClock, IconPlayerStop } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { useTimer } from '../timer/TimerContext';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const TIMER_BANNER_HEIGHT = 40;

export function TimerBanner(): JSX.Element | null {
  const { activeTimer, elapsed, stopTimer } = useTimer();
  const navigate = useNavigate();

  if (!activeTimer) return null;

  const handleStop = async (): Promise<void> => {
    const result = await stopTimer();
    if (result) {
      const minutes = result.valueQuantity?.value ?? 0;
      showNotification({
        color: 'green',
        message: `Logged ${minutes} min for ${activeTimer.patientName}`,
      });
    } else {
      showNotification({
        color: 'yellow',
        message: 'Timer stopped (entry not saved — check console).',
      });
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        height: TIMER_BANNER_HEIGHT,
        flexShrink: 0,
        background: 'var(--wc-primary-500, #EA6424)',
        color: '#fff',
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 14,
        boxShadow: '0 2px 6px rgba(234,100,36,0.18)',
      }}
    >
      <IconClock size={16} />
      <span style={{ fontWeight: 700 }}>Timer running</span>
      <button
        type="button"
        onClick={() => navigate(`/time-tracking?patient=${activeTimer.patientId}`)}
        title="Open time tracking for this member"
        style={{
          background: 'rgba(255,255,255,0.18)',
          border: 'none',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {activeTimer.patientName}
      </button>
      <span
        style={{
          fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
          minWidth: 72,
          letterSpacing: '0.02em',
        }}
      >
        {formatElapsed(elapsed)}
      </span>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={handleStop}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 12px',
          borderRadius: 6,
          border: 'none',
          background: '#fff',
          color: 'var(--wc-primary-700, #B84E1A)',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <IconPlayerStop size={14} /> Stop & save
      </button>
    </div>
  );
}

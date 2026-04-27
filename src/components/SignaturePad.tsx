// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-13 e-signature capture — minimal HTML5 canvas with mouse + touch input.
// Used by CD-13 plan-review acknowledgment to attach a signature PNG to the
// Communication resource. Output: base64 PNG data URL or `null` if the
// canvas is empty.

import { Box, Button, Group, Text } from '@mantine/core';
import { IconEraser, IconSignature } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

export interface SignaturePadProps {
  onChange?: (dataUrl: string | null) => void;
  height?: number;
  label?: string;
}

interface Point {
  x: number;
  y: number;
}

export function SignaturePad({ onChange, height = 140, label = 'Signature' }: SignaturePadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = container.clientWidth;
    const cssHeight = height;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1A191B';
  }, [height]);

  useEffect(() => {
    resizeCanvas();
    const handler = (): void => resizeCanvas();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [resizeCanvas]);

  const pointFromEvent = (e: PointerEvent | React.PointerEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointFromEvent(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const next = pointFromEvent(e);
    if (!ctx || !next || !lastPoint.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPoint.current = next;
    if (!hasSignature) setHasSignature(true);
  };

  const finish = (): void => {
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = hasSignature ? canvas.toDataURL('image/png') : null;
    onChange?.(dataUrl);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    finish();
  };

  const onPointerCancel = (): void => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clear = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasSignature(false);
    onChange?.(null);
  };

  return (
    <Box>
      <Group justify="space-between" mb={4} align="center">
        <Group gap={6}>
          <IconSignature size={14} />
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">{label}</Text>
        </Group>
        <Button size="compact-xs" variant="subtle" leftSection={<IconEraser size={12} />} onClick={clear} disabled={!hasSignature}>
          Clear
        </Button>
      </Group>
      <Box ref={containerRef} style={{ width: '100%' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{
            display: 'block',
            width: '100%',
            height,
            background: 'var(--wc-base-50, #FAFAF7)',
            border: '1px solid var(--wc-base-200, #E3E3DF)',
            borderRadius: 12,
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
      </Box>
      <Text size="xs" c="dimmed" mt={4}>
        {hasSignature ? 'Signature captured.' : 'Sign above using mouse or touch.'}
      </Text>
    </Box>
  );
}

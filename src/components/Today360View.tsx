// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CD-18 Today — visual port of Design v2 / ui_kits/cms_platform/chw-today.jsx.
// Renders only the main column (status header, KPI strip, schedule rows,
// task rows). The v2 sketch's TopRibbon + left/right rails (caseload search,
// sync widget, supervisor nudge) and the CD-17 threshold widget are deferred
// — they need data we don't fetch yet (caseload-wide Observation sums, MDM
// status, supervisor messages).

import { Badge, Progress, Table } from '@mantine/core';
import type { Appointment, Task } from '@medplum/fhirtypes';
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarTime,
  IconCheck,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconHome,
  IconPhone,
  IconPlus,
  IconTimeline,
  IconUserPlus,
} from '@tabler/icons-react';
import { type JSX, type ReactNode } from 'react';
import { getProgressColor, getStatusLabel } from '../billing/billing-utils';
import type { BillingTotalRow } from '../billing/useCcmMonthlyTotals';

const COLOR_INK = 'var(--wc-base-800, #012B49)';
const COLOR_INK_2 = 'var(--wc-base-700, #34556D)';
const COLOR_FG_MUTE = 'var(--wc-base-600, #506D85)';
const COLOR_FG_HELP = 'var(--wc-base-500, #8499AA)';
const COLOR_BORDER = 'var(--wc-base-200, #E2E6E9)';
const COLOR_SURFACE_SUBTLE = 'var(--wc-base-100, #F6F7F8)';
const COLOR_BRAND = 'var(--wc-primary-500, #EA6424)';
const COLOR_BRAND_TINT = 'var(--wc-primary-100, #FDEEE6)';
const COLOR_BRAND_BORDER = 'var(--wc-primary-300, #F39A61)';
const COLOR_DANGER = 'var(--wc-error-600, #D1190D)';
const COLOR_DANGER_TINT = 'var(--wc-error-100, #FCE9E1)';
const COLOR_TEAL_BG = 'var(--wc-success-100, #DDF3F2)';
const COLOR_TEAL_FG = 'var(--wc-success-700, #015F5D)';

interface ScheduleEntry {
  time: string;
  duration: string;
  type: string;
  member: string;
  memberMeta?: string;
  location?: string;
  isNext?: boolean;
  appointmentId?: string;
  patientId?: string;
}

interface TaskRow {
  id: string;
  done: boolean;
  title: string;
  meta: string;
  patientId?: string;
  patientLabel?: string;
  priority: 'overdue' | 'high' | 'med' | 'low';
}

export interface Today360Props {
  greetingName: string;
  todayLabel: string;
  scheduleToday: Appointment[];
  dueToday: Task[];
  overdue: Task[];
  appointmentTime: (a: Appointment) => string;
  patientLabelFor: (ref: string | undefined) => string | undefined;
  onNewTask: () => void;
  onOpenAppointment: (apptId: string | undefined, patientId: string | undefined) => void;
  onOpenTask: (taskId: string | undefined) => void;
  onOpenPatient: (patientId: string | undefined) => void;
  onNavigate: (path: string) => void;
  /** Count of patients whose CCM time is ≥ 70% and < 100% of the billable threshold this month. */
  approachingThresholdCount: number;
  /** Total number of patient/program billing rows for the month (denominator). */
  totalBillingRows: number;
  /** True while the underlying CCM aggregation is loading. */
  thresholdsLoading: boolean;
  /** Per-patient billing rows for this month — surfaced as a focus list under Tasks. */
  billingRows: BillingTotalRow[];
}

const todayDateLabel = (): string => {
  const now = new Date();
  return now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

export function Today360View(props: Today360Props): JSX.Element {
  const visitsCount = props.scheduleToday.length;
  const overdueCount = props.overdue.length;
  const dueCount = props.dueToday.length;

  // "From Plan of Care" = task whose basedOn includes a CarePlan reference.
  // Powers the colored sub-text accent on the Tasks Due tile.
  const fromPocCount = props.dueToday.filter((t) =>
    (t.basedOn ?? []).some((ref) => ref.reference?.startsWith('CarePlan/'))
  ).length;

  // Average age (in days) of overdue tasks — uses Task.restriction.period.end
  // if available, falls back to Task.authoredOn.
  const overdueAvgAgeDays = (() => {
    if (overdueCount === 0) return 0;
    const now = Date.now();
    let totalMs = 0;
    let counted = 0;
    for (const t of props.overdue) {
      const dueIso = t.restriction?.period?.end ?? t.authoredOn;
      if (!dueIso) continue;
      const due = new Date(dueIso).getTime();
      if (Number.isNaN(due)) continue;
      totalMs += Math.max(0, now - due);
      counted += 1;
    }
    if (counted === 0) return 0;
    return Math.max(1, Math.round(totalMs / counted / (24 * 60 * 60 * 1000)));
  })();

  // Map appointments → ScheduleEntry for the v2 row.
  const scheduleEntries: ScheduleEntry[] = props.scheduleToday.slice(0, 6).map((a, idx) => ({
    time: props.appointmentTime(a),
    duration: a.minutesDuration ? `${a.minutesDuration} min` : '—',
    type: a.serviceType?.[0]?.text ?? a.appointmentType?.text ?? 'Appointment',
    member:
      props.patientLabelFor(a.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor?.reference) ??
      a.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor?.display ??
      'Member',
    memberMeta: a.description,
    location: a.participant?.find((p) => p.actor?.reference?.startsWith('Location/'))?.actor?.display,
    isNext: idx === 0,
    appointmentId: a.id,
    patientId: a.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor?.reference?.replace('Patient/', ''),
  }));

  const taskRow = (t: Task, fallbackPriority: 'overdue' | 'high' | 'med'): TaskRow => {
    const fhirPri = t.priority;
    const priority: TaskRow['priority'] =
      fhirPri === 'asap'
        ? 'overdue'
        : fhirPri === 'urgent'
        ? 'high'
        : fhirPri === 'routine'
        ? 'med'
        : fallbackPriority;
    const patientRef = t.for?.reference ?? '';
    return {
      id: t.id ?? '',
      done: t.status === 'completed',
      title: t.code?.text ?? t.description ?? 'Task',
      meta: [
        t.restriction?.period?.end ? `Due ${t.restriction.period.end.slice(0, 10)}` : null,
        t.intent === 'order' ? 'Auto · trigger' : 'Manual',
      ]
        .filter(Boolean)
        .join(' · '),
      patientId: patientRef.startsWith('Patient/') ? patientRef.slice('Patient/'.length) : undefined,
      patientLabel: t.for?.display ?? props.patientLabelFor(patientRef),
      priority,
    };
  };

  const allTasks: TaskRow[] = [
    ...props.overdue.map((t) => taskRow(t, 'overdue')),
    ...props.dueToday.map((t) => taskRow(t, 'high')),
  ];

  return (
    <div
      style={{
        padding: '32px 36px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minHeight: '100%',
        background: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: COLOR_INK,
      }}
    >
      {/* Hero KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPIStat
          icon={<IconCalendarTime size={18} />}
          label="Today's visits"
          value={String(visitsCount)}
          sub={
            scheduleEntries.length === 0 ? (
              <span>Clear day.</span>
            ) : (
              <span>
                {scheduleEntries
                  .slice(0, 2)
                  .map((e) => `${e.member} ${e.time}`)
                  .join(' · ')}
              </span>
            )
          }
        />
        <KPIStat
          icon={<IconClipboardCheck size={18} />}
          label="Tasks due today"
          value={String(dueCount)}
          sub={
            dueCount === 0 ? (
              <span>Nothing due today.</span>
            ) : fromPocCount > 0 ? (
              <>
                <SubAccent tone="brand">+{fromPocCount}</SubAccent>
                <span>incl. {fromPocCount} from PoC</span>
              </>
            ) : (
              <span>Including auto-created from triggers</span>
            )
          }
        />
        <KPIStat
          icon={<IconAlertTriangle size={18} />}
          label="Overdue"
          value={String(overdueCount)}
          sub={
            overdueCount === 0 ? (
              <span>No overdue items.</span>
            ) : overdueAvgAgeDays > 0 ? (
              <>
                <SubAccent tone="danger">{overdueAvgAgeDays}d avg age</SubAccent>
                <span>snooze or escalate</span>
              </>
            ) : (
              <span>Snooze or escalate</span>
            )
          }
          tone={overdueCount > 0 ? 'danger' : undefined}
        />
        <KPIStat
          icon={<IconTimeline size={18} />}
          label="Near CCM threshold"
          value={props.thresholdsLoading ? '—' : String(props.approachingThresholdCount)}
          sub={
            props.thresholdsLoading ? (
              <span>Loading caseload…</span>
            ) : props.totalBillingRows === 0 ? (
              <span>No billable members this month.</span>
            ) : props.approachingThresholdCount === 0 ? (
              <>
                <SubAccent tone="info">0 approaching</SubAccent>
                <span>of {props.totalBillingRows} · open dashboard</span>
              </>
            ) : (
              <>
                <SubAccent tone="warn">{props.approachingThresholdCount} approaching</SubAccent>
                <span>of {props.totalBillingRows} · open dashboard</span>
              </>
            )
          }
          tone={props.approachingThresholdCount > 0 ? 'warn' : undefined}
          onClick={() => props.onNavigate('/billing-dashboard')}
        />
      </div>

      {/* Today's schedule */}
      <Section title="Today's schedule" subtitle="Geofenced reminders fire 30m before · in-home routes optimized for traffic">
        {scheduleEntries.length === 0 ? (
          <Empty label="Clear day. Nothing scheduled." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scheduleEntries.map((e) => (
              <ScheduleRowV2
                key={e.appointmentId ?? `${e.time}-${e.member}`}
                entry={e}
                onOpen={() => props.onOpenAppointment(e.appointmentId, e.patientId)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Tasks */}
      <Section
        title="Tasks"
        subtitle="Auto-created from triggers (SDoH thresholds, sequence rules) plus your manual tasks"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={props.onNewTask}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 12px',
                borderRadius: 8,
                border: `1px solid ${COLOR_BORDER}`,
                background: '#fff',
                color: COLOR_INK_2,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <IconPlus size={12} /> New task
            </button>
            <FilterChipPair
              chips={[
                { label: 'Overdue', count: overdueCount, active: true, tone: 'danger', icon: <IconAlertOctagon size={12} /> },
                { label: 'Due today', count: dueCount },
              ]}
            />
          </div>
        }
      >
        {allTasks.length === 0 ? (
          <Empty label="No tasks waiting." />
        ) : (
          <div
            style={{
              background: '#fff',
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: 15,
              overflow: 'hidden',
            }}
          >
            {allTasks.map((row) => (
              <TaskRowV2
                key={row.id}
                row={row}
                onOpen={() => props.onOpenTask(row.id)}
                onOpenPatient={() => row.patientId && props.onOpenPatient(row.patientId)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Billing thresholds — duplicates the table from BillingDashboardPage so
          the CHW can see, without leaving Today, which patients still need
          time logged this month. Sorted by minutes-still-needed (descending)
          so the most-urgent members appear first. */}
      <Section
        title="Billable time needed"
        subtitle="Sorted by minutes still needed to hit this month's CCM/CHI threshold"
      >
        <BillingThresholdsTable
          rows={props.billingRows}
          loading={props.thresholdsLoading}
          onNavigate={props.onNavigate}
        />
      </Section>
    </div>
  );
}

function BillingThresholdsTable({
  rows,
  loading,
  onNavigate,
}: {
  rows: BillingTotalRow[];
  loading: boolean;
  onNavigate: (path: string) => void;
}): JSX.Element {
  if (loading) {
    return <Empty label="Loading billing totals…" />;
  }
  if (rows.length === 0) {
    return <Empty label="No patients with billable activity this month." />;
  }
  // Most-needy first: highest (threshold - logged) at the top. Patients who
  // already hit their threshold drop to the bottom; alphabetical within ties.
  const sorted = [...rows].sort((a, b) => {
    const remainA = Math.max(0, a.threshold - a.totalMinutes);
    const remainB = Math.max(0, b.threshold - b.totalMinutes);
    if (remainB !== remainA) return remainB - remainA;
    return a.patientName.localeCompare(b.patientName);
  });
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 15,
        overflow: 'hidden',
      }}
    >
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Patient</Table.Th>
            <Table.Th>Program</Table.Th>
            <Table.Th>Minutes This Month</Table.Th>
            <Table.Th>Threshold</Table.Th>
            <Table.Th>Minutes Needed</Table.Th>
            <Table.Th>Progress</Table.Th>
            <Table.Th>Suggested CPT</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((row) => {
            const remaining = Math.max(0, row.threshold - row.totalMinutes);
            const status = getStatusLabel(row.progress);
            return (
              <Table.Tr
                key={`${row.patientId}-${row.program}`}
                role="link"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={() => row.patientId && onNavigate(`/members/${row.patientId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && row.patientId) {
                    onNavigate(`/members/${row.patientId}`);
                  }
                }}
              >
                <Table.Td fw={500}>{row.patientName}</Table.Td>
                <Table.Td>
                  <Badge variant="light" size="sm">
                    {row.program}
                  </Badge>
                </Table.Td>
                <Table.Td>{row.totalMinutes} min</Table.Td>
                <Table.Td>{row.threshold} min</Table.Td>
                <Table.Td fw={600} c={remaining === 0 ? 'green' : remaining > 30 ? 'red' : 'orange'}>
                  {remaining === 0 ? '—' : `${remaining} min`}
                </Table.Td>
                <Table.Td w={180}>
                  <Progress value={row.progress} color={getProgressColor(row.progress)} size="lg" w={120} />
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={row.suggestedCpt !== '—' ? 'blue' : 'gray'}>
                    {row.suggestedCpt}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={status.color}>{status.label}</Badge>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

/* ─────── Helpers ─────── */

function Chip({
  tone = 'slate',
  dot,
  children,
}: {
  tone?: 'brand' | 'warn' | 'info' | 'slate';
  dot?: boolean;
  children: ReactNode;
}): JSX.Element {
  const tones = {
    brand: { bg: COLOR_BRAND_TINT, fg: 'var(--wc-primary-700, #B84E1A)', dot: COLOR_BRAND },
    warn: { bg: COLOR_DANGER_TINT, fg: 'var(--wc-error-700, #A73304)', dot: COLOR_DANGER },
    info: { bg: COLOR_TEAL_BG, fg: COLOR_TEAL_FG, dot: 'var(--wc-success-500, #2F8A89)' },
    slate: { bg: COLOR_SURFACE_SUBTLE, fg: COLOR_FG_MUTE, dot: COLOR_FG_HELP },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 14,
        background: t.bg,
        color: t.fg,
        fontFamily: 'Inter',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: t.dot }} />}
      {children}
    </span>
  );
}

function RibbonButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        borderRadius: 8,
        border: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        color: COLOR_INK_2,
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function KPIStat({
  icon,
  label,
  value,
  sub,
  tone,
  muted,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** Accepts a string OR JSX so callers can split into a colored accent + grey trailing. */
  sub: ReactNode;
  tone?: 'danger' | 'warn';
  muted?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const accent = tone === 'danger' ? COLOR_DANGER : tone === 'warn' ? COLOR_BRAND : COLOR_INK_2;
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        background: muted ? COLOR_SURFACE_SUBTLE : '#fff',
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 15,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: muted ? 0.85 : 1,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color .12s ease, box-shadow .12s ease',
      }}
      onMouseEnter={
        interactive
          ? (e) => {
              e.currentTarget.style.borderColor = COLOR_BRAND;
              e.currentTarget.style.boxShadow = '0 1px 6px rgba(234,100,36,0.12)';
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.style.borderColor = COLOR_BORDER;
              e.currentTarget.style.boxShadow = 'none';
            }
          : undefined
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLOR_FG_MUTE }}>
        {icon}
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.055em',
            textTransform: 'uppercase',
            lineHeight: 1,
            color: COLOR_FG_HELP,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 31,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: accent,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: 400,
          color: COLOR_FG_HELP,
          lineHeight: '16px',
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          columnGap: 8,
          rowGap: 2,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function SubAccent({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'brand' | 'success' | 'danger' | 'warn' | 'info';
}): JSX.Element {
  const color =
    tone === 'brand' ? COLOR_BRAND
    : tone === 'success' ? COLOR_TEAL_FG
    : tone === 'danger' ? COLOR_DANGER
    : tone === 'warn' ? COLOR_BRAND
    : COLOR_INK_2;
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        color,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2
            style={{
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 19,
              color: COLOR_INK,
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: COLOR_FG_HELP, marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function FilterChipPair({
  chips,
}: {
  chips: { label: string; count: number; active?: boolean; tone?: 'danger'; icon?: ReactNode }[];
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {chips.map((c) => (
        <span
          key={c.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 14,
            border: `1px solid ${c.active ? COLOR_BRAND_BORDER : COLOR_BORDER}`,
            background: c.active ? COLOR_BRAND_TINT : '#fff',
            color: c.active ? 'var(--wc-primary-700, #B84E1A)' : COLOR_INK_2,
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {c.icon}
          {c.label}
          {c.count > 0 && (
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: '0 6px',
                borderRadius: 9,
                background: c.tone === 'danger' ? COLOR_DANGER : COLOR_INK_2,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {c.count}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function ScheduleRowV2({ entry, onOpen }: { entry: ScheduleEntry; onOpen: () => void }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '88px 32px 1fr auto',
        gap: 14,
        padding: '14px 16px',
        alignItems: 'center',
        background: entry.isNext ? COLOR_BRAND_TINT : '#fff',
        border: `1px solid ${entry.isNext ? COLOR_BRAND_BORDER : COLOR_BORDER}`,
        borderRadius: 12,
      }}
    >
      <div>
        <div style={{ fontFamily: 'var(--font-mono, Inter, system-ui, sans-serif)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 15, color: COLOR_INK }}>
          {entry.time}
        </div>
        <div style={{ fontSize: 11, color: COLOR_FG_HELP }}>{entry.duration}</div>
      </div>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: entry.isNext ? '#fff' : COLOR_SURFACE_SUBTLE,
          color: COLOR_INK_2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {entry.type.toLowerCase().includes('phone') ? <IconPhone size={16} /> : <IconHome size={16} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: COLOR_INK }}>{entry.member}</span>
          {entry.isNext && <Chip tone="brand" dot>Up next</Chip>}
          <span style={{ fontSize: 12, color: COLOR_FG_MUTE }}>· {entry.type}</span>
        </div>
        {entry.memberMeta && <div style={{ fontSize: 12, color: COLOR_FG_HELP }}>{entry.memberMeta}</div>}
        {entry.location && <div style={{ fontSize: 12, color: COLOR_FG_MUTE, marginTop: 2 }}>{entry.location}</div>}
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 12px',
          borderRadius: 8,
          border: 'none',
          background: entry.isNext ? COLOR_BRAND : '#fff',
          color: entry.isNext ? '#fff' : COLOR_INK_2,
          fontFamily: 'Inter',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: entry.isNext ? 'none' : `inset 0 0 0 1px ${COLOR_BORDER}`,
        }}
      >
        {entry.isNext ? 'Open intake' : 'Open'}
        <IconArrowRight size={12} />
      </button>
    </div>
  );
}

function TaskRowV2({
  row,
  onOpen,
  onOpenPatient,
}: {
  row: TaskRow;
  onOpen: () => void;
  onOpenPatient: () => void;
}): JSX.Element {
  const toneFg =
    row.priority === 'overdue'
      ? 'var(--wc-error-700, #A73304)'
      : row.priority === 'high'
      ? 'var(--wc-warning-700, #C97800)'
      : COLOR_FG_MUTE;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto auto',
        gap: 14,
        alignItems: 'center',
        padding: '14px 18px',
        borderBottom: `1px solid ${COLOR_BORDER}`,
        opacity: row.done ? 0.55 : 1,
      }}
    >
      <div
        role="checkbox"
        aria-checked={row.done}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: `1.5px solid ${row.done ? 'var(--wc-success-500, #2F8A89)' : 'var(--wc-base-300, #D6DCDF)'}`,
          background: row.done ? 'var(--wc-success-500, #2F8A89)' : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {row.done && <IconCheck size={11} color="#fff" />}
      </div>
      <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLOR_INK,
            textDecoration: row.done ? 'line-through' : 'none',
          }}
        >
          {row.title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: toneFg,
            marginTop: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {row.priority === 'overdue' && <IconAlertOctagon size={11} />}
          {row.meta}
        </div>
      </div>
      {row.patientLabel && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPatient();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              background: COLOR_SURFACE_SUBTLE,
              color: COLOR_INK_2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {row.patientLabel.split(' ').slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || 'M'}
          </span>
          <span style={{ fontSize: 12, color: COLOR_FG_MUTE }}>{row.patientLabel}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open task"
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          border: 'none',
          background: 'transparent',
          color: COLOR_FG_HELP,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconChevronRight size={14} />
      </button>
    </div>
  );
}

function Empty({ label }: { label: string }): JSX.Element {
  return (
    <div
      style={{
        padding: 28,
        border: `1px dashed ${COLOR_BORDER}`,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: COLOR_FG_HELP,
      }}
    >
      <IconClock size={16} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Caseload rail for /today — port of the v2 chw-today.jsx left rail
// (TodayLeftRail). Self-contained: search input on top, scrollable
// "MY CASELOAD" list with patient name + meta (next-appointment or
// open-task summary) + colored status dot, then "QUICK FILTERS" chip
// row. /my-caseload (CaseloadPage) is intentionally untouched — this
// is a /today-only secondary rail.

import type { Appointment, Patient, Task } from '@medplum/fhirtypes';
import {
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconFileAlert,
  IconHeartHandshake,
  IconSearch,
  IconTrendingUp,
} from '@tabler/icons-react';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

const COLOR_INK = 'var(--wc-base-800, #012B49)';
const COLOR_INK_2 = 'var(--wc-base-700, #34556D)';
const COLOR_FG_MUTE = 'var(--wc-base-600, #506D85)';
const COLOR_FG_HELP = 'var(--wc-base-500, #8499AA)';
const COLOR_BORDER = 'var(--wc-base-200, #E2E6E9)';
const COLOR_SURFACE_SUBTLE = 'var(--wc-base-100, #F6F7F8)';
const COLOR_BRAND = 'var(--wc-primary-500, #EA6424)';
const COLOR_BRAND_TINT = 'var(--wc-primary-100, #FDEEE6)';
const COLOR_DANGER = 'var(--wc-error-600, #D1190D)';
const COLOR_WARN = 'var(--wc-warning-500, #F99D1C)';
const COLOR_INFO = 'var(--wc-info-500, #5AA8B8)';
const COLOR_SUCCESS = 'var(--wc-success-500, #2F8A89)';

type FilterKey = 'today' | 'overdue' | 'near-billing' | 'unsigned-poc' | 'open-sdoh';

interface CaseloadRow {
  patientId: string;
  name: string;
  meta: string;
  toneColor: string;
  filters: Set<FilterKey>;
}

export interface TodayCaseloadRailProps {
  patients: Patient[];
  appointments: Appointment[];
  tasks: Task[];
  todayISO: string;
  appointmentTime: (a: Appointment) => string;
}

const buildCaseloadRows = (
  patients: Patient[],
  appointments: Appointment[],
  tasks: Task[],
  todayISO: string,
  appointmentTime: (a: Appointment) => string
): CaseloadRow[] => {
  return patients
    .filter((p) => p.id)
    .map((p) => {
      const id = p.id ?? '';
      const ref = `Patient/${id}`;
      const name =
        `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() ||
        'Unnamed member';

      const apptToday = appointments.find(
        (a) =>
          a.status !== 'cancelled' &&
          a.start?.startsWith(todayISO) &&
          a.participant?.some((pp) => pp.actor?.reference === ref)
      );
      const memberTasks = tasks.filter((t) => t.for?.reference === ref);
      const overdueTasks = memberTasks.filter((t) => {
        if (t.status === 'completed') return false;
        const due = t.restriction?.period?.end?.slice(0, 10);
        return !!due && due < todayISO;
      });
      const unsignedPoCSignal = memberTasks.some((t) =>
        (t.code?.text ?? t.description ?? '').toLowerCase().includes('plan')
      );
      const sdohSignal = memberTasks.some((t) =>
        ((t.code?.text ?? '').toLowerCase().includes('sdoh') ||
          (t.description ?? '').toLowerCase().includes('sdoh'))
      );

      const filters = new Set<FilterKey>();
      if (apptToday) filters.add('today');
      if (overdueTasks.length > 0) filters.add('overdue');
      if (unsignedPoCSignal) filters.add('unsigned-poc');
      if (sdohSignal) filters.add('open-sdoh');

      let meta = '';
      let toneColor = COLOR_FG_HELP;
      if (apptToday) {
        meta = `Visit ${appointmentTime(apptToday)}`;
        toneColor = COLOR_BRAND;
      } else if (overdueTasks.length > 0) {
        meta = `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`;
        toneColor = COLOR_DANGER;
      } else if (memberTasks.length > 0) {
        meta = `${memberTasks.length} open task${memberTasks.length === 1 ? '' : 's'}`;
        toneColor = COLOR_INFO;
      } else if (p.meta?.lastUpdated) {
        const days = Math.floor(
          (Date.now() - new Date(p.meta.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
        );
        meta = days === 0 ? 'Updated today' : `Last touched ${days}d ago`;
        toneColor = days > 14 ? COLOR_FG_HELP : COLOR_SUCCESS;
      } else {
        meta = 'No recent activity';
      }

      return { patientId: id, name, meta, toneColor, filters };
    })
    .sort((a, b) => {
      // Today's visits first, then overdue, then by name.
      const aPriority = a.filters.has('today') ? 0 : a.filters.has('overdue') ? 1 : 2;
      const bPriority = b.filters.has('today') ? 0 : b.filters.has('overdue') ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.name.localeCompare(b.name);
    });
};

export function TodayCaseloadRail(props: TodayCaseloadRailProps): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);

  const allRows = useMemo(
    () =>
      buildCaseloadRows(
        props.patients,
        props.appointments,
        props.tasks,
        props.todayISO,
        props.appointmentTime
      ),
    [props.patients, props.appointments, props.tasks, props.todayISO, props.appointmentTime]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.meta.toLowerCase().includes(q)) return false;
      if (activeFilter && !r.filters.has(activeFilter)) return false;
      return true;
    });
  }, [allRows, search, activeFilter]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      today: 0,
      overdue: 0,
      'near-billing': 0,
      'unsigned-poc': 0,
      'open-sdoh': 0,
    };
    for (const r of allRows) {
      r.filters.forEach((f) => {
        c[f] += 1;
      });
    }
    return c;
  }, [allRows]);

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        padding: '20px 16px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        borderRight: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        minHeight: '100vh',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        overflowY: 'auto',
        maxHeight: '100vh',
      }}
    >
      {/* Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 12px',
          borderRadius: 18,
          border: `1px solid ${COLOR_BORDER}`,
          background: '#fff',
        }}
      >
        <IconSearch size={14} color={COLOR_FG_HELP} />
        <input
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Find member, case, task…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 14,
            color: COLOR_INK,
          }}
        />
      </div>

      {/* Caseload list */}
      <div>
        <Eyebrow>My caseload · {allRows.length}</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 10px', fontSize: 13, color: COLOR_FG_HELP }}>
              No members match.
            </div>
          ) : (
            filtered.map((row) => (
              <button
                key={row.patientId}
                type="button"
                onClick={() => navigate(`/members/${row.patientId}`)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLOR_SURFACE_SUBTLE;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: row.toneColor,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: COLOR_INK,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLOR_FG_HELP,
                      marginTop: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.meta}
                  </div>
                </div>
                <IconChevronRight size={12} color={COLOR_FG_HELP} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Quick filters */}
      <div>
        <Eyebrow>Quick filters</Eyebrow>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <FilterChip
            icon={<IconCalendar size={11} />}
            label="Today"
            count={counts.today}
            active={activeFilter === 'today'}
            onClick={() => setActiveFilter(activeFilter === 'today' ? null : 'today')}
          />
          <FilterChip
            icon={<IconClock size={11} />}
            label="Overdue"
            count={counts.overdue}
            active={activeFilter === 'overdue'}
            onClick={() => setActiveFilter(activeFilter === 'overdue' ? null : 'overdue')}
          />
          <FilterChip
            icon={<IconTrendingUp size={11} />}
            label="Near billing"
            count={counts['near-billing']}
            active={activeFilter === 'near-billing'}
            onClick={() => setActiveFilter(activeFilter === 'near-billing' ? null : 'near-billing')}
            disabled
          />
          <FilterChip
            icon={<IconFileAlert size={11} />}
            label="Unsigned PoC"
            count={counts['unsigned-poc']}
            active={activeFilter === 'unsigned-poc'}
            onClick={() => setActiveFilter(activeFilter === 'unsigned-poc' ? null : 'unsigned-poc')}
          />
          <FilterChip
            icon={<IconHeartHandshake size={11} />}
            label="Open SDoH"
            count={counts['open-sdoh']}
            active={activeFilter === 'open-sdoh'}
            onClick={() => setActiveFilter(activeFilter === 'open-sdoh' ? null : 'open-sdoh')}
          />
        </div>
      </div>
    </aside>
  );
}

function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: COLOR_FG_HELP,
        padding: '0 4px',
      }}
    >
      {children}
    </div>
  );
}

function FilterChip({
  icon,
  label,
  count,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 14,
        border: `1px solid ${active ? COLOR_BRAND : COLOR_BORDER}`,
        background: active ? COLOR_BRAND_TINT : '#fff',
        color: active ? 'var(--wc-primary-700, #B84E1A)' : COLOR_INK_2,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: '0 6px',
            borderRadius: 9,
            background: active ? COLOR_BRAND : COLOR_INK_2,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// Re-exported helpers in case the rail's filter logic is reused on
// /my-caseload — kept intentionally co-located here to avoid coupling
// the standalone caseload page to /today data fetch shape.
export { COLOR_BRAND as TODAY_RAIL_BRAND, COLOR_DANGER as TODAY_RAIL_DANGER, COLOR_INFO as TODAY_RAIL_INFO, COLOR_SUCCESS as TODAY_RAIL_SUCCESS, COLOR_WARN as TODAY_RAIL_WARN };

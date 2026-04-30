// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CMS Platform shell — port of Design v2 / ui_kits/cms_platform/app-shell.jsx.
// 60px white left rail, icon-only nav, slate/navy icons with a light-gray
// active pill, no global top bar. Role switcher and notification bell are
// folded into the avatar menu at the bottom of the rail so we keep the v2
// "no chrome" intent without losing the demo's role-flip moment.

import { Indicator, Menu, UnstyledButton } from '@mantine/core';
import { useMedplumProfile } from '@medplum/react';
import {
  IconActivity,
  IconAlertHexagon,
  IconBell,
  IconBriefcase2,
  IconCalendar,
  IconCash,
  IconChartHistogram,
  IconClipboardList,
  IconHome2,
  IconSearch,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useRole } from '../auth/RoleContext';
import { ROLE_LABELS, ROLES, type Permission, type Role } from '../auth/roles';
import { recordRoleChange } from '../auth/audit';

interface NavItem {
  id: string;
  label: string;
  href: string;
  Icon: typeof IconHome2;
  match?: (pathname: string) => boolean;
  badge?: number;
  /**
   * Hide the nav entry from roles that don't have the listed permission.
   * The role-switch demo on stage relies on this so Billing disappears for
   * CHW, Admin disappears for everyone except admins, etc.
   */
  requiresPermission?: Permission;
  /** Optional separator gap before this item, per v2's grouped rail. */
  separatorBefore?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/today', Icon: IconHome2, match: (p) => p === '/' || p.startsWith('/today') || p.startsWith('/getstarted') },
  {
    id: 'members',
    label: 'Members',
    href: '/my-caseload',
    Icon: IconSearch,
    match: (p) => p.startsWith('/my-caseload') || p.startsWith('/Patient') || p.startsWith('/members'),
    separatorBefore: true,
  },
  { id: 'queue', label: 'Caseload', href: '/my-tasks', Icon: IconBriefcase2, match: (p) => p.startsWith('/my-tasks') || p.startsWith('/Task') || p.startsWith('/signoff-queue') || p.startsWith('/review-submission') },
  { id: 'plans', label: 'Care plans', href: '/my-plans', Icon: IconClipboardList, match: (p) => p.startsWith('/my-plans') || p.startsWith('/plan-of-care') || p.startsWith('/plan-edit') || p.startsWith('/plan-review') || p.startsWith('/CarePlan'), requiresPermission: 'careplan.review' },
  { id: 'events', label: 'Events', href: '/my-schedule', Icon: IconCalendar, match: (p) => p.startsWith('/my-schedule') || p.startsWith('/Calendar') || p.startsWith('/encounters') },
  { id: 'billing', label: 'Billing', href: '/billing-dashboard', Icon: IconCash, match: (p) => p.startsWith('/billing'), requiresPermission: 'billing.view' },
  { id: 'referrals', label: 'Referrals', href: '/referrals', Icon: IconActivity, match: (p) => p.startsWith('/referrals') || p.startsWith('/eligibility') || p.startsWith('/sdoh') || p.startsWith('/time-tracking'), requiresPermission: 'referrals.manage' },
  { id: 'reports', label: 'Reports', href: '/admin/audit-log', Icon: IconChartHistogram, match: (p) => p.startsWith('/admin/audit-log'), requiresPermission: 'admin.roles' },
  { id: 'alerts', label: 'Alerts', href: '/alerts', Icon: IconAlertHexagon, match: (p) => p.startsWith('/alerts') },
  { id: 'admin', label: 'Admin', href: '/admin/roles', Icon: IconBell, match: (p) => p.startsWith('/integrations') || p.startsWith('/onboarding') || p.startsWith('/admin/roles') || p.startsWith('/admin/workflows'), requiresPermission: 'admin.roles', separatorBefore: true },
];

const RAIL_BG = '#FFFFFF';
const RAIL_BORDER = 'var(--wc-base-200, #E2E6E9)';
const ICON_IDLE = 'var(--wc-base-600, #506D85)';
const ICON_HOVER = 'var(--wc-base-800, #012B49)';
const ICON_ACTIVE = 'var(--wc-base-800, #012B49)';
const ACTIVE_BG = '#EEF1F3';
const HOVER_BG = 'var(--wc-base-100, #F6F7F8)';
const BADGE_BG = 'var(--wc-primary-500, #EA6424)';
const AVATAR_BG = 'var(--wc-primary-500, #EA6424)';

function LeftRail(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useRole();

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((it) => !it.requiresPermission || hasPermission(it.requiresPermission)),
    [hasPermission]
  );
  const activeId = useMemo(() => {
    const hit = visibleNav.find((n) => n.match?.(location.pathname));
    return hit?.id ?? 'home';
  }, [location.pathname, visibleNav]);

  return (
    <aside
      aria-label="Primary navigation"
      style={{
        width: 60,
        flexShrink: 0,
        background: RAIL_BG,
        borderRight: `1px solid ${RAIL_BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 0',
        position: 'sticky',
        top: 0,
        height: '100vh',
        gap: 0,
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/today')}
        title="Wider Circle"
        style={{
          marginBottom: 14,
          width: 38,
          height: 30,
          borderRadius: 8,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src="/wc-v2/wc-mark.svg" alt="Wider Circle" style={{ width: 26, height: 16, display: 'block' }} />
      </button>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
        {visibleNav.map((it) => {
          const sel = it.id === activeId;
          return (
            <RailButton
              key={it.id}
              selected={sel}
              label={it.label}
              separatorBefore={it.separatorBefore}
              onClick={() => navigate(it.href)}
            >
              <it.Icon size={22} stroke={sel ? 1.9 : 1.65} />
            </RailButton>
          );
        })}
      </nav>

      <ProfileMenu />
    </aside>
  );
}

function RailButton({
  children,
  label,
  selected,
  separatorBefore,
  onClick,
}: {
  children: ReactNode;
  label: string;
  selected?: boolean;
  separatorBefore?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <>
      {separatorBefore && <div style={{ height: 6 }} />}
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-current={selected ? 'page' : undefined}
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 12,
          border: 0,
          cursor: 'pointer',
          background: selected ? ACTIVE_BG : 'transparent',
          color: selected ? ICON_ACTIVE : ICON_IDLE,
          boxShadow: selected ? `inset 0 0 0 1px ${RAIL_BORDER}` : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background .12s ease, color .12s ease',
        }}
        onMouseEnter={(e) => {
          if (!selected) {
            e.currentTarget.style.color = ICON_HOVER;
            e.currentTarget.style.background = HOVER_BG;
          }
        }}
        onMouseLeave={(e) => {
          if (!selected) {
            e.currentTarget.style.color = ICON_IDLE;
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {children}
      </button>
    </>
  );
}

function ProfileMenu(): JSX.Element {
  const { role, setRole } = useRole();
  const profile = useMedplumProfile();
  const initials = useMemo(() => {
    const name = profile?.name?.[0];
    if (!name) return 'WC';
    const given = name.given?.[0]?.[0] ?? '';
    const family = name.family?.[0] ?? '';
    return `${given}${family}`.toUpperCase() || 'WC';
  }, [profile]);

  const onPick = (next: Role): void => {
    if (next === role) return;
    setRole(next);
    recordRoleChange({ from: role, to: next, actor: profile }).catch(() => undefined);
  };

  return (
    <Menu shadow="md" position="right-end" withinPortal offset={6}>
      <Menu.Target>
        <Indicator color="orange" size={8} offset={4} withBorder>
          <UnstyledButton
            aria-label="Account and role"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              background: AVATAR_BG,
              color: '#FFFFFF',
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 12,
              marginTop: 8,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials}
          </UnstyledButton>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Demo role</Menu.Label>
        {ROLES.map((r) => (
          <Menu.Item
            key={r}
            onClick={() => onPick(r)}
            color={r === role ? 'orange' : undefined}
          >
            {ROLE_LABELS[r]}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Label>Active role</Menu.Label>
        <Menu.Item disabled>{ROLE_LABELS[role]}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function WcShell({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    document.body.style.background = '#FFFFFF';
    return () => {
      document.body.style.background = '';
    };
  }, []);
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#FFFFFF',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'var(--wc-base-800, #012B49)',
      }}
    >
      <LeftRail />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

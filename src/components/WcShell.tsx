// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplumProfile } from '@medplum/react';
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconBell,
  IconBriefcase2,
  IconCalendar,
  IconCash,
  IconHome2,
  IconMessageCircle2,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface NavItem {
  id: string;
  label: string;
  href: string;
  Icon: typeof IconHome2;
  match?: (pathname: string) => boolean;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/today', Icon: IconHome2, match: (p) => p === '/' || p.startsWith('/today') || p.startsWith('/getstarted') },
  { id: 'queue', label: 'My queue', href: '/my-tasks', Icon: IconBriefcase2, match: (p) => p.startsWith('/my-tasks') || p.startsWith('/Task') || p.startsWith('/signoff-queue') || p.startsWith('/review-submission') },
  { id: 'members', label: 'Members', href: '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated', Icon: IconUsers, match: (p) => p.startsWith('/Patient') },
  { id: 'events', label: 'Events', href: '/my-schedule', Icon: IconCalendar, match: (p) => p.startsWith('/my-schedule') || p.startsWith('/Calendar') || p.startsWith('/encounters') },
  { id: 'messaging', label: 'Messaging', href: '/Communication', Icon: IconMessageCircle2, match: (p) => p.startsWith('/Communication') || p.startsWith('/Spaces') || p.startsWith('/Fax') },
  { id: 'billing', label: 'Billing', href: '/billing-dashboard', Icon: IconCash, match: (p) => p.startsWith('/billing') },
  { id: 'reporting', label: 'Reporting', href: '/eligibility', Icon: IconActivity, match: (p) => p.startsWith('/eligibility') || p.startsWith('/sdoh') || p.startsWith('/time-tracking') },
  { id: 'admin', label: 'Admin', href: '/integrations', Icon: IconAdjustmentsHorizontal, match: (p) => p.startsWith('/integrations') || p.startsWith('/onboarding') },
];

function LeftRail(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = useMemo(() => {
    const hit = NAV_ITEMS.find((n) => n.match?.(location.pathname));
    return hit?.id ?? 'home';
  }, [location.pathname]);

  return (
    <nav
      aria-label="Primary"
      style={{
        width: 72,
        background: 'var(--wc-base-700)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        gap: 4,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/today')}
        title="Wider Circle"
        style={{
          width: 40,
          height: 40,
          marginBottom: 12,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src="/wc-logo.svg" alt="Wider Circle" style={{ width: 34, height: 34 }} />
      </button>
      {NAV_ITEMS.map((it) => {
        const sel = it.id === activeId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => navigate(it.href)}
            title={it.label}
            style={{
              position: 'relative',
              width: 52,
              height: 52,
              borderRadius: 15,
              border: 0,
              cursor: 'pointer',
              background: sel ? 'rgba(242,115,33,0.15)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: sel ? 'var(--wc-brand-200)' : 'rgba(255,255,255,0.6)',
              transition: 'background .15s, color .15s',
            }}
            onMouseEnter={(e) => {
              if (!sel) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }
            }}
            onMouseLeave={(e) => {
              if (!sel) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <it.Icon size={22} stroke={sel ? 2.2 : 1.8} />
            {sel && (
              <span
                style={{
                  position: 'absolute',
                  left: -12,
                  top: 14,
                  bottom: 14,
                  width: 3,
                  borderRadius: '0 3px 3px 0',
                  background: 'var(--wc-brand-500)',
                }}
              />
            )}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <ProfileDot />
    </nav>
  );
}

function ProfileDot(): JSX.Element {
  const profile = useMedplumProfile();
  const initials = useMemo(() => {
    const name = profile?.name?.[0];
    if (!name) return 'WC';
    const given = name.given?.[0]?.[0] ?? '';
    const family = name.family?.[0] ?? '';
    return `${given}${family}`.toUpperCase() || 'WC';
  }, [profile]);
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--wc-brand-200)',
        color: 'var(--wc-base-700)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontFamily: 'Montserrat, system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      {initials}
    </div>
  );
}

function TopBar(): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/Patient?name=${encodeURIComponent(q)}`);
  };

  return (
    <div
      style={{
        height: 60,
        borderBottom: '1px solid var(--wc-base-200)',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <form onSubmit={onSubmit} style={{ flex: 1, maxWidth: 520, position: 'relative' }}>
        <IconSearch
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--wc-base-500)',
            pointerEvents: 'none',
          }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members, cases, events…  (⌘K)"
          style={{
            width: '100%',
            height: 38,
            border: '1px solid var(--wc-base-200)',
            borderRadius: 12,
            padding: '0 12px 0 36px',
            fontFamily: 'var(--wc-font-body, Inter, system-ui, sans-serif)',
            fontSize: 14,
            background: 'var(--wc-base-50)',
            outline: 'none',
            boxSizing: 'border-box',
            color: 'var(--wc-base-700)',
          }}
        />
      </form>
      <div style={{ flex: 1 }} />
      <RoleBadge />
      <button
        type="button"
        title="Notifications"
        style={{
          background: 'var(--wc-base-50)',
          border: '1px solid var(--wc-base-200)',
          borderRadius: 12,
          width: 38,
          height: 38,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <IconBell size={18} stroke={1.8} color="var(--wc-base-700)" />
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--wc-brand-500)',
            border: '2px solid #fff',
          }}
        />
      </button>
    </div>
  );
}

function RoleBadge(): JSX.Element {
  const profile = useMedplumProfile();
  const role = profile?.resourceType === 'Practitioner' ? 'CHW' : 'Wider Circle';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--wc-base-100, #F1F1EE)',
        color: 'var(--wc-base-700)',
        borderRadius: 30,
        fontWeight: 600,
        fontFamily: 'var(--wc-font-body, Inter, system-ui, sans-serif)',
        fontSize: 12,
        padding: '3px 10px',
        height: 22,
        lineHeight: 1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--wc-base-500, #95938E)',
        }}
      />
      {role} · Wider Circle
    </span>
  );
}

export function WcShell({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    document.body.style.background = 'var(--wc-surface-page, #fff)';
    return () => {
      document.body.style.background = '';
    };
  }, []);
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--wc-surface-page, #fff)',
      }}
    >
      <LeftRail />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-02 Member 360 — visual port of Design v2 / ui_kits/cms_platform/
// member-360.jsx. Three-column layout: 264px left member rail (bordered
// card), tabbed center column with unboxed sections (Overview by default),
// 280px right rail with SDoH flags + Upcoming events. The data plumbing
// stays in the parent MemberContextPage; this component is render-only.

import { Menu, UnstyledButton } from '@mantine/core';
import { calculateAgeString, formatHumanName } from '@medplum/core';
import type {
  AllergyIntolerance,
  CarePlan,
  Communication,
  Condition,
  Consent,
  Coverage,
  Encounter,
  HumanName,
  MedicationRequest,
  Patient,
  Task,
} from '@medplum/fhirtypes';
import {
  IconAlertTriangle,
  IconCalendar,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconDots,
  IconLayersIntersect,
  IconMessageCircle,
  IconNotes,
  IconPhone,
  IconShieldCheck,
  IconSignature,
  IconStethoscope,
  IconVideo,
} from '@tabler/icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import {
  ECM_BILLABLE_EXT,
  ECM_CHANNEL_EXT,
  ECM_CHANNELS,
  ECM_OUTCOME_EXT,
  ECM_OUTCOMES,
  type EcmStatus,
} from '../utils/ecm';

const COLOR_INK = 'var(--wc-base-800, #012B49)';
const COLOR_INK_2 = 'var(--wc-base-700, #34556D)';
const COLOR_FG_MUTE = 'var(--wc-base-600, #506D85)';
const COLOR_FG_HELP = 'var(--wc-base-500, #8499AA)';
const COLOR_BORDER = 'var(--wc-base-200, #E2E6E9)';
const COLOR_SURFACE_SUBTLE = 'var(--wc-base-100, #F6F7F8)';
const COLOR_BRAND = 'var(--wc-primary-500, #EA6424)';
const COLOR_BRAND_DEEP = 'var(--wc-primary-700, #B84E1A)';
const COLOR_BRAND_TINT = 'var(--wc-primary-100, #FDEEE6)';
const COLOR_BRAND_BORDER = 'var(--wc-primary-300, #F39A61)';
const COLOR_INFO_BG = 'var(--wc-info-300, #C7E8ED)';
const COLOR_INFO_FG = 'var(--wc-info-700, #015F5D)';
const COLOR_TEAL_BG = 'var(--wc-success-100, #DDF3F2)';
const COLOR_TEAL_FG = 'var(--wc-success-700, #015F5D)';
const COLOR_TEAL_DOT = 'var(--wc-success-500, #2F8A89)';
const COLOR_DANGER = 'var(--wc-error-600, #D1190D)';

export interface MemberContext360Props {
  patient: Patient;
  conditions: Condition[];
  medications: MedicationRequest[];
  allergies: AllergyIntolerance[];
  consents: Consent[];
  coverages: Coverage[];
  carePlans: CarePlan[];
  communications: Communication[];
  cases: Task[];
  fieldVisits: Encounter[];
  consentValid: boolean;
  riskTier: string | null;
  // CM-22 — ECM tracking surface. Optional so this component still renders
  // for non-ECM contexts; when present, the right rail shows the cap counter,
  // window remaining, consent status, and recent attempts with billable badges.
  ecmStatus?: EcmStatus;
  ecmAttempts?: Communication[];
  onPhoneAction: () => void;
  onMessageAction: () => void;
  onCalendarAction: () => void;
  moreActions: { label: string; onClick: () => void; icon?: ReactNode }[];
}

const fullName = (patient: Patient): string => {
  const usual = (patient.name?.find((n) => n.use === 'usual') ?? patient.name?.[0]) as HumanName | undefined;
  if (!usual) return 'Member';
  return formatHumanName(usual);
};

const initialsFor = (patient: Patient): string => {
  const name = patient.name?.[0];
  if (!name) return 'WC';
  const given = name.given?.[0]?.[0] ?? '';
  const family = name.family?.[0] ?? '';
  return `${given}${family}`.toUpperCase() || 'WC';
};

const demographicsLine = (patient: Patient): string => {
  const parts: string[] = [];
  const pronouns = patient.extension?.find(
    (e) => e.url === 'http://hl7.org/fhir/StructureDefinition/individual-pronouns'
  )?.valueString;
  if (pronouns) parts.push(pronouns);
  if (patient.birthDate) parts.push(calculateAgeString(patient.birthDate) ?? '');
  if (patient.birthDate) parts.push(`DOB ${patient.birthDate}`);
  return parts.filter(Boolean).join(' · ');
};

const primaryLanguageLabel = (patient: Patient): string => {
  const comm = patient.communication?.find((c) => c.preferred) ?? patient.communication?.[0];
  if (!comm) return '—';
  const txt = comm.language?.text ?? comm.language?.coding?.[0]?.display;
  return comm.preferred ? `${txt} (preferred)` : txt ?? '—';
};

const homeAddressLine = (patient: Patient): string => {
  const home = patient.address?.find((a) => a.use === 'home') ?? patient.address?.[0];
  if (!home) return '—';
  return [home.city, home.state, home.postalCode].filter(Boolean).join(' · ');
};

const phoneLine = (patient: Patient): string => {
  const tel = patient.telecom?.find((t) => t.system === 'phone' && t.rank === 1) ?? patient.telecom?.find((t) => t.system === 'phone');
  return tel?.value ?? '—';
};

const planLabel = (coverages: Coverage[]): { primary: string; sub?: string } => {
  const active = coverages.find((c) => c.status === 'active') ?? coverages[0];
  if (!active) return { primary: '—' };
  const name = active.payor?.[0]?.display ?? 'Plan';
  const planId = active.subscriberId ?? active.identifier?.[0]?.value;
  return { primary: name, sub: planId };
};

const recentInteractionSummary = (comms: Communication[]): string => {
  if (!comms.length) return 'No interactions';
  const c = comms[0];
  const when = c.sent ? new Date(c.sent) : null;
  if (!when) return 'Recently logged';
  const days = Math.floor((Date.now() - when.getTime()) / (1000 * 60 * 60 * 24));
  const label = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const channel = c.payload?.[0]?.contentString?.split('.')[0] ?? c.topic?.text ?? 'communication';
  return `${label} — ${channel.slice(0, 40)}`;
};

const overdueCaseCount = (cases: Task[]): number =>
  cases.filter((t) => t.status === 'requested' && t.priority === 'asap').length;

const conditionLabel = (c: Condition): string =>
  c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Untitled condition';

interface CaseRow {
  id?: string;
  title: string;
  ref: string;
  kind: string;
  ageLabel: string;
  ownerLabel: string;
  chip: { text: string; tone: 'amber' | 'teal' | 'slate' };
  status: string;
  stripe: string;
  task: Task;
}

const caseRowFromTask = (t: Task): CaseRow => {
  const stripe = t.priority === 'asap' ? '#D1190D' : t.priority === 'urgent' ? '#EA6424' : '#2F8A89';
  const ageLabel = (() => {
    if (!t.authoredOn) return '';
    const days = Math.floor((Date.now() - new Date(t.authoredOn).getTime()) / (1000 * 60 * 60 * 24));
    return `${days}d old`;
  })();
  const status =
    t.status === 'in-progress' ? 'In progress' : t.status === 'requested' ? 'Open' : t.status === 'completed' ? 'Resolved' : t.status === 'cancelled' ? 'Closed' : t.status ?? '—';
  return {
    id: t.id,
    task: t,
    title: t.code?.text ?? t.description ?? 'Case',
    ref: t.id ? `CS-${t.id.slice(0, 4).toUpperCase()}` : 'CS-—',
    kind:
      t.code?.coding?.[0]?.code === 'sdoh-referral' ? 'SDoH'
      : t.priority === 'asap' || t.priority === 'urgent' ? 'Clinical'
      : 'Case',
    ageLabel,
    ownerLabel: t.requester?.display ?? t.owner?.display ?? 'Unassigned',
    chip:
      t.priority === 'asap'
        ? { text: 'Overdue', tone: 'amber' }
        : t.status === 'completed'
        ? { text: 'Resolved', tone: 'teal' }
        : { text: 'On track', tone: 'teal' },
    status,
    stripe,
  };
};

interface SDoHFlag {
  name: string;
  since: string;
  severity: 'high' | 'med' | 'low';
}

const sdohFlagsFromCases = (cases: Task[]): SDoHFlag[] => {
  const sdohCases = cases.filter((t) => t.code?.coding?.[0]?.code === 'sdoh-referral' || (t.code?.text ?? '').toLowerCase().includes('sdoh') || (t.description ?? '').toLowerCase().includes('sdoh'));
  return sdohCases.slice(0, 4).map((t) => ({
    name: t.code?.text ?? t.description ?? 'SDoH need',
    since: t.authoredOn ? `since ${t.authoredOn.slice(0, 10)}` : '',
    severity: t.priority === 'asap' ? 'high' : t.priority === 'urgent' ? 'med' : 'low',
  }));
};

interface UpcomingEvent {
  title: string;
  when: string;
  sub?: string;
  rsvp?: string;
}

const upcomingEventsFromVisits = (visits: Encounter[]): UpcomingEvent[] =>
  visits.slice(0, 3).map((e) => ({
    title: e.type?.[0]?.text ?? e.serviceType?.text ?? 'Visit',
    when: e.period?.start ?? '',
    sub: e.location?.[0]?.location?.display,
  }));

export function MemberContext360View(props: MemberContext360Props): JSX.Element {
  const [tab, setTab] = useState<'Overview' | 'Activity' | 'Cases' | 'Clinical' | 'SDoH' | 'Events'>(
    'Overview'
  );

  const tabs: { k: typeof tab; n?: number }[] = [
    { k: 'Overview' },
    { k: 'Activity', n: props.communications.length },
    { k: 'Cases', n: props.cases.length },
    { k: 'Clinical' },
    { k: 'SDoH' },
    { k: 'Events', n: props.fieldVisits.length },
  ];

  const overdue = overdueCaseCount(props.cases);
  const lastContact = recentInteractionSummary(props.communications);
  const plan = planLabel(props.coverages);

  return (
    <div
      style={{
        padding: '40px 44px',
        display: 'flex',
        gap: 64,
        minHeight: '100%',
        background: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: COLOR_INK,
      }}
    >
      {/* LEFT — Member rail */}
      <aside
        style={{
          width: 264,
          flexShrink: 0,
          background: '#fff',
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 18,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          alignSelf: 'flex-start',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: COLOR_INFO_BG,
                color: COLOR_INFO_FG,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Montserrat, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {initialsFor(props.patient)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'Montserrat, system-ui, sans-serif',
                  fontWeight: 700,
                  fontSize: 15,
                  color: COLOR_INK,
                  lineHeight: '19px',
                }}
              >
                {fullName(props.patient)}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: COLOR_FG_HELP, marginTop: 2 }}>
                {demographicsLine(props.patient) || '—'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {props.riskTier && <PillTag dot={COLOR_BRAND} label={`Tier ${props.riskTier}`} />}
            <PillTag
              dot={props.consentValid ? COLOR_TEAL_DOT : COLOR_DANGER}
              label={props.consentValid ? 'Consent on file' : 'Consent missing'}
            />
            {overdue > 0 && <PillTag dot={COLOR_DANGER} label={`${overdue} overdue case${overdue === 1 ? '' : 's'}`} />}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <ActionButton primary onClick={props.onPhoneAction} icon={<IconPhone size={16} />} />
          <ActionButton onClick={props.onMessageAction} icon={<IconMessageCircle size={16} />} />
          <ActionButton onClick={props.onCalendarAction} icon={<IconCalendar size={16} />} />
          <Menu shadow="md" position="bottom-end" withinPortal>
            <Menu.Target>
              <UnstyledButton
                aria-label="More actions"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: `1px solid ${COLOR_BORDER}`,
                  cursor: 'pointer',
                  background: '#fff',
                  color: COLOR_FG_MUTE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconDots size={16} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {props.moreActions.map((a) => (
                <Menu.Item key={a.label} onClick={a.onClick} leftSection={a.icon}>
                  {a.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>

        <div style={{ background: COLOR_SURFACE_SUBTLE, borderRadius: 12, padding: 18 }}>
          <Eyebrow>Quick context</Eyebrow>
          <div style={{ fontSize: 12, lineHeight: '18px', color: COLOR_INK_2, marginTop: 8 }}>
            <div>
              <span style={{ color: COLOR_FG_HELP }}>Last contact:</span> {lastContact}
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ color: COLOR_FG_HELP }}>Active cases:</span> {props.cases.length}
              {overdue > 0 && (
                <>
                  {' · '}
                  <span style={{ color: COLOR_DANGER }}>{overdue} overdue</span>
                </>
              )}
            </div>
            <div style={{ marginTop: 2 }}>
              <span style={{ color: COLOR_FG_HELP }}>Active care plans:</span> {props.carePlans.length}
            </div>
          </div>
        </div>

        <div style={{ border: `1px solid ${COLOR_BORDER}`, borderRadius: 12, padding: 18 }}>
          <Eyebrow>Key clinical</Eyebrow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {props.conditions.length === 0 && (
              <span style={{ fontSize: 12, color: COLOR_FG_HELP }}>No active conditions on file.</span>
            )}
            {props.conditions.slice(0, 6).map((c) => (
              <span
                key={c.id}
                style={{
                  padding: '4px 10px',
                  borderRadius: 14,
                  border: `1px solid ${COLOR_BORDER}`,
                  fontFamily: 'Inter',
                  fontSize: 11,
                  fontWeight: 600,
                  color: COLOR_INK_2,
                  background: '#fff',
                }}
              >
                {conditionLabel(c)}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <MetaField
            label="Plan"
            value={
              <>
                <div>{plan.primary}</div>
                {plan.sub && (
                  <div style={{ fontFamily: 'Azeret Mono, monospace', color: COLOR_FG_HELP, fontSize: 10, marginTop: 2 }}>
                    {plan.sub}
                  </div>
                )}
              </>
            }
          />
          <MetaField label="Language" value={primaryLanguageLabel(props.patient)} />
          <MetaField label="Phone" value={phoneLine(props.patient)} />
          <MetaField label="Location" value={homeAddressLine(props.patient)} />
        </div>
      </aside>

      {/* MAIN — Tabs + Overview */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <TopTabs
          tabs={tabs.map((t) => ({ k: t.k, n: t.n }))}
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />

        {tab === 'Overview' && (
          <>
            {props.cases.some((t) => t.priority === 'asap') && (
              <NeedsAttention
                items={props.cases
                  .filter((t) => t.priority === 'asap')
                  .slice(0, 3)
                  .map((t) => ({
                    text: t.code?.text ?? t.description ?? 'Case needs follow-up',
                    action: 'Open',
                    onClick: () => undefined,
                  }))}
              />
            )}

            <Section title="Active cases" right={`View all (${props.cases.length})`}>
              {props.cases.length === 0 ? (
                <Empty label="No open cases for this member." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {props.cases.slice(0, 5).map(caseRowFromTask).map((row) => (
                    <CaseRowLite key={row.id} row={row} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Recent activity" right="View history">
              {props.communications.length === 0 ? (
                <Empty label="No recent interactions." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {props.communications.slice(0, 5).map((c) => (
                    <ActivityItem
                      key={c.id}
                      title={c.payload?.[0]?.contentString ?? c.topic?.text ?? 'Communication'}
                      meta={c.sent ?? ''}
                    />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {tab === 'Cases' && (
          <Section title="All cases" right={`${props.cases.length}`}>
            {props.cases.length === 0 ? (
              <Empty label="No cases." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {props.cases.map(caseRowFromTask).map((row) => (
                  <CaseRowLite key={row.id} row={row} />
                ))}
              </div>
            )}
          </Section>
        )}

        {tab === 'Activity' && (
          <Section title="Activity timeline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {props.communications.map((c) => (
                <ActivityItem
                  key={c.id}
                  title={c.payload?.[0]?.contentString ?? c.topic?.text ?? 'Communication'}
                  meta={c.sent ?? ''}
                />
              ))}
            </div>
          </Section>
        )}

        {tab === 'Clinical' && (
          <Section title="Clinical">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <SubBlock title="Active conditions" count={props.conditions.length}>
                <Bulleted items={props.conditions.map((c) => conditionLabel(c))} empty="No conditions" />
              </SubBlock>
              <SubBlock title="Medications" count={props.medications.length}>
                <Bulleted
                  items={props.medications.map(
                    (m) =>
                      m.medicationCodeableConcept?.text ??
                      m.medicationCodeableConcept?.coding?.[0]?.display ??
                      'Medication'
                  )}
                  empty="No active medications"
                />
              </SubBlock>
              <SubBlock title="Allergies" count={props.allergies.length}>
                <Bulleted
                  items={props.allergies.map((a) => a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Allergy')}
                  empty="No allergies on file"
                />
              </SubBlock>
              <SubBlock title="Consents" count={props.consents.length}>
                <Bulleted
                  items={props.consents.map(
                    (c) => `${c.category?.[0]?.text ?? 'Consent'} · ${c.status}`
                  )}
                  empty="No consents recorded"
                />
              </SubBlock>
            </div>
          </Section>
        )}

        {tab === 'SDoH' && (
          <Section title="SDoH & resources">
            <SDoHFlagsList flags={sdohFlagsFromCases(props.cases)} />
          </Section>
        )}

        {tab === 'Events' && (
          <Section title="Events & visits">
            <UpcomingEventsList events={upcomingEventsFromVisits(props.fieldVisits)} />
          </Section>
        )}
      </main>

      {/* RIGHT — ECM tracking + SDoH flags + Upcoming events */}
      <aside
        style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
          paddingTop: 48,
        }}
      >
        {props.ecmStatus && (
          <section>
            <RailHeading>ECM tracking</RailHeading>
            <EcmTrackingPanel status={props.ecmStatus} attempts={props.ecmAttempts ?? []} />
          </section>
        )}
        <section>
          <RailHeading>SDoH flags</RailHeading>
          <SDoHFlagsList flags={sdohFlagsFromCases(props.cases)} />
        </section>
        <section>
          <RailHeading>Upcoming events</RailHeading>
          <UpcomingEventsList events={upcomingEventsFromVisits(props.fieldVisits)} />
        </section>
      </aside>
    </div>
  );
}

/* ─────── helper components ─────── */

function PillTag({ dot, label }: { dot: string; label: string }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 14,
        border: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        fontFamily: 'Inter',
        fontSize: 11,
        fontWeight: 600,
        color: COLOR_INK_2,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 3, background: dot }} />
      {label}
    </span>
  );
}

function MetaField({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div>
      <div
        style={{
          fontFamily: 'Inter',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: COLOR_FG_HELP,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 600,
          color: COLOR_INK,
          marginTop: 4,
          lineHeight: '17px',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontFamily: 'Inter',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: COLOR_FG_HELP,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({
  primary,
  onClick,
  icon,
}: {
  primary?: boolean;
  onClick: () => void;
  icon: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: primary ? 1 : 'none',
        width: primary ? undefined : 38,
        height: 38,
        borderRadius: 12,
        border: primary ? 'none' : `1px solid ${COLOR_BORDER}`,
        background: primary ? COLOR_BRAND : '#fff',
        color: primary ? '#fff' : COLOR_FG_MUTE,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </button>
  );
}

function TopTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { k: string; n?: number }[];
  active: string;
  onChange: (k: string) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28, borderBottom: `1px solid ${COLOR_BORDER}` }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 28, flex: 'none' }}>
        {tabs.map((t) => {
          const on = t.k === active;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => onChange(t.k)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '10px 0',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'Inter',
                fontSize: 14,
                fontWeight: on ? 700 : 500,
                color: on ? COLOR_INK : COLOR_FG_MUTE,
              }}
            >
              <span>{t.k}</span>
              {typeof t.n === 'number' && t.n > 0 && (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 8px',
                    borderRadius: 11,
                    background: COLOR_INK_2,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {t.n}
                </span>
              )}
              {on && (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 3,
                    background: COLOR_BRAND,
                    borderRadius: 2,
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'Montserrat, system-ui, sans-serif', fontWeight: 700, fontSize: 17, color: COLOR_INK, margin: 0, letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        {right && (
          <a style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: COLOR_FG_MUTE, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {right}
            <IconChevronRight size={12} />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function NeedsAttention({ items }: { items: { text: string; action: string; onClick: () => void }[] }): JSX.Element {
  return (
    <div
      style={{
        border: `1px solid ${COLOR_BRAND_BORDER}`,
        background: COLOR_BRAND_TINT,
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
        <IconAlertTriangle size={18} color={COLOR_BRAND_DEEP} />
        <span style={{ fontFamily: 'Montserrat, system-ui, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--wc-primary-900, #652F06)' }}>
          Needs attention
        </span>
      </div>
      {items.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 0',
            borderTop: '1px solid #FBD5BA',
          }}
        >
          <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 12.5, color: COLOR_INK_2, lineHeight: '18px' }}>
            {r.text}
          </span>
          <button
            type="button"
            onClick={r.onClick}
            style={{
              flex: 'none',
              height: 28,
              padding: '0 14px',
              borderRadius: 14,
              background: '#fff',
              border: `1px solid ${COLOR_BORDER}`,
              cursor: 'pointer',
              fontFamily: 'Inter',
              fontSize: 11.5,
              fontWeight: 600,
              color: COLOR_INK_2,
            }}
          >
            {r.action}
          </button>
        </div>
      ))}
    </div>
  );
}

function CaseRowLite({ row }: { row: CaseRow }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: '#fff',
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        padding: 14,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: 2,
          background: row.stripe,
        }}
      />
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 10 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 13.5, fontWeight: 700, color: COLOR_INK }}>{row.title}</div>
        <div style={{ fontFamily: 'Inter', fontSize: 11.5, color: COLOR_FG_HELP, marginTop: 3 }}>
          <span style={{ fontFamily: 'Azeret Mono, monospace' }}>{row.ref}</span>
          {'  ·  '}
          {row.kind}
          {'  ·  '}
          {row.ageLabel}
          {'  ·  Owner: '}
          <span style={{ color: COLOR_FG_MUTE }}>{row.ownerLabel}</span>
        </div>
      </div>
      <StatusPill tone={row.chip.tone} text={row.chip.text} />
      <StatusPill tone="slate" text={row.status} />
      <IconChevronRight size={16} color="var(--wc-base-400, #A7B6C2)" />
    </div>
  );
}

function StatusPill({ tone, text }: { tone: 'amber' | 'teal' | 'slate'; text: string }): JSX.Element {
  const tones = {
    amber: { bg: COLOR_BRAND_TINT, fg: COLOR_BRAND_DEEP },
    teal: { bg: COLOR_TEAL_BG, fg: COLOR_TEAL_FG },
    slate: { bg: COLOR_SURFACE_SUBTLE, fg: COLOR_FG_MUTE },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        flex: 'none',
        padding: '4px 10px',
        borderRadius: 12,
        background: t.bg,
        color: t.fg,
        fontFamily: 'Inter',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

function ActivityItem({ title, meta }: { title: string; meta: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: COLOR_SURFACE_SUBTLE,
          color: COLOR_FG_MUTE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <IconMessageCircle size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 10,
            fontFamily: 'Inter',
            fontSize: 13,
            fontWeight: 700,
            color: COLOR_INK,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <span style={{ fontWeight: 500, fontSize: 11, color: COLOR_FG_HELP, flex: 'none' }}>
            {meta ? new Date(meta).toLocaleString() : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }): JSX.Element {
  return (
    <div
      style={{
        padding: 32,
        border: `1px dashed ${COLOR_BORDER}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        color: COLOR_FG_HELP,
        textAlign: 'center',
      }}
    >
      <IconLayersIntersect size={24} />
      <div style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

function RailHeading({ children }: { children: ReactNode }): JSX.Element {
  return (
    <h3
      style={{
        fontFamily: 'Montserrat, system-ui, sans-serif',
        fontWeight: 700,
        fontSize: 16,
        color: COLOR_INK,
        margin: 0,
        marginBottom: 14,
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h3>
  );
}

function SDoHFlagsList({ flags }: { flags: SDoHFlag[] }): JSX.Element {
  if (flags.length === 0) return <Empty label="No SDoH needs flagged." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {flags.map((f) => (
        <div key={f.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: f.severity === 'high' ? COLOR_DANGER : f.severity === 'med' ? COLOR_BRAND : 'var(--wc-warning-500, #F99D1C)',
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: COLOR_INK }}>{f.name}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: COLOR_FG_HELP, marginTop: 2 }}>{f.since}</div>
          </div>
          <span
            style={{
              flex: 'none',
              padding: '2px 10px',
              borderRadius: 10,
              background: f.severity === 'high' ? '#FCE4E2' : 'var(--wc-warning-100, #FEF5E5)',
              color: f.severity === 'high' ? '#B81100' : '#925200',
              fontFamily: 'Inter',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            {f.severity}
          </span>
        </div>
      ))}
    </div>
  );
}

function UpcomingEventsList({ events }: { events: UpcomingEvent[] }): JSX.Element {
  if (events.length === 0) return <Empty label="No upcoming events." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {events.map((e, i) => (
        <div
          key={i}
          style={{
            background: '#fff',
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: COLOR_INK }}>{e.title}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: COLOR_FG_HELP, marginTop: 4, lineHeight: '16px' }}>
            {e.when ? new Date(e.when).toLocaleString() : ''}
            {e.sub && (
              <>
                <br />· {e.sub}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EcmTrackingPanel({
  status,
  attempts,
}: {
  status: EcmStatus;
  attempts: Communication[];
}): JSX.Element {
  const capPct = status.cap > 0 ? Math.min(100, Math.round((status.billable / status.cap) * 100)) : 0;
  const windowDays = Math.max(
    1,
    Math.round((Date.parse(status.windowEnd) - Date.parse(status.windowStart)) / (24 * 3600 * 1000))
  );

  // CM-22 §UI — color states: green by default; orange ≥80% cap; red on cap
  // reached, window expired, or consent missing (since none of those leave
  // the next attempt billable).
  let toneLabel: string;
  let toneBg: string;
  let toneFg: string;
  let toneBar: string;
  if (!status.consentOnFile) {
    toneLabel = 'Consent missing';
    toneBg = '#FCE4E2';
    toneFg = '#B81100';
    toneBar = COLOR_DANGER;
  } else if (status.windowClosed) {
    toneLabel = 'Window closed';
    toneBg = '#FCE4E2';
    toneFg = '#B81100';
    toneBar = COLOR_DANGER;
  } else if (status.capReached) {
    toneLabel = 'Cap reached';
    toneBg = '#FCE4E2';
    toneFg = '#B81100';
    toneBar = COLOR_DANGER;
  } else if (capPct >= 80) {
    toneLabel = 'Approaching cap';
    toneBg = 'var(--wc-warning-100, #FEF5E5)';
    toneFg = '#925200';
    toneBar = 'var(--wc-warning-500, #F99D1C)';
  } else {
    toneLabel = 'On track';
    toneBg = COLOR_TEAL_BG;
    toneFg = COLOR_TEAL_FG;
    toneBar = COLOR_TEAL_DOT;
  }

  const recent = attempts.slice(0, 3);

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <span style={{ fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: COLOR_INK }}>
            {status.billable}
          </span>
          <span style={{ fontFamily: 'Inter', fontSize: 13, color: COLOR_FG_HELP, marginLeft: 4 }}>
            of {status.cap} billable
          </span>
        </div>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 10,
            background: toneBg,
            color: toneFg,
            fontFamily: 'Inter',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          {toneLabel}
        </span>
      </div>

      <div
        style={{
          height: 6,
          background: COLOR_SURFACE_SUBTLE,
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        <div style={{ height: '100%', width: `${capPct}%`, background: toneBar, transition: 'width 200ms' }} />
      </div>

      <div style={{ fontFamily: 'Inter', fontSize: 12, color: COLOR_FG_MUTE, lineHeight: '17px' }}>
        {status.windowClosed
          ? `Window closed ${new Date(status.windowEnd).toLocaleDateString()}`
          : `${status.daysRemaining} days remaining of ${windowDays}-day window`}
      </div>
      {(status.nonBillable > 0 || status.preConsentAttempts > 0) && (
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: COLOR_FG_HELP, marginTop: 4 }}>
          {status.nonBillable > 0 && `${status.nonBillable} non-billable`}
          {status.nonBillable > 0 && status.preConsentAttempts > 0 && ' · '}
          {status.preConsentAttempts > 0 && `${status.preConsentAttempts} pre-consent`}
        </div>
      )}

      {recent.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingTop: 12,
            marginTop: 12,
            borderTop: `1px solid ${COLOR_BORDER}`,
          }}
        >
          <Eyebrow>Recent attempts</Eyebrow>
          {recent.map((c) => {
            const channelCode = c.extension?.find((e) => e.url === ECM_CHANNEL_EXT)?.valueString;
            const outcomeCode = c.extension?.find((e) => e.url === ECM_OUTCOME_EXT)?.valueString;
            const billable = c.extension?.find((e) => e.url === ECM_BILLABLE_EXT)?.valueBoolean ?? false;
            const channelLabel = ECM_CHANNELS.find((ch) => ch.value === channelCode)?.label ?? channelCode ?? '—';
            const outcomeLabel = ECM_OUTCOMES.find((o) => o.value === outcomeCode)?.label ?? outcomeCode ?? '—';
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'Inter',
                      fontSize: 12,
                      fontWeight: 600,
                      color: COLOR_INK,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {outcomeLabel}
                  </div>
                  <div style={{ fontFamily: 'Inter', fontSize: 11, color: COLOR_FG_HELP }}>
                    {channelLabel}
                    {c.sent ? ` · ${new Date(c.sent).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <span
                  style={{
                    flex: 'none',
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: billable ? COLOR_TEAL_BG : COLOR_SURFACE_SUBTLE,
                    color: billable ? COLOR_TEAL_FG : COLOR_FG_MUTE,
                    fontFamily: 'Inter',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {billable ? 'Billable' : 'Non-billable'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubBlock({ title, count, children }: { title: string; count: number; children: ReactNode }): JSX.Element {
  return (
    <div style={{ border: `1px solid ${COLOR_BORDER}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Eyebrow>{title}</Eyebrow>
        <span style={{ fontFamily: 'Azeret Mono, monospace', fontSize: 11, color: COLOR_FG_HELP }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Bulleted({ items, empty }: { items: string[]; empty: string }): JSX.Element {
  if (items.length === 0) return <span style={{ fontSize: 12, color: COLOR_FG_HELP }}>{empty}</span>;
  return (
    <ul style={{ margin: 0, paddingLeft: 16, color: COLOR_INK_2, fontSize: 12, lineHeight: '18px' }}>
      {items.map((it) => (
        <li key={it}>{it}</li>
      ))}
    </ul>
  );
}

// Re-exported for convenience to keep the import surface stable.
export const MEMBER_CONTEXT_360_SECTIONS = {
  CaseRowLite,
  ActivityItem,
  PillTag,
  MetaField,
  Eyebrow,
  TopTabs,
  Section,
  Empty,
  SDoHFlagsList,
  UpcomingEventsList,
};

// Icons used by parent for action menu items.
export const MEMBER_CONTEXT_ICONS = {
  IconClipboardCheck,
  IconClock,
  IconNotes,
  IconShieldCheck,
  IconStethoscope,
  IconSignature,
  IconVideo,
};

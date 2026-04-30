// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CD-13 Plan of Care · Review & sign — visual port of
// Design v2/ui_kits/cms_platform/care-plan-review.jsx. Render-only;
// data + handlers come from PlanReviewPage.

import { calculateAgeString, formatDateTime } from '@medplum/core';
import type { CarePlan, Communication, Patient } from '@medplum/fhirtypes';
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboardList,
  IconDots,
  IconEdit,
  IconFileText,
  IconGitCompare,
    IconLink,
  IconMailForward,
  IconPencil,
  IconPlus,
  IconPrinter,
  IconSend,
  IconSignature,
  IconUsers,
  IconHierarchy,
} from '@tabler/icons-react';
import { type JSX, type ReactNode, useState } from 'react';
import { SignaturePad } from './SignaturePad';

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
const COLOR_INFO_TINT = 'var(--wc-info-100, #EAF7FA)';
const COLOR_INFO_FG = 'var(--wc-info-700, #015F5D)';
const COLOR_INFO_DOT = 'var(--wc-info-500, #5AA8B8)';
const COLOR_TEAL_BG = 'var(--wc-success-100, #DDF3F2)';
const COLOR_TEAL_FG = 'var(--wc-success-700, #015F5D)';
const COLOR_TEAL_DOT = 'var(--wc-success-500, #2F8A89)';
const COLOR_WARNING_TINT = '#FFF7E6';
const COLOR_WARNING_BORDER = '#F1C56A';
const COLOR_WARNING_FG = '#8B6508';

type SectionKey = 'problems' | 'goals' | 'interventions' | 'team' | 'consents';

export interface ReviewItemForView {
  id: string;
  title: string;
  description?: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'cancelled' | 'on-hold';
  ownerLabel: string;
}

export interface PlanReview360Props {
  plan: CarePlan | undefined;
  patient: Patient | undefined;
  items: ReviewItemForView[];
  versionHistory: CarePlan[];
  acks: Communication[];
  reviewState: 'draft' | 'submitted' | 'approved' | 'revision-requested';
  alreadyAcked: boolean;
  canSignAsProvider: boolean;
  acking: boolean;
  signatureDataUrl: string | null;
  setSignatureDataUrl: (data: string | null) => void;
  ackThisPlan: () => void;
  onCompareV3: () => void;
}

function memberIdentity(patient: Patient | undefined, plan: CarePlan | undefined): string {
  if (plan?.subject?.display) return plan.subject.display;
  if (patient?.name?.[0]) {
    const n = patient.name[0];
    return `${n.given?.[0] ?? ''} ${n.family ?? ''}`.trim() || 'Member';
  }
  return 'Member';
}

function memberMeta(patient: Patient | undefined): string {
  if (!patient) return '';
  const parts: string[] = [];
  if (patient.birthDate) parts.push(calculateAgeString(patient.birthDate) ?? '');
  if (patient.gender) parts.push(patient.gender.charAt(0).toUpperCase());
  if (patient.id) parts.push(`MRN ${patient.id.slice(0, 8).toUpperCase()}`);
  return parts.filter(Boolean).join(' · ');
}

function memberInitials(patient: Patient | undefined): string {
  const n = patient?.name?.[0];
  const given = n?.given?.[0]?.[0] ?? '';
  const family = n?.family?.[0] ?? '';
  return `${given}${family}`.toUpperCase() || 'M';
}

const STATUS_PALETTE: Record<ReviewItemForView['status'], { tone: 'info' | 'warn' | 'slate'; label: string }> = {
  'not-started': { tone: 'slate', label: 'open' },
  'in-progress': { tone: 'warn', label: 'in progress' },
  completed: { tone: 'info', label: 'resolved' },
  cancelled: { tone: 'slate', label: 'cancelled' },
  'on-hold': { tone: 'slate', label: 'on hold' },
};

export function PlanReview360View(props: PlanReview360Props): JSX.Element {
  const [section, setSection] = useState<SectionKey>('problems');

  const sections: { k: SectionKey; label: string; icon: ReactNode; n: number; sub: string }[] = [
    { k: 'problems', label: 'Action items', icon: <IconClipboardList size={16} />, n: props.items.length, sub: 'status flows through CD-14' },
    { k: 'goals', label: 'Goals & outcomes', icon: <IconHierarchy size={16} />, n: 0, sub: 'pending CD-08 §goals' },
    { k: 'interventions', label: 'Interventions', icon: <IconHierarchy size={16} />, n: 0, sub: 'auto from triggers' },
    { k: 'team', label: 'Care team', icon: <IconUsers size={16} />, n: 0, sub: '— external' },
    { k: 'consents', label: 'Consents & signatures', icon: <IconSignature size={16} />, n: props.acks.length, sub: props.alreadyAcked ? 'CHW signed' : 'awaiting CHW' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: COLOR_INK,
      }}
    >
      {/* Header */}
      <PlanHeader
        plan={props.plan}
        patient={props.patient}
        version={props.versionHistory.length}
        reviewState={props.reviewState}
        onCompareV3={props.onCompareV3}
      />

      {/* Body: 3 columns */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <PlanLeftRail
          version={props.versionHistory.length}
          versions={props.versionHistory}
          sections={sections}
          activeSection={section}
          onSectionChange={setSection}
        />

        <main style={{ flex: 1, minWidth: 0, padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 24, overflow: 'auto' }}>
          <PlanMainHeader
            patientName={memberIdentity(props.patient, props.plan)}
            changesSinceV3={props.versionHistory.length >= 2 ? Math.max(1, props.items.length - (props.versionHistory[1]?.activity?.length ?? 0)) : 0}
            reviewState={props.reviewState}
          />
          <Stepper currentIndex={1} steps={['Generated', 'CHW review', 'Provider sign', 'Member sign', 'Finalized']} />

          {section === 'problems' && <ProblemsSection items={props.items} />}
          {section !== 'problems' && (
            <EmptyTab label={sections.find((s) => s.k === section)?.label ?? section} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ─────── Header ─────── */

function PlanHeader({
  plan,
  patient,
  version,
  reviewState,
  onCompareV3,
}: {
  plan: CarePlan | undefined;
  patient: Patient | undefined;
  version: number;
  reviewState: PlanReview360Props['reviewState'];
  onCompareV3: () => void;
}): JSX.Element {
  const stateLabel =
    reviewState === 'submitted' ? 'AWAITING PROVIDER'
    : reviewState === 'approved' ? 'APPROVED'
    : reviewState === 'revision-requested' ? 'REVISION REQUESTED'
    : 'DRAFT';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 28px',
        borderBottom: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_BRAND }} />
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.06em',
            color: COLOR_BRAND_DEEP,
            textTransform: 'uppercase',
          }}
        >
          Plan of Care · {stateLabel}
        </span>
      </div>

      {patient && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: COLOR_INK_2,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {memberInitials(patient)}
          </span>
          <span
            style={{
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 14,
              color: COLOR_INK,
            }}
          >
            {memberIdentity(patient, plan)}
            {memberMeta(patient) && (
              <span style={{ color: COLOR_FG_MUTE, fontWeight: 500 }}> · {memberMeta(patient)}</span>
            )}
          </span>
        </div>
      )}

      <Chip tone="info">ECM</Chip>
      <Chip tone="brand" dot>
        Plan of Care v{version} · {stateLabel}
      </Chip>

      {plan?.meta?.lastUpdated && (
        <span
          style={{
            fontFamily: 'Azeret Mono, monospace',
            fontSize: 11,
            color: COLOR_FG_MUTE,
            marginLeft: 4,
          }}
        >
          regenerated {formatDateTime(plan.meta.lastUpdated)}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <HeaderButton onClick={onCompareV3} icon={<IconGitCompare size={14} />} disabled={version < 2}>
        Compare to v{Math.max(1, version - 1)}
      </HeaderButton>
      <HeaderButton onClick={() => undefined} icon={<IconPrinter size={14} />} disabled>
        Preview PDF
      </HeaderButton>
      <HeaderButton onClick={() => undefined} icon={<IconFileText size={14} />} disabled>
        Save draft
      </HeaderButton>
    </div>
  );
}

function HeaderButton({
  children,
  icon,
  disabled,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
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
        height: 32,
        padding: '0 12px',
        borderRadius: 8,
        border: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        color: disabled ? COLOR_FG_HELP : COLOR_INK_2,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─────── Left rail ─────── */

function PlanLeftRail({
  version,
  versions,
  sections,
  activeSection,
  onSectionChange,
}: {
  version: number;
  versions: CarePlan[];
  sections: { k: SectionKey; label: string; icon: ReactNode; n: number; sub: string }[];
  activeSection: SectionKey;
  onSectionChange: (k: SectionKey) => void;
}): JSX.Element {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        padding: '20px 14px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        overflowY: 'auto',
      }}
    >
      <Eyebrow style={{ padding: '0 6px' }}>Plan of Care · v{version}</Eyebrow>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map((s) => {
          const on = s.k === activeSection;
          return (
            <button
              key={s.k}
              type="button"
              onClick={() => onSectionChange(s.k)}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 10px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                background: on ? COLOR_BRAND_TINT : 'transparent',
                textAlign: 'left',
              }}
            >
              <span style={{ color: on ? COLOR_BRAND_DEEP : COLOR_FG_MUTE, display: 'flex' }}>{s.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: on ? 700 : 600, color: COLOR_INK }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 10, color: COLOR_FG_HELP, marginTop: 1 }}>{s.sub}</div>}
              </div>
              <span
                style={{
                  minWidth: 22,
                  padding: '2px 6px',
                  borderRadius: 11,
                  background: on ? '#fff' : COLOR_BORDER,
                  color: on ? COLOR_BRAND_DEEP : COLOR_FG_MUTE,
                  fontFamily: 'Azeret Mono, monospace',
                  fontSize: 10,
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {s.n}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <Eyebrow style={{ padding: '0 6px', marginBottom: 8 }}>Version history</Eyebrow>
        {versions.length === 0 ? (
          <div style={{ padding: '8px 10px', fontSize: 11, color: COLOR_FG_HELP }}>No versions yet.</div>
        ) : (
          versions.map((v, idx) => {
            const num = versions.length - idx;
            const isLatest = idx === 0;
            return (
              <div
                key={v.id ?? idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  background: isLatest ? COLOR_SURFACE_SUBTLE : 'transparent',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Azeret Mono, monospace',
                    fontSize: 11,
                    fontWeight: 700,
                    color: COLOR_INK,
                    width: 24,
                  }}
                >
                  v{num}
                </span>
                <span style={{ fontSize: 11, color: COLOR_FG_MUTE, flex: 1 }}>
                  {v.meta?.lastUpdated ? new Date(v.meta.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                </span>
                {isLatest && v.status !== 'completed' ? (
                  <Chip tone="brand" dot small>
                    DRAFT
                  </Chip>
                ) : (
                  <Chip tone="info" small>
                    signed
                  </Chip>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

/* ─────── Main column ─────── */

function PlanMainHeader({
  patientName,
  changesSinceV3,
  reviewState,
}: {
  patientName: string;
  changesSinceV3: number;
  reviewState: PlanReview360Props['reviewState'];
}): JSX.Element {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1
            style={{
              fontFamily: 'Montserrat, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 22,
              color: COLOR_INK,
              margin: 0,
            }}
          >
            Plan of Care · Review &amp; sign
          </h1>
          <div style={{ fontSize: 13, color: COLOR_FG_MUTE, marginTop: 4 }}>
            Auto-generated from latest assessment + clinical history for {patientName}
            {changesSinceV3 > 0 && ` · ${changesSinceV3} change${changesSinceV3 === 1 ? '' : 's'} since previous version`}
          </div>
        </div>
        <Chip tone="brand" dot>
          {reviewState === 'submitted'
            ? 'Awaiting Provider sign-off'
            : reviewState === 'approved'
            ? 'Signed & finalized'
            : reviewState === 'revision-requested'
            ? 'Revision requested by Provider'
            : 'Awaiting CHW review & member sign'}
        </Chip>
      </div>
    </div>
  );
}

function Stepper({ steps, currentIndex }: { steps: string[]; currentIndex: number }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((label, i) => {
        const past = i < currentIndex;
        const current = i === currentIndex;
        const dotBg = past ? COLOR_TEAL_DOT : current ? COLOR_BRAND : COLOR_BORDER;
        const dotIcon = past ? '✓' : null;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i === steps.length - 1 ? 'none' : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  background: past ? COLOR_TEAL_DOT : current ? '#fff' : COLOR_SURFACE_SUBTLE,
                  border: current ? `2px solid ${COLOR_BRAND}` : `1px solid ${COLOR_BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {dotIcon ?? <span style={{ width: 10, height: 10, borderRadius: 5, background: dotBg }} />}
              </span>
              <span style={{ fontSize: 11, fontWeight: current ? 700 : 500, color: current ? COLOR_INK : COLOR_FG_MUTE }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: past ? COLOR_TEAL_DOT : COLOR_BORDER,
                  margin: '0 8px',
                  marginBottom: 18,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProblemsSection({ items }: { items: ReviewItemForView[] }): JSX.Element {
  return (
    <section>
      <SectionTitle
        title="Action items"
        subtitle="Tasks the care team commits to. Auto-pulled from triggers + manual; edit via CD-14 plan editing."
        right={
          <button
            type="button"
            disabled
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              padding: '0 12px',
              borderRadius: 8,
              border: `1px solid ${COLOR_BORDER}`,
              background: '#fff',
              color: COLOR_FG_HELP,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'not-allowed',
            }}
            title="Add via /plan-edit (CD-14)"
          >
            <IconPlus size={12} />
            Add action item
          </button>
        }
      />
      <div
        style={{
          background: '#fff',
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 15,
          overflow: 'hidden',
        }}
      >
        {items.length === 0 ? (
          <div style={{ padding: 32, color: COLOR_FG_HELP, textAlign: 'center', fontSize: 13 }}>
            No items on this plan.
          </div>
        ) : (
          items.map((item) => <ProblemRow key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

function ProblemRow({ item }: { item: ReviewItemForView }): JSX.Element {
  const palette = STATUS_PALETTE[item.status];
  const isResolved = item.status === 'completed' || item.status === 'cancelled';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr auto',
        gap: 18,
        alignItems: 'flex-start',
        padding: '14px 18px',
        borderBottom: `1px solid ${COLOR_BORDER}`,
      }}
    >
      <div>
        <div style={{ fontFamily: 'Azeret Mono, monospace', fontSize: 13, fontWeight: 700, color: COLOR_INK }}>
          {item.id.slice(0, 6).toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: COLOR_FG_HELP, marginTop: 2 }}>Item</div>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLOR_INK,
              textDecoration: isResolved ? 'line-through' : 'none',
            }}
          >
            {item.title}
          </span>
          <Chip tone={palette.tone} dot={!isResolved}>
            {palette.label}
          </Chip>
          {item.ownerLabel && <span style={{ fontSize: 11, color: COLOR_FG_HELP }}>· owner {item.ownerLabel}</span>}
        </div>
        {item.description && (
          <div style={{ fontSize: 11, color: COLOR_FG_MUTE, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconLink size={11} />
            {item.description}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <IconButton icon={<IconEdit size={14} />} />
        <IconButton icon={<IconDots size={14} />} />
      </div>
    </div>
  );
}

function EmptyTab({ label }: { label: string }): JSX.Element {
  return (
    <div
      style={{
        padding: 60,
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
      <IconHierarchy size={28} />
      <div style={{ fontFamily: 'Montserrat, system-ui, sans-serif', fontWeight: 700, fontSize: 15, color: COLOR_INK }}>
        {label}
      </div>
      <div style={{ fontSize: 12 }}>This section will populate as more of the v2 plan-of-care surface lands.</div>
    </div>
  );
}

/* ─────── Right rail ─────── */

function PlanRightRail({
  version,
  patient,
  alreadyAcked,
  canSignAsProvider,
  acking,
  signatureDataUrl,
  setSignatureDataUrl,
  ackThisPlan,
}: {
  version: number;
  patient: Patient | undefined;
  alreadyAcked: boolean;
  canSignAsProvider: boolean;
  acking: boolean;
  signatureDataUrl: string | null;
  setSignatureDataUrl: (data: string | null) => void;
  ackThisPlan: () => void;
}): JSX.Element {
  return (
    <aside
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        padding: '20px 18px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        overflowY: 'auto',
      }}
    >
      <Eyebrow>Signatures · v{version}</Eyebrow>

      {/* CHW review (for the demo, the active "ready" card maps to the
          current actor: a Provider with review.signoff or a CHW reviewing
          before passing to Provider). We show this card with the inline
          signature pad when the active role can sign. */}
      <SignatureCard
        role="CHW review"
        name="Awaiting CHW attest"
        status={alreadyAcked ? 'done' : 'ready'}
        detail={alreadyAcked ? 'Signature recorded — see Communication audit log.' : 'Reviewed all sections · ready to attest'}
      >
        {!alreadyAcked && canSignAsProvider && (
          <>
            <SignaturePad onChange={setSignatureDataUrl} label="Care Provider signature" />
            <button
              type="button"
              onClick={ackThisPlan}
              disabled={acking || !signatureDataUrl}
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 36,
                width: '100%',
                borderRadius: 10,
                border: 'none',
                background: signatureDataUrl ? COLOR_BRAND : COLOR_BORDER,
                color: '#fff',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13,
                fontWeight: 700,
                cursor: signatureDataUrl ? 'pointer' : 'not-allowed',
              }}
            >
              <IconSignature size={14} /> {acking ? 'Saving…' : 'Attest & sign'}
            </button>
          </>
        )}
      </SignatureCard>

      <SignatureCard
        role="Provider co-sign"
        name="Awaiting Provider"
        status="queued"
        detail="Will route via secure portal · 24h SLA"
      >
        <SignatureCardButton onClick={() => undefined} disabled icon={<IconMailForward size={14} />}>
          Send for co-sign
        </SignatureCardButton>
      </SignatureCard>

      <SignatureCard
        role="Member acknowledgement"
        name={patient ? memberIdentity(patient, undefined) : 'Member'}
        status="pending-method"
        detail="On-tablet now · or SMS link · or print &amp; scan"
      >
        <SignatureCardButton onClick={() => undefined} disabled icon={<IconSend size={14} />}>
          Choose method
        </SignatureCardButton>
      </SignatureCard>

      {/* 30-day warning */}
      <div
        style={{
          background: COLOR_WARNING_TINT,
          border: `1px solid ${COLOR_WARNING_BORDER}`,
          borderRadius: 11,
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLOR_WARNING_FG,
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <IconAlertTriangle size={11} />
          Member must sign within 30 days
        </div>
        <div style={{ fontSize: 12, color: COLOR_INK, lineHeight: '17px' }}>
          Auto-reminder fires at day 14, 21, 28 if the member hasn&apos;t signed.
        </div>
      </div>

      {/* Document store */}
      <div style={{ background: '#fff', border: `1px solid ${COLOR_BORDER}`, borderRadius: 11, padding: '12px 14px' }}>
        <Eyebrow style={{ marginBottom: 8 }}>Document store</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: COLOR_INK }}>
          <IconFileText size={14} color={COLOR_FG_MUTE} />
          <span style={{ flex: 1 }}>POC-v{Math.max(1, version - 1)}.pdf</span>
          <Chip tone="info" small>
            {version > 1 ? 'Signed' : 'Pending'}
          </Chip>
        </div>
        <div style={{ fontSize: 10, color: COLOR_FG_HELP, marginTop: 4 }}>
          v{version} PDF generates after sign · S3-backed · audit trail attached
        </div>
      </div>
    </aside>
  );
}

function SignatureCard({
  role,
  name,
  status,
  detail,
  children,
}: {
  role: string;
  name: string;
  status: 'ready' | 'queued' | 'pending-method' | 'done';
  detail: string;
  children?: ReactNode;
}): JSX.Element {
  const cfg =
    status === 'ready'
      ? { border: COLOR_BRAND_BORDER, dot: COLOR_BRAND }
      : status === 'queued'
      ? { border: COLOR_BORDER, dot: COLOR_FG_HELP }
      : status === 'pending-method'
      ? { border: COLOR_BORDER, dot: COLOR_INFO_DOT }
      : { border: COLOR_TEAL_DOT, dot: COLOR_TEAL_DOT };

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${cfg.border}`,
        borderRadius: 11,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: cfg.dot }} />
        <Eyebrow>{role}</Eyebrow>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLOR_INK }}>{name}</div>
      <div style={{ fontSize: 11, color: COLOR_FG_MUTE, marginTop: 4, lineHeight: '15px' }}>{detail}</div>
      {children}
    </div>
  );
}

function SignatureCardButton({
  onClick,
  icon,
  disabled,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        marginTop: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 34,
        width: '100%',
        borderRadius: 10,
        border: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        color: disabled ? COLOR_FG_HELP : COLOR_INK_2,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─────── Shared atoms ─────── */

function Chip({
  tone = 'slate',
  dot,
  small,
  children,
}: {
  tone?: 'brand' | 'warn' | 'info' | 'slate';
  dot?: boolean;
  small?: boolean;
  children: ReactNode;
}): JSX.Element {
  const tones = {
    brand: { bg: COLOR_BRAND_TINT, fg: COLOR_BRAND_DEEP, dot: COLOR_BRAND },
    warn: { bg: COLOR_WARNING_TINT, fg: COLOR_WARNING_FG, dot: '#F1C56A' },
    info: { bg: COLOR_TEAL_BG, fg: COLOR_TEAL_FG, dot: COLOR_TEAL_DOT },
    slate: { bg: COLOR_SURFACE_SUBTLE, fg: COLOR_FG_MUTE, dot: COLOR_FG_HELP },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: small ? '2px 8px' : '4px 10px',
        borderRadius: 14,
        background: t.bg,
        color: t.fg,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: small ? 10 : 11,
        fontWeight: 600,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: t.dot }} />}
      {children}
    </span>
  );
}

function Eyebrow({ children, style }: { children: ReactNode; style?: React.CSSProperties }): JSX.Element {
  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: COLOR_FG_HELP,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontFamily: 'Montserrat, system-ui, sans-serif', fontWeight: 700, fontSize: 18, color: COLOR_INK, margin: 0 }}>
          {title}
        </h2>
        {subtitle && <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: COLOR_FG_HELP, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function IconButton({ icon }: { icon: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: 'none',
        background: 'transparent',
        color: COLOR_FG_MUTE,
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

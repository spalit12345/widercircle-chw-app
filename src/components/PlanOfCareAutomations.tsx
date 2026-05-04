// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Workflow visualisation surfaced inside the Plan of Care page. Renders the
// member's CarePlan, the Tasks linked to it (Task.basedOn → CarePlan), and the
// most recent SDoH QuestionnaireResponses as a node-and-edge diagram, in the
// style of the Curitics MetaCare automations canvas.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import type { CarePlan, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronDown, IconPlus, IconSettings, IconSitemap } from '@tabler/icons-react';

const COLOR_HEADER_BG = 'var(--wc-base-800, #012B49)';
const COLOR_TRIGGER = 'var(--wc-success-500, #2F8A89)';
const COLOR_RESULT = 'var(--ac-violet-600, #6B52B8)';
const COLOR_SUB = 'var(--wc-base-500, #8499AA)';
const COLOR_SURFACE = '#fff';
const COLOR_INK = 'var(--wc-base-800, #012B49)';
const COLOR_FG_MUTE = 'var(--wc-base-600, #506D85)';
const COLOR_FG_HELP = 'var(--wc-base-500, #8499AA)';
const COLOR_BORDER = 'var(--wc-base-200, #E2E6E9)';
const COLOR_LINK = 'var(--ac-violet-600, #6B52B8)';

type NodeType = 'trigger' | 'result' | 'sub';

interface NodeShape {
  id: string;
  col: number;
  row: number;
  kind: 'Plan' | 'Task' | 'Assessment' | 'Sub Process';
  type: NodeType;
  title: string;
  description?: string;
  bullets?: string[];
  trigger?: string;
  detailsHref?: string;
  faded?: boolean;
}

interface Edge {
  from: string;
  to: string;
}

const COL_X = [16, 232, 460, 712, 936];
const COL_GAP = 16;
const NODE_W = 196;
const NODE_GAP = 16;
const NODE_BASE_H = 168;
const HEADER_STRIP_H = 6;
const ROW_OFFSET_FOR_FADED = 24;

export interface PlanOfCareAutomationsProps {
  plan: CarePlan | undefined;
  patientId: string;
}

export function PlanOfCareAutomations(props: PlanOfCareAutomationsProps): JSX.Element | null {
  const medplum = useMedplum();
  const { plan, patientId } = props;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [assessments, setAssessments] = useState<QuestionnaireResponse[]>([]);
  const [program, setProgram] = useState<string>('Chronic Care Management');
  const [programOpen, setProgramOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!patientId) {
      setTasks([]);
      setAssessments([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      medplum.searchResources(
        'Task',
        plan?.id ? `based-on=CarePlan/${plan.id}&_count=20` : `for=Patient/${patientId}&_count=20`
      ),
      medplum.searchResources(
        'QuestionnaireResponse',
        `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=5`
      ),
    ])
      .then(([t, qr]) => {
        if (cancelled) return;
        setTasks(t as Task[]);
        setAssessments(qr as QuestionnaireResponse[]);
      })
      .catch(() => {
        if (cancelled) return;
        setTasks([]);
        setAssessments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, patientId, plan?.id]);

  const { nodes, edges } = useMemo(
    () => buildGraph(plan, tasks, assessments),
    [plan, tasks, assessments]
  );

  const positions = useMemo(() => layoutNodes(nodes), [nodes]);
  const canvasHeight = useMemo(() => {
    let max = 0;
    for (const id of Object.keys(positions)) {
      const p = positions[id];
      if (p.y + p.h > max) max = p.y + p.h;
    }
    return Math.max(max + 32, 540);
  }, [positions]);

  if (!patientId) return null;

  return (
    <section
      style={{
        background: COLOR_SURFACE,
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 4,
      }}
    >
      <Header />
      <Toolbar
        program={program}
        onProgramChange={setProgram}
        open={programOpen}
        onOpen={() => setProgramOpen(!programOpen)}
      />
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          minHeight: canvasHeight,
          overflowX: 'auto',
          background:
            'radial-gradient(circle, rgba(132,153,170,0.22) 1px, transparent 1px) 0 0 / 18px 18px, #FAFBFC',
        }}
      >
        <div style={{ position: 'relative', width: 1148, minHeight: canvasHeight }}>
          <Connections edges={edges} positions={positions} canvasHeight={canvasHeight} />
          {nodes.map((n) => {
            const p = positions[n.id];
            if (!p) return null;
            return (
              <NodeCard
                key={n.id}
                node={n}
                style={{ position: 'absolute', left: p.x, top: p.y, width: NODE_W }}
              />
            );
          })}
          {nodes.length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLOR_FG_HELP,
                fontSize: 14,
              }}
            >
              No automations to visualise yet — save the Plan and add Tasks to see the workflow.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Header / Toolbar / Legend
   ============================================================ */

function Header(): JSX.Element {
  return (
    <div
      style={{
        background: COLOR_HEADER_BG,
        color: '#fff',
        padding: '14px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display, Montserrat, system-ui, sans-serif)',
            fontWeight: 700,
            fontSize: 19,
            letterSpacing: '-0.01em',
          }}
        >
          Automations
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>
          Automate manual processes. For example trigger a task when a case is created.
        </div>
      </div>
      <button
        type="button"
        style={{
          border: '1px solid rgba(255,255,255,0.32)',
          background: 'transparent',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Toggle Table
      </button>
    </div>
  );
}

function Toolbar({
  program,
  onProgramChange,
  open,
  onOpen,
}: {
  program: string;
  onProgramChange: (p: string) => void;
  open: boolean;
  onOpen: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 22px',
        borderBottom: `1px solid ${COLOR_BORDER}`,
        background: '#fff',
        position: 'relative',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, color: COLOR_FG_MUTE, fontWeight: 600 }}>Program:</span>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 8,
          background: '#fff',
          fontSize: 14,
          color: COLOR_INK,
          cursor: 'pointer',
        }}
      >
        {program}
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 88,
            background: '#fff',
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(1,43,73,0.10)',
            zIndex: 5,
            minWidth: 220,
          }}
        >
          {['Chronic Care Management', 'CHI / Behavioural Health', 'ECM Outreach'].map((p) => (
            <div
              key={p}
              onClick={() => {
                onProgramChange(p);
                onOpen();
              }}
              style={{
                padding: '8px 12px',
                fontSize: 14,
                cursor: 'pointer',
                color: p === program ? COLOR_LINK : COLOR_INK,
                background: p === program ? 'var(--ac-violet-100, #EDEAF5)' : 'transparent',
              }}
            >
              {p}
            </div>
          ))}
        </div>
      )}
      <ToolbarButton icon={<IconSettings size={14} />} label="Manage Programs" />
      <ToolbarButton icon={<IconSitemap size={14} />} label="Manage Processes" />
      <ToolbarButton icon={<IconPlus size={14} />} label="Add Automation" />
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: COLOR_FG_HELP, marginRight: 8 }}>
        Drag from endpoint to create new
      </span>
      <LegendInline />
    </div>
  );
}

function LegendInline(): JSX.Element {
  const items: Array<{ label: string; color: string }> = [
    { label: 'Trigger', color: COLOR_TRIGGER },
    { label: 'Result', color: COLOR_RESULT },
    { label: 'Sub Process', color: COLOR_SUB },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: it.color }} />
          <span style={{ fontSize: 13, color: COLOR_INK }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function ToolbarButton({ icon, label }: { icon: ReactNode; label: string }): JSX.Element {
  return (
    <button
      type="button"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 8,
        background: '#fff',
        fontSize: 13,
        color: COLOR_INK,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ============================================================
   Node card
   ============================================================ */

function NodeCard({ node, style }: { node: NodeShape; style: CSSProperties }): JSX.Element {
  const stripColor =
    node.type === 'trigger' ? COLOR_TRIGGER : node.type === 'result' ? COLOR_RESULT : COLOR_SUB;
  const opacity = node.faded ? 0.55 : 1;
  return (
    <div
      style={{
        ...style,
        background: '#fff',
        borderRadius: 10,
        border: `1px solid ${COLOR_BORDER}`,
        boxShadow: '0 1px 3px rgba(1,43,73,0.06)',
        overflow: 'hidden',
        opacity,
      }}
    >
      <div style={{ height: HEADER_STRIP_H, background: stripColor }} />
      <Endpoint side="left" color={stripColor} />
      <Endpoint side="right" color={stripColor} />
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            fontFamily: 'var(--font-display, Montserrat, system-ui, sans-serif)',
            fontWeight: 700,
            fontSize: 14,
            color: COLOR_INK,
          }}
        >
          {node.kind}
        </div>
        {node.title && node.title !== node.kind && (
          <div style={{ fontWeight: 600, fontSize: 13, color: COLOR_INK }}>{node.title}</div>
        )}
        {node.description && (
          <div style={{ fontSize: 12, color: COLOR_FG_MUTE, lineHeight: 1.4 }}>{node.description}</div>
        )}
        {node.bullets && node.bullets.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 14, fontSize: 12, color: COLOR_FG_MUTE, lineHeight: 1.4 }}>
            {node.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        {node.trigger && (
          <div style={{ fontSize: 12, color: COLOR_FG_HELP }}>
            <strong style={{ color: COLOR_INK, fontWeight: 600 }}>Trigger:</strong> {node.trigger}
          </div>
        )}
        <a
          style={{
            fontSize: 12,
            color: COLOR_LINK,
            textDecoration: 'none',
            fontWeight: 600,
            cursor: node.detailsHref ? 'pointer' : 'default',
          }}
          href={node.detailsHref}
        >
          View Details
        </a>
      </div>
    </div>
  );
}

function Endpoint({ side, color }: { side: 'left' | 'right'; color: string }): JSX.Element {
  return (
    <span
      style={{
        position: 'absolute',
        top: 38,
        [side]: -5,
        width: 10,
        height: 10,
        borderRadius: 10,
        background: '#fff',
        border: `2px solid ${color}`,
        boxShadow: '0 0 0 2px #fff',
      }}
    />
  );
}

/* ============================================================
   Connections (SVG curves)
   ============================================================ */

interface NodePosition {
  x: number;
  y: number;
  h: number;
}

function Connections({
  edges,
  positions,
  canvasHeight,
}: {
  edges: Edge[];
  positions: Record<string, NodePosition>;
  canvasHeight: number;
}): JSX.Element {
  return (
    <svg
      width="100%"
      height={canvasHeight}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {edges.map((e, i) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (!a || !b) return null;
        const x1 = a.x + NODE_W;
        const y1 = a.y + 38 + 5;
        const x2 = b.x;
        const y2 = b.y + 38 + 5;
        const dx = Math.max(40, (x2 - x1) * 0.5);
        const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        return (
          <path
            key={i}
            d={path}
            stroke="var(--ac-violet-200, #C8BEE3)"
            strokeWidth={1.5}
            fill="none"
          />
        );
      })}
    </svg>
  );
}

/* ============================================================
   Graph builder + layout
   ============================================================ */

function buildGraph(
  plan: CarePlan | undefined,
  tasks: Task[],
  assessments: QuestionnaireResponse[]
): { nodes: NodeShape[]; edges: Edge[] } {
  const nodes: NodeShape[] = [];
  const edges: Edge[] = [];

  // Combine the plan's activity entries and any standalone Task resources into
  // one ordered list of "result" items. Plan activity comes first since the
  // page is the Plan of Care.
  const planActivityEntries: Array<{ title: string; description?: string }> = (plan?.activity ?? [])
    .map((a) => ({
      title: a.detail?.description ?? a.detail?.code?.text ?? 'Action item',
      description: a.detail?.code?.text && a.detail?.description ? a.detail.code.text : undefined,
    }))
    .filter((a) => a.title);

  const taskEntries: Array<{ title: string; description?: string }> = tasks.map((t) => ({
    title: t.code?.text ?? t.description ?? 'Follow-up task',
    description: t.description && t.code?.text ? t.description : undefined,
  }));

  const allResults = [...planActivityEntries, ...taskEntries];

  // -------- Column 0 — Plan trigger --------
  const planNodeId = 'plan-root';
  nodes.push({
    id: planNodeId,
    col: 0,
    row: 0,
    kind: 'Plan',
    type: 'trigger',
    title: 'Automation: CCM',
    description: truncate(plan?.title ?? plan?.description ?? 'Plan of Care', 90),
    bullets: allResults[0] ? [truncate(allResults[0].title, 110)] : undefined,
    trigger: 'created',
  });

  // Optional second plan trigger when there's a deeper activity (faded — visual cue
  // it represents another automation enrolled to the same plan).
  if (allResults.length > 4) {
    nodes.push({
      id: 'plan-second',
      col: 0,
      row: 1,
      kind: 'Plan',
      type: 'trigger',
      title: 'Automation: CCM',
      description: truncate(allResults[4].title, 110),
      trigger: 'created',
      faded: true,
    });
  }

  // -------- Column 1 — first batch of result tasks (up to 2) --------
  allResults.slice(0, 2).forEach((r, idx) => {
    const id = `task-a-${idx}`;
    nodes.push({
      id,
      col: 1,
      row: idx,
      kind: 'Task',
      type: 'result',
      title: 'Result: create',
      description: truncate(r.title, 90),
    });
    edges.push({ from: planNodeId, to: id });
  });

  // -------- Column 2 — Sub-process group with the next 2-4 results --------
  const clusterResults = allResults.slice(2, 6);
  let subId: string | undefined;
  if (clusterResults.length > 0) {
    subId = 'sub-1';
    nodes.push({
      id: subId,
      col: 2,
      row: 0,
      kind: 'Sub Process',
      type: 'sub',
      title: 'Unresponsive Tasking Workflow',
      description: 'A series of tasks which trigger concurrently if the member is unreachable.',
      bullets: clusterResults.map((r) => truncate(r.title, 80)),
    });
    const sourceLeft = nodes.find((n) => n.id === 'task-a-0');
    if (sourceLeft) edges.push({ from: sourceLeft.id, to: subId });
  }

  // -------- Column 3 — Assessment trigger --------
  const assessmentId = 'assessment-1';
  const latestAssessment = assessments[0];
  const assessmentName = latestAssessment
    ? truncate(
        latestAssessment.questionnaire?.split('/').pop()?.replace(/-/g, ' ') ?? 'SDoH assessment',
        70
      )
    : 'Complete CSNP HRA Assessment';
  nodes.push({
    id: assessmentId,
    col: 3,
    row: 0,
    kind: 'Assessment',
    type: 'trigger',
    title: `Automation: ${assessmentName}`,
    description: latestAssessment
      ? `${assessments.length} assessment${assessments.length === 1 ? '' : 's'} on file. Send a copy to Member and PCP, schedule ICT meeting.`
      : 'Accepted Care Plan, send a copy to Member and PCP and Schedule ICT meeting',
    trigger: latestAssessment?.status === 'completed' ? 'completed' : '35',
  });
  edges.push({ from: subId ?? planNodeId, to: assessmentId });

  // -------- Column 3 (lower) — Sub-process (faded) for the unresponsive branch --------
  nodes.push({
    id: 'sub-bottom',
    col: 3,
    row: 1,
    kind: 'Sub Process',
    type: 'sub',
    title: '',
    description: 'Complete CSNP Unresponsive Care Plan and Notify PCP, unable to reach Member',
    trigger: 'updated',
    faded: true,
  });

  // -------- Column 4 — Down-stream result tasks --------
  const downstreamSource = allResults.slice(6);
  const downstream = downstreamSource.length > 0 ? downstreamSource : allResults.slice(-2);
  downstream.slice(0, 3).forEach((r, idx) => {
    const id = `task-r-${idx}`;
    nodes.push({
      id,
      col: 4,
      row: idx,
      kind: 'Task',
      type: 'result',
      title: 'Result: create',
      description: truncate(r.title, 90),
      faded: idx > 0,
    });
    edges.push({ from: assessmentId, to: id });
  });

  if (downstream.length === 0) {
    // Always render at least one terminal result so the canvas isn't lopsided.
    nodes.push({
      id: 'task-r-0',
      col: 4,
      row: 0,
      kind: 'Task',
      type: 'result',
      title: 'Result: create',
      description: 'Notify PCP & document outreach',
    });
    edges.push({ from: assessmentId, to: 'task-r-0' });
  }

  return { nodes, edges };
}

function layoutNodes(nodes: NodeShape[]): Record<string, NodePosition> {
  const out: Record<string, NodePosition> = {};
  const colHeights: number[] = [];
  for (const n of nodes) {
    const x = COL_X[n.col] ?? n.col * (NODE_W + COL_GAP) + 16;
    const baseY = 20;
    const cumulative = colHeights[n.col] ?? 0;
    const y = baseY + cumulative + (n.faded && n.row > 0 ? ROW_OFFSET_FOR_FADED : 0);
    const h = NODE_BASE_H + (n.bullets?.length ?? 0) * 14;
    out[n.id] = { x, y, h };
    colHeights[n.col] = cumulative + h + NODE_GAP + (n.faded && n.row > 0 ? ROW_OFFSET_FOR_FADED : 0);
  }
  return out;
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

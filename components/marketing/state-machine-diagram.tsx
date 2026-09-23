"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../lib/motion";

/**
 * A literal graph of Sentinel's real report-triage state machine (see
 * docs/decisions/0009-report-triage-state-machine.md) -- not an invented illustration.
 * Every node is a real ReportStatus; every edge is a real legal transition from that
 * doc's transition table. NEEDS_INFORMATION -> TRIAGING is drawn as a real back-edge
 * (a report can loop between them more than once), because it does in the real system.
 *
 * One motion moment for the whole page lives here: a traveling dot follows the one
 * representative path (new -> triaging -> needs_information -> triaging -> accepted ->
 * resolved -- the same path SIGNAL_PATH and LiveWorkflowArtifact already narrate) once
 * the section scrolls into view, via IntersectionObserver driving a CSS class toggle
 * (stroke-dashoffset), not GSAP and not a scroll-linked animation loop. The four other
 * real terminal exits from TRIAGING (duplicate/informative/not_applicable/rejected) are
 * drawn as real, static, dimmer edges -- present and honest, not hidden, but not the
 * lit path -- since showing only a straight line would misrepresent a state machine
 * that genuinely branches.
 *
 * prefers-reduced-motion renders every edge already fully drawn/lit, dot omitted --
 * no information is ever gated behind the animation.
 */

type NodeId = "new" | "triaging" | "needs_information" | "accepted" | "resolved" | "duplicate" | "informative" | "not_applicable" | "rejected";

const NODES: Record<NodeId, { label: string; x: number; y: number; terminal?: boolean }> = {
  new: { label: "New", x: 40, y: 140 },
  triaging: { label: "Triaging", x: 190, y: 140 },
  needs_information: { label: "Needs information", x: 190, y: 40 },
  accepted: { label: "Accepted", x: 400, y: 140 },
  resolved: { label: "Resolved", x: 560, y: 140, terminal: true },
  duplicate: { label: "Duplicate", x: 340, y: 230 },
  informative: { label: "Informative", x: 420, y: 260 },
  not_applicable: { label: "Not applicable", x: 500, y: 230 },
  rejected: { label: "Rejected", x: 400, y: 40 },
};

// The one representative, real path this diagram animates -- matches SIGNAL_PATH and
// LiveWorkflowArtifact's own narrated sequence, so all three tell one consistent story.
const LIT_PATH: [NodeId, NodeId][] = [
  ["new", "triaging"],
  ["triaging", "needs_information"],
  ["needs_information", "triaging"],
  ["triaging", "accepted"],
  ["accepted", "resolved"],
];

// Real terminal exits from TRIAGING that are NOT the lit path -- drawn dimmer, still
// literal (docs/decisions/0009's transition table), never omitted.
const DIM_EDGES: [NodeId, NodeId][] = [
  ["triaging", "duplicate"],
  ["triaging", "informative"],
  ["triaging", "not_applicable"],
  ["triaging", "rejected"],
];

function edgePath(from: NodeId, to: NodeId): string {
  const a = NODES[from];
  const b = NODES[to];
  const midX = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} Q ${midX} ${a.y}, ${midX} ${(a.y + b.y) / 2} T ${b.x} ${b.y}`;
}

export function StateMachineDiagram() {
  const reducedMotion = usePrefersReducedMotion();
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) {
      setInView(true);
      return;
    }
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const animate = inView && !reducedMotion;

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <svg viewBox="0 0 620 300" className="mx-auto h-auto w-full max-w-2xl" role="img" aria-label="Diagram of Sentinel's real report triage state machine: new reports move through triaging, may loop through needs-information, and end at accepted-then-resolved, duplicate, informative, not applicable, or rejected.">
        {DIM_EDGES.map(([from, to]) => (
          <path key={`${from}-${to}`} d={edgePath(from, to)} fill="none" className="stroke-border-strong" strokeWidth={1.5} strokeDasharray="3 4" />
        ))}

        {LIT_PATH.map(([from, to], index) => (
          <path
            key={`${from}-${to}-${index}`}
            d={edgePath(from, to)}
            fill="none"
            className="stroke-action"
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={1}
            style={
              inView
                ? { strokeDasharray: 1, strokeDashoffset: 0, transition: animate ? `stroke-dashoffset 500ms ease-out ${index * 500}ms` : undefined }
                : { strokeDasharray: 1, strokeDashoffset: 1 }
            }
          />
        ))}

        {(Object.entries(NODES) as [NodeId, (typeof NODES)[NodeId]][]).map(([id, node]) => {
          const onLitPath = LIT_PATH.some(([from, to]) => from === id || to === id);
          return (
            <g key={id}>
              <circle cx={node.x} cy={node.y} r={5} className={onLitPath ? "fill-action" : "fill-ink-muted"} />
              <text x={node.x} y={node.y - 12} textAnchor="middle" className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${onLitPath ? "fill-ink" : "fill-ink-muted"}`}>
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-xs text-ink-muted">This is the same state machine that governs every report in Sentinel — nothing here is simplified for the demo.</p>
    </div>
  );
}

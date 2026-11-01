"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MOTION, usePrefersReducedMotion } from "../../lib/motion";
import { reportStatusLabel, reportStatusMeaning } from "../../lib/report-status";

gsap.registerPlugin(ScrollTrigger);

/**
 * A literal graph of Unpatched's real report-triage state machine (see
 * docs/decisions/0009-report-triage-state-machine.md) -- not an invented illustration.
 * Every node is a real ReportStatus; every edge is a real legal transition from that
 * doc's transition table. NEEDS_INFORMATION -> TRIAGING is drawn as a real back-edge
 * (a report can loop between them more than once), because it does in the real system.
 *
 * Scroll drives it: the visitor's own scrolling walks one representative report along
 * the lit path (new -> triaging -> needs_information -> triaging -> accepted -> resolved),
 * a red marker riding each edge as it draws, the current state enlarged and named below
 * with its real product meaning (reportStatusMeaning, the copy the app itself shows). On a
 * desktop viewport the diagram pins while that happens; on smaller screens it simply plays
 * as it crosses the viewport, so nothing traps a phone's scroll.
 *
 * At the branch point (triaging) the four other real terminal exits brighten -- duplicate,
 * informative, not applicable, rejected are genuine outcomes, not a footnote. Scroll moves
 * the illustration, never a real report: the caption says plainly that every transition is
 * a person's decision.
 *
 * prefers-reduced-motion renders every edge already drawn, no marker, no pin -- no
 * information is ever gated behind the animation.
 */

type NodeId = "new" | "triaging" | "needs_information" | "accepted" | "resolved" | "duplicate" | "informative" | "not_applicable" | "rejected";

const NODES: Record<NodeId, { label: string; x: number; y: number }> = {
  new: { label: "New", x: 40, y: 140 },
  triaging: { label: "Triaging", x: 190, y: 140 },
  needs_information: { label: "Needs information", x: 190, y: 40 },
  accepted: { label: "Accepted", x: 400, y: 140 },
  resolved: { label: "Resolved", x: 560, y: 140 },
  duplicate: { label: "Duplicate", x: 340, y: 230 },
  informative: { label: "Informative", x: 420, y: 260 },
  not_applicable: { label: "Not applicable", x: 500, y: 230 },
  rejected: { label: "Rejected", x: 400, y: 40 },
};

// The one representative, real path this diagram walks -- matches SIGNAL_PATH and
// LiveWorkflowArtifact's own narrated sequence, so all three tell one consistent story.
const LIT_PATH: [NodeId, NodeId][] = [
  ["new", "triaging"],
  ["triaging", "needs_information"],
  ["needs_information", "triaging"],
  ["triaging", "accepted"],
  ["accepted", "resolved"],
];
const STOPS: NodeId[] = [LIT_PATH[0][0], ...LIT_PATH.map(([, to]) => to)];

// Real terminal exits from TRIAGING that are NOT the lit path -- drawn dimmer, still
// literal (docs/decisions/0009's transition table), never omitted.
const DIM_EDGES: [NodeId, NodeId][] = [
  ["triaging", "duplicate"],
  ["triaging", "informative"],
  ["triaging", "not_applicable"],
  ["triaging", "rejected"],
];
const LIT_NODES = new Set<NodeId>(STOPS);

function edgePath(from: NodeId, to: NodeId): string {
  const a = NODES[from];
  const b = NODES[to];
  const midX = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} Q ${midX} ${a.y}, ${midX} ${(a.y + b.y) / 2} T ${b.x} ${b.y}`;
}

export function StateMachineDiagram() {
  const reducedMotion = usePrefersReducedMotion();
  // null = no walk in progress (reduced motion, or before the section is reached).
  const [step, setStep] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const edgeRefs = useRef<(SVGPathElement | null)[]>([]);
  const markerRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    if (reducedMotion) {
      setStep(null);
      return;
    }
    const container = containerRef.current;
    const marker = markerRef.current;
    const edges = edgeRefs.current.filter((edge): edge is SVGPathElement => edge !== null);
    if (!container || !marker || edges.length !== LIT_PATH.length) return;
    const lengths = edges.map((edge) => edge.getTotalLength());
    let lastStep = -1;

    function render(progress: number) {
      const travelled = progress * edges.length;
      edges.forEach((edge, index) => {
        edge.style.strokeDashoffset = String(1 - gsap.utils.clamp(0, 1, travelled - index));
      });
      const segment = Math.min(edges.length - 1, Math.floor(travelled));
      const point = edges[segment].getPointAtLength(lengths[segment] * gsap.utils.clamp(0, 1, travelled - segment));
      marker!.setAttribute("transform", `translate(${point.x} ${point.y})`);
      // A stop becomes "current" once the marker has nearly arrived at it.
      const next = Math.min(STOPS.length - 1, Math.floor(travelled + 0.12));
      if (next !== lastStep) {
        lastStep = next;
        setStep(next);
      }
    }

    const mm = gsap.matchMedia();
    const scrubbed = (pin: boolean) => {
      const trigger = ScrollTrigger.create({
        trigger: container,
        start: pin ? "center center" : "top 80%",
        end: pin ? "+=140%" : "bottom 30%",
        pin,
        // Measured before every other homepage trigger: the pin adds scroll length to this
        // section, and the background layers' start/end points must include it.
        refreshPriority: 1,
        scrub: MOTION.scrub,
        onUpdate: (self) => render(self.progress),
      });
      render(trigger.progress);
    };
    mm.add("(min-width: 1024px) and (min-height: 720px)", () => scrubbed(true));
    mm.add("(max-width: 1023px), (max-height: 719px)", () => scrubbed(false));
    return () => mm.revert();
  }, [reducedMotion]);

  const walking = step !== null;
  const current = walking ? STOPS[step] : null;
  const branching = current === "triaging";

  return (
    <div ref={containerRef} className="py-2">
      <div>
        <svg
          viewBox="0 0 620 300"
          className="mx-auto h-auto w-full max-w-2xl"
          role="img"
          aria-label="Diagram of Unpatched's real report triage state machine: new reports move through triaging, may loop through needs-information, and end at accepted-then-resolved, duplicate, informative, not applicable, or rejected."
        >
          <g className="transition-opacity duration-500" opacity={!walking || branching ? 1 : 0.45}>
            {DIM_EDGES.map(([from, to]) => (
              <path key={`${from}-${to}`} d={edgePath(from, to)} fill="none" className="stroke-border-strong" strokeWidth={1.5} strokeDasharray="3 4" />
            ))}
          </g>

          {LIT_PATH.map(([from, to], index) => (
            <path key={`${from}-${to}-${index}`} d={edgePath(from, to)} fill="none" className="stroke-border-strong" strokeWidth={1} />
          ))}
          {LIT_PATH.map(([from, to], index) => (
            <path
              key={`lit-${from}-${to}-${index}`}
              ref={(el) => {
                edgeRefs.current[index] = el;
              }}
              d={edgePath(from, to)}
              fill="none"
              className="stroke-action"
              strokeWidth={2}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={reducedMotion ? 0 : 1}
            />
          ))}

          {(Object.entries(NODES) as [NodeId, (typeof NODES)[NodeId]][]).map(([id, node]) => {
            const onLitPath = LIT_NODES.has(id);
            const isCurrent = id === current;
            const reached = !walking || (onLitPath && STOPS.slice(0, (step ?? 0) + 1).includes(id));
            const outcomeLit = !onLitPath && (!walking || branching);
            return (
              <g key={id}>
                <circle cx={node.x} cy={node.y} r={12} className="fill-none stroke-action transition-[opacity] duration-300" strokeWidth={1.5} opacity={isCurrent ? 0.5 : 0} />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isCurrent ? 7 : 5}
                  className={`transition-[fill] duration-300 ${onLitPath ? (reached ? "fill-action" : "fill-surface stroke-action") : outcomeLit ? "fill-ink" : "fill-ink-muted"}`}
                  strokeWidth={1.5}
                />
                <text
                  x={node.x}
                  y={node.y - 16}
                  textAnchor="middle"
                  // A ground-colored halo keeps labels legible where an edge passes beneath them.
                  className={`stroke-surface-muted font-mono text-[10px] font-semibold uppercase tracking-wide transition-[fill] duration-300 [paint-order:stroke] [stroke-width:4px] ${isCurrent || outcomeLit || (onLitPath && !walking) ? "fill-ink" : "fill-ink-muted"}`}
                >
                  {node.label}
                </text>
              </g>
            );
          })}

          {!reducedMotion && (
            <g ref={markerRef} transform={`translate(${NODES.new.x} ${NODES.new.y})`} aria-hidden="true">
              <circle r={4} className="fill-action" />
            </g>
          )}
        </svg>
      </div>

      {/* The current state, in the product's own words. Fixed height so the pinned diagram
          never jumps as captions of different lengths swap. */}
      <div className="mx-auto mt-4 min-h-[4.5rem] max-w-xl text-center" aria-hidden={walking ? "true" : undefined}>
        {current ? (
          <p key={`${current}-${step}`} className="motion-safe:animate-enter-rise">
            <span className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-action">
              {String((step ?? 0) + 1).padStart(2, "0")} {reportStatusLabel(current)}
            </span>
            <span className="mt-1 block text-sm text-ink-muted">
              {branching ? `${reportStatusMeaning(current)} It can also close here as duplicate, informative, not applicable, or rejected.` : reportStatusMeaning(current)}
            </span>
          </p>
        ) : null}
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">
        This is the same state machine that governs every report in Unpatched. Nothing moves on its own: every transition is a person&rsquo;s decision, attributed and timestamped.
      </p>
    </div>
  );
}

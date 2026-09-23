import React from "react";
import { cn } from "../../lib/cn";

export type WorkflowStage = { label: string; detail: React.ReactNode };

/**
 * A vertical numbered sequence, reusable by the philosophy section and both the researcher
 * and organization sections. `tone="inverted"` renders against a dark (bg-ink) band using
 * canvas-derived opacity steps instead of the ink/border tokens -- since ink and canvas are
 * defined as an always-opposite pair (see app/globals.css), this stays correctly readable
 * in both light and dark ambient themes without any extra CSS.
 */
export function WorkflowDiagram({ stages, tone = "default" }: { stages: WorkflowStage[]; tone?: "default" | "inverted" }) {
  const inverted = tone === "inverted";
  return (
    <ol className={cn("divide-y border-y", inverted ? "divide-canvas/15 border-canvas/15" : "divide-border border-border")}>
      {stages.map((stage, index) => (
        <li key={stage.label} className="flex items-start gap-4 py-4 sm:gap-6 sm:py-5">
          <span aria-hidden="true" className={cn("mt-0.5 font-mono text-xs", inverted ? "text-canvas/40" : "text-ink-muted")}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-semibold uppercase tracking-wide", inverted ? "text-canvas/60" : "text-ink-muted")}>{stage.label}</p>
            <div className={cn("mt-1.5 text-sm", inverted ? "text-canvas/75" : "text-ink-muted")}>{stage.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function WorkflowStep({ stage, index }: { stage: WorkflowStage; index: number }) {
  return (
    <div className="flex items-start gap-4 py-4 sm:gap-6 sm:py-5">
      <span aria-hidden="true" className="mt-0.5 font-mono text-xs text-ink-muted">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{stage.label}</p>
        <div className="mt-1.5 text-sm text-ink-muted">{stage.detail}</div>
      </div>
    </div>
  );
}

/**
 * Two equal-length stage lists (RESEARCHER_STAGES/ORGANIZATION_STAGES) side by side,
 * step N of one aligned with step N of the other -- a single CSS grid with one row
 * track per step, not two independent `<ol>` flows in a 2-column section. Two
 * independent lists (the prior structure) let each column's own text wrapping decide
 * that row's height on its own, so a longer left-column step and a shorter
 * right-column step at the same index drifted out of alignment: divider lines no
 * longer lined up across the two columns, confirmed live as a real visual bug. A
 * shared grid row is exactly as tall as its tallest cell, which keeps every divider
 * level by construction, no measurement/JS required. Requires `left.length ===
 * right.length` -- both real stage lists happen to be 7 items each; a caller with
 * mismatched lengths would silently misalign trailing rows, so this is intentionally
 * not defended against for a fixed, page-authored pair of arrays.
 */
export function WorkflowDiagramPair({ left, right }: { left: WorkflowStage[]; right: WorkflowStage[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-12 border-y border-border lg:grid-cols-2 lg:[&>*]:[grid-column:var(--wf-col)] lg:[&>*]:[grid-row:var(--wf-row)]">
      {left.map((stage, index) => (
        <div
          key={stage.label}
          style={{ "--wf-col": 1, "--wf-row": index + 1 } as React.CSSProperties}
          className={cn("border-border lg:border-r lg:pr-12", index > 0 && "border-t")}
        >
          <WorkflowStep stage={stage} index={index} />
        </div>
      ))}
      {right.map((stage, index) => (
        <div
          key={stage.label}
          style={{ "--wf-col": 2, "--wf-row": index + 1 } as React.CSSProperties}
          className={cn("border-border lg:pl-12", index > 0 && "border-t")}
        >
          <WorkflowStep stage={stage} index={index} />
        </div>
      ))}
    </div>
  );
}

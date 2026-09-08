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

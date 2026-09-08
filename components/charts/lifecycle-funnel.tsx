"use client";

import React, { useState } from "react";
import { cn } from "../../lib/cn";
import type { MockFunnelStage } from "../../lib/mock/report-analytics";

/**
 * Submitted -> Triaged -> Needs info -> Accepted/Resolved -> Closed, as a real funnel:
 * each stage's bar width is its own count as a share of Submitted (stage 1), with the
 * conversion rate from the PREVIOUS stage called out directly on the connector -- the
 * number that actually answers "where is the drop-off," not just "how big is each
 * stage" side by side. Status colors come from Tailwind's bg-action (in-progress work)
 * and bg-ink-muted (closed) rather than a single per-stage status tone, since a funnel
 * stage is a real aggregate of several statuses (see lib/mock/report-analytics.ts's own
 * MockFunnelStage.statuses), not one status -- using one status's tone for a multi-status
 * bucket would misrepresent it.
 */
export function LifecycleFunnel({ stages }: { stages: MockFunnelStage[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const base = stages[0]?.count ?? 0;
  if (base === 0) return null;

  return (
    <div role="img" aria-label={stages.map((s) => `${s.label}: ${s.count}`).join(", ")}>
      <div className="space-y-2">
        {stages.map((stage, index) => {
          const pctOfBase = Math.round((stage.count / base) * 100);
          const previous = index > 0 ? stages[index - 1] : null;
          const conversionFromPrevious = previous && previous.count > 0 ? Math.round((stage.count / previous.count) * 100) : null;
          const isTerminal = index === stages.length - 1;

          return (
            <div key={stage.key}>
              {conversionFromPrevious !== null && (
                <div className="flex items-center gap-2 py-0.5 pl-1">
                  <span aria-hidden="true" className="text-ink-muted/50">
                    ↓
                  </span>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {conversionFromPrevious}% of {previous!.label.toLowerCase()}
                    {conversionFromPrevious < 100 && <span className="text-danger"> · −{previous!.count - stage.count} dropped off</span>}
                  </span>
                </div>
              )}
              <div
                className="relative"
                onMouseEnter={() => setHovered(stage.key)}
                onMouseLeave={() => setHovered((current) => (current === stage.key ? null : current))}
              >
                <div className="flex items-center justify-between gap-3 pb-1">
                  <span className="text-sm font-medium text-ink">{stage.label}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-ink">{stage.count}</span>
                </div>
                <div className="h-6 w-full overflow-hidden rounded-md bg-surface-muted">
                  <div
                    className={cn(
                      "h-full rounded-md motion-safe:transition-[width] motion-safe:duration-200",
                      isTerminal ? "bg-ink-muted" : "bg-action",
                      hovered === stage.key && "brightness-110",
                    )}
                    style={{ width: `${Math.max(pctOfBase, 3)}%` }}
                  />
                </div>
                {hovered === stage.key && (
                  <div className="absolute -top-1 left-0 -translate-y-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs shadow-lg">
                    <p className="font-semibold text-ink">{stage.label}</p>
                    <p className="mt-0.5 font-mono text-ink-muted">
                      {stage.count} reports · {pctOfBase}% of submitted
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

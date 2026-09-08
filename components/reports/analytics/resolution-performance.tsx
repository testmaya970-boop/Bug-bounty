import React from "react";
import { SectionLabel } from "../../ui/security-primitives";
import type { MockResolutionPerformance } from "../../../lib/mock/report-analytics";

/**
 * Not a chart -- three real numbers, per the dataviz skill's own "sometimes the answer
 * is not a chart" rule. Median time-to-triage and median time-to-resolution answer "is
 * this program responsive," which a distribution chart would only obscure at this
 * report volume; aging count is a direct flag, not a magnitude to plot.
 */
export function ResolutionPerformance({ performance }: { performance: MockResolutionPerformance }) {
  return (
    <div>
      <SectionLabel>Resolution performance</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-muted">Median time to triage</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
            {performance.medianTimeToTriageHours}
            <span className="ml-1 text-sm font-normal text-ink-muted">hrs</span>
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-muted">Median time to resolution</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
            {performance.medianTimeToResolutionDays}
            <span className="ml-1 text-sm font-normal text-ink-muted">days</span>
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-muted">Currently open</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{performance.openReportsCount}</p>
        </div>
        <div className={performance.agingReportsCount > 0 ? "bg-danger/5 p-4" : "bg-surface p-4"}>
          <p className="text-xs text-ink-muted">Aging past 30 days</p>
          <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${performance.agingReportsCount > 0 ? "text-danger" : "text-ink"}`}>{performance.agingReportsCount}</p>
        </div>
      </div>
    </div>
  );
}

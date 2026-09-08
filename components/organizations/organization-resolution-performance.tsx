import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import type { OrganizationResolutionPerformance } from "../../types/organization";

/**
 * Not a chart -- four real numbers, per the dataviz skill's own "sometimes the answer is
 * not a chart" rule. Modeled directly on components/reports/analytics/
 * resolution-performance.tsx's stat-tile layout (same reasoning: median time-to-triage
 * and median time-to-resolution answer "is this organization responsive," which a
 * distribution chart would only obscure at this report volume). The two medians render
 * "No data yet" rather than a fabricated 0 or dash when null -- get_organization_
 * resolution_performance returns null precisely when no report has ever reached that
 * milestone, an honest absence, not a zero duration.
 */
export function OrganizationResolutionPerformanceTiles({ performance }: { performance: OrganizationResolutionPerformance }) {
  const agingTotal = performance.aging31To60DaysCount + performance.agingOver60DaysCount;

  return (
    <div>
      <SectionLabel>Resolution performance</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-muted">Median time to first triage</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
            {performance.medianHoursToFirstTriage !== null ? (
              <>
                {Math.round(performance.medianHoursToFirstTriage)}
                <span className="ml-1 text-sm font-normal text-ink-muted">hrs</span>
              </>
            ) : (
              <span className="text-base font-normal text-ink-muted">No data yet</span>
            )}
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-muted">Median time to resolution</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
            {performance.medianDaysToResolution !== null ? (
              <>
                {Math.round(performance.medianDaysToResolution * 10) / 10}
                <span className="ml-1 text-sm font-normal text-ink-muted">days</span>
              </>
            ) : (
              <span className="text-base font-normal text-ink-muted">No data yet</span>
            )}
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-muted">Currently open</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{performance.openCount}</p>
        </div>
        <div className={agingTotal > 0 ? "bg-danger/5 p-4" : "bg-surface p-4"}>
          <p className="text-xs text-ink-muted">Aging past 30 days</p>
          <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${agingTotal > 0 ? "text-danger" : "text-ink"}`}>{agingTotal}</p>
        </div>
      </div>
    </div>
  );
}

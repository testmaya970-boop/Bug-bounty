import React from "react";
import { formatMoney } from "../../lib/money";
import type { OrganizationTopResearcher } from "../../services/organization-analytics";

/** Who finds real issues in this organization's programs: resolved reports, how many were
 * high/critical, the share of decided reports that were valid, and money awarded vs paid. */
export function OrganizationTopResearchers({ rows }: { rows: OrganizationTopResearcher[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Top researchers</h2>
        <p className="text-sm text-ink-muted">Ranked by resolved reports. Signal is the share of decided reports that were valid.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted">No researcher has a resolved report in your programs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                {["Researcher", "Resolved", "High/critical", "Signal", "Awarded", "Paid"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.researcherId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.displayName}</td>
                  <td className="px-4 py-3 tabular-nums text-ink">{row.resolvedCount}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.highOrCriticalCount}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.signalPercent === null ? "—" : `${row.signalPercent}%`}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.currency ? formatMoney(row.awardedMinorUnits, row.currency) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.currency ? formatMoney(row.paidMinorUnits, row.currency) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

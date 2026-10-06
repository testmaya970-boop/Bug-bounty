import React from "react";
import type { OrganizationSlaSummary, SlaCount } from "../../types/program-policy";

function Missed({ count }: { count: SlaCount }) {
  if (count.tracked === 0) return <span className="text-ink-muted">—</span>;
  return (
    <span className={count.breached > 0 ? "font-semibold text-danger" : "text-ink-muted"}>
      {count.breached} of {count.tracked}
    </span>
  );
}

/** Per program: how many reports missed each response target of the policy they were
 * submitted under (get_organization_sla_summary, 202610060009). Only reports bound to a
 * policy with that target are counted. */
export function OrganizationSla({ rows, programNames }: { rows: OrganizationSlaSummary[]; programNames: Map<string, string> }) {
  const tracked = rows.filter((r) => r.firstResponse.tracked + r.triage.tracked + r.resolution.tracked > 0);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Response targets</h2>
        <p className="text-sm text-ink-muted">Reports that missed a target from their program&apos;s policy. Open reports past due count as missed.</p>
      </div>
      {tracked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-muted">No report has been submitted under a policy with response targets yet. Publish a program policy to start tracking.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                {["Program", "Median first response", "First response missed", "Triage missed", "Resolution missed"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tracked.map((row) => (
                <tr key={row.programId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{programNames.get(row.programId) ?? "Program"}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.medianFirstResponseHours === null ? "—" : `${row.medianFirstResponseHours}h`}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <Missed count={row.firstResponse} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <Missed count={row.triage} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <Missed count={row.resolution} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React from "react";
import { formatHours, percent } from "../../lib/viz";
import type { OrganizationResponseMetrics, ResponseMetricKey, ResponseMetricStats } from "../../services/organization-analytics";

const METRICS: { key: ResponseMetricKey; label: string; short: string; from: string }[] = [
  { key: "first_response", label: "Time to first response", short: "First response", from: "Submission to the first staff message or status change" },
  { key: "triage", label: "Time to triage", short: "Triage", from: "Submission to triage started" },
  { key: "bounty", label: "Time to bounty", short: "Bounty", from: "Accepted to bounty finalized" },
  { key: "resolution", label: "Time to resolution", short: "Resolution", from: "Submission to the closing decision" },
];

function SlaLine({ stats, metric }: { stats: ResponseMetricStats; metric: ResponseMetricKey }) {
  if (stats.sla_tracked === 0) {
    return <p className="text-xs text-ink-muted">{metric === "bounty" ? "Policies set no bounty target." : "No policy target applies yet."}</p>;
  }
  const pct = percent(stats.sla_met, stats.sla_tracked) ?? 0;
  const tone = pct >= 90 ? "var(--success)" : pct >= 70 ? "var(--warning)" : "var(--danger)";
  return (
    <div>
      <p className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink">{pct}% on target</span>
        <span className="text-ink-muted tabular-nums">
          {stats.sla_met} of {stats.sla_tracked}
        </span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${pct}% of ${stats.sla_tracked} reports met the policy target`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

function Benchmark({ yours, platform, orgs }: { yours: number | null; platform: number | null; orgs: number }) {
  if (platform === null) {
    return <p className="text-xs text-ink-muted">Not enough data for a platform benchmark yet{orgs > 0 ? ` (${orgs} of 5 organizations needed)` : ""}.</p>;
  }
  const max = Math.max(platform, yours ?? 0, 0.1);
  const verdict =
    yours === null ? null : yours < platform ? "Faster than the platform median" : yours > platform ? "Slower than the platform median" : "Level with the platform median";
  const bar = (label: string, value: number | null, color: string) => (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-xs">
      <span className="text-ink-muted">{label}</span>
      <div className="h-2 rounded-r-[4px]">
        <div className="h-full rounded-r-[4px]" style={{ width: `${value === null ? 0 : Math.max((value / max) * 100, 2)}%`, background: color }} />
      </div>
      <span className="text-right tabular-nums text-ink">{formatHours(value)}</span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {bar("You", yours, "var(--viz-1)")}
      {bar("Platform", platform, "var(--viz-axis)")}
      {verdict && <p className="text-xs font-medium text-ink">{verdict}</p>}
    </div>
  );
}

function ProgramCell({ stats }: { stats: ResponseMetricStats | undefined }) {
  if (!stats || stats.median_hours === null) return <span className="text-ink-muted">No data</span>;
  const pct = percent(stats.sla_met, stats.sla_tracked);
  return (
    <>
      <span className="font-semibold text-ink">{formatHours(stats.median_hours)}</span>
      <span className="block text-xs text-ink-muted">
        p90 {formatHours(stats.p90_hours)}
        {pct !== null && <>, {pct}% on target</>}
      </span>
    </>
  );
}

/**
 * Response times (HackerOne/Bugcrowd "response efficiency"): median and 90th percentile for
 * each stage, share of reports that met the program policy's own targets, and the platform
 * median for comparison. One RPC, get_organization_response_metrics (202610220020).
 */
export function OrganizationResponseTimes({ data, days, exportHref }: { data: OrganizationResponseMetrics; days: number; exportHref: string }) {
  const window = days === 365 ? "12 months" : `${days} days`;
  const byKey = new Map(data.metrics.map((m) => [m.metric, m]));
  return (
    <section aria-labelledby="response-times" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="response-times" className="text-lg font-semibold text-ink">
            Response times
          </h2>
          <p className="text-sm text-ink-muted">
            Reports submitted in the last {window}: median, 90th percentile, policy targets met, and the platform median.
          </p>
        </div>
        <a
          href={exportHref}
          download
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-action hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
          </svg>
          Export CSV
        </a>
      </div>

      {data.reports === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-muted">
          No reports were submitted in the last {window}. Pick a longer range to see response times.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {METRICS.map((metric) => {
              const m = byKey.get(metric.key);
              if (!m) return null;
              return (
                <article key={metric.key} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={metric.label}>
                  <div>
                    <h3 className="text-xs font-medium text-ink-muted">{metric.label}</h3>
                    <p className="text-xs text-ink-muted">{metric.from}</p>
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-2xl font-semibold tracking-tight text-ink">{formatHours(m.median_hours)}</span>
                      <span className="text-xs text-ink-muted">median</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {m.count === 0 ? "No report has reached this stage yet." : `90% within ${formatHours(m.p90_hours)}, ${m.count} report${m.count === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <SlaLine stats={m} metric={metric.key} />
                  <div className="mt-auto border-t border-border pt-3">
                    <Benchmark yours={m.median_hours} platform={m.benchmark_hours} orgs={m.benchmark_orgs} />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">By program</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                <caption className="sr-only">Median response time per program, with the 90th percentile and the share of reports on target</caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Program
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Reports
                    </th>
                    {METRICS.map((m) => (
                      <th key={m.key} scope="col" className="px-4 py-3 font-semibold">
                        {m.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.programs.map((program) => (
                    <tr key={program.program_id} className="border-b border-border align-top last:border-0">
                      <th scope="row" className="px-4 py-3 font-medium text-ink">
                        {program.name}
                      </th>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">{program.reports}</td>
                      {METRICS.map((m) => (
                        <td key={m.key} className="px-4 py-3 tabular-nums">
                          <ProgramCell stats={program.metrics?.[m.key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

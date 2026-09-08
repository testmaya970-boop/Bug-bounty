"use client";

import React, { useState } from "react";
import { cn } from "../../lib/cn";
import { formatMoney } from "../../lib/money";
import { SectionLabel } from "../ui/security-primitives";
import type { OrganizationBountySpendSummary, OrganizationWeeklyBountySpend } from "../../types/organization";
import type { ReportSeverity } from "../../types/report";

const SEVERITY_BREAKDOWN: { key: keyof Pick<OrganizationBountySpendSummary, "paidCriticalCount" | "paidHighCount" | "paidMediumCount" | "paidLowCount" | "paidNoneCount">; severity: ReportSeverity; label: string }[] = [
  { key: "paidCriticalCount", severity: "critical", label: "Critical" },
  { key: "paidHighCount", severity: "high", label: "High" },
  { key: "paidMediumCount", severity: "medium", label: "Medium" },
  { key: "paidLowCount", severity: "low", label: "Low" },
  { key: "paidNoneCount", severity: "none", label: "None" },
];

const SEVERITY_DOT_CLASS: Record<ReportSeverity, string> = {
  critical: "bg-severity-critical",
  high: "bg-severity-high",
  medium: "bg-severity-medium",
  low: "bg-severity-low",
  none: "bg-ink-muted",
};

function formatWeekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** One currency's real finalized-spend summary -- total paid, payout count, and which
 * severities that money went to. SEVERITY_DOT_CLASS maps to the same severity color
 * tokens SeverityBadge/severityTone use (critical/high/medium/low/none), so a "Critical"
 * dot here reads identically to SeverityBadge everywhere else -- a dedicated dot-color map
 * rather than reusing severityTone's own Tone type directly, since this renders a small
 * inline dot, not a ToneBadge pill. */
function SpendSummaryTile({ summary }: { summary: OrganizationBountySpendSummary }) {
  const breakdownWithCounts = SEVERITY_BREAKDOWN.filter((entry) => summary[entry.key] > 0);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-ink-muted">Total paid ({summary.currency})</p>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          {summary.payoutCount} payout{summary.payoutCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{formatMoney(summary.totalPaidMinorUnits, summary.currency)}</p>
      {breakdownWithCounts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
          {breakdownWithCounts.map((entry) => (
            <span key={entry.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT_CLASS[entry.severity])} />
              <span className="text-ink-muted">{entry.label}</span>
              <span className="font-mono font-semibold text-ink">{summary[entry.key]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One currency's real weekly payout trend, trailing 12 weeks -- a single-series bar
 * chart (never blended across currencies: see the migration's own note on why summing
 * different currencies would fabricate a meaningless number). Modeled directly on
 * OrganizationWeeklyVolume's own hover/crosshair mechanism, adapted to one value series. */
function WeeklySpendChart({ currency, weeks }: { currency: string; weeks: OrganizationWeeklyBountySpend[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxValue = Math.max(1, ...weeks.map((w) => w.paidMinorUnits));
  const chartHeight = 100;
  const barWidth = 100 / weeks.length;
  const barGap = barWidth * 0.15;

  return (
    <div>
      <p className="text-xs text-ink-muted">{currency}</p>
      <div className="relative mt-1" onMouseLeave={() => setHoveredIndex(null)}>
        <svg viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible" role="img" aria-label={`Weekly ${currency} bounty spend, past 12 weeks`}>
          {[0.5, 1].map((fraction) => (
            <line key={fraction} x1={0} x2={100} y1={chartHeight - chartHeight * fraction} y2={chartHeight - chartHeight * fraction} className="stroke-border" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          ))}
          {weeks.map((week, index) => {
            const height = (week.paidMinorUnits / maxValue) * chartHeight;
            const isHovered = hoveredIndex === index;
            return (
              <g key={week.weekStart} onMouseEnter={() => setHoveredIndex(index)} className="cursor-pointer">
                <rect x={index * barWidth} y={0} width={barWidth} height={chartHeight} fill="transparent" />
                {height > 0 && (
                  <rect
                    x={index * barWidth + barGap / 2}
                    y={chartHeight - height}
                    width={Math.max(barWidth - barGap, 0.5)}
                    height={height}
                    rx={0.6}
                    className={cn("fill-action motion-safe:transition-opacity motion-safe:duration-150", isHovered ? "opacity-100" : "opacity-80")}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {hoveredIndex !== null && weeks[hoveredIndex].paidMinorUnits > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2.5 py-2 text-xs shadow-lg"
            style={{ left: `${(hoveredIndex + 0.5) * barWidth}%` }}
          >
            <p className="font-semibold text-ink">Week of {formatWeekLabel(weeks[hoveredIndex].weekStart)}</p>
            <p className="mt-0.5 font-mono font-semibold text-ink">{formatMoney(weeks[hoveredIndex].paidMinorUnits, currency)}</p>
            <p className="text-ink-muted">
              {weeks[hoveredIndex].payoutCount} payout{weeks[hoveredIndex].payoutCount === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-muted">
        <span>{formatWeekLabel(weeks[0]?.weekStart ?? "")}</span>
        <span>{formatWeekLabel(weeks[weeks.length - 1]?.weekStart ?? "")}</span>
      </div>
    </div>
  );
}

/**
 * Real organization bounty spend -- what this organization has actually paid
 * researchers, never a projection or a policy's max-range. Every number comes from
 * report_bounty_decisions rows in state 'finalized' (see db/migrations/
 * 202609090002_organization_bounty_spend_analytics.sql), grouped by currency throughout:
 * an organization with programs in more than one currency gets one tile and one chart per
 * currency, never a single blended total. Renders nothing when the organization has never
 * finalized a payout -- an org still setting up bounty policy shouldn't see a fabricated
 * "$0 paid" panel, matching this codebase's own honest-empty-state convention.
 */
export function OrganizationBountySpend({ summary, weeklySpend }: { summary: OrganizationBountySpendSummary[]; weeklySpend: OrganizationWeeklyBountySpend[] }) {
  if (summary.length === 0) return null;

  const weeksByCurrency = new Map<string, OrganizationWeeklyBountySpend[]>();
  for (const row of weeklySpend) {
    const existing = weeksByCurrency.get(row.currency) ?? [];
    existing.push(row);
    weeksByCurrency.set(row.currency, existing);
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Bounty spend</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Real, finalized payouts across every program -- never a policy's max range or a pending recommendation.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((row) => (
            <SpendSummaryTile key={row.currency} summary={row} />
          ))}
        </div>
      </div>

      {weeksByCurrency.size > 0 && (
        <div>
          <SectionLabel>Weekly payout trend</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Past 12 weeks, by the date each payout was finalized.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[...weeksByCurrency.entries()].map(([currency, weeks]) => (
              <WeeklySpendChart key={currency} currency={currency} weeks={weeks} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

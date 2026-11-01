"use client";

import React, { useState } from "react";
import { cn } from "../../lib/cn";
import type { OrganizationWeeklyReportVolume } from "../../types/organization";

const SERIES: { key: keyof Omit<OrganizationWeeklyReportVolume, "weekStart">; label: string; className: string }[] = [
  { key: "submittedCount", label: "Submitted", className: "fill-info" },
  { key: "resolvedCount", label: "Resolved", className: "fill-success" },
  { key: "otherClosedCount", label: "Closed (other)", className: "fill-ink-muted" },
];

function formatWeekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Real weekly report activity for an organization -- grouped columns (three independent
 * events per week: submitted, resolved, closed for another reason), never stacked, since
 * these are not three slices of one snapshot the way a status breakdown is -- a report
 * submitted this week and one resolved this week are unrelated events that can both be
 * true in the same week. Modeled on components/charts/volume-timeline.tsx's hover/
 * crosshair mechanism, adapted for this org-facing RPC's real 3-series shape (no
 * "in progress" series -- get_organization_weekly_report_volume only tracks submission
 * and terminal-closure events, not every intermediate status transition).
 */
export function OrganizationWeeklyVolume({ weeks }: { weeks: OrganizationWeeklyReportVolume[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxValue = Math.max(1, ...weeks.flatMap((w) => [w.submittedCount, w.resolvedCount, w.otherClosedCount]));
  const chartHeight = 140;
  const barWidth = 100 / weeks.length;
  const groupGap = barWidth * 0.12;
  const seriesWidth = (barWidth - groupGap * 2) / SERIES.length;

  const hasAnyActivity = weeks.some((w) => w.submittedCount + w.resolvedCount + w.otherClosedCount > 0);
  if (!hasAnyActivity) return null;

  return (
    <div>
      <div className="relative" onMouseLeave={() => setHoveredIndex(null)}>
        <svg viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-label="Weekly report submissions and closures, past 12 weeks">
          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line key={fraction} x1={0} x2={100} y1={chartHeight - chartHeight * fraction} y2={chartHeight - chartHeight * fraction} className="stroke-border" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          ))}
          {weeks.map((week, index) => {
            const isHovered = hoveredIndex === index;
            return (
              <g key={week.weekStart} onMouseEnter={() => setHoveredIndex(index)} className="cursor-pointer">
                <rect x={index * barWidth} y={0} width={barWidth} height={chartHeight} fill="transparent" />
                {SERIES.map((series, seriesIndex) => {
                  const value = week[series.key];
                  const height = (value / maxValue) * chartHeight;
                  if (height <= 0) return null;
                  return (
                    <rect
                      key={series.key}
                      x={index * barWidth + groupGap + seriesIndex * seriesWidth}
                      y={chartHeight - height}
                      width={Math.max(seriesWidth - 1, 0.5)}
                      height={height}
                      className={cn(series.className, "motion-safe:transition-opacity motion-safe:duration-150", isHovered ? "opacity-100" : "opacity-80")}
                      rx={0.6}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {hoveredIndex !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-surface-raised px-2.5 py-2 text-xs shadow-lg"
            style={{ left: `${(hoveredIndex + 0.5) * barWidth}%` }}
          >
            <p className="whitespace-nowrap font-semibold text-ink">Week of {formatWeekLabel(weeks[hoveredIndex].weekStart)}</p>
            <dl className="mt-1 space-y-0.5">
              {SERIES.map((series) => {
                const value = weeks[hoveredIndex][series.key];
                if (value === 0) return null;
                return (
                  <div key={series.key} className="flex items-center gap-1.5 whitespace-nowrap">
                    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", series.className.replace("fill-", "bg-"))} />
                    <dt className="text-ink-muted">{series.label}</dt>
                    <dd className="ml-auto font-mono font-semibold text-ink">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-muted">
        <span>{formatWeekLabel(weeks[0]?.weekStart ?? "")}</span>
        <span>{formatWeekLabel(weeks[weeks.length - 1]?.weekStart ?? "")}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {SERIES.map((series) => (
          <div key={series.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", series.className.replace("fill-", "bg-"))} />
            <span className="text-ink-muted">{series.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

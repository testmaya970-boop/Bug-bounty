"use client";

import React, { useState } from "react";
import { cn } from "../../lib/cn";
import type { MockWeeklyVolume } from "../../lib/mock/report-analytics";

const SERIES: { key: keyof Omit<MockWeeklyVolume, "weekStart">; label: string; className: string }[] = [
  { key: "new", label: "New", className: "fill-info" },
  { key: "inProgress", label: "In progress", className: "fill-warning" },
  { key: "resolved", label: "Resolved", className: "fill-success" },
  { key: "otherClosed", label: "Closed (other)", className: "fill-ink-muted" },
];

function formatWeekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * A stacked-bar volume timeline -- report status MOVEMENT over time, not a single line.
 * Each week is one column, segments stacked in a fixed status order (new -> in progress
 * -> resolved -> closed other), colors from the same statusTone family every badge/funnel
 * already uses. A hover crosshair + tooltip on the hovered column, per the dataviz
 * skill's interaction defaults for a time-series form.
 */
export function VolumeTimeline({ weeks }: { weeks: MockWeeklyVolume[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxTotal = Math.max(1, ...weeks.map((w) => w.new + w.inProgress + w.resolved + w.otherClosed));
  const chartHeight = 140;
  const barWidth = 100 / weeks.length;

  return (
    <div>
      <div className="relative" onMouseLeave={() => setHoveredIndex(null)}>
        <svg viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-label="Weekly report volume by status, past 12 weeks">
          {/* Recessive gridlines at 25/50/75/100% of the tallest week */}
          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line key={fraction} x1={0} x2={100} y1={chartHeight - chartHeight * fraction} y2={chartHeight - chartHeight * fraction} className="stroke-border" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          ))}
          {weeks.map((week, index) => {
            let yOffset = chartHeight;
            const segments = SERIES.map((series) => {
              const value = week[series.key];
              const height = (value / maxTotal) * chartHeight;
              const y = yOffset - height;
              yOffset = y;
              return { ...series, value, height, y };
            });
            const isHovered = hoveredIndex === index;
            return (
              <g key={week.weekStart} onMouseEnter={() => setHoveredIndex(index)} className="cursor-pointer">
                <rect x={index * barWidth} y={0} width={barWidth} height={chartHeight} fill="transparent" />
                {segments.map(
                  (segment) =>
                    segment.height > 0 && (
                      <rect
                        key={segment.key}
                        x={index * barWidth + barWidth * 0.15}
                        y={segment.y}
                        width={barWidth * 0.7}
                        height={Math.max(segment.height - 1, 0)}
                        className={cn(segment.className, "motion-safe:transition-opacity motion-safe:duration-150", isHovered ? "opacity-100" : "opacity-80")}
                        rx={1}
                      />
                    ),
                )}
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

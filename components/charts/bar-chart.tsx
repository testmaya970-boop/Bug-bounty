"use client";

import React from "react";
import { cn } from "../../lib/cn";

export type BarChartDatum = { label: string; value: number; colorClassName?: string };

/**
 * A plain horizontal bar list -- no charting library (see docs/decisions/0045): every
 * value here is a real, already-fetched count, and a dependency-free `<div>` scaled by
 * percentage of the max value is the entire mechanism. `colorClassName` is a `bg-*`
 * Tailwind class (defaults to the brand action color) so a caller can reuse this for any
 * real category breakdown -- reputation outcomes, report status, severity -- without a
 * second chart implementation per data shape. Renders nothing (not a zero-height chart)
 * when every value is zero, since a chart of all-zero bars communicates nothing.
 *
 * docs/decisions/0057: each bar's real, already-known width is what transitions in (a CSS
 * `transition` on `width`, triggered by mounting at 0 then committing to the true value one
 * frame later) rather than the previous flat opacity fade -- still strictly a reveal of a
 * real number, never an animated placeholder or guess. `motion-reduce:` renders the true
 * width immediately with no transition property at all.
 */
export function BarChart({ data, className }: { data: BarChartDatum[]; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const [revealed, setRevealed] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (total === 0) return null;

  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_2.5rem]">
          <span className="truncate text-ink-muted">{d.label}</span>
          <span className="h-2.5 min-w-0 overflow-hidden rounded-full bg-surface-muted">
            <span
              className={cn("block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", d.colorClassName ?? "bg-action")}
              style={{ width: revealed ? `${Math.max(2, (d.value / max) * 100)}%` : "0%" }}
            />
          </span>
          <span className="text-right font-mono font-semibold tabular-nums text-ink">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

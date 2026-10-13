import React from "react";

/**
 * A KPI tile: label, value, change vs the previous window, and a weekly sparkline. The
 * change is colored by whether up is good for THIS metric (more reports received is good;
 * a longer time to triage is not) and always carries its sign and arrow, never color alone.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  goodWhen = "up",
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Percent change vs the previous window; null when there is nothing to compare. */
  delta?: number | null;
  goodWhen?: "up" | "down";
  spark?: number[];
}) {
  const showDelta = delta !== undefined && delta !== null;
  const good = showDelta && delta !== 0 && (delta > 0) === (goodWhen === "up");
  const deltaTone = !showDelta || delta === 0 ? "text-ink-muted" : good ? "text-success" : "text-danger";
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{value}</p>
        <p className="mt-1 min-h-4 text-xs">
          {showDelta ? (
            <span className={deltaTone}>
              <span aria-hidden="true">{delta > 0 ? "▲" : delta < 0 ? "▼" : "■"}</span> {delta > 0 ? "+" : ""}
              {delta}% <span className="text-ink-muted">vs previous period</span>
            </span>
          ) : (
            hint && <span className="text-ink-muted">{hint}</span>
          )}
        </p>
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </div>
  );
}

/** De-emphasis gray trail with the latest point in the accent -- the tile's trend at a glance. */
function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 28;
  const max = Math.max(...values, 1);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 2 - (v / max) * (h - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--viz-axis)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="var(--viz-1)" />
    </svg>
  );
}

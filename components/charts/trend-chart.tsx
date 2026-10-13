"use client";

import React, { useState } from "react";
import { compactMoney, formatHours } from "../../lib/viz";

export type TrendSeries = { key: string; label: string; color: string };
export type TrendPoint = { label: string; values: Record<string, number> };
/** A name, not a function: this is a client component rendered from server pages, and
 * functions can't cross that boundary. "money:USD" values are major units (dollars). */
export type TrendFormat = "number" | "hours" | `money:${string}`;

function formatter(format: TrendFormat): (n: number) => string {
  if (format === "hours") return (n) => formatHours(n);
  if (format.startsWith("money:")) return (n) => compactMoney(n * 100, format.slice(6));
  return (n) => n.toLocaleString("en-US");
}

const PLOT_HEIGHT = 160;

/** 0 / 5 / 10 ... -- a clean top for the y axis. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4) ?? 10;
  return Math.ceil(value / (step * magnitude)) * step * magnitude;
}

/**
 * Weekly trend chart: stacked columns (counts that add up -- reports by severity) or lines
 * (rates and running totals -- time to triage, reputation). One y axis only. Hovering or
 * arrowing across the plot moves a crosshair to the nearest week and lists every series at
 * that week in one tooltip; the legend is always shown for 2+ series, and the card's table
 * view carries every value without hovering.
 */
export function TrendChart({
  series,
  points,
  mode,
  format: formatName = "number",
  ariaLabel,
}: {
  series: TrendSeries[];
  points: TrendPoint[];
  mode: "stacked" | "lines";
  format?: TrendFormat;
  ariaLabel: string;
}) {
  const format = formatter(formatName);
  const [active, setActive] = useState<number | null>(null);
  const totals = points.map((p) => (mode === "stacked" ? series.reduce((sum, s) => sum + (p.values[s.key] ?? 0), 0) : Math.max(0, ...series.map((s) => p.values[s.key] ?? 0))));
  const top = niceMax(Math.max(0, ...totals));
  const n = points.length;
  const band = 100 / Math.max(n, 1);
  const y = (v: number) => PLOT_HEIGHT - (v / top) * PLOT_HEIGHT;
  const xCenter = (i: number) => (i + 0.5) * band;
  const ticks = [0, top / 2, top];

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") setActive((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? n) - 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  }

  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div>
      <div className="flex gap-2">
        {/* y axis: three clean ticks, muted, tabular */}
        <div className="relative w-10 shrink-0 text-right text-[10px] tabular-nums text-ink-muted" style={{ height: PLOT_HEIGHT }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              {format(t)}
            </span>
          ))}
        </div>

        <div
          className="relative min-w-0 flex-1 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          role="img"
          aria-label={`${ariaLabel}. Use left and right arrow keys to read each week.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          <svg viewBox={`0 0 100 ${PLOT_HEIGHT}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: PLOT_HEIGHT }} aria-hidden="true">
            {ticks.map((t) => (
              <line key={t} x1={0} x2={100} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}

            {mode === "stacked" &&
              points.map((p, i) => {
                let base = PLOT_HEIGHT;
                const width = Math.min(band * 0.55, 4); // ~24px at a typical card width
                return series.map((s) => {
                  const value = p.values[s.key] ?? 0;
                  if (value <= 0) return null;
                  const h = (value / top) * PLOT_HEIGHT;
                  base -= h;
                  // 2px surface gap between stacked segments (drawn as a shorter segment).
                  return (
                    <rect
                      key={`${i}-${s.key}`}
                      x={xCenter(i) - width / 2}
                      y={base}
                      width={width}
                      height={Math.max(h - 1.5, 0.5)}
                      fill={s.color}
                      opacity={active === null || active === i ? 1 : 0.45}
                    />
                  );
                });
              })}

            {mode === "lines" &&
              series.map((s) => {
                const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xCenter(i).toFixed(2)},${y(p.values[s.key] ?? 0).toFixed(2)}`).join(" ");
                return (
                  <g key={s.key}>
                    {series.length === 1 && <path d={`${d} L${xCenter(n - 1)},${PLOT_HEIGHT} L${xCenter(0)},${PLOT_HEIGHT} Z`} fill={s.color} opacity={0.1} />}
                    <path d={d} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                  </g>
                );
              })}

            {active !== null && <line x1={xCenter(active)} x2={xCenter(active)} y1={0} y2={PLOT_HEIGHT} stroke="var(--ink-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>

          {/* End/active markers as HTML so they stay round under the stretched viewBox. */}
          {mode === "lines" &&
            series.map((s) => {
              const i = active ?? n - 1;
              if (n === 0) return null;
              return (
                <span
                  key={s.key}
                  aria-hidden="true"
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                  style={{ left: `${xCenter(i)}%`, top: y(points[i].values[s.key] ?? 0), background: s.color }}
                />
              );
            })}

          {/* Hit targets: one full-height column per week -- bigger than any mark. */}
          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <div key={p.label} className="h-full flex-1" onMouseEnter={() => setActive(i)} />
            ))}
          </div>

          {active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg"
              style={{ left: `${xCenter(active)}%`, transform: `translateX(${active > n / 2 ? "calc(-100% - 10px)" : "10px"})` }}
            >
              <p className="whitespace-nowrap font-medium text-ink-muted">{points[active].label}</p>
              <dl className="mt-1 space-y-0.5">
                {series.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                    <dd className="font-semibold tabular-nums text-ink">{format(points[active].values[s.key] ?? 0)}</dd>
                    <dt className="text-ink-muted">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* x axis: a handful of week labels, never cramped */}
      <div className="relative ml-12 mt-1.5 h-4 text-[10px] text-ink-muted" aria-hidden="true">
        {points.map((p, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          if (i !== n - 1 && n - 1 - i < labelEvery / 2) return null; // keep clear of the last label
          const edge = i === 0 ? "translate-x-0" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <span key={p.label} className={`absolute whitespace-nowrap ${edge}`} style={{ left: `${i === 0 ? 0 : i === n - 1 ? 100 : xCenter(i)}%` }}>
              {p.label}
            </span>
          );
        })}
      </div>

      {series.length > 1 && (
        <ul className="ml-12 mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={mode === "lines" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-sm"} style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import React from "react";
import { cn } from "../../lib/cn";
import type { Tone } from "../ui/badge";

export type DonutChartDatum = { label: string; value: number; tone: Tone };

const SIZE = 128;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A dependency-free SVG ring chart (see docs/decisions/0045) -- each segment takes a
 * real `Tone` (the exact `{text, bg}` pair components/ui/badge.tsx's own status/severity
 * badges use), never a chart-invented palette, and inverts correctly in dark mode with no
 * extra work. `tone.text` (used with `stroke="currentColor"`) draws the ring; `tone.bg`
 * fills the legend dot -- both are literal classes from the same shared map, never one
 * derived from the other at runtime (see badge.tsx's own comment for why that specific
 * mistake silently drops the color entirely under Tailwind's static content scan). The
 * center label is the real total, never a fabricated percentage or score. Renders
 * nothing when every value is zero.
 *
 * docs/decisions/0057: each segment's real, already-computed dash length is what draws in
 * (mount at a fully-retracted stroke, commit to the true `dash` value one frame later, via
 * a `transition` on `stroke-dasharray`) rather than the previous flat opacity fade -- still
 * strictly revealing a real, known value, never an animated guess. `motion-reduce:` renders
 * every segment at its true length immediately with no transition property at all.
 */
export function DonutChart({ data, centerLabel, className }: { data: DonutChartDatum[]; centerLabel: string; className?: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const [revealed, setRevealed] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (total === 0) return null;

  let cumulative = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = d.value / total;
      const dash = fraction * CIRCUMFERENCE;
      const offset = CIRCUMFERENCE * (1 - cumulative);
      cumulative += fraction;
      return { ...d, dash, offset };
    });

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" role="img" aria-label={`${centerLabel}: ${total} total`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-surface-muted" />
        {segments.map((segment) => (
          <circle
            key={segment.label}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeDasharray={revealed ? `${segment.dash} ${CIRCUMFERENCE - segment.dash}` : `0 ${CIRCUMFERENCE}`}
            strokeDashoffset={segment.offset}
            className={cn(segment.tone.text, "transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none")}
          />
        ))}
        <text x={SIZE / 2} y={SIZE / 2} textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-ink font-mono text-2xl font-semibold tabular-nums" transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}>
          {total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <li key={d.label} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", d.tone.bg)} />
              <span className="text-ink-muted">{d.label}</span>
              <span className="font-mono font-semibold text-ink">{d.value}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

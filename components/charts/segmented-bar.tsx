"use client";

import React, { useState } from "react";
import { cn } from "../../lib/cn";
import type { Tone } from "../ui/badge";

export type SegmentedBarDatum = { label: string; value: number; tone: Tone };

/**
 * A single proportional pipeline bar (GitHub's own language-breakdown bar is the closest
 * real-world reference) plus a dense legend grid -- not another list of individually-
 * scaled bars. Where BarChart (components/charts/bar-chart.tsx) answers "how big is each
 * category on its own," this answers "what does the whole set look like as one shape,"
 * which is the more honest read for a status *breakdown* specifically: nine real
 * categories that together make up one 100% total, not nine independent measurements.
 * See docs/decisions/0046. Every segment's color is a real `Tone` (the exact literal
 * `{text, bg}` pair components/ui/badge.tsx's own status/severity dots use), never a
 * runtime-derived class -- see that file's own comment on why that specific mistake
 * silently drops the color under Tailwind's static content scan. Renders nothing when
 * every value is zero; a zero-count category is simply absent from both the bar and the
 * legend, never a hollow segment or a "0%" row.
 *
 * Hover ties a segment to its legend row and vice versa (the dataviz skill's default
 * interaction layer for this form) -- the un-hovered segments dim rather than the
 * hovered one gaining a ring, so the reader's eye still lands on the whole shape first.
 */
export function SegmentedBar({ data, className }: { data: SegmentedBarDatum[]; className?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const present = data.filter((d) => d.value > 0);
  const total = present.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  return (
    <div className={cn(className)} onMouseLeave={() => setHovered(null)}>
      <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={present.map((d) => `${d.label}: ${d.value}`).join(", ")}>
        {present.map((d, index) => (
          <div
            key={d.label}
            onMouseEnter={() => setHovered(d.label)}
            className={cn(
              d.tone.bg,
              "h-full cursor-pointer motion-safe:animate-enter-fade motion-safe:transition-opacity motion-safe:duration-150",
              index < present.length - 1 && "border-r-2 border-canvas",
              hovered !== null && hovered !== d.label && "opacity-40",
            )}
            style={{ width: `${(d.value / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
        {present.map((d) => (
          <div
            key={d.label}
            onMouseEnter={() => setHovered(d.label)}
            className={cn("flex cursor-pointer items-center gap-2 rounded motion-safe:transition-opacity motion-safe:duration-150", hovered !== null && hovered !== d.label && "opacity-50")}
          >
            <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", d.tone.bg)} />
            <dt className="min-w-0 flex-1 truncate text-ink-muted">{d.label}</dt>
            <dd className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="font-mono font-semibold text-ink">{d.value}</span>
              <span className="font-mono text-xs text-ink-muted">{Math.round((d.value / total) * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

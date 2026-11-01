import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { RANGES } from "../../lib/viz";

/**
 * The one filter row above a dashboard: the time window every tile and chart below re-reads.
 * Plain links (?range=), so the choice is shareable and survives a reload.
 */
export function RangeFilter({ basePath, current, extraParams }: { basePath: string; current: number; extraParams?: Record<string, string> }) {
  return (
    <nav aria-label="Time range" className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm">
      {RANGES.map((range) => {
        const active = range.days === current;
        const params = new URLSearchParams({ ...extraParams, range: range.key });
        return (
          <Link
            key={range.key}
            prefetch={false}
            href={`${basePath}?${params.toString()}` as Route}
            aria-current={active ? "true" : undefined}
            className={`rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${active ? "bg-ink font-medium text-canvas" : "text-ink-muted hover:bg-surface-muted hover:text-ink"}`}
          >
            {range.label}
          </Link>
        );
      })}
    </nav>
  );
}

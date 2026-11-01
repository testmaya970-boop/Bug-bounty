import React from "react";
import Link from "next/link";
import type { Route } from "next";

export type BarListItem = { label: string; value: number; secondary?: string; href?: string };

/**
 * Ranked horizontal bars (top weaknesses, assets, programs, researchers). One series, so
 * one color for every bar (slot 1) -- the length carries magnitude, not the hue -- with the
 * value at the bar's tip. Bars cap at 10px tall with a 4px rounded end.
 */
export function BarList({ items, format = (n) => n.toLocaleString("en-US") }: { items: BarListItem[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const label = (
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink" title={item.label}>
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-ink">{format(item.value)}</span>
              {item.secondary && <span className="ml-1.5 text-xs text-ink-muted">{item.secondary}</span>}
            </span>
          </span>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link prefetch={false} href={item.href as Route} className="block rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus hover:[&_.bar]:opacity-80">
                {label}
              </Link>
            ) : (
              label
            )}
            <div className="mt-1.5 h-2.5 w-full rounded-r-[4px] bg-transparent">
              <div className="bar h-full rounded-r-[4px]" style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%`, background: "var(--viz-1)" }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

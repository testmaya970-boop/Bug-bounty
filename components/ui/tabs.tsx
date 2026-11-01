"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { cn } from "../../lib/cn";

export type TabItem = { key: string; label: string; href: string; count?: number };

/**
 * A real `?tab=` URL, not client-only state -- a tab is a page, so it stays bookmarkable,
 * shareable, and survives a refresh, matching this codebase's existing GET-form filter
 * pattern (see app/programs/page.tsx's own search form comment). No JS is required for
 * the tab to render correctly server-side (a plain <a href>, so middle-click/open-in-new-
 * tab/no-JS all still work) -- but with JS, router.push inside useTransition gives an
 * IMMEDIATE pressed/active-tab visual on click, before the new route's server payload
 * arrives, rather than the bare <Link>'s prior behavior of zero DOM change for the full
 * 300-600ms navigation (found live: this was the one real interaction in the whole app
 * that missed the perceived-latency bar, confirmed via performance.now()-bracketed
 * click-to-first-DOM-mutation profiling). isPending drives a subtle opacity dip on the
 * inactive tabs so the click always reads as registered even while its own content is
 * still loading.
 */
export function Tabs({ items, active, className }: { items: TabItem[]; active: string; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticActive, setOptimisticActive] = React.useState(active);
  const displayActive = isPending ? optimisticActive : active;

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, item: TabItem) {
    // Let a modified click (open in new tab, middle-click, etc.) fall through to the
    // browser's own default <a> behavior untouched.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOptimisticActive(item.key);
    startTransition(() => {
      router.push(item.href as Route);
    });
  }

  return (
    <div className={cn("border-b border-border", className)}>
      <nav aria-label="Sections" className="-mb-px flex items-end gap-1 overflow-x-auto">
        {items.map((item) => {
          const isActive = item.key === displayActive;
          return (
            <a
              key={item.key}
              href={item.href}
              onClick={(event) => handleClick(event, item)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-[color,border-color,opacity] duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                isActive ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink",
                isPending && item.key !== optimisticActive && "opacity-60",
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                    isActive ? "border-action text-action" : "border-border-strong text-ink-muted",
                  )}
                >
                  {item.count}
                </span>
              )}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

import React from "react";
import Link from "next/link";
import type { Route } from "next";

// No "Overview" tab: the sidebar's Analytics item already links to the overview, and a sub-nav
// never repeats a destination of the level above (AGENTS.md, one nav control per level).
const TABS = [
  { key: "explore", label: "Explore & export", path: "/explore" },
  { key: "schedules", label: "Scheduled exports", path: "/schedules" },
] as const;

/** The analytics section's own sub-nav (one level below the sidebar's "Analytics"). */
export function AnalyticsTabs({ organizationId, active }: { organizationId: string; active: (typeof TABS)[number]["key"] | "overview" }) {
  return (
    <nav aria-label="Analytics" className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          prefetch={false}
          href={`/organizations/${organizationId}/analytics${tab.path}` as Route}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${tab.key === active ? "border-action font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

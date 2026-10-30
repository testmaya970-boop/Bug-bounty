"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

/** Switches the Explore view to another organization the person can analyse. Not a form field:
 * each organization has its own URL, and filters (program/asset ids) don't carry across. */
export function WorkspaceSelect({ current, options }: { current: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      Workspace
      <select
        defaultValue={current}
        onChange={(e) => router.push(`/organizations/${e.target.value}/analytics/explore` as Route)}
        className="inline-flex h-9 max-w-56 items-center rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

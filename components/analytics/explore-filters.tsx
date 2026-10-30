import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { X } from "@phosphor-icons/react/dist/ssr";
import { FILTER_STATUSES, RANGE_PRESETS, filtersToSearch, type AnalyticsFilters } from "../../lib/analytics/filters";
import { SEVERITY_KEYS } from "../../lib/analytics/report-metrics";
import { reportStatusLabel } from "../../lib/report-status";
import { WorkspaceSelect } from "./workspace-select";

type Option = { value: string; label: string };
const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info", unrated: "Not yet rated" };
const CONTROL = "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** A native multi-select: checkboxes in a disclosure, submitted with the form (works without JS). */
function MultiSelect({ name, label, options, selected }: { name: string; label: string; options: Option[]; selected: string[] }) {
  return (
    <details className="group relative">
      <summary className={`${CONTROL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {label}
        {selected.length > 0 && <span className="rounded bg-ink px-1.5 font-mono text-[11px] text-canvas">{selected.length}</span>}
        <span aria-hidden="true" className="text-ink-muted">▾</span>
      </summary>
      <fieldset className="absolute left-0 z-30 mt-1 max-h-72 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1.5 shadow-lg">
        <legend className="sr-only">{label}</legend>
        {options.length === 0 && <p className="px-2 py-1.5 text-sm text-ink-muted">Nothing to choose yet.</p>}
        {options.map((o) => (
          <label key={o.value} className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-surface-muted">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="size-4 shrink-0 accent-[var(--color-action)]" />
            <span className="min-w-0 truncate">{o.label}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

/**
 * The Explore filter bar: workspace (organization), date range, program, severity, status and
 * asset. A plain GET form, so every view is a shareable URL and the export links carry the
 * exact same filters.
 */
export function ExploreFilters({
  basePath,
  filters,
  workspaces,
  organizationId,
  programs,
  assets,
}: {
  basePath: string;
  filters: AnalyticsFilters & { range: string };
  workspaces: Option[];
  organizationId: string;
  programs: Option[];
  assets: Option[];
}) {
  const without = (key: "programIds" | "severities" | "statuses" | "assetIds", value: string) =>
    `${basePath}?${filtersToSearch({ ...filters, [key]: (filters[key] as string[]).filter((v) => v !== value) })}` as Route;
  const names = new Map([...programs, ...assets].map((o) => [o.value, o.label]));
  const chips: { key: string; label: string; href: Route }[] = [
    ...filters.programIds.map((v) => ({ key: `p${v}`, label: `Program: ${names.get(v) ?? "Unknown"}`, href: without("programIds", v) })),
    ...filters.severities.map((v) => ({ key: `s${v}`, label: `Severity: ${SEVERITY_LABEL[v]}`, href: without("severities", v) })),
    ...filters.statuses.map((v) => ({ key: `t${v}`, label: `Status: ${reportStatusLabel(v)}`, href: without("statuses", v) })),
    ...filters.assetIds.map((v) => ({ key: `a${v}`, label: `Asset: ${names.get(v) ?? "Unknown"}`, href: without("assetIds", v) })),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted/50 p-3">
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        {workspaces.length > 1 && <WorkspaceSelect current={organizationId} options={workspaces} />}
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Date range
          <select name="range" defaultValue={filters.range} className={CONTROL}>
            {RANGE_PRESETS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          From
          <input type="date" name="from" defaultValue={filters.from} className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          To
          <input type="date" name="to" defaultValue={filters.to} className={CONTROL} />
        </label>
        <MultiSelect name="program" label="Program" options={programs} selected={filters.programIds} />
        <MultiSelect name="severity" label="Severity" options={SEVERITY_KEYS.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} selected={filters.severities} />
        <MultiSelect name="status" label="Status" options={FILTER_STATUSES.map((s) => ({ value: s, label: reportStatusLabel(s) }))} selected={filters.statuses} />
        <MultiSelect name="asset" label="Asset" options={assets} selected={filters.assetIds} />
        <button type="submit" className="inline-flex h-9 items-center rounded-md bg-action px-4 text-sm font-medium text-on-action hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Apply
        </button>
        {(chips.length > 0 || filters.range !== "90") && (
          <Link prefetch={false} href={basePath as Route} className="inline-flex h-9 items-center px-2 text-sm text-ink-muted hover:text-ink">
            Reset
          </Link>
        )}
      </form>
      <p className="text-xs text-ink-muted">
        Showing reports submitted <span className="font-medium text-ink">{filters.from}</span> to <span className="font-medium text-ink">{filters.to}</span> (UTC).
        &nbsp;Choose &ldquo;Custom dates&rdquo; to use the From and To fields.
      </p>
      {chips.length > 0 && (
        <ul aria-label="Active filters" className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li key={c.key}>
              <Link prefetch={false} href={c.href} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface py-0.5 pl-2.5 pr-1.5 text-xs text-ink hover:border-ink-muted">
                <span className="truncate">{c.label}</span>
                <X aria-label="Remove filter" className="size-3 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

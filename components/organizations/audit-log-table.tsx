import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { LocalTime } from "../ui/local-time";
import { Button } from "../ui/button";
import { activityActionLabel } from "../../lib/organization-activity-labels";
import { describeAuditChange } from "../../lib/audit-change";
import type { AuditCategory, AuditLogEntry, AuditLogFilters } from "../../services/organization-members";

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  scope: "Scope and assets",
  programs: "Programs",
  members: "Team members",
  researchers: "Researchers",
  reports: "Reports and bounties",
  billing: "Billing and payments",
  organization: "Organization and integrations",
};

/**
 * The organization's audit log (owner / security admin): who did what, when, and exactly what
 * changed -- a scope target moved out of scope, a member removed, a budget set. Filters are a
 * plain GET form, so a filtered view is a shareable URL and works without JavaScript.
 */
export function AuditLogTable({ basePath, filters, entries, next }: { basePath: string; filters: AuditLogFilters; entries: AuditLogEntry[]; next: { createdAt: string; id: string } | null }) {
  const field = "h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-ink outline-none focus-visible:border-focus";
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  const olderHref = next ? `${basePath}?${new URLSearchParams({ ...Object.fromEntries(params), before: next.createdAt, beforeId: next.id })}` : null;

  return (
    <section aria-labelledby="audit-log" className="space-y-3">
      <form action={basePath} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
        <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink-muted sm:max-w-xs">
          Search
          <span className="relative">
            <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
            <input type="search" name="q" defaultValue={filters.query} placeholder="Person, target, value…" className={`${field} w-full pl-7`} />
          </span>
        </label>
        <label className="grid gap-1 text-xs text-ink-muted">
          Category
          <select name="category" defaultValue={filters.category ?? ""} className={field}>
            <option value="">Everything</option>
            {(Object.keys(CATEGORY_LABEL) as AuditCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-ink-muted">
          From
          <input type="date" name="from" defaultValue={filters.from} className={field} />
        </label>
        <label className="grid gap-1 text-xs text-ink-muted">
          To
          <input type="date" name="to" defaultValue={filters.to} className={field} />
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {params.size > 0 && (
          <Link prefetch={false} href={basePath as Route} className="px-1 text-[13px] text-ink-muted hover:text-ink">
            Clear
          </Link>
        )}
        <a href={`${basePath}/export?${params}`} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] text-ink hover:bg-surface-hover">
          <DownloadSimple aria-hidden="true" className="size-4" />
          CSV
        </a>
      </form>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-ink-muted">Nothing matches these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-left text-[13px]">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b border-border bg-surface-hover text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Who</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">What changed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => {
                const change = describeAuditChange(e.metadata);
                const removal = /removed|deleted|revoked|suspended|cancelled/.test(e.action);
                return (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">
                      <LocalTime value={e.createdAt} />
                    </td>
                    <td className="px-3 py-2.5 text-ink">{e.actorId ? e.actorName ?? "Former member" : "System"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 ${removal ? "text-danger" : "text-ink"}`}>
                        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${removal ? "bg-danger" : "bg-ink-muted"}`} />
                        {activityActionLabel(e.action)}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">{e.action}</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {change.length === 0 ? <span className="text-ink-muted">No details recorded</span> : change.map((line) => <span key={line} className="block break-words">{line}</span>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {olderHref && (
            <div className="border-t border-border px-3 py-2.5 text-right">
              <Link prefetch={false} href={olderHref as Route} className="text-[13px] font-medium text-action hover:underline">
                Older entries →
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

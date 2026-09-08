"use client";

import React, { useMemo, useState } from "react";
import { SeverityBadge } from "../ui/badge";
import { EmptyState } from "../ui/feedback";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format-date";
import type { PublicDisclosure, ReportSeverity } from "../../types/report";

type SortKey = "newest" | "oldest";
const SEVERITY_ORDER: ReportSeverity[] = ["critical", "high", "medium", "low", "none"];

/**
 * Search/filter/sort over the public disclosure feed -- closes the "no search/filter"
 * gap against HackerOne's Hacktivity. Client-side over the already-loaded, small feed
 * (the same "filter what's already on the page" pattern /learn's own library grid and
 * the researcher leaderboard table already use), since a public disclosure list has no
 * realistic volume that would need server-side pagination yet. No upvote/reaction field
 * exists on `PublicDisclosure` -- adding one would require a real vote table and
 * authentication model this document does not introduce; search/filter/sort is the
 * scoped fix for this pass.
 */
export function DisclosureFeed({ disclosures }: { disclosures: PublicDisclosure[] }) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<ReportSeverity | "">("");
  const [sort, setSort] = useState<SortKey>("newest");

  const visible = useMemo(() => {
    let filtered = disclosures;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter(
        (d) =>
          (d.publishedTitle ?? "").toLowerCase().includes(term) ||
          (d.publishedSummary ?? "").toLowerCase().includes(term) ||
          d.programName.toLowerCase().includes(term) ||
          d.organizationName.toLowerCase().includes(term),
      );
    }
    if (severityFilter) filtered = filtered.filter((d) => d.confirmedSeverity === severityFilter);
    return [...filtered].sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return sort === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [disclosures, search, severityFilter, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="disclosure-search">
          Search disclosures
        </label>
        <input
          id="disclosure-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title, program, or organization"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 sm:max-w-72"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSeverityFilter("")}
            aria-pressed={severityFilter === ""}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              severityFilter === "" ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
            )}
          >
            All severities
          </button>
          {SEVERITY_ORDER.map((severity) => (
            <button
              key={severity}
              type="button"
              onClick={() => setSeverityFilter(severity)}
              aria-pressed={severityFilter === severity}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-semibold capitalize transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                severityFilter === severity ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
              )}
            >
              {severity}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSort((current) => (current === "newest" ? "oldest" : "newest"))}
          className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-ink-muted transition-colors duration-150 hover:text-ink motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Sort · {sort === "newest" ? "Newest" : "Oldest"}
        </button>
      </div>

      <p className="mt-3 font-mono text-xs text-ink-muted">
        {visible.length} of {disclosures.length} disclosures
      </p>

      <div className="mt-2">
        {visible.length === 0 ? (
          <EmptyState title="No disclosures match">Try a different search term or clear the severity filter.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {visible.map((disclosure) => (
              <li key={disclosure.reportId} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{disclosure.organizationName}</p>
                    <p className="mt-0.5 font-semibold text-ink">{disclosure.publishedTitle ?? "Untitled report"}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {disclosure.programName} · {disclosure.publishedAt ? formatDate(disclosure.publishedAt) : "Unknown date"}
                    </p>
                  </div>
                  {disclosure.confirmedSeverity && <SeverityBadge severity={disclosure.confirmedSeverity} />}
                </div>
                {disclosure.publishedSummary && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">{disclosure.publishedSummary}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import type { PublicLeaderboardRow } from "../../types/reputation";

type SortKey = "score" | "resolvedCount" | "bountyFinalizedCount";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "resolvedCount", label: "Resolved" },
  { key: "bountyFinalizedCount", label: "Bounties" },
];

// Grid template shared by the header row and every data row -- Researcher / Score /
// Resolved / Bounties, the exact real columns get_public_leaderboard actually returns
// (docs/decisions/0065) -- no region/level/dollar-amount column, since none of those
// exist on the real leaderboard. No rank column: docs/decisions/0074 replaces the
// competitive-ranking treatment (numbered rank, distance-from-leader bar, "behind #1"
// framing) with a plain registry -- the same real data, ordered by whichever real column
// is currently sorted, without editorializing that order as a race.
const GRID_COLS = "grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4.5rem]";

/**
 * A researcher index/intelligence registry -- every real, computed field
 * get_public_leaderboard returns, ordered by the chosen real column, never framed as a
 * competitive race (no rank number, no "distance from #1" bar, no gap language). Real,
 * server-fetched rows (docs/decisions/0065); filtering/sorting stays local client-side
 * state over the already-loaded page, matching this codebase's own existing GET-form/
 * local-state split elsewhere -- re-sorting 50 already-loaded rows needs no round trip.
 */
export function LeaderboardTable({ rows, myResearcherId }: { rows: PublicLeaderboardRow[]; myResearcherId?: string }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const visibleRows = useMemo(() => {
    const filtered = search.trim() ? rows.filter((row) => row.displayName.toLowerCase().includes(search.trim().toLowerCase())) : rows;
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [rows, search, sortKey]);

  function handleReset() {
    setSearch("");
    setSortKey("score");
  }

  const hasActiveFilters = search.trim() !== "" || sortKey !== "score";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Researcher registry</SectionLabel>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          {visibleRows.length} of {rows.length}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="leaderboard-search">
          Search researchers by name
        </label>
        <input
          id="leaderboard-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 sm:max-w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSortKey(option.key)}
              aria-pressed={sortKey === option.key}
              className={cn(
                "min-h-9 border-b-2 px-2.5 font-mono text-xs font-semibold uppercase tracking-wide transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                sortKey === option.key ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="min-h-9 px-2.5 text-xs font-semibold text-ink-muted underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Reset
          </button>
        )}
      </div>

      <div className="mt-3">
        {visibleRows.length === 0 ? (
          <p className="border-t border-dashed border-border py-6 text-sm text-ink-muted">No researcher matches this search.</p>
        ) : (
          <div role="table" aria-label="Researcher registry">
            <div role="row" className={cn("grid items-center gap-3 border-b border-border py-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted/70", GRID_COLS)}>
              <span role="columnheader">Researcher</span>
              <span role="columnheader" className="text-right">
                Score
              </span>
              <span role="columnheader" className="text-right">
                Resolved
              </span>
              <span role="columnheader" className="text-right">
                Bounties
              </span>
            </div>

            {visibleRows.map((row, index) => {
              const isMe = myResearcherId && row.researcherId === myResearcherId;
              return (
                <div
                  key={row.researcherId ?? `anonymous-${index}`}
                  role="row"
                  className={cn("grid items-center gap-3 border-b border-border/70 py-2.5 transition-colors duration-150 last:border-0 hover:bg-surface-muted motion-reduce:transition-none", GRID_COLS, isMe && "bg-surface-muted")}
                >
                  <div role="cell" className="flex min-w-0 items-center gap-2">
                    {row.publicUsername ? (
                      <Link prefetch={false}
                        href={`/researchers/${row.publicUsername}` as Route}
                        className="truncate text-sm font-semibold text-ink transition-colors duration-150 hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
                      >
                        {row.displayName}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-semibold text-ink">{row.displayName}</p>
                    )}
                    {isMe && <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">You</span>}
                  </div>

                  <span role="cell" className="text-right font-mono text-sm font-semibold tabular-nums text-ink">
                    {row.score.toLocaleString("en-US")}
                  </span>
                  <span role="cell" className="text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.resolvedCount}
                  </span>
                  <span role="cell" className="text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.bountyFinalizedCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import type { CtfLeaderboardRow, CtfLevel } from "../../services/ctf";

type SortKey = "ctfPoints" | "challengesSolved";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "ctfPoints", label: "Points" },
  { key: "challengesSolved", label: "Solved" },
];
const LEVEL_OPTIONS: CtfLevel[] = ["Distinguished", "Expert", "Specialist", "Practitioner", "Apprentice"];

// Shared by header and data rows so columns can never drift -- same recipe as
// components/researchers/leaderboard-table.tsx's own GRID_COLS, with CTF-specific
// columns (Rank / Researcher (+ distance track) / Points / Solved / Fastest solve /
// Level), never the real reputation ledger's vocabulary.
const GRID_COLS = "grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.5rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_6rem_5rem_6.5rem]";

/**
 * The CTF section's own leaderboard -- deliberately gamified vocabulary (points, rank,
 * solved), never the real reputation ledger's "confirmed outcomes" language.
 * Real standings from ctf_solves (get_ctf_leaderboard); never merged with /researchers' own
 * reputation leaderboard.
 * Structural clone of components/researchers/leaderboard-table.tsx's filter/sort/
 * distance-bar/"You"-row recipe.
 */
export function CtfLeaderboardTable({ rows, myResearcherId }: { rows: CtfLeaderboardRow[]; myResearcherId?: string }) {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<CtfLevel | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("ctfPoints");

  const leaderPoints = rows[0]?.ctfPoints ?? 1;

  const visibleRows = useMemo(() => {
    let filtered = rows;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter((row) => row.name.toLowerCase().includes(term) || row.username?.toLowerCase().includes(term));
    }
    if (levelFilter) filtered = filtered.filter((row) => row.level === levelFilter);
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [rows, search, levelFilter, sortKey]);

  function handleReset() {
    setSearch("");
    setLevelFilter("");
    setSortKey("ctfPoints");
  }
  const hasActiveFilters = search.trim() !== "" || levelFilter !== "" || sortKey !== "ctfPoints";

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionLabel>CTF leaderboard</SectionLabel>
          <h2 className="mt-1 text-lg font-semibold text-ink">Every ranked challenger</h2>
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-muted">Points from flags you capture here. Ties go to whoever got there first.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="ctf-leaderboard-search">
          Search researchers by name
        </label>
        <input
          id="ctf-leaderboard-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or @username"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 sm:max-w-56"
        />
        <label className="sr-only" htmlFor="ctf-leaderboard-level-filter">
          Filter by level
        </label>
        <select
          id="ctf-leaderboard-level-filter"
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value as CtfLevel | "")}
          className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
        >
          <option value="">All levels</option>
          {LEVEL_OPTIONS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSortKey(option.key)}
              aria-pressed={sortKey === option.key}
              className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97]",
                sortKey === option.key ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
              )}
            >
              Sort · {option.label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="min-h-10 rounded-md px-3 text-xs font-semibold text-ink-muted underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97]"
          >
            Reset
          </button>
        )}
      </div>

      <p className="mt-3 font-mono text-xs text-ink-muted">
        {visibleRows.length} of {rows.length} challengers
      </p>

      <div className="mt-2">
        {visibleRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-ink-muted">
            {rows.length === 0 ? "Nobody has captured a flag yet. Solve a challenge to take the top spot." : "No challenger matches these filters."}
          </p>
        ) : (
          <div role="table" aria-label="CTF leaderboard" className="overflow-hidden rounded-lg border border-border bg-surface">
            <div role="row" className={cn("grid items-center gap-3 border-b border-border bg-surface-muted px-3 py-2 text-[11px] font-semibold text-ink-muted", GRID_COLS)}>
              <span role="columnheader">Rank</span>
              <span role="columnheader">Researcher</span>
              <span role="columnheader" className="text-right">
                Points
              </span>
              <span role="columnheader" className="text-right">
                Solved
              </span>
              <span role="columnheader" className="hidden lg:block">
                Level
              </span>
            </div>

            {visibleRows.map((row) => {
              const distancePct = Math.round((row.ctfPoints / leaderPoints) * 1000) / 10;
              const gap = leaderPoints - row.ctfPoints;
              const isMe = myResearcherId !== undefined && row.researcherId === myResearcherId;
              return (
                <div key={row.researcherId} role="row" className={cn("grid items-center gap-3 border-b border-border px-3 py-2.5 last:border-0", GRID_COLS, isMe && "bg-action/5")}>
                  <span role="cell" className="font-mono text-xs font-semibold text-ink-muted">
                    #{row.rank}
                  </span>

                  <div role="cell" className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                      {isMe && <span className="shrink-0 rounded-full bg-action/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-action">You</span>}
                    </div>
                    <p className="truncate font-mono text-[11px] text-ink-muted">{row.username ? `@${row.username}` : "No username yet"}</p>
                    <div className="relative mt-1.5 h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-action motion-safe:transition-[width] motion-safe:duration-150" style={{ width: `${distancePct}%`, opacity: Math.max(0.35, 1 - (row.rank - 1) * 0.045) }} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-ink-muted lg:hidden">
                      {row.level}
                      {row.rank > 1 && <span className="text-danger"> · −{gap.toLocaleString("en-US")} behind #1</span>}
                    </p>
                    {row.rank > 1 && <p className="mt-0.5 hidden font-mono text-[11px] text-danger lg:block">−{gap.toLocaleString("en-US")} behind #1</p>}
                  </div>

                  <span role="cell" className="text-right font-mono text-sm font-bold tabular-nums text-ink">
                    {row.ctfPoints.toLocaleString("en-US")}
                  </span>
                  <span role="cell" className="text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.challengesSolved}
                  </span>
                  <span role="cell" className="hidden truncate text-xs font-medium text-ink-muted lg:block">
                    {row.level}
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

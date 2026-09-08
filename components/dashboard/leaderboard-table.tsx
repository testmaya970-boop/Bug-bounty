"use client";

import React, { useMemo, useState } from "react";
import { Card } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import type { MockLeaderboardRow } from "../../lib/mock/researcher-dashboard";

type SortKey = "reputation" | "reports" | "acceptedReports";
const SORT_LABELS: Record<SortKey, string> = { reputation: "Reputation", reports: "Reports", acceptedReports: "Accepted" };

export function LeaderboardTable({ rows }: { rows: MockLeaderboardRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reputation");

  const visibleRows = useMemo(() => {
    const filtered = search.trim() ? rows.filter((row) => row.username.toLowerCase().includes(search.trim().toLowerCase())) : rows;
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [rows, search, sortKey]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Leaderboard</SectionLabel>
          <h2 className="mt-1 text-lg font-semibold text-ink">Top researchers this week</h2>
        </div>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search researchers"
          aria-label="Search researchers by username"
          className="min-h-10 w-full max-w-56 rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortKey(key)}
            aria-pressed={sortKey === key}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              sortKey === key ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
            )}
          >
            Sort by {SORT_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th scope="col" className="py-2 pr-3">Rank</th>
              <th scope="col" className="py-2 pr-3">Username</th>
              <th scope="col" className="py-2 pr-3 text-right">Reputation</th>
              <th scope="col" className="py-2 pr-3 text-right">Reports</th>
              <th scope="col" className="py-2 pr-3 text-right">Accepted</th>
              <th scope="col" className="py-2 text-right">Rewards</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.username} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-3 font-mono tabular-nums text-ink-muted">#{row.rank}</td>
                <td className="py-2.5 pr-3 font-medium text-ink">{row.username}</td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink">{row.reputation.toLocaleString("en-US")}</td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink-muted">{row.reports}</td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink-muted">{row.acceptedReports}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-success">${Math.round(row.bountyEarnedMinorUnits / 100).toLocaleString("en-US")}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-ink-muted">
                  No researcher matches “{search}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

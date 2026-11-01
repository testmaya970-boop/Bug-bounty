import React from "react";
import { SectionLabel } from "../ui/security-primitives";

/** Real, per-program verified-outcome counts (see services/reputation.ts's
 * getMyReputationProgramCounts for why this is a true total, not a partial-page tally).
 * A program id missing from `programNames` (no report of the researcher's own ever
 * resolved into that page's `listMyReports()` join) degrades to "Unknown program"
 * rather than erroring -- the count itself is still real. No ranking implied by row
 * order: sorted by count purely to put the most-evidenced program first, the same
 * "most significant first" convention this product's other lists already use, never a
 * leaderboard position. */
export function ReputationProgramContext({ programCounts, programNames }: { programCounts: { programId: string; count: number }[]; programNames: Map<string, string> }) {
  if (programCounts.length === 0) return null;
  const sorted = [...programCounts].sort((a, b) => b.count - a.count);

  return (
    <div>
      <SectionLabel>Programs</SectionLabel>
      <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
        {sorted.map(({ programId, count }) => (
          <li key={programId} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="font-medium text-ink">{programNames.get(programId) ?? "Unknown program"}</span>
            <span className="whitespace-nowrap font-mono text-ink-muted">
              {count} verified outcome{count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

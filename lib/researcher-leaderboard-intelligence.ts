import type { PublicLeaderboardRow } from "../types/reputation";

// The public leaderboard row plus its rank. Only what get_public_leaderboard returns is public:
// name, @username (unless the researcher opted out), score, resolved reports and finalized
// bounties. Nothing else about a researcher is shown here.

/** How the list is ordered: the leaderboard's own score, or one of its two public counts. */
export type LeaderboardSort = "score" | "resolved" | "bounties";

export type EnrichedLeaderboardRow = PublicLeaderboardRow & { rank: number; username: string };

export function enrichLeaderboardRow(row: PublicLeaderboardRow, index: number): EnrichedLeaderboardRow {
  return { ...row, rank: index + 1, username: row.username ?? row.publicUsername ?? "" };
}

/** The leaders on each public measure, for the summary cards. */
export function calculateLeaderboardSummary(rows: EnrichedLeaderboardRow[]) {
  const visible = rows.filter((r) => r.researcherId !== null);
  if (visible.length === 0) return null;
  const by = (pick: (r: EnrichedLeaderboardRow) => number) => visible.reduce((best, r) => (pick(r) > pick(best) ? r : best), visible[0]);
  return {
    top: visible[0],
    mostResolved: by((r) => r.resolvedCount),
    mostBounties: by((r) => r.bountyFinalizedCount),
    ranked: rows.length,
  };
}

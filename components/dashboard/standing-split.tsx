import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { EmptyState } from "../ui/feedback";
import { ReputationSummarySection } from "../reputation/reputation-summary";
import type { PublicLeaderboardRow } from "../../types/reputation";
import type { ReputationFactCount } from "../../types/reputation";

/**
 * Verified Impact: an asymmetric split, not two equal-weight cards. Real reputation (the
 * thing that's actually true, organization-confirmed) gets more width, a raised surface,
 * and a left accent rail so it reads as this section's dominant fact.
 *
 * The community leaderboard beside it is now a real top-N slice of the same
 * get_public_leaderboard RPC the full /researchers page renders (services/reputation.ts's
 * getPublicLeaderboard) -- a previous version rendered lib/mock/researcher-dashboard's
 * MOCK_LEADERBOARD here, captioned "Preview"/"Mock data," while its own "Full board →"
 * link pointed at /researchers, which shows the REAL leaderboard -- so the preview and
 * "full version" were silently two different datasets. Now they're the same one, just
 * truncated, so the preview relationship is actually true.
 */
export function StandingSplit({
  reputationCounts,
  hasReputationHistory,
  leaderboardRows,
}: {
  reputationCounts: ReputationFactCount[];
  hasReputationHistory: boolean;
  leaderboardRows: PublicLeaderboardRow[];
}) {
  const visibleRows = leaderboardRows.slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="rounded-xl border border-border border-l-4 border-l-action bg-surface-raised p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SectionLabel>Verified impact</SectionLabel>
            <h2 className="mt-0.5 text-base font-semibold text-ink">Your reputation</h2>
          </div>
          <Link prefetch={false} href={"/researchers" as Route} className="shrink-0 font-mono text-xs font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Full record →
          </Link>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Organization-confirmed outcomes. Never ranked, weighted, or gamified.</p>
        <div className="mt-4">
          {!hasReputationHistory ? (
            <EmptyState title="No verified outcomes yet">Reputation appears here as your reports reach meaningful outcomes.</EmptyState>
          ) : (
            <ReputationSummarySection counts={reputationCounts} />
          )}
        </div>
      </div>

      <div className="rounded-xl bg-surface-muted p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SectionLabel>Leaderboard</SectionLabel>
            <h2 className="mt-0.5 text-base font-semibold text-ink">Top researchers</h2>
          </div>
          <Link prefetch={false} href={"/researchers" as Route} className="shrink-0 font-mono text-xs font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Full board →
          </Link>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Real, computed from organization-confirmed outcomes -- the same leaderboard shown in full at /researchers.</p>

        <div className="mt-3 divide-y divide-border">
          {visibleRows.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-muted">The leaderboard fills in as researchers earn confirmed outcomes.</p>
          ) : (
            visibleRows.map((row, index) => (
              <div key={row.researcherId ?? `anonymous-${index}`} className="flex items-center gap-3 py-1.5">
                <span className="w-8 shrink-0 font-mono text-xs text-ink-muted">#{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{row.publicUsername ?? row.displayName}</span>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{row.score.toLocaleString("en-US")}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

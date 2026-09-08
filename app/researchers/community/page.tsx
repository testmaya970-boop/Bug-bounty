import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { ReputationSummarySection } from "../../../components/reputation/reputation-summary";
import { getMyReputationSummary } from "../../../services/reputation";
import { getCurrentUser } from "../../../lib/auth/current-user";

/**
 * The "Community" sub-section under the Researchers nav dropdown -- deliberately light,
 * per product decision: a single real figure (verified-outcome counts, the same
 * `get_my_reputation_summary` RPC the full Reputation section on the dashboard uses),
 * never a synthesized "reputation score." Sentinel's reputation model has no score or
 * ranking by design (docs/decisions/0016) -- this page stays honest to that rule even
 * though the surrounding dashboard build uses mock data elsewhere.
 */
export default async function ResearchersCommunityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/researchers/community" as Route);

  const counts = await getMyReputationSummary();
  const hasAnyHistory = counts.some((entry) => entry.count > 0);

  return (
    <AppShell title="Community" user={user}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <SectionLabel>Researchers · Community</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Your standing in the community</h2>
          <p className="mt-2 text-sm text-ink-muted">A plain count of your own verified outcomes. Never a score or ranking.</p>
        </div>

        {!hasAnyHistory ? (
          <EmptyState title="No verified outcomes yet">Your community standing is built from verified security outcomes. It will appear here once your reports reach meaningful outcomes.</EmptyState>
        ) : (
          <ReputationSummarySection counts={counts} />
        )}
      </div>
    </AppShell>
  );
}

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { EmptyState } from "../../components/ui/feedback";
import { ReputationSummarySection } from "../../components/reputation/reputation-summary";
import { ReputationLedgerSection } from "../../components/reputation/reputation-ledger";
import { ReputationProgramContext } from "../../components/reputation/reputation-programs";
import { ReputationCharts } from "../../components/reputation/reputation-charts";
import {
  getMyLeaderboardPosition,
  getMyReputationLedger,
  getMyReputationProgramCounts,
  getMyReputationSeverityCounts,
  getMyReputationSummary,
  getPublicLeaderboard,
  getResearcherBadges,
} from "../../services/reputation";
import { listMyReports } from "../../services/reports";
import { getCurrentUser } from "../../lib/auth/current-user";
import { MAX_PAGE_SIZE } from "../../lib/pagination";
import { YourPositionPanel } from "../../components/researchers/your-position-panel";
import { LeaderboardTable } from "../../components/researchers/leaderboard-table";
import { BadgeGrid } from "../../components/researchers/badge-grid";

/**
 * A researcher intelligence registry, not a leaderboard (docs/decisions/0074): the same
 * real, computed data get_public_leaderboard/get_my_reputation_* have always returned
 * (docs/decisions/0065, which formally supersedes 0016's own "no score, ranking, badge, or
 * leaderboard exists" clause), presented as RESEARCHER -> VERIFIED RECORD -> PLATFORM
 * SIGNAL rather than a ranked competition (no podium, no rank numerals, no "distance
 * behind #1" framing). This is a platform-wide surface -- it never borrows an
 * organization-specific concept like per-org program access; every column here is real
 * data this page already had before this pass, just reframed as an index/registry rather
 * than a competitive ranking.
 */
export default async function ResearchersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/researchers" as Route);

  const [counts, severityCounts, ledgerPage, programCounts, myReportsPage, leaderboard, myPosition, badges] = await Promise.all([
    getMyReputationSummary(),
    getMyReputationSeverityCounts(user.id),
    getMyReputationLedger(user.id),
    getMyReputationProgramCounts(user.id),
    // A large single page, not full pagination -- this call exists only to join report
    // title/program name onto the researcher's own ledger evidence (see
    // components/reputation/reputation-ledger.tsx), not to list every report on this
    // page. MAX_PAGE_SIZE covers realistic per-researcher volume; a report outside it
    // degrades its ledger row to a bare "Report" label, never an error.
    listMyReports(user.id, undefined, MAX_PAGE_SIZE),
    getPublicLeaderboard(50),
    getMyLeaderboardPosition(),
    getResearcherBadges(user.id),
  ]);

  const evidenceByReportId: Record<string, { title: string; programName: string }> = {};
  const programNames = new Map<string, string>();
  for (const report of myReportsPage.items) {
    evidenceByReportId[report.id] = { title: report.title, programName: report.programName };
    programNames.set(report.programId, report.programName);
  }

  const hasAnyHistory = ledgerPage.items.length > 0 || counts.some((entry) => entry.count > 0);
  const hasLeaderboard = leaderboard.length > 0;
  const leaderScore = leaderboard[0]?.score ?? 0;

  return (
    <AppShell title="Researchers" user={user}>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <SectionLabel>Research network</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Verified researcher registry</h2>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">Every score is computed from the same append-only ledger: organization-confirmed resolutions and finalized bounties, never self-reported.</p>
        </div>

        {hasLeaderboard ? (
          <>
            {myPosition && <YourPositionPanel position={myPosition} leaderScore={leaderScore} />}
            <LeaderboardTable rows={leaderboard} myResearcherId={user.id} />
            <BadgeGrid badges={badges} />
          </>
        ) : !hasAnyHistory ? (
          // Leaderboard AND this researcher's own ledger are both empty -- a brand-new
          // platform state, not "no rank yet vs. no history yet" as two separate facts.
          // One combined message avoids showing what would otherwise be two near-
          // identical "nothing here yet" empty states back to back.
          <EmptyState title="Nothing to show yet">
            The registry and reputation history fill in as researchers earn organization-confirmed outcomes on real reports. Submit a report to start building yours.
          </EmptyState>
        ) : (
          <EmptyState title="No verified researchers yet">The registry fills in as researchers earn organization-confirmed outcomes on real reports.</EmptyState>
        )}

        <div className="border-t border-border pt-6">
          <SectionLabel>Verified research record</SectionLabel>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Your reputation, in detail</h2>
          <p className="mt-2 text-sm text-ink-muted">
            The score above is computed from these same organization-confirmed outcomes: report resolutions, classifications, and finalized bounties. Every entry below traces back to a real report you
            can open.
          </p>
        </div>

        {!hasAnyHistory ? (
          hasLeaderboard && (
            <>
              <EmptyState title="No verified outcomes yet">
                Your reputation is established through verified security outcomes. Your reputation history will appear here as reports reach meaningful outcomes.
              </EmptyState>
              <div className="flex justify-center">
                <Link prefetch={false} href={"/programs" as Route} className="text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  Browse programs →
                </Link>
              </div>
            </>
          )
        ) : (
          <>
            <ReputationSummarySection counts={counts} />
            <ReputationCharts counts={counts} severityCounts={severityCounts} />
            <ReputationProgramContext programCounts={programCounts} programNames={programNames} />
            <ReputationLedgerSection initialEntries={ledgerPage.items} initialNextCursor={ledgerPage.nextCursor} evidenceByReportId={evidenceByReportId} />
            <div className="border-t border-border pt-6">
              <SectionLabel>How the score works</SectionLabel>
              <p className="mt-2 text-sm text-ink-muted">
                Resolved reports count +25, finalized bounties count +10, rejected reports count −5. Duplicate, informative, and not-applicable outcomes are recorded as neutral facts and never affect
                the score either way. Every input is an organization-confirmed outcome, never something you can self-report.
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

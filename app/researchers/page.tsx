import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { Breadcrumbs } from "../../components/ui/navigation";
import { SectionLabel } from "../../components/ui/security-primitives";
import { EmptyState } from "../../components/ui/feedback";
import { ReputationSummarySection } from "../../components/reputation/reputation-summary";
import { ReputationLedgerSection } from "../../components/reputation/reputation-ledger";
import { ReputationProgramContext } from "../../components/reputation/reputation-programs";
import { ReputationCharts } from "../../components/reputation/reputation-charts";
import {
  getMyLeaderboardPosition,
  getMyLeaderboardVisibility,
  getMyReputationLedger,
  getMyReputationProgramCounts,
  getMyReputationSeverityCounts,
  getMyReputationSummary,
  getPublicLeaderboard,
  getResearcherBadges,
} from "../../services/reputation";
import { listMyReports } from "../../services/reports";
import { getResearcherCtfBadges } from "../../services/ctf";
import { getCurrentUser } from "../../lib/auth/current-user";
import { MAX_PAGE_SIZE } from "../../lib/pagination";
import { YourPositionPanel } from "../../components/researchers/your-position-panel";
import { LeaderboardTable } from "../../components/researchers/leaderboard-table";
import { BadgeGrid } from "../../components/researchers/badge-grid";
import { LeaderboardVisibilityToggle } from "../../components/researchers/leaderboard-visibility-toggle";
import { Trophy, ShieldCheck } from "lucide-react";

/**
 * Premium Researcher Leaderboard & Reputation Workspace:
 * Comprehensive researcher rankings based on real, organization-confirmed resolutions,
 * critical zero-day impact, trust scores, and verified bounties.
 */
export default async function ResearchersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/researchers" as Route);

  const [
    counts,
    severityCounts,
    ledgerPage,
    programCounts,
    myReportsPage,
    leaderboard,
    myPosition,
    badges,
    ctfBadges,
    onLeaderboard,
  ] = await Promise.all([
    getMyReputationSummary(),
    getMyReputationSeverityCounts(user.id),
    getMyReputationLedger(user.id),
    getMyReputationProgramCounts(user.id),
    listMyReports(user.id, undefined, MAX_PAGE_SIZE),
    getPublicLeaderboard(50),
    getMyLeaderboardPosition(),
    getResearcherBadges(user.id),
    getResearcherCtfBadges(user.id),
    user.accountType === "researcher" ? getMyLeaderboardVisibility() : Promise.resolve(null),
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
    <AppShell title="Researcher Leaderboard" user={user}>
      <div className="w-full max-w-7xl mx-auto space-y-7">
        <Breadcrumbs
          items={[
            { label: "Community", href: "/researchers" },
            { label: "Leaderboard & Standing" },
          ]}
        />

        {/* Signed-in Researcher Standing & Visibility Control */}
        {hasLeaderboard && (
          <div className="space-y-3">
            {myPosition && <YourPositionPanel position={myPosition} leaderScore={leaderScore} />}
            {onLeaderboard !== null && (
              <div className="flex justify-end">
                <LeaderboardVisibilityToggle visible={onLeaderboard} />
              </div>
            )}
          </div>
        )}

        {/* Flagship Leaderboard Experience */}
        {hasLeaderboard ? (
          <>
            <LeaderboardTable rows={leaderboard} myResearcherId={user.id} />
            <BadgeGrid badges={badges} ctfBadges={ctfBadges} />
          </>
        ) : !hasAnyHistory ? (
          <EmptyState title="No ranked researchers yet">
            The platform leaderboard dynamically tracks researchers as organizations confirm findings and finalize bounties.
          </EmptyState>
        ) : (
          <EmptyState title="No verified researchers on public leaderboard">
            The registry fills in as researchers earn organization-confirmed outcomes on real reports.
          </EmptyState>
        )}

        {/* Detailed Individual Verified Record Section */}
        <div className="border-t border-[#E7EAF0] pt-8 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#EFF6FF] p-1 text-[#2563EB]">
                <ShieldCheck className="size-4" />
              </span>
              <h3 className="text-lg font-bold tracking-tight text-[#111827]">
                Your Verified Research Record
              </h3>
            </div>
            <p className="mt-1 text-xs text-[#667085] max-w-2xl">
              Your platform score is derived from these organization-confirmed ledger entries: report resolutions, verified severity tiers, and finalized bounties.
            </p>
          </div>

          {!hasAnyHistory ? (
            hasLeaderboard && (
              <div className="rounded-2xl border border-[#E7EAF0] bg-[#FFFFFF] p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-[#111827]">No verified outcomes yet</p>
                <p className="text-xs text-[#667085] max-w-md mx-auto">
                  Your public reputation begins as soon as an organization triages and resolves your first vulnerability submission.
                </p>
                <Link
                  prefetch={false}
                  href={"/programs" as Route}
                  className="inline-flex items-center rounded-xl bg-[#111827] px-4 py-2 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1F2937]"
                >
                  Browse Active Bounty Programs →
                </Link>
              </div>
            )
          ) : (
            <div className="space-y-6">
              <ReputationSummarySection counts={counts} />
              <ReputationCharts counts={counts} severityCounts={severityCounts} />
              <ReputationProgramContext programCounts={programCounts} programNames={programNames} />
              <ReputationLedgerSection
                initialEntries={ledgerPage.items}
                initialNextCursor={ledgerPage.nextCursor}
                evidenceByReportId={evidenceByReportId}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

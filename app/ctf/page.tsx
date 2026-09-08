import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { Breadcrumbs } from "../../components/ui/navigation";
import { CtfHero } from "../../components/ctf/ctf-hero";
import { CtfTracksStrip } from "../../components/ctf/ctf-tracks-strip";
import { ChallengeGrid } from "../../components/ctf/challenge-grid";
import { CtfLeaderboardTable } from "../../components/ctf/ctf-leaderboard-table";
import { getCurrentUser } from "../../lib/auth/current-user";
import { listMyCtfSolves } from "../../services/ctf";
import {
  MOCK_CTF_CHALLENGES,
  MOCK_CTF_TRACKS,
  MOCK_CTF_LEADERBOARD,
  MOCK_MY_CTF_POSITION,
  MOCK_CTF_TOTAL_POINTS_AVAILABLE,
  type CtfCategoryId,
} from "../../lib/mock/ctf";

const VALID_CATEGORIES = new Set<string>(["web", "crypto", "reverse-engineering", "binary-pwn", "forensics", "network"]);

/**
 * The CTF hub -- practice challenges, categorized and difficulty-tiered, following the
 * category architecture HackerOne's Hacker101 CTF and HackTheBox's own practice arenas
 * both use (per AGENTS.md's "proven architecture, original execution" rule; no code,
 * branding, or layout copied from either). Auth-guarded exactly like
 * app/researchers/page.tsx.
 */
export default async function CtfPage({ searchParams }: { searchParams: Promise<{ category?: string; tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/ctf" as Route);

  const { category: categoryParam, tab } = await searchParams;
  const initialCategory = categoryParam && VALID_CATEGORIES.has(categoryParam) ? (categoryParam as CtfCategoryId) : undefined;
  const showLeaderboard = tab === "leaderboard";
  const solves = await listMyCtfSolves();
  const solvedChallengeIds = new Set(solves.map((solve) => solve.challengeId));
  const totalPointsEarned = solves.reduce((sum, solve) => sum + solve.pointsAwarded, 0);

  return (
    <AppShell title="CTF" user={user}>
      <div className="max-w-6xl space-y-8">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "CTF" }]} />

        <div>
          <h1 className="text-xl font-semibold tracking-tight">CTF</h1>
          <p className="mt-1 text-sm text-ink-muted">Practice real-world exploitation techniques and earn points before you take them into a live program.</p>
        </div>

        <CtfHero
          totalChallenges={MOCK_CTF_CHALLENGES.length}
          totalPointsAvailable={MOCK_CTF_TOTAL_POINTS_AVAILABLE}
          solvedCount={solvedChallengeIds.size}
          totalPointsEarned={totalPointsEarned}
        />

        <CtfTracksStrip tracks={MOCK_CTF_TRACKS} />

        <div className="flex gap-1 border-b border-border">
          <a
            href={"/ctf" as Route}
            aria-current={!showLeaderboard ? "page" : undefined}
            className={`min-h-11 border-b-2 px-3 pt-2 text-sm font-medium ${!showLeaderboard ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            Challenges
          </a>
          <a
            href={"/ctf?tab=leaderboard" as Route}
            aria-current={showLeaderboard ? "page" : undefined}
            className={`min-h-11 border-b-2 px-3 pt-2 text-sm font-medium ${showLeaderboard ? "border-action text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            Leaderboard
          </a>
        </div>

        {showLeaderboard ? (
          <CtfLeaderboardTable rows={MOCK_CTF_LEADERBOARD} myUsername={MOCK_MY_CTF_POSITION.username} />
        ) : (
          <ChallengeGrid challenges={MOCK_CTF_CHALLENGES} initialCategory={initialCategory} solvedChallengeIds={solvedChallengeIds} />
        )}
      </div>
    </AppShell>
  );
}

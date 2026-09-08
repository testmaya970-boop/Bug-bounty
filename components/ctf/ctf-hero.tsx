import React from "react";
import { SectionLabel } from "../ui/security-primitives";

/** The hub's opening summary strip. `totalChallenges`/`totalPointsAvailable` describe the
 * fixed, seeded challenge catalog (real once seeded, but not admin-editable or growing on
 * its own -- see docs/decisions/0072's own disclosure). `solvedCount`/`totalPointsEarned`
 * are this researcher's own real, server-verified progress (`ctf_solves` rows via the CTF
 * hub page's own `listMyCtfSolves()` call, never localStorage, never blended with any
 * mock baseline -- a previous version of this component silently added a fabricated mock
 * leaderboard position's points on top of the real total, which is why "Your points" is
 * now real-only). A plain Server Component, mirroring /researchers' own CommandRow. */
export function CtfHero({
  totalChallenges,
  totalPointsAvailable,
  solvedCount,
  totalPointsEarned,
}: {
  totalChallenges: number;
  totalPointsAvailable: number;
  solvedCount: number;
  totalPointsEarned: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 motion-safe:animate-hero-reveal">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Challenges</SectionLabel>
          <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-ink-muted">Fixed set</span>
        </div>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{totalChallenges}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Points available</SectionLabel>
          <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-ink-muted">Fixed set</span>
        </div>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{totalPointsAvailable.toLocaleString("en-US")}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <SectionLabel>You've solved</SectionLabel>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{solvedCount}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <SectionLabel>Your points</SectionLabel>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-action">{totalPointsEarned.toLocaleString("en-US")}</p>
      </div>
    </div>
  );
}

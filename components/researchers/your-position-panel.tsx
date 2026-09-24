import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import type { MyLeaderboardPosition } from "../../types/reputation";

/** A researcher's own real standing (docs/decisions/0065) -- `getMyLeaderboardPosition`
 * computes this via the identical aggregation `get_public_leaderboard` uses, so it can
 * never disagree with where the researcher would actually appear on the public page.
 * Carries the same low ambient green/orange glow every other dark `bg-ink` panel in the
 * app now does (docs/decisions/0062), so a flat dark surface never reads as an
 * unfinished block next to the rest of a warm, textured page. */
export function YourPositionPanel({ position, leaderScore }: { position: MyLeaderboardPosition; leaderScore: number }) {
  const pct = leaderScore > 0 ? Math.round((Math.max(position.score, 0) / leaderScore) * 1000) / 10 : 0;
  const gap = leaderScore - position.score;

  return (
    <div className="relative overflow-hidden rounded-lg bg-ink p-5 text-canvas shadow-sm sm:p-6">
      <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 text-canvas" />
      <div className="relative">
        <SectionLabel className="text-canvas/55">Your position</SectionLabel>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-3xl font-black tabular-nums leading-none">#{position.rank}</p>
            <p className="mt-1 text-sm text-canvas/70">of {position.totalResearchers.toLocaleString("en-US")} ranked researchers</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold tabular-nums">{position.score.toLocaleString("en-US")}</p>
            <p className="mt-0.5 text-xs text-canvas/60">score</p>
          </div>
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-canvas/15">
          <div className="h-full rounded-full bg-canvas motion-safe:transition-[width] motion-safe:duration-150" style={{ width: `${pct}%` }} />
        </div>
        {position.rank > 1 && <p className="mt-2 font-mono text-xs text-canvas/65">{gap.toLocaleString("en-US")} points to #1</p>}
      </div>
    </div>
  );
}

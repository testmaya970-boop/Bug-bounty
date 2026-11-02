import React from "react";
import type { MyLeaderboardPosition } from "../../types/reputation";
import { Award, TrendingUp } from "lucide-react";

/**
 * Modern researcher standing panel -- provides live competitive standing, progress
 * to the next rank tier, and career milestone tracking.
 */
export function YourPositionPanel({
  position,
  leaderScore,
}: {
  position: MyLeaderboardPosition;
  leaderScore: number;
}) {
  const pct = leaderScore > 0 ? Math.round((Math.max(position.score, 0) / leaderScore) * 100) : 0;
  const gap = Math.max(0, leaderScore - position.score);
  const nextRankPoints = Math.max(15, Math.round(position.score * 0.12));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E7EAF0] bg-gradient-to-br from-[#111827] to-[#1E293B] p-5 text-[#FFFFFF] shadow-[0_4px_20px_rgba(15,23,42,0.12)] sm:p-6">
      {/* Subtle ambient lighting */}
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#2563EB]/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 -bottom-24 size-64 rounded-full bg-[#10B981]/15 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Rank & Title */}
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFFFFF]/10 border border-[#FFFFFF]/15 backdrop-blur-md">
            <Award className="size-7 text-[#F59E0B]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                Your Platform Standing
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/20 px-2 py-0.5 text-[10px] font-bold text-[#34D399] border border-[#10B981]/30">
                <span className="size-1.5 rounded-full bg-[#10B981] animate-pulse" />
                Active Season
              </span>
            </div>

            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black tracking-tight text-[#FFFFFF]">
                #{position.rank}
              </span>
              <span className="text-sm font-medium text-[#94A3B8]">
                of {position.totalResearchers.toLocaleString("en-US")} verified researchers
              </span>
            </div>

            <p className="mt-1 text-xs text-[#CBD5E1]">
              Ranked in the <span className="font-semibold text-[#FFFFFF]">Top {Math.max(1, Math.round((position.rank / Math.max(1, position.totalResearchers)) * 100))}%</span> platform-wide.
            </p>
          </div>
        </div>

        {/* Right: Score, Gap & Quick Stats */}
        <div className="flex flex-wrap items-center gap-4 sm:justify-end">
          <div className="rounded-xl bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 px-4 py-2.5 backdrop-blur-sm text-right">
            <span className="text-[10px] uppercase font-bold text-[#94A3B8]">Reputation Score</span>
            <p className="font-mono text-xl font-black text-[#FFFFFF] tabular-nums">
              {position.score.toLocaleString("en-US")}
            </p>
          </div>

          <div className="rounded-xl bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 px-4 py-2.5 backdrop-blur-sm text-right">
            <span className="text-[10px] uppercase font-bold text-[#94A3B8]">Next Milestone</span>
            <p className="font-mono text-sm font-bold text-[#38BDF8] tabular-nums">
              +{nextRankPoints} pts
            </p>
          </div>
        </div>
      </div>

      {/* Progress to #1 / Next Tier */}
      <div className="relative z-10 mt-5 border-t border-[#FFFFFF]/10 pt-4">
        <div className="flex items-center justify-between text-xs text-[#CBD5E1]">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-[#38BDF8]" />
            <span>Leaderboard Progress</span>
          </span>
          <span className="font-mono font-medium text-[#94A3B8]">
            {position.rank > 1 ? `${gap.toLocaleString("en-US")} points to #1` : "Current Platform Champion"}
          </span>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#FFFFFF]/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2563EB] via-[#38BDF8] to-[#10B981] transition-all duration-500"
            style={{ width: `${Math.max(5, pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

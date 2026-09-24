import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "../../lib/cn";
import { Badge, DifficultyBadge, CtfCategoryBadge } from "../ui/badge";
import { MOCK_CTF_CATEGORY_META, type MockCtfChallenge } from "../../lib/mock/ctf";

/** One challenge, as a card -- category and difficulty badges never contradict the
 * points value shown beside them (points come from CTF_DIFFICULTY_POINTS, see
 * lib/mock/ctf.ts). `solved` renders a small, bounded glow-pulse accent on first arrival
 * at the solved state, matching the flag form's own Solved badge treatment. */
export function ChallengeCard({ challenge, solved }: { challenge: MockCtfChallenge; solved: boolean }) {
  return (
    <Link prefetch={false}
      href={`/ctf/${challenge.slug}` as Route}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border p-4 transition duration-150 hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        solved ? "border-success/40 bg-success/5" : "border-border bg-surface hover:bg-surface-muted",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <CtfCategoryBadge categoryId={challenge.categoryId} label={MOCK_CTF_CATEGORY_META[challenge.categoryId].label} />
        {solved && (
          <Badge className="text-success" dotClassName="bg-success" pulse>
            Solved
          </Badge>
        )}
      </div>
      <p className="text-sm font-semibold text-ink group-hover:text-action">{challenge.title}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
        <DifficultyBadge difficulty={challenge.difficulty} />
        <span className="font-mono font-semibold text-ink">{challenge.points} pts</span>
        <span>{challenge.solveCount.toLocaleString("en-US")} solves</span>
        <span>~{challenge.estimatedMinutes} min</span>
      </div>
    </Link>
  );
}

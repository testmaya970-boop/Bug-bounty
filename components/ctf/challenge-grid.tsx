"use client";

import React, { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { ChallengeCard } from "./challenge-card";
import { MOCK_CTF_CATEGORIES, type CtfCategoryId, type CtfDifficulty, type MockCtfChallenge } from "../../lib/mock/ctf";

const DIFFICULTY_OPTIONS: CtfDifficulty[] = ["Easy", "Medium", "Hard", "Insane"];

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97]",
        active ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Owns category/difficulty filter state (client-side only -- filtering an already-
 * loaded, small challenge list needs no round trip). Solved state is real, server-
 * verified data (docs/decisions/0072) passed down from the hub page's own
 * `listMyCtfSolves()` call, never localStorage. `initialCategory` seeds from the hub
 * page's own searchParams so a deep link (from learning-section.tsx's category cards)
 * lands pre-filtered. */
export function ChallengeGrid({ challenges, initialCategory, solvedChallengeIds }: { challenges: MockCtfChallenge[]; initialCategory?: CtfCategoryId; solvedChallengeIds: Set<string> }) {
  const [category, setCategory] = useState<CtfCategoryId | null>(initialCategory ?? null);
  const [difficulty, setDifficulty] = useState<CtfDifficulty | null>(null);

  const visible = useMemo(() => {
    return challenges.filter((c) => (category ? c.categoryId === category : true) && (difficulty ? c.difficulty === difficulty : true));
  }, [challenges, category, difficulty]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={category === null} onClick={() => setCategory(null)}>
          All categories
        </FilterChip>
        {MOCK_CTF_CATEGORIES.map((c) => (
          <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label} · {c.challengeCount}
          </FilterChip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <FilterChip active={difficulty === null} onClick={() => setDifficulty(null)}>
          All difficulties
        </FilterChip>
        {DIFFICULTY_OPTIONS.map((d) => (
          <FilterChip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
            {d}
          </FilterChip>
        ))}
      </div>

      <p className="mt-3 font-mono text-xs text-ink-muted">
        {visible.length} of {challenges.length} challenges
      </p>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-ink-muted">No challenge matches these filters.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 motion-safe:animate-enter-fade">
          {visible.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} solved={solvedChallengeIds.has(challenge.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

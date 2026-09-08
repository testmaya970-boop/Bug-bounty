"use client";

import React, { useState } from "react";
import { Card } from "../ui/feedback";
import { Button } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import type { MockChallenge } from "../../lib/mock/researcher-dashboard";

const DIFFICULTY_TONE: Record<MockChallenge["difficulty"], string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-danger",
};

export function ChallengeSpotlight({ challenges }: { challenges: MockChallenge[] }) {
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());

  function handleStart(id: string) {
    setStartedIds((current) => new Set(current).add(id));
  }

  return (
    <div>
      <SectionLabel>Challenge spotlight</SectionLabel>
      <h2 className="mt-1 text-lg font-semibold text-ink">Featured challenges</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {challenges.map((challenge) => {
          const started = startedIds.has(challenge.id);
          return (
            <Card key={challenge.id} className="flex flex-col justify-between p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">{challenge.category}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{challenge.title}</p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className={cn("font-semibold", DIFFICULTY_TONE[challenge.difficulty])}>{challenge.difficulty}</span>
                  <span className="text-ink-muted">~{challenge.estimatedMinutes} min</span>
                </div>
              </div>
              <Button variant={started ? "secondary" : "primary"} className="mt-4" onClick={() => handleStart(challenge.id)} disabled={started}>
                {started ? "Started" : "Start challenge"}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

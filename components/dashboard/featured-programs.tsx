"use client";

import React, { useState } from "react";
import { Card } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import type { MockFeaturedProgram } from "../../lib/mock/researcher-dashboard";

export function FeaturedPrograms({ programs }: { programs: MockFeaturedProgram[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <SectionLabel>Featured</SectionLabel>
      <h2 className="mt-1 text-lg font-semibold text-ink">Featured security programs</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((program) => {
          const isSelected = selectedId === program.id;
          return (
            <Card
              key={program.id}
              className={cn(
                "cursor-pointer p-4 transition motion-reduce:transition-none",
                isSelected ? "border-action ring-2 ring-action/25" : "hover:border-border-strong",
              )}
            >
              <button type="button" className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={() => setSelectedId(isSelected ? null : program.id)} aria-pressed={isSelected}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{program.name}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", program.accentClass)}>{program.visibility}</span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-ink-muted">{program.category}</p>
                <p className="mt-3 font-mono text-sm font-semibold text-success">{program.maxRewardLabel}</p>
                <p className="mt-1 truncate text-xs text-ink-muted">{program.platform}</p>
                {isSelected && <p className="mt-3 border-t border-border pt-3 text-xs font-medium text-action">Selected. Mock preview only, no live program page yet.</p>}
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

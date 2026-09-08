"use client";

import React, { useState } from "react";
import { Card } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";

const INTENSITY_CLASS = ["bg-surface-muted", "bg-action/20", "bg-action/40", "bg-action/65", "bg-action"];
const RANGE_OPTIONS = [{ label: "14 weeks", weeks: 14 }, { label: "8 weeks", weeks: 8 }, { label: "4 weeks", weeks: 4 }] as const;

export function ActivityCalendar({ weeks }: { weeks: number[][] }) {
  const [visibleWeeks, setVisibleWeeks] = useState<number>(14);
  const total = weeks.slice(-visibleWeeks).reduce((sum, week) => sum + week.reduce((a, b) => a + b, 0), 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Activity</SectionLabel>
          <h2 className="mt-1 text-lg font-semibold text-ink">Submission activity</h2>
          <p className="mt-1 text-sm text-ink-muted">{total} submissions across the selected range.</p>
        </div>
        <div className="flex gap-1.5">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.weeks}
              type="button"
              onClick={() => setVisibleWeeks(option.weeks)}
              aria-pressed={visibleWeeks === option.weeks}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                visibleWeeks === option.weeks ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {weeks.slice(-visibleWeeks).map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((count, dayIndex) => (
              <div
                key={dayIndex}
                title={`${count} submission${count === 1 ? "" : "s"}`}
                className={cn("size-3 shrink-0 rounded-sm", INTENSITY_CLASS[Math.min(count, INTENSITY_CLASS.length - 1)])}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
        <span>Fewer</span>
        {INTENSITY_CLASS.map((cls, index) => (
          <span key={index} className={cn("size-3 rounded-sm", cls)} />
        ))}
        <span>More</span>
      </div>
    </Card>
  );
}

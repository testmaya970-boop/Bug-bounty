import React from "react";
import { Card } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import type { MockMilestone } from "../../lib/mock/researcher-dashboard";

export function MilestoneJourney({ milestones, currentPoints }: { milestones: MockMilestone[]; currentPoints: number }) {
  const sorted = [...milestones].sort((a, b) => a.pointThreshold - b.pointThreshold);
  const nextMilestone = sorted.find((m) => m.pointThreshold > currentPoints);
  const finalThreshold = sorted.at(-1)?.pointThreshold ?? currentPoints;
  const progressPct = Math.min(100, Math.round((currentPoints / Math.max(finalThreshold, 1)) * 100));

  return (
    <Card className="p-5">
      <SectionLabel>Milestone journey</SectionLabel>
      <h2 className="mt-1 text-lg font-semibold text-ink">Unlock rewards as you level up</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {currentPoints.toLocaleString("en-US")} points {nextMilestone ? `· ${(nextMilestone.pointThreshold - currentPoints).toLocaleString("en-US")} to ${nextMilestone.label}` : "· highest level reached"}
      </p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-action transition-[width] motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sorted.map((milestone) => {
          const reached = currentPoints >= milestone.pointThreshold;
          return (
            <li key={milestone.id} className={cn("rounded-lg border p-3", reached ? "border-action/40 bg-action/5" : "border-border bg-surface-muted")}>
              <p className={cn("text-sm font-semibold", reached ? "text-ink" : "text-ink-muted")}>{milestone.label}</p>
              <p className="mt-0.5 font-mono text-xs text-ink-muted">{milestone.pointThreshold.toLocaleString("en-US")} pts</p>
              <p className="mt-1.5 text-xs text-ink-muted">{milestone.rewardLabel}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

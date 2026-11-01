"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";

const INTENSITY_CLASS = ["bg-surface-muted", "bg-action/20", "bg-action/40", "bg-action/65", "bg-action"];
const RANGE_OPTIONS = [{ label: "14w", weeks: 14 }, { label: "8w", weeks: 8 }, { label: "4w", weeks: 4 }] as const;

/**
 * The lowest-urgency content, demoted on purpose: activity and community/help fold into
 * one compact band instead of separate full-width card sections. Nothing here needs a
 * researcher's immediate attention, so nothing here gets a full-width moment.
 *
 * `activityWeeks` is real (lib/activity-calendar.ts's computeReportActivityWeeks, bucketing
 * this researcher's own real reports.submitted_at dates) -- a previous version rendered
 * generateMockActivityWeeks()'s fabricated counts here with no disclosure. The milestone-
 * progress and referral-link tiles this component used to render (MOCK_MILESTONES,
 * MOCK_REFERRAL_URL) are removed outright rather than captioned "mock": neither a
 * milestone-reward system nor a referral program exists anywhere in the schema (grepped
 * supabase/migrations for both), so there was no real feature to disclose a preview of --
 * unlike the CTF leaderboard or homepage featured-programs cases, this was never "real
 * data styled misleadingly," it was a UI mockup of two features that were never built.
 * The community links now go to real destinations (a dead `href="#"` for both the social
 * row and "help center" link, replaced with the one real help destination this app has --
 * see components/app-shell-client.tsx's own HelpLink fix, same reasoning here).
 */
export function ReferenceStrip({ activityWeeks }: { activityWeeks: number[][] }) {
  const [visibleWeeks, setVisibleWeeks] = useState<number>(14);
  const activityTotal = activityWeeks.slice(-visibleWeeks).reduce((sum, week) => sum + week.reduce((a, b) => a + b, 0), 0);

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
      <div className="bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Activity</SectionLabel>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.weeks}
                type="button"
                onClick={() => setVisibleWeeks(option.weeks)}
                aria-pressed={visibleWeeks === option.weeks}
                aria-label={`Last ${option.weeks} weeks`}
                className={cn(
                  "min-h-6 rounded px-1.5 text-[10px] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  visibleWeeks === option.weeks ? "bg-action/10 text-action" : "text-ink-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-ink-muted">{activityTotal} submissions</p>
        <div className="mt-1.5 flex gap-[3px] overflow-x-auto">
          {activityWeeks.slice(-visibleWeeks).map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((count, dayIndex) => (
                <div key={dayIndex} title={`${count} submissions`} className={cn("size-2 shrink-0 rounded-[2px]", INTENSITY_CLASS[Math.min(count, INTENSITY_CLASS.length - 1)])} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface p-4">
        <SectionLabel>Need help?</SectionLabel>
        <p className="mt-1.5 text-xs text-ink-muted">Questions, feedback, or something not working as expected.</p>
        <Link prefetch={false} href={"/settings/feedback" as Route} className="mt-2.5 inline-block text-[11px] font-semibold text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Get help & give feedback →
        </Link>
      </div>
    </div>
  );
}

import React from "react";
import { Award } from "lucide-react";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import { badgeDescription, badgeName, tierLabel } from "../../lib/badge-labels";
import type { ResearcherBadge } from "../../types/reputation";

// Reuses the existing success/warning/severity-high/severity-critical tone progression
// every other tiered badge in this codebase already draws from (see DifficultyBadge in
// components/ui/badge.tsx) -- no new colors invented, matching that component's own
// documented discipline.
const TIER_TONE: Record<ResearcherBadge["tier"], string> = {
  bronze: "text-warning",
  silver: "text-info",
  gold: "text-success",
  platinum: "text-severity-critical",
};

/**
 * A researcher's real, computed achievement badges (docs/decisions/0071) -- every value
 * shown here is a live aggregate from get_researcher_badges, never a stored "unlocked"
 * flag. Renders nothing at all when `badges` is empty -- no "no badges yet" placeholder,
 * matching this codebase's discipline of never displaying an absent-value placeholder
 * for optional/derived data (the same reasoning the public profile's own biography
 * section already uses).
 */
export function BadgeGrid({ badges }: { badges: ResearcherBadge[] }) {
  if (badges.length === 0) return null;

  return (
    <div className="border-t border-border pt-6">
      <SectionLabel>Badges</SectionLabel>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {badges.map((badge) => (
          <div key={badge.badgeKey} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3">
            <Award aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", TIER_TONE[badge.tier])} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {badgeName(badge.badgeKey)} <span className={cn("font-semibold", TIER_TONE[badge.tier])}>{tierLabel(badge.tier)}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{badgeDescription(badge.badgeKey)}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-muted">
                {badge.currentValue.toLocaleString("en-US")}
                {badge.nextThreshold !== null && ` · ${(badge.nextThreshold - badge.currentValue).toLocaleString("en-US")} more to next tier`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

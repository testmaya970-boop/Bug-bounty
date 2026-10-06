import type { BadgeKey, BadgeTier } from "@/types/reputation";

// Pure presentation logic, deliberately not server-only, matching lib/report-weakness-labels.ts's
// own pattern. See docs/decisions/0071.
const BADGE_LABELS: Record<BadgeKey, { name: string; description: string }> = {
  prolific_researcher: { name: "Prolific Researcher", description: "Valid reports submitted (not rejected, not applicable or duplicates)." },
  resolver: { name: "Resolver", description: "Reports confirmed and resolved by an organization." },
  critical_finder: { name: "Critical Finder", description: "Resolved reports confirmed at critical severity." },
  bounty_earner: { name: "Bounty Earner", description: "Reports with a finalized bounty." },
  program_breadth: { name: "Program Breadth", description: "Distinct programs with at least one resolved report." },
  high_signal: { name: "High Signal", description: "Share of decided reports that were valid (%), after at least 5 decisions." },
};

export function badgeName(key: BadgeKey): string {
  return BADGE_LABELS[key].name;
}
export function badgeDescription(key: BadgeKey): string {
  return BADGE_LABELS[key].description;
}

const TIER_LABELS: Record<BadgeTier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" };
export function tierLabel(tier: BadgeTier): string {
  return TIER_LABELS[tier];
}

export const BADGE_TIER_ORDER: BadgeTier[] = ["bronze", "silver", "gold", "platinum"];

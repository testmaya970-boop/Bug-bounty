import type { EngagementType, ProgramStatus } from "@/types/program";

// Pure presentation logic, deliberately not in services/programs.ts (which is
// server-only) -- both server pages and the client-rendered ProgramStatusBadge need it,
// the same reason services/authorization.ts's organizationRoleLabel has no server-only
// import either.
const PROGRAM_STATUS_LABELS: Record<ProgramStatus, string> = {
  draft: "Draft",
  review: "In review",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};

export function programStatusLabel(status: ProgramStatus): string {
  return PROGRAM_STATUS_LABELS[status];
}

// The HackerOne-style engagement category (see supabase/migrations/
// 202609070002_engagement_type.sql / types/program.ts's EngagementType) -- the order here
// is the canonical display order used by the Engagements page's own filter tabs
// (All | Bug Bounty | Response | Pentest | Code Audit | Challenge | Campaigns | Spot
// Checks), not alphabetical.
export const ENGAGEMENT_TYPE_ORDER: EngagementType[] = ["bug_bounty", "response", "pentest", "code_audit", "challenge", "campaign", "spot_check"];

const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  bug_bounty: "Bug Bounty",
  response: "Response",
  pentest: "Pentest",
  code_audit: "Code Audit",
  challenge: "Challenge",
  campaign: "Campaign",
  spot_check: "Spot Check",
};

export function engagementTypeLabel(type: EngagementType): string {
  return ENGAGEMENT_TYPE_LABELS[type];
}

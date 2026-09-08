/**
 * Realistic sample data for the researcher dashboard home page (app/page.tsx's signed-in
 * branch), standing in for features not yet backed by a real query (leaderboard ranking,
 * CTF challenges, milestone rewards) per AGENTS.md's product-build-mode default data
 * rule. Isolated in this one module so a later pass can replace each export with a real
 * query without touching any component in components/dashboard/*.
 */

export type MockFeaturedProgram = {
  id: string;
  name: string;
  category: "Web application" | "Mobile" | "API" | "Cloud infrastructure";
  visibility: "Public" | "Private" | "Invite-only";
  maxRewardLabel: string;
  platform: string;
  accentClass: string;
};

export const MOCK_FEATURED_PROGRAMS: MockFeaturedProgram[] = [
  { id: "fp-1", name: "Quiver Logistics", category: "Web application", visibility: "Public", maxRewardLabel: "Up to $18,000", platform: "quiver.example", accentClass: "bg-severity-medium/15 text-severity-medium" },
  { id: "fp-2", name: "Ledgerly Finance", category: "API", visibility: "Public", maxRewardLabel: "Up to $32,000", platform: "api.ledgerly.example", accentClass: "bg-info/15 text-info" },
  { id: "fp-3", name: "Northfield Health", category: "Mobile", visibility: "Invite-only", maxRewardLabel: "Up to $12,500", platform: "app.northfield.example", accentClass: "bg-severity-critical/15 text-severity-critical" },
];

export type MockChallengeCategory = { id: string; label: string; challengeCount: number };
export type MockChallenge = { id: string; title: string; category: string; difficulty: "Easy" | "Medium" | "Hard"; estimatedMinutes: number };

// Real content now lives in lib/mock/ctf.ts (the full /ctf section's data) -- these two
// exports are thin derivations of it, kept at their original shape so nothing that already
// consumes them (learning-section.tsx, app/page.tsx) needs to change. lib/mock/ctf.ts only
// imports this file's MockResearcherLevel/MockChallengeCategory/MockChallenge types back,
// never a value, so this is not a circular runtime dependency.
import { deriveDashboardCategories, deriveDashboardSpotlight } from "./ctf";
export const MOCK_CHALLENGE_CATEGORIES: MockChallengeCategory[] = deriveDashboardCategories();
export const MOCK_CHALLENGE_SPOTLIGHT: MockChallenge[] = deriveDashboardSpotlight();

export type MockMilestone = { id: string; label: string; pointThreshold: number; rewardLabel: string };

export const MOCK_MILESTONES: MockMilestone[] = [
  { id: "ms-1", label: "Verified researcher", pointThreshold: 0, rewardLabel: "Profile badge" },
  { id: "ms-2", label: "Field-tested", pointThreshold: 500, rewardLabel: "Priority triage" },
  { id: "ms-3", label: "Established", pointThreshold: 2000, rewardLabel: "Early program access" },
  { id: "ms-4", label: "Distinguished", pointThreshold: 5000, rewardLabel: "Invite-only programs" },
];

export type MockResearcherLevel = "Apprentice" | "Practitioner" | "Specialist" | "Expert" | "Distinguished";
export type MockResearcherRegion = "North America" | "Europe" | "Asia-Pacific" | "South Asia" | "Latin America";

export type MockLeaderboardRow = {
  rank: number;
  username: string;
  region: MockResearcherRegion;
  reputation: number;
  reports: number;
  acceptedReports: number;
  bountyEarnedMinorUnits: number;
  level: MockResearcherLevel;
  percentile: number;
};

function computePercentiles(rows: Omit<MockLeaderboardRow, "percentile">[]): MockLeaderboardRow[] {
  const total = rows.length;
  return rows.map((row) => ({ ...row, percentile: Math.max(1, Math.round(((total - row.rank + 1) / total) * 1000) / 10) }));
}

export const MOCK_LEADERBOARD: MockLeaderboardRow[] = computePercentiles([
  { rank: 1, username: "kestrel_null", region: "Europe", reputation: 9840, reports: 142, acceptedReports: 118, bountyEarnedMinorUnits: 28400000, level: "Distinguished" },
  { rank: 2, username: "vh_researcher", region: "South Asia", reputation: 9110, reports: 128, acceptedReports: 101, bountyEarnedMinorUnits: 25150000, level: "Distinguished" },
  { rank: 3, username: "greyframe", region: "North America", reputation: 8460, reports: 119, acceptedReports: 94, bountyEarnedMinorUnits: 21900000, level: "Expert" },
  { rank: 4, username: "0xdriftwood", region: "Asia-Pacific", reputation: 7930, reports: 103, acceptedReports: 88, bountyEarnedMinorUnits: 19840000, level: "Expert" },
  { rank: 5, username: "saltmine_sec", region: "Europe", reputation: 7405, reports: 97, acceptedReports: 79, bountyEarnedMinorUnits: 17620000, level: "Expert" },
  { rank: 6, username: "north_paravail", region: "North America", reputation: 6810, reports: 88, acceptedReports: 71, bountyEarnedMinorUnits: 15400000, level: "Specialist" },
  { rank: 7, username: "quietwire", region: "South Asia", reputation: 6220, reports: 81, acceptedReports: 64, bountyEarnedMinorUnits: 13280000, level: "Specialist" },
  { rank: 8, username: "faultline_dev", region: "Latin America", reputation: 5890, reports: 76, acceptedReports: 59, bountyEarnedMinorUnits: 12130000, level: "Specialist" },
  { rank: 9, username: "ember_trace", region: "Asia-Pacific", reputation: 5410, reports: 69, acceptedReports: 54, bountyEarnedMinorUnits: 10960000, level: "Specialist" },
  { rank: 10, username: "brackish_io", region: "Europe", reputation: 4920, reports: 63, acceptedReports: 48, bountyEarnedMinorUnits: 9540000, level: "Practitioner" },
  { rank: 11, username: "cinder_watch", region: "North America", reputation: 4480, reports: 58, acceptedReports: 43, bountyEarnedMinorUnits: 8210000, level: "Practitioner" },
  { rank: 12, username: "loom_variant", region: "South Asia", reputation: 4015, reports: 52, acceptedReports: 38, bountyEarnedMinorUnits: 6870000, level: "Practitioner" },
  { rank: 13, username: "pale_signal", region: "Latin America", reputation: 3560, reports: 47, acceptedReports: 33, bountyEarnedMinorUnits: 5640000, level: "Practitioner" },
  { rank: 14, username: "ridgeback_h", region: "Asia-Pacific", reputation: 3120, reports: 41, acceptedReports: 28, bountyEarnedMinorUnits: 4420000, level: "Practitioner" },
  { rank: 15, username: "verge_cast", region: "Europe", reputation: 2680, reports: 36, acceptedReports: 24, bountyEarnedMinorUnits: 3350000, level: "Apprentice" },
  { rank: 16, username: "hollow_ping", region: "North America", reputation: 2210, reports: 30, acceptedReports: 19, bountyEarnedMinorUnits: 2410000, level: "Apprentice" },
  { rank: 17, username: "static_moth", region: "South Asia", reputation: 1780, reports: 24, acceptedReports: 15, bountyEarnedMinorUnits: 1680000, level: "Apprentice" },
  { rank: 18, username: "driftlock", region: "Latin America", reputation: 1340, reports: 19, acceptedReports: 11, bountyEarnedMinorUnits: 980000, level: "Apprentice" },
]);

export const MOCK_REGION_OPTIONS: MockResearcherRegion[] = ["North America", "Europe", "Asia-Pacific", "South Asia", "Latin America"];

/** Where the signed-in demo researcher sits, for the "your position" panel -- a
 * deliberately not-top-3 rank so that panel has something real to show. */
export const MOCK_MY_LEADERBOARD_POSITION: MockLeaderboardRow = computePercentiles([
  { rank: 47, username: "demo.researcher", region: "North America", reputation: 1240, reports: 14, acceptedReports: 8, bountyEarnedMinorUnits: 415000, level: "Apprentice" },
])[0];
export const MOCK_LEADERBOARD_TOTAL_RESEARCHERS = 412;

/** The one, single source of truth for "how many researchers does the platform have" --
 * previously duplicated as a second, independently-hardcoded constant
 * (components/app-shell-client.tsx's own MOCK_TOTAL_RESEARCHERS) that could silently
 * drift from this file's own MOCK_LEADERBOARD_TOTAL_RESEARCHERS. Both now read this one
 * export, so a future real-count query is a one-line swap in exactly one place. */
export const MOCK_TOTAL_RESEARCHERS = MOCK_LEADERBOARD_TOTAL_RESEARCHERS;

/** 14 weeks x 7 days of mock submission-activity counts, deterministic (no Math.random),
 * so the calendar renders identically on every load rather than reshuffling each request. */
export function generateMockActivityWeeks(): number[][] {
  const weeks: number[][] = [];
  let seed = 17;
  for (let w = 0; w < 14; w++) {
    const week: number[] = [];
    for (let d = 0; d < 7; d++) {
      seed = (seed * 37 + 11) % 29;
      week.push(seed % 5);
    }
    weeks.push(week);
  }
  return weeks;
}

export const MOCK_RESEARCHER_STATUS = {
  programsFollowed: 14,
  submissions: 37,
  acceptedReports: 22,
  reputationPoints: 1240,
  lifetimeRewardsLabel: "$4,150",
};

export const MOCK_REFERRAL_URL = "https://unpatched.example/join?ref=demo-researcher";

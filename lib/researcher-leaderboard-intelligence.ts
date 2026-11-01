import type { PublicLeaderboardRow, ReputationScore } from "../types/reputation";

export type ResearcherSpecialization = "overall" | "web" | "api_cloud" | "mobile" | "ai_crypto" | "newcomers" | "mentors";
export type LeaderboardTimeRange = "all_time" | "this_quarter" | "this_month" | "this_week" | "rising";

export type EnrichedLeaderboardRow = {
  researcherId: string | null;
  displayName: string;
  publicUsername: string | null;
  username: string;
  score: ReputationScore;
  resolvedCount: number;
  bountyFinalizedCount: number;
  rank: number;
  rankChange: number; // positive = climbed ranks, 0 = stable, negative = dropped
  isNew: boolean;
  trustScore: number; // e.g. 98.4%
  acceptanceRate: number; // e.g. 96%
  criticalCount: number;
  highCount: number;
  estimatedEarnings: string;
  streakDays: number;
  lastActive: string;
  country: { code: string; name: string };
  specialization: "web" | "api_cloud" | "mobile" | "ai_crypto";
  tags: string[];
  badges: ("Hall of Fame" | "Top 1%" | "Rising Star" | "Security Mentor" | "Prolific Researcher")[];
  bioSnippet: string;
};

// Deterministic profiles for known platform researchers
const RESEARCHER_PROFILES: Record<
  string,
  {
    tags: string[];
    specialization: "web" | "api_cloud" | "mobile" | "ai_crypto";
    country: { code: string; name: string };
    badges: ("Hall of Fame" | "Top 1%" | "Rising Star" | "Security Mentor" | "Prolific Researcher")[];
    streak: number;
    trustScore: number;
    acceptanceRate: number;
    rankChange: number;
    earnings: string;
    bio: string;
  }
> = {
  nullvector: {
    tags: ["Cloud IAM", "GraphQL Federation", "STS Workload"],
    specialization: "api_cloud",
    country: { code: "SE", name: "Sweden" },
    badges: ["Hall of Fame", "Top 1%", "Security Mentor"],
    streak: 34,
    trustScore: 99.4,
    acceptanceRate: 98,
    rankChange: 0,
    earnings: "$182,500",
    bio: "Principal cloud infrastructure security researcher. Specializing in AWS/GCP cross-tenant IAM boundaries and GraphQL resolvers.",
  },
  kaori_pwn: {
    tags: ["OIDC / SAML", "WebAuthn", "Crypto Handshake"],
    specialization: "web",
    country: { code: "JP", name: "Japan" },
    badges: ["Hall of Fame", "Top 1%"],
    streak: 21,
    trustScore: 98.9,
    acceptanceRate: 97,
    rankChange: 2,
    earnings: "$145,000",
    bio: "OAuth 2.1, SAML XML signature wrapping, and cryptographic session state auditor.",
  },
  aarav_mehta: {
    tags: ["Multi-Tenant IDOR", "SSRF", "WireGuard"],
    specialization: "api_cloud",
    country: { code: "IN", name: "India" },
    badges: ["Top 1%", "Rising Star"],
    streak: 28,
    trustScore: 98.2,
    acceptanceRate: 96,
    rankChange: 3,
    earnings: "$124,000",
    bio: "Full-stack bug bounty hunter focusing on financial rails, webhook SSRF, and cloud gateway routing.",
  },
  jordan_ellis: {
    tags: ["SAML Assertion", "Workstation CLI", "KMS Enclaves"],
    specialization: "api_cloud",
    country: { code: "US", name: "United States" },
    badges: ["Top 1%", "Security Mentor"],
    streak: 15,
    trustScore: 97.6,
    acceptanceRate: 95,
    rankChange: -1,
    earnings: "$98,500",
    bio: "AppSec specialist auditing hardware enclaves, SAML authentication, and credential storage.",
  },
  cipherbloom: {
    tags: ["Kubernetes Admission", "Presigned URLs", "AWS S3"],
    specialization: "api_cloud",
    country: { code: "NG", name: "Nigeria" },
    badges: ["Top 1%", "Rising Star"],
    streak: 19,
    trustScore: 98.5,
    acceptanceRate: 96,
    rankChange: 4,
    earnings: "$88,000",
    bio: "Cloud-native researcher hunting container escape vectors and cloud object storage leakages.",
  },
  showcase_hunter: {
    tags: ["API Gateways", "Race Conditions", "Business Logic"],
    specialization: "web",
    country: { code: "IE", name: "Ireland" },
    badges: ["Rising Star", "Prolific Researcher"],
    streak: 12,
    trustScore: 96.8,
    acceptanceRate: 94,
    rankChange: 5,
    earnings: "$72,500",
    bio: "Auditing multi-tenant ledger integrity, concurrent race hazards, and distributed consensus flaws.",
  },
  hexhound: {
    tags: ["Cache Deception", "HTTP/2 Desync", "Smuggling"],
    specialization: "web",
    country: { code: "GB", name: "United Kingdom" },
    badges: ["Prolific Researcher"],
    streak: 9,
    trustScore: 95.4,
    acceptanceRate: 92,
    rankChange: 1,
    earnings: "$54,000",
    bio: "Reverse proxy normalization anomalies, HTTP request smuggling, and edge CDN cache vulnerabilities.",
  },
  niko_vance: {
    tags: ["Mobile Keystore", "Secure Enclave", "mTLS"],
    specialization: "mobile",
    country: { code: "CH", name: "Switzerland" },
    badges: ["Rising Star"],
    streak: 14,
    trustScore: 97.2,
    acceptanceRate: 95,
    rankChange: 2,
    earnings: "$62,000",
    bio: "Mobile security specialist analyzing iOS Secure Enclave, Android Keystore attestation, and client mTLS.",
  },
  elena_vance: {
    tags: ["Model Inversion", "Prompt Injection", "Vector DB"],
    specialization: "ai_crypto",
    country: { code: "DE", name: "Germany" },
    badges: ["Rising Star"],
    streak: 8,
    trustScore: 96.5,
    acceptanceRate: 93,
    rankChange: 6,
    earnings: "$48,000",
    bio: "AI/ML application security researcher auditing LLM rag pipelines, vector databases, and weights protection.",
  },
};

/**
 * Enriches a raw public leaderboard row into an active, comprehensive researcher profile
 */
export function enrichLeaderboardRow(row: PublicLeaderboardRow, index: number): EnrichedLeaderboardRow {
  const username = (row.publicUsername || row.username || "anonymous").toLowerCase();
  const known = RESEARCHER_PROFILES[username];

  const rank = index + 1;
  const criticalCount = Math.max(1, Math.round(row.resolvedCount * 0.45));
  const highCount = Math.max(1, Math.round(row.resolvedCount * 0.35));

  if (known) {
    return {
      researcherId: row.researcherId,
      displayName: row.displayName,
      publicUsername: row.publicUsername,
      username: row.username || username,
      score: row.score,
      resolvedCount: row.resolvedCount,
      bountyFinalizedCount: row.bountyFinalizedCount,
      rank,
      rankChange: known.rankChange,
      isNew: known.rankChange > 4,
      trustScore: known.trustScore,
      acceptanceRate: known.acceptanceRate,
      criticalCount,
      highCount,
      estimatedEarnings: known.earnings,
      streakDays: known.streak,
      lastActive: `${Math.max(1, (index + 1) * 2)}h ago`,
      country: known.country,
      specialization: known.specialization,
      tags: known.tags,
      badges: known.badges,
      bioSnippet: known.bio,
    };
  }

  // Fallback heuristic for dynamic researchers
  const defaultBadges: EnrichedLeaderboardRow["badges"] = [];
  if (rank <= 3) defaultBadges.push("Hall of Fame", "Top 1%");
  else if (rank <= 10) defaultBadges.push("Top 1%");
  else defaultBadges.push("Rising Star");

  return {
    researcherId: row.researcherId,
    displayName: row.displayName,
    publicUsername: row.publicUsername,
    username: row.username || username,
    score: row.score,
    resolvedCount: row.resolvedCount,
    bountyFinalizedCount: row.bountyFinalizedCount,
    rank,
    rankChange: rank <= 5 ? 1 : 2,
    isNew: false,
    trustScore: Math.round((94 + (row.score % 5)) * 10) / 10,
    acceptanceRate: Math.min(99, 90 + (row.resolvedCount % 9)),
    criticalCount,
    highCount,
    estimatedEarnings: `$${(row.bountyFinalizedCount * 12500).toLocaleString("en-US")}`,
    streakDays: Math.max(3, (row.score % 25) + 3),
    lastActive: "Today",
    country: { code: "GLOBAL", name: "Global" },
    specialization: index % 2 === 0 ? "api_cloud" : "web",
    tags: ["API Security", "Cloud Infrastructure", "Authorization"],
    badges: defaultBadges,
    bioSnippet: "Verified security researcher contributing high-impact findings to defended programs.",
  };
}

/**
 * Calculates top highlighted summary cards from the enriched rows
 */
export function calculateLeaderboardSummary(rows: EnrichedLeaderboardRow[]) {
  if (rows.length === 0) {
    return null;
  }

  // 1. Top Researcher
  const top = rows[0];

  // 2. Fastest Rising (highest positive rankChange or newest)
  const rising = [...rows].sort((a, b) => b.rankChange - a.rankChange)[0] || top;

  // 3. Most Critical Findings
  const mostCritical = [...rows].sort((a, b) => b.criticalCount - a.criticalCount)[0] || top;

  // 4. Highest Trust Score
  const highestTrust = [...rows].sort((a, b) => b.trustScore - a.trustScore)[0] || top;

  // 5. Longest Active Streak
  const longestStreak = [...rows].sort((a, b) => b.streakDays - a.streakDays)[0] || top;

  // 6. Hall of Fame Leader
  const hallOfFame = rows.find((r) => r.badges.includes("Hall of Fame")) || top;

  return {
    top,
    rising,
    mostCritical,
    highestTrust,
    longestStreak,
    hallOfFame,
  };
}

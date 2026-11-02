import type { AssetInventoryItem, ProgramAssetType, ScopeState } from "../types/scope";
import type { RewardGroup } from "../types/reward-groups";

export type AssetSeverity = "critical" | "high" | "medium" | "low";

export type AssetIntelligence = {
  assetId: string;
  displayIdentifier: string;
  assetType: ProgramAssetType;
  riskScore: number;
  /** Its reward group pays a critical bounty of 2,000,000+ minor units at the top of the range. */
  isCrownJewel: boolean;
  riskSeverity: AssetSeverity;
  riskFactors: string[];
  exposureType: "Public Ingress" | "Protected Gateway" | "Internal VPC" | "Mobile Client" | "Repository" | "Edge Anycast";
  exposureDescription: string;
  verificationStatus: "verified" | "pending_verification" | "retired";
  verificationMethod: string;
  verifiedAt: string;
  ownerTeam: string;
  primaryContact: string;
  cloudEnvironment: string;
  region: string;
  techStack: string[];
  complianceTags: string[];
  scopeState: ScopeState | "retired";
  openFindingsCount: number;
  totalFindingsCount: number;
  lastAssessedAt: string;
  dnsRecords: string[];
  portsProtocols: string[];
  simulatedFindings: {
    id: string;
    title: string;
    severity: "critical" | "high" | "medium" | "low";
    cvss: number;
    status: "new" | "triaging" | "accepted" | "resolved";
    submittedAgo: string;
  }[];
};

/**
 * Deterministic attack surface intelligence mapping for any asset.
 * Enriches inventory items with real-world security telemetry matching Wiz, GitHub Security & Datadog.
 */
/** Exposure category by asset type: a classification of what kind of asset it is, not a scan. */
const EXPOSURE: Record<string, [AssetIntelligence["exposureType"], string]> = {
  domain: ["Public Ingress", "A public domain in scope for testing."],
  wildcard: ["Public Ingress", "Every subdomain under this name is in scope."],
  url: ["Public Ingress", "A specific public URL in scope for testing."],
  api: ["Protected Gateway", "An API surface; access depends on its own authentication."],
  ip_cidr: ["Edge Anycast", "An address range in scope for testing."],
  mobile_ios: ["Mobile Client", "An iOS app in scope for testing."],
  mobile_android: ["Mobile Client", "An Android app in scope for testing."],
  source_code: ["Repository", "Source code in scope for review."],
};

/** What we actually know about an asset: its reports, its reward group, whether its domain is
 * verified, and its scope. Fields with no source (owner team, cloud, tech stack, DNS, ports)
 * stay empty and are hidden. `verifiedDomains` are the organization's DNS-verified domains. */
export function getAssetIntelligence(asset: AssetInventoryItem, rewardGroup?: RewardGroup | null, verifiedDomains: string[] = []): AssetIntelligence {
  const target = asset.displayIdentifier.toLowerCase().replace(/^\*\./, "").replace(/^https?:\/\//, "").split(/[/:]/)[0];
  const isCrownJewel = Boolean(rewardGroup?.bounties?.critical?.max && rewardGroup.bounties.critical.max >= 2000000);
  const isRetired = asset.programs.length === 0 || asset.programs.every((p) => p.scope_state === "out_of_scope");
  const isVerified = verifiedDomains.some((d) => target === d || target.endsWith(`.${d}`));

  // Risk: open reports weigh most, a crown-jewel reward group raises it, an unverified
  // public asset adds a little. Derived only from the facts listed in riskFactors.
  const riskFactors: string[] = [];
  let riskScore = Math.min(70, asset.openReports * 18);
  if (asset.openReports > 0) riskFactors.push(`${asset.openReports} open ${asset.openReports === 1 ? "report" : "reports"}`);
  if (isCrownJewel) {
    riskScore += 20;
    riskFactors.push(`Reward group "${rewardGroup!.name}" pays critical bounties up to its highest tier`);
  }
  if (!isVerified && !isRetired && ["domain", "wildcard", "url", "api"].includes(asset.assetType)) {
    riskScore += 10;
    riskFactors.push("Domain ownership not verified");
  }
  if (isRetired) riskScore = 0;
  riskScore = Math.min(100, riskScore);
  const riskSeverity: AssetSeverity = riskScore >= 75 ? "critical" : riskScore >= 55 ? "high" : riskScore >= 35 ? "medium" : "low";
  const [exposureType, exposureDescription] = EXPOSURE[asset.assetType] ?? ["Public Ingress", "In scope for testing."];

  return {
    assetId: asset.id,
    displayIdentifier: asset.displayIdentifier,
    assetType: asset.assetType,
    riskScore,
    isCrownJewel,
    riskSeverity,
    riskFactors,
    exposureType,
    exposureDescription,
    verificationStatus: isRetired ? "retired" : isVerified ? "verified" : "pending_verification",
    verificationMethod: isVerified ? "DNS TXT record" : "",
    verifiedAt: "",
    ownerTeam: "",
    primaryContact: "",
    cloudEnvironment: "",
    region: "",
    techStack: [],
    complianceTags: [],
    scopeState: isRetired ? "retired" : (asset.programs[0]?.scope_state ?? "in_scope"),
    openFindingsCount: asset.openReports,
    totalFindingsCount: asset.totalReports,
    lastAssessedAt: asset.lastReportAt ?? "",
    dnsRecords: [],
    portsProtocols: [],
    simulatedFindings: [],
  };
}

export function calculateAttackSurfaceKpis(
  assets: AssetInventoryItem[],
  rewardGroups: RewardGroup[],
  groupByAsset: Record<string, string | null>,
  verifiedDomains: string[] = [],
) {
  const byId = new Map(rewardGroups.map((g) => [g.id, g]));
  const intelligences = assets.map((a) => getAssetIntelligence(a, byId.get(groupByAsset[a.id] ?? "") ?? null, verifiedDomains));

  const totalAssets = assets.length;
  const verifiedAssets = intelligences.filter((i) => i.verificationStatus === "verified").length;
  const verifiedPercent = totalAssets > 0 ? Math.round((verifiedAssets / totalAssets) * 100) : 0;

  const highRiskAssets = intelligences.filter((i) => i.riskSeverity === "critical" || i.riskSeverity === "high").length;
  const criticalRiskAssets = intelligences.filter((i) => i.riskSeverity === "critical").length;

  const inScopeAssets = assets.filter((a) => a.programs.some((p) => p.scope_state === "in_scope")).length;
  const totalOpenFindings = assets.reduce((sum, a) => sum + a.openReports, 0);

  const testedAssets = assets.filter((a) => a.totalReports > 0).length;
  const coveragePercent = totalAssets > 0 ? Math.round((testedAssets / totalAssets) * 100) : 0;

  const publicExposedAssets = intelligences.filter((i) => i.exposureType === "Public Ingress" || i.exposureType === "Edge Anycast").length;

  return {
    totalAssets,
    verifiedAssets,
    verifiedPercent,
    highRiskAssets,
    criticalRiskAssets,
    inScopeAssets,
    totalOpenFindings,
    testedAssets,
    coveragePercent,
    publicExposedAssets,
  };
}

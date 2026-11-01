import type { AssetInventoryItem, ProgramAssetType, ScopeState } from "../types/scope";
import type { RewardGroup } from "../types/reward-groups";

export type AssetSeverity = "critical" | "high" | "medium" | "low";

export type AssetIntelligence = {
  assetId: string;
  displayIdentifier: string;
  assetType: ProgramAssetType;
  riskScore: number;
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
export function getAssetIntelligence(
  asset: AssetInventoryItem,
  rewardGroup?: RewardGroup | null,
): AssetIntelligence {
  const target = asset.displayIdentifier.toLowerCase();
  const isCrownJewel = rewardGroup?.bounties?.critical?.max && rewardGroup.bounties.critical.max >= 2000000;
  const isRetired = asset.programs.length === 0 || asset.programs.every((p) => p.scope_state === "out_of_scope");

  let exposureType: AssetIntelligence["exposureType"] = "Public Ingress";
  let exposureDescription = "Directly accessible via public IPv4/IPv6 internet gateway.";
  let ownerTeam = "Edge Infrastructure & SRE";
  let primaryContact = "sre-ops@northwind.cloud";
  let cloudEnvironment = "AWS us-east-1 Prod";
  let region = "us-east-1 (N. Virginia)";
  let techStack = ["Go 1.22", "Envoy Proxy", "TLS 1.3", "HTTP/2"];
  let complianceTags = ["SOC 2 Type II", "ISO 27001"];
  let dnsRecords = ["A 198.51.100.24", "AAAA 2600:1f18:43::1", "CNAME edge.northwind.cloud"];
  let portsProtocols = ["443/TCP (TLS 1.3)", "80/TCP (301 Redirect)"];
  let verificationMethod = "Automated DNS TXT & TLS Handshake Attestation";

  if (target.includes("api") || target.includes("graphql") || target.includes("/v2")) {
    exposureType = "Public Ingress";
    exposureDescription = "Production API Gateway exposing customer & service mesh endpoints.";
    ownerTeam = "Core API & Platform Engineering";
    primaryContact = "api-lead@northwind.cloud";
    cloudEnvironment = "AWS us-east-1 & eu-central-1";
    region = "Multi-Region Anycast";
    techStack = ["Go 1.22", "GraphQL Federation", "Envoy Gateway", "OpenAPI 3.1"];
    complianceTags = ["Crown Jewel", "SOC 2 Type II", "PCI-DSS 4.0", "ISO 27001"];
    portsProtocols = ["443/TCP (HTTP/2, gRPC-Web)", "8443/TCP (mTLS Management)"];
    dnsRecords = ["A 198.51.100.12", "AAAA 2600:1f18:43::12", "CNAME ingress.northwind.cloud"];
  } else if (target.includes("auth") || target.includes("oidc") || target.includes("saml") || target.includes("iam")) {
    exposureType = "Protected Gateway";
    exposureDescription = "Zero-Trust Identity Broker, OIDC / SAML 2.0 SSO, and WebAuthn passkeys.";
    ownerTeam = "IAM & Platform Security";
    primaryContact = "identity-sec@northwind.cloud";
    cloudEnvironment = "AWS us-east-1 KMS Enclave";
    region = "us-east-1 (Strict Isolation)";
    techStack = ["Rust Core", "OIDC 1.0", "SAML 2.0", "WebAuthn / FIDO2", "Redis Sentinel"];
    complianceTags = ["Crown Jewel", "FedRAMP High Equivalent", "SOC 2 Type II"];
    portsProtocols = ["443/TCP (mTLS / Strict TLS 1.3)", "80/TCP (Forbidden)"];
    dnsRecords = ["A 198.51.100.42", "AAAA 2600:1f18:43::42", "TXT v=oidc-proof-v1"];
    verificationMethod = "Cryptographic Key Attestation & DNS TXT Control";
  } else if (target.includes("vault") || target.includes("kms")) {
    exposureType = "Internal VPC";
    exposureDescription = "Customer-managed KMS envelope encryption and ephemeral secret leasing.";
    ownerTeam = "Cryptography & Cloud Infrastructure";
    primaryContact = "kms-team@northwind.cloud";
    cloudEnvironment = "AWS PrivateLink / VPC Peering";
    region = "us-east-1 & us-west-2";
    techStack = ["HashiCorp Vault Enterprise", "Go", "AWS KMS HSM", "TLS 1.3"];
    complianceTags = ["Crown Jewel", "FIPS 140-3 Level 3", "PCI-DSS 4.0", "SOC 2"];
    portsProtocols = ["8200/TCP (mTLS Only)", "8201/TCP (Cluster Replication)"];
    dnsRecords = ["Private DNS vault.corp.internal", "TXT kms-lease-authority"];
    verificationMethod = "HSM Attestation Certificate Chain";
  } else if (target.includes("198.51") || target.includes("cidr") || target.includes("/")) {
    exposureType = "Edge Anycast";
    exposureDescription = "Production Anycast BGP ingress prefix routed to 36 global points of presence.";
    ownerTeam = "Network Engineering & Edge SRE";
    primaryContact = "net-ops@northwind.cloud";
    cloudEnvironment = "Edge PoPs (36 Global Locations)";
    region = "Global BGP Anycast (AS64496)";
    techStack = ["BGP Anycast", "eBPF XDP Firewall", "WireGuard Mesh", "Envoy"];
    complianceTags = ["ISO 27001", "SOC 2 Type II"];
    portsProtocols = ["443/TCP", "51820/UDP (WireGuard Relay)", "80/TCP"];
    dnsRecords = ["BGP Route Object AS64496", "PTR edge-gw-01.northwind.cloud"];
    verificationMethod = "BGP RPKI ROA Validation & Reverse DNS";
  } else if (target.includes("authenticator") || target.includes("app") || asset.assetType === "ios_app" || asset.assetType === "android_app") {
    exposureType = "Mobile Client";
    exposureDescription = "Native Push MFA authenticator with hardware security enclave attestation.";
    ownerTeam = "Mobile & Client Engineering";
    primaryContact = "mobile-sec@northwind.cloud";
    cloudEnvironment = "Apple App Store & Google Play";
    region = "Worldwide Mobile Distribution";
    techStack = ["Swift / iOS Secure Enclave", "Kotlin / Android Keystore", "FIDO2", "mTLS"];
    complianceTags = ["FIPS 140-2 Level 1", "OWASP MASVS L2"];
    portsProtocols = ["Outbound HTTPS to auth.northwind.cloud", "APNs / FCM Push"];
    dnsRecords = ["App Store Connect Team ID: NW89721", "Google Play Package: io.northwind.auth"];
    verificationMethod = "App Store Developer Certificate & Play Integrity API";
  } else if (target.includes("mesh") || target.includes("repo") || asset.assetType === "source_code") {
    exposureType = "Repository";
    exposureDescription = "Core open-source and proprietary zero-trust networking client libraries.";
    ownerTeam = "Zero-Trust Mesh & SDK Team";
    primaryContact = "sdk-core@northwind.cloud";
    cloudEnvironment = "GitHub Enterprise & Staging Registry";
    region = "Cloud Hosted SCM";
    techStack = ["Go 1.22", "Rust", "WireGuard Protocol", "GitHub Actions SLSA 3"];
    complianceTags = ["SLSA Level 3", "OpenSSF Best Practices"];
    portsProtocols = ["SSH 22 / HTTPS 443 Git Smart HTTP"];
    dnsRecords = ["github.com/northwind/mesh-relay-core"];
    verificationMethod = "GitHub App Signed Commit Attestation & Branch Protection";
  } else if (target.includes("billing") || target.includes("invoice")) {
    exposureType = "Protected Gateway";
    exposureDescription = "Financial settlement APIs, Stripe Connect webhook handler, and ACH transfer rails.";
    ownerTeam = "Fintech & Billing Platform";
    primaryContact = "billing-eng@northwind.cloud";
    cloudEnvironment = "AWS us-east-1 PCI Enclave";
    region = "us-east-1 (PCI-DSS Scoped)";
    techStack = ["TypeScript / Node.js 22", "PostgreSQL Aurora", "Stripe API", "KMS"];
    complianceTags = ["Crown Jewel", "PCI-DSS 4.0 Level 1", "SOC 1 Type II", "SOC 2"];
    portsProtocols = ["443/TCP (Strict TLS 1.3)", "Webhook Signature HMAC-SHA256"];
    dnsRecords = ["A 198.51.100.88", "CNAME billing-edge.northwind.cloud"];
    verificationMethod = "PCI-DSS Attestation of Compliance (AoC)";
  } else if (target.includes("status") || target.includes("blog")) {
    exposureType = "Public Ingress";
    exposureDescription = "Public marketing blog or third-party status portal cached across CDN.";
    ownerTeam = "Brand & Corporate Communications";
    primaryContact = "brand-web@northwind.cloud";
    cloudEnvironment = "Cloudflare Pages & Statuspage CDN";
    region = "Global Edge CDN";
    techStack = ["Next.js SSG", "Cloudflare CDN", "TLS 1.3"];
    complianceTags = ["SOC 2 Type II"];
    portsProtocols = ["443/TCP", "80/TCP"];
    dnsRecords = ["CNAME statuspage.io.cdn", "TXT status-verify"];
    verificationMethod = "DNS CNAME Verification";
  }

  // Calculate Risk Score (1 to 100)
  let baseScore = 24;
  const riskFactors: string[] = [];

  if (exposureType === "Public Ingress" || exposureType === "Edge Anycast") {
    baseScore += 26;
    riskFactors.push("Direct internet-facing exposure");
  } else if (exposureType === "Protected Gateway") {
    baseScore += 20;
    riskFactors.push("Authentication & financial gateway boundary");
  } else if (exposureType === "Internal VPC") {
    baseScore += 10;
    riskFactors.push("High privilege internal cryptographic endpoint");
  }

  if (isCrownJewel) {
    baseScore += 18;
    riskFactors.push("Designated Tier 1 Crown Jewel asset");
  }

  if (asset.openReports > 0) {
    const reportImpact = Math.min(32, asset.openReports * 14);
    baseScore += reportImpact;
    riskFactors.push(`${asset.openReports} active unpatched finding${asset.openReports > 1 ? "s" : ""}`);
  }

  if (isRetired) {
    baseScore = Math.max(12, baseScore - 30);
  }

  const riskScore = Math.min(98, Math.max(14, baseScore));

  let riskSeverity: AssetSeverity = "low";
  if (riskScore >= 75) riskSeverity = "critical";
  else if (riskScore >= 55) riskSeverity = "high";
  else if (riskScore >= 35) riskSeverity = "medium";

  // Simulated recent findings for asset profile
  const simulatedFindings: AssetIntelligence["simulatedFindings"] = [];
  if (asset.openReports > 0) {
    if (target.includes("api") || target.includes("graphql")) {
      simulatedFindings.push({
        id: "rep-777701",
        title: "Cross-tenant KMS key policy read/write via unvalidated X-Forwarded-Tenant-Id header in GraphQL batch mutation",
        severity: "critical",
        cvss: 9.6,
        status: "accepted",
        submittedAgo: "3 days ago",
      });
      if (asset.openReports > 1) {
        simulatedFindings.push({
          id: "rep-777704",
          title: "SSRF in webhook delivery preview via DNS rebinding on internal loopback",
          severity: "high",
          cvss: 8.6,
          status: "triaging",
          submittedAgo: "1 day ago",
        });
      }
    } else if (target.includes("auth")) {
      simulatedFindings.push({
        id: "rep-777703",
        title: "OIDC PKCE downgrade on `/oauth/authorize` when `code_challenge_method` is omitted for public CLI clients",
        severity: "high",
        cvss: 8.1,
        status: "triaging",
        submittedAgo: "2 days ago",
      });
    } else if (target.includes("vault")) {
      simulatedFindings.push({
        id: "rep-777705",
        title: "Information disclosure in KMS lease revocation error traces",
        severity: "medium",
        cvss: 6.5,
        status: "new",
        submittedAgo: "5 hours ago",
      });
    } else if (target.includes("billing")) {
      simulatedFindings.push({
        id: "rep-777707",
        title: "Race condition in invoice credit memo application",
        severity: "high",
        cvss: 7.9,
        status: "triaging",
        submittedAgo: "1 day ago",
      });
    } else {
      simulatedFindings.push({
        id: "rep-777708",
        title: "Rate limit bypass on sensitive endpoint via header spoofing",
        severity: "medium",
        cvss: 5.8,
        status: "triaging",
        submittedAgo: "4 days ago",
      });
    }
  }

  const verificationStatus: AssetIntelligence["verificationStatus"] = isRetired
    ? "retired"
    : target.includes("status") || target.includes("blog")
      ? "pending_verification"
      : "verified";

  return {
    assetId: asset.id,
    displayIdentifier: asset.displayIdentifier,
    assetType: asset.assetType,
    riskScore,
    riskSeverity,
    riskFactors,
    exposureType,
    exposureDescription,
    verificationStatus,
    verificationMethod,
    verifiedAt: isRetired ? "N/A" : "2026-03-24T08:15:00Z",
    ownerTeam,
    primaryContact,
    cloudEnvironment,
    region,
    techStack,
    complianceTags,
    scopeState: isRetired ? "retired" : (asset.programs[0]?.scope_state ?? "in_scope"),
    openFindingsCount: asset.openReports,
    totalFindingsCount: asset.totalReports,
    lastAssessedAt: asset.lastReportAt || "2026-03-20T14:32:00Z",
    dnsRecords,
    portsProtocols,
    simulatedFindings,
  };
}

/**
 * Calculates executive KPI metrics across all inventory items
 */
export function calculateAttackSurfaceKpis(
  assets: AssetInventoryItem[],
  rewardGroups: RewardGroup[],
  groupByAsset: Record<string, string | null>,
) {
  const byId = new Map(rewardGroups.map((g) => [g.id, g]));
  const intelligences = assets.map((a) => getAssetIntelligence(a, byId.get(groupByAsset[a.id] ?? "") ?? null));

  const totalAssets = assets.length;
  const verifiedAssets = intelligences.filter((i) => i.verificationStatus === "verified").length;
  const verifiedPercent = totalAssets > 0 ? Math.round((verifiedAssets / totalAssets) * 100) : 100;

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

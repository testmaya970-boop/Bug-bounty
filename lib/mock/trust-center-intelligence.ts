export interface TrustScoreBreakdown {
  overallScore: number;
  grade: "A+" | "A" | "B" | "C" | "Needs Attention";
  trend: string;
  trendDirection: "up" | "down" | "neutral";
  coveragePercentage: number;
  totalAssets: number;
  verifiedAssets: number;
  pendingReviews: number;
  verificationFailures: number;
  criticalTrustIssues: number;
  breakdown: {
    category: string;
    score: number;
    weight: string;
    verifiedCount: number;
    totalCount: number;
    status: "healthy" | "warning" | "alert";
  }[];
}

export interface AssetVerificationGroup {
  id: string;
  type: "domains" | "repositories" | "mobile" | "cloud" | "desktop" | "apis" | "hardware" | "ai";
  label: string;
  description: string;
  verified: number;
  pending: number;
  rejected: number;
  expired: number;
  needsReview: number;
  total: number;
  items: {
    id: string;
    name: string;
    identifier: string;
    status: "verified" | "pending" | "rejected" | "expired" | "review_required";
    verifiedAt?: string;
    verifiedBy?: string;
    method: "DNS TXT" | "GitHub App" | "App Store Connect" | "OIDC Cloud Role" | "Code Signing Cert" | "Manual Attestation" | "Model Card Attestation";
    notes?: string;
    expiresAt?: string;
  }[];
}

export interface DNSVerificationRecord {
  domain: string;
  txtRecordName: string;
  txtRecordValue: string;
  status: "verified" | "propagating" | "failed" | "unverified";
  propagationPercentage: number;
  lastChecked: string;
  verifiedAt: string;
  verifiedBy: string;
  nameservers: string[];
  subdomainsInherited: boolean;
  lookalikeProtectionEnabled: boolean;
  history: {
    timestamp: string;
    event: string;
    status: "success" | "warning" | "error";
  }[];
}

export interface ManualVerificationRequest {
  id: string;
  assetType: "IP Range" | "Mobile App" | "Repository" | "Hardware Key" | "AI Model" | "Cloud Project";
  assetName: string;
  targetIdentifier: string;
  evidenceType: "Signed GPG Release" | "App Store Developer Certificate" | "AWS Role Proof" | "Model Card Attestation" | "ARIN/RIPE Whois Proof";
  evidenceSnippet: string;
  requesterName: string;
  requesterEmail: string;
  submittedAt: string;
  assignedReviewer: string;
  status: "pending_review" | "more_evidence_required" | "approved" | "rejected";
  reviewNotes?: string;
  urgency: "High" | "Standard";
}

export interface ScopeIntegrityItem {
  id: string;
  type: "lookalike" | "unauthorized" | "expired" | "duplicate" | "pending";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  detectedAt: string;
  affectedAsset: string;
  recommendedAction: string;
}

export interface TrustRecommendation {
  id: string;
  priority: "Critical" | "High" | "Medium";
  title: string;
  description: string;
  impactScoreIncrease: number;
  category: "Ownership" | "Scope Integrity" | "DNS" | "Integration";
  actionLabel: string;
}

export interface IntegrationHealthItem {
  id: string;
  name: string;
  category: "Code & CI" | "Issue Tracking" | "ChatOps" | "ITSM" | "Webhooks";
  connected: boolean;
  healthy: boolean;
  lastSync: string;
  uptimePercentage: number;
  errorCount: number;
  latencyMs: number;
  syncSummary: string;
}

export interface TrustAuditTimelineEvent {
  id: string;
  action: string;
  target: string;
  actor: string;
  timestamp: string;
  category: "dns" | "approval" | "revocation" | "expiry" | "score_change" | "scope";
  status: "success" | "warning" | "revoked" | "alert";
  details: string;
}

export const MOCK_TRUST_SCORE_BREAKDOWN: TrustScoreBreakdown = {
  overallScore: 94,
  grade: "A+",
  trend: "+3.2% this month",
  trendDirection: "up",
  coveragePercentage: 97.4,
  totalAssets: 342,
  verifiedAssets: 326,
  pendingReviews: 8,
  verificationFailures: 2,
  criticalTrustIssues: 1,
  breakdown: [
    { category: "Verified Domains", score: 98, weight: "25%", verifiedCount: 14, totalCount: 14, status: "healthy" },
    { category: "Verified Repositories", score: 95, weight: "20%", verifiedCount: 48, totalCount: 50, status: "healthy" },
    { category: "Verified Mobile Apps", score: 92, weight: "15%", verifiedCount: 6, totalCount: 6, status: "healthy" },
    { category: "Verified Cloud Projects", score: 96, weight: "20%", verifiedCount: 12, totalCount: 12, status: "healthy" },
    { category: "Verified AI Models", score: 88, weight: "10%", verifiedCount: 4, totalCount: 5, status: "warning" },
    { category: "Pending Ownership Requests", score: 85, weight: "10%", verifiedCount: 8, totalCount: 10, status: "warning" },
  ],
};

export const MOCK_ASSET_VERIFICATION_GROUPS: AssetVerificationGroup[] = [
  {
    id: "grp-domains",
    type: "domains",
    label: "Web Domains & FQDNs",
    description: "Cryptographically verified via DNS TXT tokens and authoritative nameservers",
    verified: 14,
    pending: 1,
    rejected: 0,
    expired: 0,
    needsReview: 1,
    total: 15,
    items: [
      { id: "dom-01", name: "comolho.io", identifier: "Apex Domain", status: "verified", method: "DNS TXT", verifiedAt: "2026-06-12", verifiedBy: "Alex Vance", expiresAt: "2027-06-12" },
      { id: "dom-02", name: "*.comolho.io", identifier: "Wildcard Subdomains", status: "verified", method: "DNS TXT", verifiedAt: "2026-06-12", verifiedBy: "Alex Vance", notes: "Inherits apex cryptographic verification" },
      { id: "dom-03", name: "auth.comolho.com", identifier: "Single Sign-On Portal", status: "verified", method: "DNS TXT", verifiedAt: "2026-08-01", verifiedBy: "Sarah Chen" },
      { id: "dom-04", name: "api.staging.comolho.net", identifier: "Staging API Gateway", status: "pending", method: "DNS TXT", notes: "TXT token generated, awaiting propagation verification" },
    ],
  },
  {
    id: "grp-repos",
    type: "repositories",
    label: "Source Repositories",
    description: "Verified via GitHub Apps and GitLab OAuth webhooks with org attestation",
    verified: 48,
    pending: 2,
    rejected: 1,
    expired: 0,
    needsReview: 2,
    total: 51,
    items: [
      { id: "repo-01", name: "github.com/comolho/core-api", identifier: "Primary Backend Services", status: "verified", method: "GitHub App", verifiedAt: "2026-05-10", verifiedBy: "Marcus Brody" },
      { id: "repo-02", name: "github.com/comolho/agent-engine", identifier: "Vulnerability Scanner Agent", status: "verified", method: "GitHub App", verifiedAt: "2026-07-14", verifiedBy: "Sarah Chen" },
      { id: "repo-03", name: "gitlab.com/comolho/billing-service", identifier: "Payment Gateway Microservice", status: "verified", method: "GitHub App", verifiedAt: "2026-09-02", verifiedBy: "Alex Vance" },
      { id: "repo-04", name: "github.com/comolho/internal-tools", identifier: "Staff Diagnostic Utilities", status: "review_required", method: "GitHub App", notes: "Repository made public temporarily; re-verification needed" },
    ],
  },
  {
    id: "grp-mobile",
    type: "mobile",
    label: "Mobile Applications",
    description: "Attested via Apple App Store Connect Team ID and Google Play Console",
    verified: 6,
    pending: 0,
    rejected: 0,
    expired: 0,
    needsReview: 0,
    total: 6,
    items: [
      { id: "mob-01", name: "Com Olho Sentinel (iOS)", identifier: "Bundle ID: com.comolho.sentinel", status: "verified", method: "App Store Connect", verifiedAt: "2026-04-18", verifiedBy: "Alex Vance" },
      { id: "mob-02", name: "Com Olho Sentinel (Android)", identifier: "Package: com.comolho.sentinel.android", status: "verified", method: "App Store Connect", verifiedAt: "2026-04-20", verifiedBy: "Sarah Chen" },
    ],
  },
  {
    id: "grp-cloud",
    type: "cloud",
    label: "Cloud Projects & Tenants",
    description: "Cryptographically verified via AWS IAM OIDC roles and GCP Service Accounts",
    verified: 12,
    pending: 0,
    rejected: 0,
    expired: 0,
    needsReview: 0,
    total: 12,
    items: [
      { id: "cld-01", name: "AWS Prod US-East-1", identifier: "Account ID: 384910293812", status: "verified", method: "OIDC Cloud Role", verifiedAt: "2026-03-11", verifiedBy: "Marcus Brody" },
      { id: "cld-02", name: "GCP Mesh Cluster", identifier: "Project ID: comolho-prod-mesh", status: "verified", method: "OIDC Cloud Role", verifiedAt: "2026-03-12", verifiedBy: "Marcus Brody" },
    ],
  },
  {
    id: "grp-apis",
    type: "apis",
    label: "API Gateways & Endpoints",
    description: "Verified through OpenAPI spec hashes and TLS SNI certificate matching",
    verified: 18,
    pending: 1,
    rejected: 0,
    expired: 0,
    needsReview: 1,
    total: 20,
    items: [
      { id: "api-01", name: "https://api.comolho.io/v2", identifier: "Production GraphQL Gateway", status: "verified", method: "DNS TXT", verifiedAt: "2026-06-12", verifiedBy: "Alex Vance" },
      { id: "api-02", name: "https://webhooks.comolho.io", identifier: "Event Stream Ingest", status: "verified", method: "DNS TXT", verifiedAt: "2026-07-01", verifiedBy: "Sarah Chen" },
    ],
  },
  {
    id: "grp-ai",
    type: "ai",
    label: "AI Models & Weights",
    description: "Fine-tuned models attested via SHA-256 weight hash and Model Card signing",
    verified: 4,
    pending: 1,
    rejected: 0,
    expired: 0,
    needsReview: 1,
    total: 5,
    items: [
      { id: "ai-01", name: "comolho-vuln-detector-v3", identifier: "Fine-tuned Transformer", status: "verified", method: "Model Card Attestation", verifiedAt: "2026-09-15", verifiedBy: "Sarah Chen" },
      { id: "ai-02", name: "comolho-triage-summarizer", identifier: "7B Instruction Model", status: "pending", method: "Model Card Attestation", notes: "Reviewing training provenance and data ownership" },
    ],
  },
  {
    id: "grp-hardware",
    type: "hardware",
    label: "Hardware & Key Infrastructure",
    description: "Hardware security keys and appliances verified via FIPS attestation certs",
    verified: 8,
    pending: 0,
    rejected: 0,
    expired: 0,
    needsReview: 0,
    total: 8,
    items: [
      { id: "hw-01", name: "YubiKey 5C FIPS Master Keys", identifier: "Attestation Serial: YK-984210", status: "verified", method: "Code Signing Cert", verifiedAt: "2026-02-01", verifiedBy: "Alex Vance" },
    ],
  },
  {
    id: "grp-desktop",
    type: "desktop",
    label: "Desktop Client Binaries",
    description: "Apple Notarization and Microsoft Authenticode code-signing identity",
    verified: 4,
    pending: 0,
    rejected: 0,
    expired: 0,
    needsReview: 0,
    total: 4,
    items: [
      { id: "dt-01", name: "Com Olho Inspector (macOS)", identifier: "Team ID: 4K92LZ948", status: "verified", method: "Code Signing Cert", verifiedAt: "2026-05-18", verifiedBy: "Alex Vance" },
      { id: "dt-02", name: "Com Olho Inspector (Windows)", identifier: "SHA-256 Authenticode", status: "verified", method: "Code Signing Cert", verifiedAt: "2026-05-20", verifiedBy: "Alex Vance" },
    ],
  },
];

export const MOCK_DNS_VERIFICATION: DNSVerificationRecord = {
  domain: "comolho.io",
  txtRecordName: "_unpatched-challenge.comolho.io",
  txtRecordValue: "unpatched-site-verification=784fe982bca931e0984da22184ff",
  status: "verified",
  propagationPercentage: 100,
  lastChecked: "6 minutes ago",
  verifiedAt: "June 12, 2026",
  verifiedBy: "Alex Vance (VP InfoSec)",
  nameservers: ["ns1.cloudflare.com", "ns2.cloudflare.com"],
  subdomainsInherited: true,
  lookalikeProtectionEnabled: true,
  history: [
    { timestamp: "Today at 22:50", event: "Automated hourly DNS re-check: Validated 200 OK across 8 global PoPs", status: "success" },
    { timestamp: "Oct 24, 2026", event: "TXT record TTL confirmed at 300 seconds", status: "success" },
    { timestamp: "June 12, 2026", event: "Initial DNS TXT record propagated and cryptographically bound to org_3333333301", status: "success" },
  ],
};

export const MOCK_MANUAL_VERIFICATION_QUEUE: ManualVerificationRequest[] = [
  {
    id: "mvr-01",
    assetType: "IP Range",
    assetName: "Primary Datacenter Subnet",
    targetIdentifier: "198.51.100.0/24 (US-West Colocation)",
    evidenceType: "ARIN/RIPE Whois Proof",
    evidenceSnippet: "ARIN OrgID 'COMOLHO-CORP' matching organization legal entity registration #482910.",
    requesterName: "Marcus Brody",
    requesterEmail: "marcus.brody@comolho.io",
    submittedAt: "2026-10-31T14:30:00Z",
    assignedReviewer: "Alex Vance",
    status: "pending_review",
    urgency: "High",
  },
  {
    id: "mvr-02",
    assetType: "AI Model",
    assetName: "Triage Inference Model",
    targetIdentifier: "huggingface.co/comolho/triage-v2",
    evidenceType: "Model Card Attestation",
    evidenceSnippet: "Cryptographic weight checksum SHA256: 9e4f... bound to Com Olho PGP release key.",
    requesterName: "Sarah Chen",
    requesterEmail: "sarah.chen@comolho.io",
    submittedAt: "2026-10-30T16:10:00Z",
    assignedReviewer: "Elena Rostova",
    status: "more_evidence_required",
    reviewNotes: "Please attach training set license verification document.",
    urgency: "Standard",
  },
  {
    id: "mvr-03",
    assetType: "Repository",
    assetName: "Internal Vulnerability Telemetry",
    targetIdentifier: "github.com/comolho/vuln-feed-internal",
    evidenceType: "Signed GPG Release",
    evidenceSnippet: "GitHub organization ownership certified via verified domain comolho.io.",
    requesterName: "David Kim",
    requesterEmail: "david.kim@comolho.io",
    submittedAt: "2026-10-29T11:00:00Z",
    assignedReviewer: "Alex Vance",
    status: "approved",
    reviewNotes: "Verified organization match and branch protection rules.",
    urgency: "Standard",
  },
];

export const MOCK_SCOPE_INTEGRITY_ITEMS: ScopeIntegrityItem[] = [
  {
    id: "sci-01",
    type: "lookalike",
    severity: "critical",
    title: "Typosquat Domain Discovered & Blocked",
    description: "External actor attempted to register scope for 'c0molho.io' and 'comolho-security.org'. Automatically blocked by brand trust heuristics.",
    detectedAt: "3 hours ago",
    affectedAsset: "c0molho.io",
    recommendedAction: "Add to permanent scope blacklist and trigger brand protection takedown.",
  },
  {
    id: "sci-02",
    type: "pending",
    severity: "high",
    title: "New Staging Microservice Awaiting Proof",
    description: "Asset 'api.staging.comolho.net' added to Core Bounty Program without active DNS TXT record confirmation.",
    detectedAt: "5 hours ago",
    affectedAsset: "api.staging.comolho.net",
    recommendedAction: "Complete TXT record verification or keep asset in private testing.",
  },
  {
    id: "sci-03",
    type: "expired",
    severity: "medium",
    title: "Legacy Testing Endpoint Expiring",
    description: "Scope verification for 'legacy-portal.internal' will expire in 14 days due to annual attestation policy.",
    detectedAt: "1 day ago",
    affectedAsset: "legacy-portal.internal",
    recommendedAction: "Renew certificate or decommission asset from bounty scope.",
  },
];

export const MOCK_TRUST_RECOMMENDATIONS: TrustRecommendation[] = [
  {
    id: "rec-01",
    priority: "Critical",
    title: "Verify 1 Pending Staging API Domain",
    description: "Completing DNS TXT record check for api.staging.comolho.net will bring domain ownership coverage to 100%.",
    impactScoreIncrease: 2,
    category: "DNS",
    actionLabel: "Verify DNS Record",
  },
  {
    id: "rec-02",
    priority: "High",
    title: "Review 1 AI Model Ownership Request",
    description: "Review pending model attestation for comolho-triage-summarizer to ensure AI assets comply with responsible disclosure.",
    impactScoreIncrease: 2,
    category: "Ownership",
    actionLabel: "Open Review Queue",
  },
  {
    id: "rec-03",
    priority: "Medium",
    title: "Enable Automatic Look-alike Domain Protection on .net TLD",
    description: "Extend typosquatting shield from .io to .com and .net domains registered in your asset perimeter.",
    impactScoreIncrease: 1,
    category: "Scope Integrity",
    actionLabel: "Enable Shield",
  },
];

export const MOCK_INTEGRATION_HEALTH: IntegrationHealthItem[] = [
  {
    id: "int-github",
    name: "GitHub Enterprise Cloud",
    category: "Code & CI",
    connected: true,
    healthy: true,
    lastSync: "2 minutes ago",
    uptimePercentage: 99.98,
    errorCount: 0,
    latencyMs: 142,
    syncSummary: "48 verified repositories synchronized with organization webhooks.",
  },
  {
    id: "int-jira",
    name: "Jira Software Cloud",
    category: "Issue Tracking",
    connected: true,
    healthy: true,
    lastSync: "8 minutes ago",
    uptimePercentage: 99.95,
    errorCount: 0,
    latencyMs: 284,
    syncSummary: "Bidirectional ticket sync active; 14 open findings tracked.",
  },
  {
    id: "int-slack",
    name: "Slack Security Alerts (#sec-ops)",
    category: "ChatOps",
    connected: true,
    healthy: true,
    lastSync: "Instant (Realtime)",
    uptimePercentage: 100,
    errorCount: 0,
    latencyMs: 95,
    syncSummary: "Alert channels active for critical & high severity triage events.",
  },
  {
    id: "int-servicenow",
    name: "ServiceNow ITSM Connector",
    category: "ITSM",
    connected: true,
    healthy: true,
    lastSync: "35 minutes ago",
    uptimePercentage: 99.9,
    errorCount: 0,
    latencyMs: 340,
    syncSummary: "Enterprise change management mapping verified.",
  },
  {
    id: "int-gitlab",
    name: "GitLab Self-Managed",
    category: "Code & CI",
    connected: false,
    healthy: false,
    lastSync: "Never",
    uptimePercentage: 0,
    errorCount: 0,
    latencyMs: 0,
    syncSummary: "Connector configured but disabled. Ready to authenticate.",
  },
  {
    id: "int-webhooks",
    name: "Custom Security SIEM Webhooks",
    category: "Webhooks",
    connected: true,
    healthy: true,
    lastSync: "1 minute ago",
    uptimePercentage: 99.99,
    errorCount: 0,
    latencyMs: 82,
    syncSummary: "Delivering HMAC-SHA256 signed payloads to internal ingest bus.",
  },
];

export const MOCK_TRUST_AUDIT_TIMELINE: TrustAuditTimelineEvent[] = [
  {
    id: "aud-01",
    action: "DNS Verification Re-confirmed",
    target: "comolho.io",
    actor: "Automated Trust Engine",
    timestamp: "Today at 22:50",
    category: "dns",
    status: "success",
    details: "Authoritative nameservers confirmed TXT token propagation.",
  },
  {
    id: "aud-02",
    action: "Typosquat Domain Discovered & Suppressed",
    target: "c0molho.io",
    actor: "Brand Shield Service",
    timestamp: "Today at 20:15",
    category: "scope",
    status: "alert",
    details: "Lookalike domain registration rejected; blacklisted across platform scopes.",
  },
  {
    id: "aud-03",
    action: "Source Repository Attested",
    target: "github.com/comolho/vuln-feed-internal",
    actor: "Alex Vance",
    timestamp: "Oct 29, 2026",
    category: "approval",
    status: "success",
    details: "GPG release proof verified and added to Core Bounty Program scope.",
  },
  {
    id: "aud-04",
    action: "Trust Score Updated",
    target: "Organization Overall Score",
    actor: "Compliance Scoring System",
    timestamp: "Oct 28, 2026",
    category: "score_change",
    status: "success",
    details: "Score increased from 91 to 94 following cloud asset OIDC verification.",
  },
  {
    id: "aud-05",
    action: "Mobile Bundle Attestation Renewed",
    target: "com.comolho.sentinel",
    actor: "Sarah Chen",
    timestamp: "Oct 20, 2026",
    category: "approval",
    status: "success",
    details: "App Store Connect certificate renewed for 12 months.",
  },
];

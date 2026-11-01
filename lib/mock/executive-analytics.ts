export interface ExecutiveKpi {
  id: string;
  label: string;
  value: string | number;
  delta: string;
  isPositive: boolean;
  benchmark: string;
  category: "vulnerabilities" | "performance" | "surface" | "community" | "financial";
  sparkline: number[];
  subtext?: string;
}

export interface VulnerabilityTrendPoint {
  date: string;
  label: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolved: number;
}

export interface MttrStage {
  id: string;
  name: string;
  avgHours: number;
  slaTargetHours: number;
  trend: string;
  isBottleneck: boolean;
  description: string;
  volumeCount: number;
}

export interface AssetCategoryRisk {
  id: string;
  category: string;
  assetCount: number;
  riskScore: number; // 0-100 (higher is safer)
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  trend: "improving" | "stable" | "degrading";
  coveragePct: number;
}

export interface ProgramPerformance {
  id: string;
  name: string;
  type: "Bug Bounty" | "VDP" | "Private";
  openFindings: number;
  criticalFindings: number;
  mttrDays: number;
  healthScore: number;
  activeResearchers: number;
  totalAwarded: number;
  slaCompliance: number;
}

export interface ResearcherLeader {
  rank: number;
  handle: string;
  name: string;
  country: string;
  reputation: number;
  signalScore: number; // e.g. 98.4
  acceptanceRate: number; // e.g. 96%
  totalFindings: number;
  totalEarned: number;
  avatarSeed: string;
  tier: "Elite" | "Master" | "Pro" | "Contributor";
}

export interface ExecutiveTimelineEvent {
  id: string;
  timestamp: string;
  relativeTime: string;
  category: "resolution" | "program" | "bounty" | "compliance" | "incident";
  title: string;
  description: string;
  severity?: "critical" | "high" | "medium" | "low";
  author: string;
  programName: string;
}

export interface AiSecurityInsight {
  id: string;
  title: string;
  summary: string;
  impact: "high" | "medium" | "positive";
  category: "Operations" | "Attack Surface" | "Budget" | "Researcher";
  recommendation: string;
  confidence: number;
}

export const EXECUTIVE_HEALTH = {
  score: 94.8,
  grade: "Excellent",
  deltaPct: 6.2,
  previousPeriodScore: 89.2,
  percentile: "Top 4% in Security Operations",
  factors: [
    { name: "Zero Unresolved Criticals Past SLA", weight: 99, status: "healthy" },
    { name: "Mean Time to Remediate (MTTR)", weight: 94, status: "healthy" },
    { name: "Attack Surface Endpoint Coverage", weight: 91, status: "healthy" },
    { name: "First Response Latency (< 4 hours)", weight: 97, status: "healthy" },
    { name: "Researcher Retention & Signal Ratio", weight: 93, status: "healthy" },
  ],
};

export const EXECUTIVE_KPIS: ExecutiveKpi[] = [
  {
    id: "open-findings",
    label: "Open Findings",
    value: 42,
    delta: "▼ 14% MoM",
    isPositive: true,
    benchmark: "Target < 50",
    category: "vulnerabilities",
    sparkline: [58, 54, 51, 48, 46, 43, 42],
    subtext: "4 Critical • 11 High • 19 Med • 8 Low",
  },
  {
    id: "critical-findings",
    label: "Critical Findings",
    value: 4,
    delta: "▲ 1 vs last wk",
    isPositive: false,
    benchmark: "Zero breach",
    category: "vulnerabilities",
    sparkline: [6, 5, 4, 3, 2, 3, 4],
    subtext: "All under active remediation",
  },
  {
    id: "mttr",
    label: "MTTR (Median)",
    value: "5.2 days",
    delta: "▼ 1.8d faster",
    isPositive: true,
    benchmark: "Target < 7d",
    category: "performance",
    sparkline: [7.8, 7.2, 6.9, 6.1, 5.8, 5.4, 5.2],
    subtext: "Critical MTTR: 1.4 days",
  },
  {
    id: "sla-compliance",
    label: "SLA Compliance",
    value: "98.2%",
    delta: "▲ 2.4% MoM",
    isPositive: true,
    benchmark: "Target: 95%",
    category: "performance",
    sparkline: [94, 95.1, 95.8, 96.5, 97.2, 98.0, 98.2],
    subtext: "1 breach in 56 reports",
  },
  {
    id: "verified-assets",
    label: "Verified Assets",
    value: 168,
    delta: "▲ 12 added",
    isPositive: true,
    benchmark: "100% scope",
    category: "surface",
    sparkline: [142, 148, 152, 156, 160, 164, 168],
    subtext: "91% continuous scanning",
  },
  {
    id: "active-programs",
    label: "Active Programs",
    value: 12,
    delta: "+2 launched",
    isPositive: true,
    benchmark: "4 Pub • 6 Priv • 2 VDP",
    category: "surface",
    sparkline: [9, 10, 10, 10, 11, 11, 12],
    subtext: "All programs health > 85%",
  },
  {
    id: "researchers",
    label: "Active Researchers",
    value: 184,
    delta: "▲ 24 new",
    isPositive: true,
    benchmark: "88% signal",
    category: "community",
    sparkline: [120, 134, 145, 158, 168, 176, 184],
    subtext: "24 countries represented",
  },
  {
    id: "rewards-paid",
    label: "Rewards Paid",
    value: "$92,450",
    delta: "+$18.4K pending",
    isPositive: true,
    benchmark: "Runway: 10.4m",
    category: "financial",
    sparkline: [62, 68, 74, 80, 85, 89, 92],
    subtext: "Avg Critical: $4,500",
  },
  {
    id: "coverage",
    label: "Attack Surface",
    value: "91.4%",
    delta: "▲ 3.2% gain",
    isPositive: true,
    benchmark: "153/168 hosts",
    category: "surface",
    sparkline: [82, 84, 86, 88, 89, 90, 91.4],
    subtext: "Zero blind spot gaps",
  },
  {
    id: "risk-score",
    label: "Risk Posture",
    value: "84 / 100",
    delta: "Low Exposure",
    isPositive: true,
    benchmark: "Top 5% Rank",
    category: "performance",
    sparkline: [72, 75, 78, 80, 81, 83, 84],
    subtext: "Continuous verification",
  },
];

export const VULNERABILITY_TRENDS_30D: VulnerabilityTrendPoint[] = [
  { date: "Oct 03", label: "Oct 3", critical: 2, high: 4, medium: 8, low: 4, resolved: 14 },
  { date: "Oct 07", label: "Oct 7", critical: 1, high: 3, medium: 7, low: 5, resolved: 16 },
  { date: "Oct 11", label: "Oct 11", critical: 3, high: 5, medium: 9, low: 3, resolved: 18 },
  { date: "Oct 15", label: "Oct 15", critical: 1, high: 4, medium: 6, low: 4, resolved: 15 },
  { date: "Oct 19", label: "Oct 19", critical: 2, high: 3, medium: 8, low: 6, resolved: 19 },
  { date: "Oct 23", label: "Oct 23", critical: 0, high: 2, medium: 5, low: 3, resolved: 12 },
  { date: "Oct 27", label: "Oct 27", critical: 1, high: 3, medium: 7, low: 2, resolved: 14 },
  { date: "Oct 31", label: "Oct 31", critical: 1, high: 2, medium: 4, low: 3, resolved: 11 },
];

export const VULNERABILITY_TRENDS_90D: VulnerabilityTrendPoint[] = [
  { date: "Aug W1", label: "Aug 1-7", critical: 5, high: 12, medium: 22, low: 14, resolved: 48 },
  { date: "Aug W3", label: "Aug 15-21", critical: 4, high: 10, medium: 19, low: 11, resolved: 42 },
  { date: "Sep W1", label: "Sep 1-7", critical: 3, high: 8, medium: 18, low: 10, resolved: 39 },
  { date: "Sep W3", label: "Sep 15-21", critical: 2, high: 7, medium: 15, low: 8, resolved: 34 },
  { date: "Oct W1", label: "Oct 1-7", critical: 2, high: 6, medium: 14, low: 7, resolved: 31 },
  { date: "Oct W3", label: "Oct 15-21", critical: 1, high: 5, medium: 12, low: 6, resolved: 28 },
];

export const VULNERABILITY_TRENDS_12M: VulnerabilityTrendPoint[] = [
  { date: "Nov 25", label: "Nov", critical: 18, high: 34, medium: 62, low: 38, resolved: 142 },
  { date: "Jan 26", label: "Jan", critical: 14, high: 28, medium: 54, low: 32, resolved: 130 },
  { date: "Mar 26", label: "Mar", critical: 11, high: 24, medium: 46, low: 29, resolved: 118 },
  { date: "May 26", label: "May", critical: 8, high: 21, medium: 40, low: 24, resolved: 105 },
  { date: "Jul 26", label: "Jul", critical: 6, high: 18, medium: 35, low: 20, resolved: 92 },
  { date: "Sep 26", label: "Sep", critical: 5, high: 14, medium: 28, low: 16, resolved: 81 },
  { date: "Oct 26", label: "Oct", critical: 4, high: 11, medium: 19, low: 8, resolved: 68 },
];

export const MTTR_STAGES: MttrStage[] = [
  {
    id: "submission",
    name: "Submission Ingest",
    avgHours: 0.8,
    slaTargetHours: 2.0,
    trend: "▼ 20m faster",
    isBottleneck: false,
    description: "Automated deduplication and preliminary payload validation",
    volumeCount: 56,
  },
  {
    id: "validation",
    name: "Triage Validation",
    avgHours: 3.2,
    slaTargetHours: 4.0,
    trend: "▼ 45m faster",
    isBottleneck: false,
    description: "Analyst reproduction and severity confirmation",
    volumeCount: 52,
  },
  {
    id: "triaged",
    name: "Engineering Hand-off",
    avgHours: 8.4,
    slaTargetHours: 12.0,
    trend: "▼ 1.2h faster",
    isBottleneck: false,
    description: "Jira ticket creation and security champion sync",
    volumeCount: 48,
  },
  {
    id: "accepted",
    name: "Fix Development",
    avgHours: 52.6, // ~2.2 days
    slaTargetHours: 72.0,
    trend: "▲ 4h slower",
    isBottleneck: true,
    description: "Code patch authoring, PR review, and security review",
    volumeCount: 42,
  },
  {
    id: "resolved",
    name: "Deployment Verification",
    avgHours: 18.2,
    slaTargetHours: 24.0,
    trend: "▼ 2.1h faster",
    isBottleneck: false,
    description: "Production canary release and regression re-test",
    volumeCount: 38,
  },
  {
    id: "paid",
    name: "Reward Payout",
    avgHours: 26.4,
    slaTargetHours: 48.0,
    trend: "▼ 12h faster",
    isBottleneck: false,
    description: "Finance approval and researcher wallet distribution",
    volumeCount: 36,
  },
];

export const ASSET_RISK_HEATMAP: AssetCategoryRisk[] = [
  {
    id: "api",
    category: "Public API Endpoints",
    assetCount: 46,
    riskScore: 92,
    criticalCount: 0,
    highCount: 2,
    mediumCount: 5,
    lowCount: 1,
    trend: "improving",
    coveragePct: 98,
  },
  {
    id: "web",
    category: "Web Applications",
    assetCount: 38,
    riskScore: 86,
    criticalCount: 1,
    highCount: 3,
    mediumCount: 6,
    lowCount: 3,
    trend: "improving",
    coveragePct: 94,
  },
  {
    id: "cloud",
    category: "Cloud Infrastructure & Gateways",
    assetCount: 32,
    riskScore: 78,
    criticalCount: 2,
    highCount: 3,
    mediumCount: 4,
    lowCount: 2,
    trend: "stable",
    coveragePct: 88,
  },
  {
    id: "mobile",
    category: "Mobile Clients (iOS / Android)",
    assetCount: 18,
    riskScore: 89,
    criticalCount: 0,
    highCount: 1,
    mediumCount: 2,
    lowCount: 1,
    trend: "improving",
    coveragePct: 92,
  },
  {
    id: "identity",
    category: "Identity, IAM & OAuth",
    assetCount: 14,
    riskScore: 95,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 1,
    lowCount: 1,
    trend: "improving",
    coveragePct: 100,
  },
  {
    id: "internal",
    category: "VPN & Internal Microservices",
    assetCount: 20,
    riskScore: 81,
    criticalCount: 1,
    highCount: 2,
    mediumCount: 1,
    lowCount: 0,
    trend: "stable",
    coveragePct: 82,
  },
];

export const PROGRAM_PERFORMANCES: ProgramPerformance[] = [
  {
    id: "northwind-core",
    name: "Northwind Core Platform",
    type: "Bug Bounty",
    openFindings: 18,
    criticalFindings: 2,
    mttrDays: 4.1,
    healthScore: 96,
    activeResearchers: 124,
    totalAwarded: 48500,
    slaCompliance: 98.4,
  },
  {
    id: "cloud-gateway",
    name: "Cloud Edge & API Gateway",
    type: "Bug Bounty",
    openFindings: 9,
    criticalFindings: 1,
    mttrDays: 3.8,
    healthScore: 98,
    activeResearchers: 78,
    totalAwarded: 24200,
    slaCompliance: 99.1,
  },
  {
    id: "payments-api",
    name: "Payments & Checkout Service",
    type: "Private",
    openFindings: 5,
    criticalFindings: 0,
    mttrDays: 2.9,
    healthScore: 99,
    activeResearchers: 42,
    totalAwarded: 12400,
    slaCompliance: 100.0,
  },
  {
    id: "consumer-mobile",
    name: "Consumer Mobile (iOS/Android)",
    type: "Private",
    openFindings: 7,
    criticalFindings: 1,
    mttrDays: 6.2,
    healthScore: 91,
    activeResearchers: 36,
    totalAwarded: 5200,
    slaCompliance: 94.2,
  },
  {
    id: "public-vdp",
    name: "Responsible Disclosure VDP",
    type: "VDP",
    openFindings: 3,
    criticalFindings: 0,
    mttrDays: 8.1,
    healthScore: 88,
    activeResearchers: 64,
    totalAwarded: 2150,
    slaCompliance: 96.0,
  },
];

export const RESEARCHER_LEADERS: ResearcherLeader[] = [
  {
    rank: 1,
    handle: "@0xviper",
    name: "Stefan Dahl",
    country: "SE",
    reputation: 4820,
    signalScore: 99.2,
    acceptanceRate: 98,
    totalFindings: 28,
    totalEarned: 24500,
    avatarSeed: "viper",
    tier: "Elite",
  },
  {
    rank: 2,
    handle: "@cybersentry",
    name: "Priya Nair",
    country: "IN",
    reputation: 3940,
    signalScore: 96.8,
    acceptanceRate: 94,
    totalFindings: 22,
    totalEarned: 18200,
    avatarSeed: "priya",
    tier: "Elite",
  },
  {
    rank: 3,
    handle: "@bytehunter",
    name: "Lucas Müller",
    country: "DE",
    reputation: 3210,
    signalScore: 95.4,
    acceptanceRate: 92,
    totalFindings: 17,
    totalEarned: 14800,
    avatarSeed: "lucas",
    tier: "Master",
  },
  {
    rank: 4,
    handle: "@nullpointer",
    name: "Alex Vance",
    country: "US",
    reputation: 2890,
    signalScore: 94.1,
    acceptanceRate: 91,
    totalFindings: 14,
    totalEarned: 11200,
    avatarSeed: "alex",
    tier: "Master",
  },
  {
    rank: 5,
    handle: "@apexsec",
    name: "Kenji Sato",
    country: "JP",
    reputation: 2410,
    signalScore: 92.5,
    acceptanceRate: 89,
    totalFindings: 12,
    totalEarned: 8900,
    avatarSeed: "kenji",
    tier: "Pro",
  },
];

export const GEO_DISTRIBUTION = [
  { country: "United States", code: "US", count: 62, pct: 34 },
  { country: "India", code: "IN", count: 44, pct: 24 },
  { country: "Germany", code: "DE", count: 26, pct: 14 },
  { country: "United Kingdom", code: "GB", count: 18, pct: 10 },
  { country: "Sweden", code: "SE", count: 14, pct: 8 },
  { country: "Singapore", code: "SG", count: 12, pct: 6 },
  { country: "Other (18 Countries)", code: "GL", count: 8, pct: 4 },
];

export const FINANCIAL_METRICS = {
  totalPaidYTD: 92450,
  totalBudgetAnnual: 240000,
  budgetRemaining: 147550,
  pendingApproval: 18400,
  monthlyBurnAvg: 11500,
  projectedNextMonth: 14200,
  runwayMonths: 10.4,
  severityAverages: [
    { severity: "Critical", avgAmount: 4500, paidCount: 11, total: 49500 },
    { severity: "High", avgAmount: 1850, paidCount: 16, total: 29600 },
    { severity: "Medium", avgAmount: 650, paidCount: 14, total: 9100 },
    { severity: "Low", avgAmount: 225, paidCount: 19, total: 4250 },
  ],
};

export const SLA_COMPLIANCE_TIERS = [
  { severity: "Critical", actual: 99.2, target: 95.0, status: "healthy", slaWindow: "24h" },
  { severity: "High", actual: 96.4, target: 90.0, status: "healthy", slaWindow: "72h" },
  { severity: "Medium", actual: 95.1, target: 85.0, status: "healthy", slaWindow: "7d" },
  { severity: "Low", actual: 98.0, target: 80.0, status: "healthy", slaWindow: "14d" },
];

export const EXECUTIVE_TIMELINE: ExecutiveTimelineEvent[] = [
  {
    id: "evt-1",
    timestamp: "2026-10-31T14:32:00Z",
    relativeTime: "2 hours ago",
    category: "resolution",
    severity: "critical",
    title: "Critical RCE Remediated in 3.4 Hours",
    description: "Production gateway canary deployed and verified by security team. Researcher @0xviper notified.",
    author: "Elena Rostova (Lead SecOps)",
    programName: "Cloud Edge & API Gateway",
  },
  {
    id: "evt-2",
    timestamp: "2026-10-31T09:15:00Z",
    relativeTime: "7 hours ago",
    category: "bounty",
    title: "Awarded $5,000 Bounty to @0xviper",
    description: "Fast-track reward approved for high-fidelity privilege escalation finding with zero false positive rate.",
    author: "Finance Automated Gateway",
    programName: "Northwind Core Platform",
  },
  {
    id: "evt-3",
    timestamp: "2026-10-30T16:45:00Z",
    relativeTime: "Yesterday",
    category: "compliance",
    title: "Q3 SOC2 Type II Continuous Audit Export Completed",
    description: "SLA compliance audit packet generated showing 98.2% adherence across all reported items.",
    author: "System Automation",
    programName: "All Programs",
  },
  {
    id: "evt-4",
    timestamp: "2026-10-29T11:20:00Z",
    relativeTime: "2 days ago",
    category: "program",
    title: "Expanded Scope: 12 New Kubernetes Cluster Ingresses Added",
    description: "Assets verified via automated DNS handshake and registered for researcher assessment.",
    author: "Sarah Chen (Cloud Architect)",
    programName: "Northwind Core Platform",
  },
  {
    id: "evt-5",
    timestamp: "2026-10-28T08:00:00Z",
    relativeTime: "3 days ago",
    category: "incident",
    severity: "high",
    title: "Mass Session Invalidation Executed Successfully",
    description: "Proactive token rotation after SSRF verification in staging environment.",
    author: "Incident Response Team",
    programName: "Payments & Checkout Service",
  },
];

export const AI_SECURITY_INSIGHTS: AiSecurityInsight[] = [
  {
    id: "ins-1",
    title: "Critical Findings MTTR Dropped by 34%",
    summary: "Dedicated engineering triage pods reduced critical remediation time from 3.8 days to 2.5 days across Northwind Core.",
    impact: "positive",
    category: "Operations",
    recommendation: "Replicate dedicated triage rotation model into the Cloud Gateway engineering team to achieve parity.",
    confidence: 96,
  },
  {
    id: "ins-2",
    title: "Cloud Infrastructure Asset Drift Detected",
    summary: "3 staging Kubernetes endpoints were exposed with outdated TLS ciphers outside of the continuous verification perimeter.",
    impact: "high",
    category: "Attack Surface",
    recommendation: "Enroll wildcard '*.staging.northwind.internal' into the automated verification policy.",
    confidence: 94,
  },
  {
    id: "ins-3",
    title: "Budget Burn Rate Projection: $14,200 Next Month",
    summary: "With 4 high-severity findings in final review, reward liability is estimated at $14,200. Annual runway remains solid at 10.4 months.",
    impact: "medium",
    category: "Budget",
    recommendation: "Approve current pending batch of $18.4K to keep researcher payout velocity under 24 hours.",
    confidence: 91,
  },
  {
    id: "ins-4",
    title: "Researcher Retention at All-Time High (88%)",
    summary: "Top 10 contributors submitted 72% of all verified reports with an acceptance rate exceeding 94%.",
    impact: "positive",
    category: "Researcher",
    recommendation: "Consider inviting top 5 researchers to the upcoming private Q4 zero-day hunting sprint.",
    confidence: 98,
  },
];

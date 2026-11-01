export type TriagePlanId = "business" | "enterprise" | "enterprise_plus";

export type TriageSeverity = "critical" | "high" | "medium" | "low";

export type PipelineStageId =
  | "submitted"
  | "validation"
  | "reproduction"
  | "duplicate_check"
  | "severity_review"
  | "ready_for_org";

export interface HeroPipelineStep {
  id: string;
  label: string;
  sublabel: string;
  avgDuration: string;
  status: "healthy" | "info" | "decision";
}

export interface OrganizationTriageStatusData {
  enabled: boolean;
  statusLabel: "Not Enabled" | "Enabled";
  reportsWaiting: number;
  averageResponse: string;
  criticalWaiting: number;
  researcherMessages: number;
  estimatedEngineerHoursSavedPerMonth: number;
  lastAuditSync: string;
}

export interface TriageKpiCard {
  id: string;
  label: string;
  value: string;
  trend: string;
  trendDirection: "up" | "down" | "neutral";
  trendTone: "healthy" | "warning" | "critical" | "info";
  subtitle: string;
  sparkline: number[];
  iconName: "inbox" | "alert" | "copy" | "clock" | "shield" | "heart";
}

export interface LiveQueueReportItem {
  id: string;
  reportCode: string;
  severity: TriageSeverity;
  vulnerabilityType: string;
  title: string;
  targetAsset: string;
  waitingLabel: string;
  waitingMinutes: number;
  statusText: string;
  assignedAnalyst: string | null;
  cvssScore: string;
  stageId: PipelineStageId;
}

export interface TriagePipelineStage {
  id: PipelineStageId;
  label: string;
  count: number;
  slaTarget: string;
  description: string;
  automationRate: string;
}

export interface AnalystPerformanceMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  benchmark: string;
  tone: "healthy" | "info";
}

export interface AnalystProfile {
  id: string;
  name: string;
  role: string;
  certifications: string[];
  experience: string;
  reportsValidatedLabel: string;
  reportsValidatedCount: number;
  focusAreas: string[];
  averageSla: string;
  languages: string[];
  specialties: string[];
  recentWork: {
    reportCode: string;
    finding: string;
    outcome: string;
    timeAgo: string;
  }[];
  availability: "On Shift" | "Lead Escalation" | "Cloud Rotation";
}

export interface TriageServicePlan {
  id: TriagePlanId;
  name: "Business" | "Enterprise" | "Enterprise+";
  tagline: string;
  monthlyPriceUsd: number;
  monthlyPriceFormatted: string;
  annualDiscountNote: string;
  highlighted?: boolean;
  badgeText?: string;
  firstResponseSla: string;
  criticalEscalationSla: string;
  expectedHoursSaved: number;
  coverageHours: string;
  dedicatedAnalysts: string;
  highlights: string[];
  backendPlanCode: "standard" | "priority";
}

export interface PlanComparisonRow {
  id: string;
  feature: string;
  category: "Operations" | "Communications & SLA" | "Governance & Intelligence";
  business: string;
  enterprise: string;
  enterprisePlus: string;
}

export interface CoverageComparisonSide {
  title: string;
  subtitle: string;
  tone: "unmanaged" | "managed";
  metrics: {
    label: string;
    value: string;
    detail: string;
    status: "critical" | "warning" | "healthy" | "info";
  }[];
}

export interface CustomerOutcomeMetric {
  id: string;
  label: string;
  numericValue: number;
  suffix: string;
  detail: string;
  beforeBaseline: string;
  afterManaged: string;
}

export interface WorkflowTimelineStep {
  stepNumber: number;
  id: string;
  title: string;
  actor: "Researcher" | "Automated Engine" | "Unpatched SOC Analyst" | "Organization AppSec";
  slaWindow: string;
  description: string;
  auditArtifact: string;
}

export interface TriageFaqItem {
  id: string;
  question: string;
  answer: string;
  auditGuarantee: string;
}

export const HERO_PIPELINE_STEPS: HeroPipelineStep[] = [
  {
    id: "report",
    label: "Report",
    sublabel: "Inbound encrypted disclosure",
    avgDuration: "0m",
    status: "info",
  },
  {
    id: "validation",
    label: "Validation",
    sublabel: "Scope & signal verification",
    avgDuration: "6m",
    status: "healthy",
  },
  {
    id: "reproduction",
    label: "Reproduction",
    sublabel: "Clean-room PoC execution",
    avgDuration: "18m",
    status: "healthy",
  },
  {
    id: "severity",
    label: "Severity",
    sublabel: "CVSS v3.1 & environmental scoring",
    avgDuration: "24m",
    status: "healthy",
  },
  {
    id: "duplicate_detection",
    label: "Duplicate Detection",
    sublabel: "Root-cause & CWE clustering",
    avgDuration: "27m",
    status: "healthy",
  },
  {
    id: "engineering_ready",
    label: "Engineering Ready",
    sublabel: "Remediation brief & patch guidance",
    avgDuration: "38m",
    status: "healthy",
  },
  {
    id: "your_decision",
    label: "Your Decision",
    sublabel: "Final severity & bounty approval",
    avgDuration: "SLA < 4h",
    status: "decision",
  },
];

export const DEFAULT_TRIAGE_STATUS: OrganizationTriageStatusData = {
  enabled: false,
  statusLabel: "Not Enabled",
  reportsWaiting: 14,
  averageResponse: "31h",
  criticalWaiting: 2,
  researcherMessages: 6,
  estimatedEngineerHoursSavedPerMonth: 42,
  lastAuditSync: "Live audit trail active",
};

export const KPI_OVERVIEW_CARDS: TriageKpiCard[] = [
  {
    id: "open_reports",
    label: "Open Reports",
    value: "14",
    trend: "+3 since 08:00 UTC",
    trendDirection: "up",
    trendTone: "warning",
    subtitle: "Awaiting initial validation & PoC check",
    sparkline: [9, 11, 10, 12, 11, 13, 14],
    iconName: "inbox",
  },
  {
    id: "critical_queue",
    label: "Critical Queue",
    value: "2",
    trend: "SLA at risk (31h avg)",
    trendDirection: "up",
    trendTone: "critical",
    subtitle: "High-impact RCE / SSRF findings queued",
    sparkline: [0, 1, 1, 0, 1, 2, 2],
    iconName: "alert",
  },
  {
    id: "duplicate_prevention",
    label: "Duplicate Prevention",
    value: "23%",
    trend: "+4.2% vs last 30d",
    trendDirection: "up",
    trendTone: "healthy",
    subtitle: "Filtered before hitting engineering",
    sparkline: [16, 18, 19, 20, 21, 22, 23],
    iconName: "copy",
  },
  {
    id: "average_validation",
    label: "Average Validation",
    value: "18 min",
    trend: "-6m faster PoC cycle",
    trendDirection: "down",
    trendTone: "healthy",
    subtitle: "Median analyst time to reproduce",
    sparkline: [26, 24, 22, 21, 20, 19, 18],
    iconName: "clock",
  },
  {
    id: "severity_accuracy",
    label: "Severity Accuracy",
    value: "98%",
    trend: "+1.4% CVSS alignment",
    trendDirection: "up",
    trendTone: "healthy",
    subtitle: "Verified CVSS v3.1 environmental score",
    sparkline: [95, 96, 96, 97, 97, 98, 98],
    iconName: "shield",
  },
  {
    id: "researcher_satisfaction",
    label: "Researcher Satisfaction",
    value: "97%",
    trend: "4.92 / 5.0 CSAT",
    trendDirection: "up",
    trendTone: "healthy",
    subtitle: "Post-triage researcher survey rating",
    sparkline: [93, 94, 95, 95, 96, 97, 97],
    iconName: "heart",
  },
];

export const INITIAL_LIVE_QUEUE_REPORTS: LiveQueueReportItem[] = [
  {
    id: "rep-9481",
    reportCode: "UP-9481",
    severity: "critical",
    vulnerabilityType: "SSRF",
    title: "Unauthenticated metadata SSRF via webhook preview worker",
    targetAsset: "api.northwind.cloud",
    waitingLabel: "Waiting 14m",
    waitingMinutes: 14,
    statusText: "Assigned: Sarah",
    assignedAnalyst: "Sarah",
    cvssScore: "9.6",
    stageId: "reproduction",
  },
  {
    id: "rep-9479",
    reportCode: "UP-9479",
    severity: "high",
    vulnerabilityType: "IDOR",
    title: "Cross-tenant invoice export via GraphQL batch node ID",
    targetAsset: "billing.northwind.cloud",
    waitingLabel: "Waiting 22m",
    waitingMinutes: 22,
    statusText: "Reproducing",
    assignedAnalyst: "David",
    cvssScore: "8.2",
    stageId: "reproduction",
  },
  {
    id: "rep-9476",
    reportCode: "UP-9476",
    severity: "medium",
    vulnerabilityType: "Open Redirect",
    title: "OAuth callback state parameter host bypass on mobile web",
    targetAsset: "auth.northwind.cloud",
    waitingLabel: "Waiting 29m",
    waitingMinutes: 29,
    statusText: "Duplicate Analysis",
    assignedAnalyst: "Emily",
    cvssScore: "6.1",
    stageId: "duplicate_check",
  },
  {
    id: "rep-9474",
    reportCode: "UP-9474",
    severity: "critical",
    vulnerabilityType: "SQLi",
    title: "Second-order blind SQL injection in audit log filter expression",
    targetAsset: "console.northwind.cloud",
    waitingLabel: "Waiting 9m",
    waitingMinutes: 9,
    statusText: "Assigned: Sarah",
    assignedAnalyst: "Sarah",
    cvssScore: "9.3",
    stageId: "validation",
  },
  {
    id: "rep-9470",
    reportCode: "UP-9470",
    severity: "high",
    vulnerabilityType: "Privilege Escalation",
    title: "Read-only auditor role can mint SCIM provisioning tokens",
    targetAsset: "iam.northwind.cloud",
    waitingLabel: "Waiting 34m",
    waitingMinutes: 34,
    statusText: "Severity Review",
    assignedAnalyst: "Emily",
    cvssScore: "8.5",
    stageId: "severity_review",
  },
  {
    id: "rep-9465",
    reportCode: "UP-9465",
    severity: "low",
    vulnerabilityType: "Information Disclosure",
    title: "Verbose stack trace leaks internal Envoy upstream cluster names",
    targetAsset: "edge.northwind.cloud",
    waitingLabel: "Waiting 41m",
    waitingMinutes: 41,
    statusText: "Ready For Organization",
    assignedAnalyst: "David",
    cvssScore: "3.7",
    stageId: "ready_for_org",
  },
];

export const QUEUE_SEVERITY_DISTRIBUTION: {
  severity: TriageSeverity;
  label: string;
  blocks: number;
  count: number;
  slaTarget: string;
}[] = [
  { severity: "critical", label: "Critical", blocks: 3, count: 3, slaTarget: "< 1h first response" },
  { severity: "high", label: "High", blocks: 6, count: 6, slaTarget: "< 4h first response" },
  { severity: "medium", label: "Medium", blocks: 4, count: 4, slaTarget: "< 12h first response" },
  { severity: "low", label: "Low", blocks: 2, count: 2, slaTarget: "< 24h first response" },
];

export const TRIAGE_PIPELINE_STAGES: TriagePipelineStage[] = [
  {
    id: "submitted",
    label: "Submitted",
    count: 28,
    slaTarget: "Instant",
    description: "Inbound encrypted reports ingested with automated asset & scope matching.",
    automationRate: "100% automated intake",
  },
  {
    id: "validation",
    label: "Validation",
    count: 18,
    slaTarget: "< 15 min",
    description: "Signal-to-noise check removing spam, scanner output, and out-of-scope submissions.",
    automationRate: "39% noise filtered early",
  },
  {
    id: "reproduction",
    label: "Reproduction",
    count: 14,
    slaTarget: "< 2 hrs",
    description: "Analysts execute proof-of-concept payloads in isolated sandboxes to confirm exploitability.",
    automationRate: "Clean-room PoC replay",
  },
  {
    id: "duplicate_check",
    label: "Duplicate Check",
    count: 6,
    slaTarget: "< 30 min",
    description: "Cross-referenced against historical reports, known CVEs, and internal Jira backlogs.",
    automationRate: "23% duplicate suppression",
  },
  {
    id: "severity_review",
    label: "Severity Review",
    count: 5,
    slaTarget: "< 45 min",
    description: "Peer-reviewed CVSS v3.1 base + environmental calculation calibrated to your business impact.",
    automationRate: "98% CVSS accuracy",
  },
  {
    id: "ready_for_org",
    label: "Ready For Organization",
    count: 4,
    slaTarget: "< 4 hrs total",
    description: "Delivered with clean reproduction steps, affected component tags, and remediation guidance.",
    automationRate: "Zero false positives",
  },
];

export const TODAY_ANALYST_PERFORMANCE: AnalystPerformanceMetric[] = [
  {
    id: "reports_validated",
    label: "Reports Validated",
    value: "18",
    delta: "+5 vs daily median",
    benchmark: "100% within SLA window",
    tone: "healthy",
  },
  {
    id: "average_response",
    label: "Average Response",
    value: "17 min",
    delta: "4.2x faster than 1h target",
    benchmark: "P95 under 34 min",
    tone: "healthy",
  },
  {
    id: "duplicate_rate",
    label: "Duplicate Rate",
    value: "26%",
    delta: "7 duplicate payouts prevented",
    benchmark: "$8,400 bounty budget protected",
    tone: "info",
  },
  {
    id: "severity_accuracy",
    label: "Severity Accuracy",
    value: "99%",
    delta: "Zero disputed CVSS scores today",
    benchmark: "Dual-analyst peer review",
    tone: "healthy",
  },
  {
    id: "researcher_replies",
    label: "Researcher Replies",
    value: "41",
    delta: "6 clarifications resolved",
    benchmark: "97% researcher CSAT",
    tone: "info",
  },
];

export const ANALYST_TEAM_PROFILES: AnalystProfile[] = [
  {
    id: "sarah",
    name: "Sarah",
    role: "Senior Security Analyst",
    certifications: ["OSCP", "OSWE"],
    experience: "12 years",
    reportsValidatedLabel: "7,900 reports",
    reportsValidatedCount: 7900,
    focusAreas: ["Server-Side Injection", "SSRF & Cloud Metadata", "Auth Bypass"],
    averageSla: "14 min first response",
    languages: ["English", "German", "Python / Go"],
    specialties: ["Distributed Systems", "OAuth / OIDC Flows", "Deserialization"],
    availability: "On Shift",
    recentWork: [
      {
        reportCode: "UP-9481",
        finding: "Unauthenticated webhook SSRF to IMDSv2 token endpoint",
        outcome: "Reproduced PoC & isolated IAM role blast radius in 16m",
        timeAgo: "14m ago",
      },
      {
        reportCode: "UP-9452",
        finding: "Blind SQLi in multi-tenant billing export worker",
        outcome: "Verified payload & drafted parameterized patch diff",
        timeAgo: "2h ago",
      },
    ],
  },
  {
    id: "david",
    name: "David",
    role: "Cloud Security",
    certifications: ["AWS", "Azure", "GCP"],
    experience: "9 years",
    reportsValidatedLabel: "5,400 reports",
    reportsValidatedCount: 5400,
    focusAreas: ["AWS", "Azure", "GCP"],
    averageSla: "19 min first response",
    languages: ["English", "Spanish", "Terraform / Rust"],
    specialties: ["Kubernetes RBAC", "Cross-Tenant IAM", "Container Escape"],
    availability: "Cloud Rotation",
    recentWork: [
      {
        reportCode: "UP-9479",
        finding: "Cross-tenant invoice export via GraphQL batch node ID",
        outcome: "Confirmed tenant boundary bypass across 2 sandbox orgs",
        timeAgo: "22m ago",
      },
      {
        reportCode: "UP-9440",
        finding: "Misconfigured GCP Workload Identity Federation pool",
        outcome: "Downgraded from Critical to Medium due to VPC Service Controls",
        timeAgo: "4h ago",
      },
    ],
  },
  {
    id: "emily",
    name: "Emily",
    role: "Application Security",
    certifications: ["CISSP", "OSCE"],
    experience: "10 years",
    reportsValidatedLabel: "6,200 reports",
    reportsValidatedCount: 6200,
    focusAreas: ["Application Security", "CISSP", "OSCE"],
    averageSla: "16 min first response",
    languages: ["English", "French", "TypeScript / C++"],
    specialties: ["GraphQL & REST APIs", "DOM XSS & CSP Bypass", "Business Logic Flaws"],
    availability: "Lead Escalation",
    recentWork: [
      {
        reportCode: "UP-9470",
        finding: "Auditor role privilege escalation via SCIM token endpoint",
        outcome: "Calibrated CVSS 8.5 & linked to existing IAM sprint epic",
        timeAgo: "34m ago",
      },
      {
        reportCode: "UP-9461",
        finding: "Race condition in promotional credit redemption",
        outcome: "Identified as duplicate of UP-9398; saved $2,500 payout",
        timeAgo: "3h ago",
      },
    ],
  },
];

export const SERVICE_PLANS: TriageServicePlan[] = [
  {
    id: "business",
    name: "Business",
    tagline: "Structured vulnerability validation and deduplication for growing AppSec teams.",
    monthlyPriceUsd: 2500,
    monthlyPriceFormatted: "$2,500/month",
    annualDiscountNote: "Billed monthly from prepaid balance · Cancel anytime",
    firstResponseSla: "< 4 hours",
    criticalEscalationSla: "< 2 hours",
    expectedHoursSaved: 42,
    coverageHours: "24×5 Business Coverage",
    dedicatedAnalysts: "Shared Pod (3 Analysts)",
    backendPlanCode: "standard",
    highlights: [
      "Full PoC reproduction & validation",
      "CVSS v3.1 environmental scoring",
      "Duplicate & noise suppression",
      "Direct researcher communication",
      "Complete audit log transparency",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Continuous 24/7 SOC operations with named analysts, Slack bridge, and rapid P1 escalation.",
    monthlyPriceUsd: 5500,
    monthlyPriceFormatted: "$5,500/month",
    annualDiscountNote: "Most popular for multi-program security organizations",
    highlighted: true,
    badgeText: "Recommended SOC Tier",
    firstResponseSla: "< 1 hour",
    criticalEscalationSla: "< 15 minutes",
    expectedHoursSaved: 86,
    coverageHours: "24/7/365 Continuous SOC",
    dedicatedAnalysts: "2 Named Lead Analysts",
    backendPlanCode: "priority",
    highlights: [
      "Everything in Business, plus:",
      "24/7/365 follow-the-sun coverage",
      "Dedicated Slack / Teams war-room channel",
      "15-minute Critical (P1) pager escalation",
      "Monthly executive vulnerability review",
    ],
  },
  {
    id: "enterprise_plus",
    name: "Enterprise+",
    tagline: "Bespoke vulnerability operations cell with threat intelligence correlation and custom SLAs.",
    monthlyPriceUsd: 9500,
    monthlyPriceFormatted: "$9,500/month",
    annualDiscountNote: "Tailored for global regulated enterprises & high-volume scopes",
    firstResponseSla: "< 15 minutes",
    criticalEscalationSla: "Immediate Warm Handoff",
    expectedHoursSaved: 140,
    coverageHours: "24/7/365 Dedicated Pod",
    dedicatedAnalysts: "4 Named Principal Analysts",
    backendPlanCode: "priority",
    highlights: [
      "Everything in Enterprise, plus:",
      "4 named Principal OSWE/OSCE analysts",
      "Active threat intelligence & exploit correlation",
      "Custom remediation patch verification",
      "Contractual custom SLA & board reporting",
    ],
  },
];

export const PLAN_COMPARISON_MATRIX: PlanComparisonRow[] = [
  {
    id: "coverage",
    feature: "Coverage",
    category: "Operations",
    business: "Up to 3 active programs",
    enterprise: "Unlimited programs & scopes",
    enterprisePlus: "Unlimited global orgs & subsidiaries",
  },
  {
    id: "hours",
    feature: "Hours",
    category: "Operations",
    business: "24×5 (Mon–Fri global shifts)",
    enterprise: "24/7/365 continuous SOC",
    enterprisePlus: "24/7/365 dedicated watch desk",
  },
  {
    id: "dedicated_analysts",
    feature: "Dedicated Analysts",
    category: "Operations",
    business: "Assigned specialist pod",
    enterprise: "2 named senior analysts",
    enterprisePlus: "4 named principal analysts",
  },
  {
    id: "slack",
    feature: "Slack",
    category: "Communications & SLA",
    business: "Webhook notifications",
    enterprise: "Shared bidirectional Slack channel",
    enterprisePlus: "Dedicated war-room + on-call bridge",
  },
  {
    id: "incident_escalation",
    feature: "Incident Escalation",
    category: "Communications & SLA",
    business: "< 2h critical notification",
    enterprise: "< 15m PagerDuty / Slack escalation",
    enterprisePlus: "Immediate live call + exploit containment brief",
  },
  {
    id: "cvss",
    feature: "CVSS",
    category: "Operations",
    business: "Verified CVSS v3.1 Base",
    enterprise: "CVSS v3.1 + Environmental & Asset criticality",
    enterprisePlus: "Custom business-risk rubric + CVSS v4.0",
  },
  {
    id: "duplicate_detection",
    feature: "Duplicate Detection",
    category: "Operations",
    business: "Cross-report deduplication",
    enterprise: "Cross-program + Jira/GitHub backlog sync",
    enterprisePlus: "Full root-cause clustering + internal pentest dedupe",
  },
  {
    id: "monthly_review",
    feature: "Monthly Review",
    category: "Governance & Intelligence",
    business: "Async monthly metrics digest",
    enterprise: "Live monthly AppSec posture cadence",
    enterprisePlus: "Bi-weekly architecture & scope optimization",
  },
  {
    id: "executive_reporting",
    feature: "Executive Reporting",
    category: "Governance & Intelligence",
    business: "Standard SLA & volume exports",
    enterprise: "Quarterly CISO & board deck",
    enterprisePlus: "Custom compliance & audit attestation packs",
  },
  {
    id: "threat_intelligence",
    feature: "Threat Intelligence",
    category: "Governance & Intelligence",
    business: "Known CVE matching",
    enterprise: "Active in-the-wild exploit correlation",
    enterprisePlus: "Bespoke 0-day & campaign hunting across scopes",
  },
  {
    id: "custom_sla",
    feature: "Custom SLA",
    category: "Communications & SLA",
    business: "Standard 4h / 24h targets",
    enterprise: "Priority 1h / 12h targets",
    enterprisePlus: "Contractual custom SLA with financial backing",
  },
];

export const COVERAGE_COMPARISON: {
  withoutManaged: CoverageComparisonSide;
  withManaged: CoverageComparisonSide;
} = {
  withoutManaged: {
    title: "Without Managed Triage",
    subtitle: "Internal engineering teams absorb raw inbound noise and researcher back-and-forth.",
    tone: "unmanaged",
    metrics: [
      {
        label: "31h Average Response",
        value: "31 hours",
        detail: "Critical findings sit unreviewed across weekends and time zones.",
        status: "critical",
      },
      {
        label: "Manual Duplicate Detection",
        value: "23% wasted review",
        detail: "Engineers spend hours investigating issues already tracked in Jira.",
        status: "warning",
      },
      {
        label: "Manual Severity",
        value: "Frequent disputes",
        detail: "Researchers inflate severity ratings; engineers negotiate CVSS vectors in comments.",
        status: "warning",
      },
      {
        label: "No Reproduction",
        value: "Unverified PoCs",
        detail: "Developers pull context away from roadmap work to decipher vague curl commands.",
        status: "critical",
      },
    ],
  },
  withManaged: {
    title: "With Managed Triage",
    subtitle: "Every report arrives validated, deduplicated, scored, and ready for engineering remediation.",
    tone: "managed",
    metrics: [
      {
        label: "4h Response",
        value: "< 4 hours (< 17m avg)",
        detail: "Rapid 24/7 analyst intake keeps top researchers engaged and SLA targets green.",
        status: "healthy",
      },
      {
        label: "Analyst Validation",
        value: "100% noise filtered",
        detail: "Out-of-scope, scanner spam, and non-exploitable reports never interrupt your team.",
        status: "healthy",
      },
      {
        label: "Professional Reproduction",
        value: "Clean-room PoC",
        detail: "Step-by-step deterministic reproduction scripts verified in isolated environments.",
        status: "healthy",
      },
      {
        label: "Verified CVSS",
        value: "98% accuracy",
        detail: "Objective CVSS v3.1 scoring aligned with your asset criticality before payout.",
        status: "healthy",
      },
      {
        label: "Researcher Communication",
        value: "Handled by SOC",
        detail: "Analysts request missing info, clarify edge cases, and maintain researcher trust.",
        status: "info",
      },
      {
        label: "Engineering Summary",
        value: "Jira / GitHub ready",
        detail: "Executive root-cause summary, affected endpoints, and recommended patch diff.",
        status: "healthy",
      },
    ],
  },
};

export const CUSTOMER_OUTCOMES: CustomerOutcomeMetric[] = [
  {
    id: "engineering_time_saved",
    label: "Engineering Time Saved",
    numericValue: 68,
    suffix: "%",
    detail: "Reduction in senior AppSec & developer hours spent on intake and reproduction",
    beforeBaseline: "18.5 hrs/week on raw triage",
    afterManaged: "5.9 hrs/week on final approvals",
  },
  {
    id: "false_positives_prevented",
    label: "False Positives Prevented",
    numericValue: 41,
    suffix: "%",
    detail: "Invalid, theoretical, or out-of-scope submissions intercepted before escalation",
    beforeBaseline: "Every submission hits engineering",
    afterManaged: "Only verified exploits escalated",
  },
  {
    id: "duplicate_payout_reduction",
    label: "Duplicate Payout Reduction",
    numericValue: 32,
    suffix: "%",
    detail: "Bounty budget preserved through cross-report & internal backlog deduplication",
    beforeBaseline: "Accidental double rewards",
    afterManaged: "Strict root-cause clustering",
  },
  {
    id: "researcher_satisfaction",
    label: "Researcher Satisfaction",
    numericValue: 97,
    suffix: "%",
    detail: "Positive rating from top security researchers citing fast, technical responses",
    beforeBaseline: "71% CSAT on slow queues",
    afterManaged: "97% CSAT with 17m median reply",
  },
  {
    id: "sla_compliance",
    label: "SLA Compliance",
    numericValue: 99.4,
    suffix: "%",
    detail: "Adherence to contractual first-response and full-triage turnaround windows",
    beforeBaseline: "62% on-time internal triage",
    afterManaged: "99.4% verified SOC SLA",
  },
];

export const WORKFLOW_TIMELINE_STEPS: WorkflowTimelineStep[] = [
  {
    stepNumber: 1,
    id: "researcher",
    title: "Researcher",
    actor: "Researcher",
    slaWindow: "T + 0m",
    description: "Submits encrypted vulnerability disclosure with proof-of-concept artifacts.",
    auditArtifact: "SHA-256 submission hash recorded",
  },
  {
    stepNumber: 2,
    id: "automated_validation",
    title: "Automated Validation",
    actor: "Automated Engine",
    slaWindow: "T + 1m",
    description: "Checks asset scope, program policy rules, and syntax completeness.",
    auditArtifact: "Scope match & asset tag attached",
  },
  {
    stepNumber: 3,
    id: "security_analyst",
    title: "Security Analyst",
    actor: "Unpatched SOC Analyst",
    slaWindow: "T + 6m",
    description: "Named OSCP/OSWE analyst claims the report and reviews technical exploitability.",
    auditArtifact: "Analyst assignment logged",
  },
  {
    stepNumber: 4,
    id: "reproduction",
    title: "Reproduction",
    actor: "Unpatched SOC Analyst",
    slaWindow: "T + 18m",
    description: "Executes PoC in an isolated sandbox to confirm real-world impact without side effects.",
    auditArtifact: "HTTP trace & sandbox replay saved",
  },
  {
    stepNumber: 5,
    id: "duplicate_analysis",
    title: "Duplicate Analysis",
    actor: "Unpatched SOC Analyst",
    slaWindow: "T + 24m",
    description: "Correlates root cause against prior submissions and synced Jira/GitHub issues.",
    auditArtifact: "Deduplication fingerprint verified",
  },
  {
    stepNumber: 6,
    id: "cvss",
    title: "CVSS",
    actor: "Unpatched SOC Analyst",
    slaWindow: "T + 29m",
    description: "Calculates objective CVSS v3.1 vector with environmental modifiers for your asset.",
    auditArtifact: "Signed CVSS vector string",
  },
  {
    stepNumber: 7,
    id: "researcher_discussion",
    title: "Researcher Discussion",
    actor: "Unpatched SOC Analyst",
    slaWindow: "T + 33m",
    description: "Handles follow-up questions, missing steps, or scope clarifications directly.",
    auditArtifact: "Full transcript in report timeline",
  },
  {
    stepNumber: 8,
    id: "engineering_summary",
    title: "Engineering Summary",
    actor: "Unpatched SOC Analyst",
    slaWindow: "T + 38m",
    description: "Authors a concise remediation brief with affected code paths and fix recommendations.",
    auditArtifact: "Structured engineering handoff brief",
  },
  {
    stepNumber: 9,
    id: "organization_review",
    title: "Organization Review",
    actor: "Organization AppSec",
    slaWindow: "Your schedule",
    description: "Your team reviews the validated package, confirms severity, and pushes to Jira/GitHub.",
    auditArtifact: "Organization acceptance signature",
  },
  {
    stepNumber: 10,
    id: "reward",
    title: "Reward",
    actor: "Organization AppSec",
    slaWindow: "Upon approval",
    description: "You approve the final bounty decision and trigger payout from your reward budget.",
    auditArtifact: "Ledger payout & Hall of Fame credit",
  },
];

export const TRIAGE_FAQ_ITEMS: TriageFaqItem[] = [
  {
    id: "who-decides-severity",
    question: "Who decides severity?",
    answer:
      "Unpatched analysts calculate and recommend a verified CVSS v3.1 score based on reproducible impact and your asset criticality, but your organization always retains final authority to confirm or adjust severity.",
    auditGuarantee: "Every proposed vector and override is logged with actor attribution.",
  },
  {
    id: "can-analysts-reject-reports",
    question: "Can analysts reject reports?",
    answer:
      "Analysts filter obvious spam, automated scanner noise, and clearly out-of-scope submissions into a suppressed state. Any borderline finding is escalated to your queue as a structured question—and your team can inspect or reopen any suppressed report at any time.",
    auditGuarantee: "100% of closed or suppressed reports remain visible in your audit log.",
  },
  {
    id: "do-analysts-approve-payouts",
    question: "Do analysts approve payouts?",
    answer:
      "Never. Analysts never decide or disburse bounty payouts, modify your reward table, or touch your prepaid balance. Only authorized organization owners and security admins can approve rewards.",
    auditGuarantee: "Hard RBAC boundary enforced at the database transaction layer.",
  },
  {
    id: "can-i-disable-anytime",
    question: "Can I disable anytime?",
    answer:
      "Yes. You can pause, downgrade, or cancel Managed Triage at any time directly from this console with zero lock-in. All in-flight analyst notes, reproduction scripts, and transcripts remain permanently in your workspace.",
    auditGuarantee: "Instant self-serve cancellation with full data retention.",
  },
  {
    id: "how-is-billing-calculated",
    question: "How is billing calculated?",
    answer:
      "Managed Triage is billed as a predictable flat monthly subscription ($2,500/mo for Business, $5,500/mo for Enterprise, or $9,500/mo for Enterprise+) drawn from your organization balance or invoice—never as a percentage cut of researcher bounties.",
    auditGuarantee: "Zero per-report surprise fees or bounty commission markups.",
  },
  {
    id: "how-quickly-does-onboarding-happen",
    question: "How quickly does onboarding happen?",
    answer:
      "Enabling Managed Triage activates your analyst pod within 2 hours. Analysts immediately ingest your existing program scopes, asset inventory, and safe-harbor rules to begin validating your current backlog of 14 waiting reports.",
    auditGuarantee: "Zero engineering integration work required to go live.",
  },
];

export function getServicePlanById(planId: TriagePlanId): TriageServicePlan {
  return SERVICE_PLANS.find((plan) => plan.id === planId) ?? SERVICE_PLANS[0];
}

export function filterLiveQueueReports(
  reports: LiveQueueReportItem[],
  severityFilter: TriageSeverity | "all",
  stageFilter: PipelineStageId | "all" = "all",
): LiveQueueReportItem[] {
  return reports.filter((item) => {
    const matchesSeverity = severityFilter === "all" || item.severity === severityFilter;
    const matchesStage = stageFilter === "all" || item.stageId === stageFilter;
    return matchesSeverity && matchesStage;
  });
}

export function computeEffectiveTriageStatus(
  baseStatus: OrganizationTriageStatusData,
  enabledOverride: boolean,
  selectedPlanId: TriagePlanId,
): OrganizationTriageStatusData {
  const plan = getServicePlanById(selectedPlanId);
  if (!enabledOverride) {
    return {
      ...baseStatus,
      enabled: false,
      statusLabel: "Not Enabled",
      estimatedEngineerHoursSavedPerMonth: plan.expectedHoursSaved,
    };
  }
  return {
    ...baseStatus,
    enabled: true,
    statusLabel: "Enabled",
    averageResponse: plan.id === "business" ? "3.4h" : plan.id === "enterprise" ? "17m" : "9m",
    criticalWaiting: 0,
    estimatedEngineerHoursSavedPerMonth: plan.expectedHoursSaved,
    lastAuditSync: `Active SOC Pod (${plan.name} Tier) · 100% SLA`,
  };
}

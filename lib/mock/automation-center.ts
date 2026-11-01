/**
 * Realistic Mock Data and Types for Com Olho Enterprise Automation Center
 * Operational brain for security operations, vulnerability triage, and bug bounty workflows.
 */

export type WorkflowStatus = "active" | "paused" | "draft" | "error";

export type TriggerCategory =
  | "findings"
  | "researchers"
  | "assets"
  | "rewards"
  | "integrations"
  | "sla"
  | "programs";

export type ActionCategory =
  | "assignment"
  | "ticketing"
  | "communication"
  | "ai"
  | "sla"
  | "governance"
  | "security";

export interface WorkflowNode {
  id: string;
  type: "trigger" | "condition" | "ai" | "action" | "approval" | "notification" | "end";
  title: string;
  subtitle: string;
  category?: string;
  config: Record<string, any>;
  iconName: string;
  status?: "configured" | "pending";
}

export interface WorkflowConditionRule {
  id: string;
  field: string;
  operator: "equals" | "not_equals" | "greater_than" | "less_than" | "contains" | "in_list" | "matches_regex";
  value: string;
}

export interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  category: "triage" | "escalation" | "rewards" | "compliance" | "attack_surface" | "communication";
  status: WorkflowStatus;
  triggerEvent: string;
  triggerCategory: TriggerCategory;
  ownerName: string;
  ownerAvatar?: string;
  lastRun: string;
  avgRuntimeMs: number;
  executionCount: number;
  successRate: number;
  lastModified: string;
  version: string;
  manualHoursSaved: number;
  nodes: WorkflowNode[];
  tags: string[];
}

export interface TriggerDefinition {
  id: string;
  name: string;
  category: TriggerCategory;
  description: string;
  iconName: string;
  eventKey: string;
  samplePayloadFields: string[];
}

export interface ActionDefinition {
  id: string;
  name: string;
  category: ActionCategory;
  description: string;
  iconName: string;
  isAi?: boolean;
  provider: string;
  inputParams: { key: string; label: string; type: "text" | "select" | "number" | "boolean"; options?: string[] }[];
}

export interface ExecutionLog {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerEvent: string;
  startedAt: string;
  durationMs: number;
  status: "success" | "failed" | "running";
  executedBy: string;
  actionsCount: number;
  failureReason?: string;
  failedStep?: string;
  suggestion?: string;
  steps: {
    name: string;
    type: string;
    status: "success" | "failed" | "skipped";
    durationMs: number;
    inputSummary: string;
    outputSummary: string;
  }[];
  payloadSummary: Record<string, any>;
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  workflowName: string;
  title: string;
  findingTitle: string;
  researcherName: string;
  amount?: number;
  currency?: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  urgency: "critical" | "high" | "normal";
  currentStage: string;
  stages: {
    role: string;
    approverName: string;
    status: "approved" | "pending" | "rejected";
    timestamp?: string;
    note?: string;
  }[];
}

export interface SystemVariable {
  key: string;
  label: string;
  category: "finding" | "researcher" | "program" | "organization" | "reward" | "system";
  description: string;
  exampleValue: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "triage" | "escalation" | "rewards" | "compliance" | "discovery" | "attack_surface" | "communication";
  recommendedFor: string;
  popular?: boolean;
  nodesCount: number;
  estimatedHoursSavedPerMonth: number;
  triggerEvent: string;
  integrationsUsed: string[];
  nodes: WorkflowNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIGGER CATALOG
// ─────────────────────────────────────────────────────────────────────────────
export const TRIGGER_CATALOG: TriggerDefinition[] = [
  // Findings
  {
    id: "trig-finding-submitted",
    name: "Report Submitted",
    category: "findings",
    description: "Fires immediately when a researcher submits a new vulnerability report.",
    iconName: "FilePlus",
    eventKey: "finding.submitted",
    samplePayloadFields: ["report.id", "report.title", "report.severity", "report.program_id", "researcher.id"],
  },
  {
    id: "trig-finding-severity-changed",
    name: "Severity Changed",
    category: "findings",
    description: "Fires when report severity is adjusted by triager or CVSS recalculation.",
    iconName: "AlertTriangle",
    eventKey: "finding.severity_changed",
    samplePayloadFields: ["report.id", "previous_severity", "new_severity", "updated_by"],
  },
  {
    id: "trig-finding-status-changed",
    name: "Status Changed",
    category: "findings",
    description: "Fires when state transitions (e.g. New → Triaged → Validated → Resolved).",
    iconName: "CheckCircle",
    eventKey: "finding.status_changed",
    samplePayloadFields: ["report.id", "old_status", "new_status", "actor_id"],
  },
  {
    id: "trig-finding-accepted",
    name: "Report Accepted",
    category: "findings",
    description: "Fires when finding is validated and confirmed as in-scope vulnerability.",
    iconName: "ShieldCheck",
    eventKey: "finding.accepted",
    samplePayloadFields: ["report.id", "reward_tier", "cwe_id", "triage_score"],
  },
  {
    id: "trig-finding-rejected",
    name: "Report Rejected / Out-of-Scope",
    category: "findings",
    description: "Fires when report is marked as duplicate, out of scope, or informative.",
    iconName: "XCircle",
    eventKey: "finding.rejected",
    samplePayloadFields: ["report.id", "rejection_reason", "duplicate_of_id"],
  },

  // SLA & Deadlines
  {
    id: "trig-sla-warning",
    name: "SLA Warning (80% Elapsed)",
    category: "sla",
    description: "Fires when initial response or triage time crosses 80% threshold.",
    iconName: "Clock",
    eventKey: "sla.warning",
    samplePayloadFields: ["report.id", "target_deadline", "time_remaining_minutes"],
  },
  {
    id: "trig-sla-breached",
    name: "SLA Breached",
    category: "sla",
    description: "Fires the moment an agreed resolution or triage SLA is violated.",
    iconName: "Flame",
    eventKey: "sla.breached",
    samplePayloadFields: ["report.id", "severity", "elapsed_hours", "assigned_triager"],
  },

  // Rewards & Payments
  {
    id: "trig-reward-approved",
    name: "Reward Approved",
    category: "rewards",
    description: "Fires when bounty payout is signed off by program manager.",
    iconName: "DollarSign",
    eventKey: "reward.approved",
    samplePayloadFields: ["report.id", "bounty_amount", "currency", "approver_id"],
  },
  {
    id: "trig-reward-paid",
    name: "Reward Paid / Disbursed",
    category: "rewards",
    description: "Fires when payout transaction settles successfully to researcher wallet.",
    iconName: "CreditCard",
    eventKey: "reward.paid",
    samplePayloadFields: ["payment.id", "researcher.id", "transfer_reference", "amount"],
  },

  // Attack Surface & Assets
  {
    id: "trig-asset-added",
    name: "Asset Added to Scope",
    category: "assets",
    description: "Fires when a new domain, IP range, or mobile app is enrolled into program scope.",
    iconName: "Target",
    eventKey: "asset.added",
    samplePayloadFields: ["asset.id", "asset.hostname", "asset.tier", "verified_dns"],
  },
  {
    id: "trig-domain-verified",
    name: "Domain DNS Verified",
    category: "assets",
    description: "Fires when cryptographic TXT or CNAME record verification completes.",
    iconName: "Globe",
    eventKey: "domain.verified",
    samplePayloadFields: ["domain.name", "verification_method", "verified_at"],
  },

  // Researchers
  {
    id: "trig-researcher-registered",
    name: "Researcher Registered",
    category: "researchers",
    description: "Fires when a security researcher completes identity verification.",
    iconName: "UserCheck",
    eventKey: "researcher.registered",
    samplePayloadFields: ["researcher.id", "username", "country", "kyc_status"],
  },
  {
    id: "trig-researcher-invited",
    name: "Researcher Invited to Private Program",
    category: "researchers",
    description: "Fires when an invite is dispatched to private bounty program.",
    iconName: "Mail",
    eventKey: "researcher.invited",
    samplePayloadFields: ["program.id", "researcher.email", "invitation_token"],
  },

  // Integrations & Webhooks
  {
    id: "trig-webhook-failed",
    name: "Webhook Delivery Failed",
    category: "integrations",
    description: "Fires after consecutive HTTP 5xx delivery errors to external SIEM/SOAR.",
    iconName: "Unplug",
    eventKey: "webhook.failed",
    samplePayloadFields: ["webhook.id", "endpoint_url", "http_status", "retry_count"],
  },
  {
    id: "trig-api-token-created",
    name: "API Token Created",
    category: "integrations",
    description: "Fires when a member provisions a new programmatic personal access token.",
    iconName: "Key",
    eventKey: "api_token.created",
    samplePayloadFields: ["token.id", "creator.id", "scopes", "expires_at"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ACTION CATALOG
// ─────────────────────────────────────────────────────────────────────────────
export const ACTION_CATALOG: ActionDefinition[] = [
  // AI Actions (Dedicated AI Section)
  {
    id: "act-ai-summarize",
    name: "Generate AI Executive Summary",
    category: "ai",
    description: "Synthesizes raw reproduction steps and HTTP dumps into crisp executive prose.",
    iconName: "Sparkles",
    isAi: true,
    provider: "Com Olho AI Studio",
    inputParams: [
      { key: "detailLevel", label: "Detail Level", type: "select", options: ["Executive (1-Paragraph)", "Technical Deep Dive", "Board Briefing"] },
      { key: "targetAudience", label: "Audience", type: "select", options: ["CISO / VP", "Engineering Leads", "Compliance Officer"] },
    ],
  },
  {
    id: "act-ai-predict-severity",
    name: "Predict Severity & CVSS v4.0",
    category: "ai",
    description: "Analyzes attack vector, complexity, and privilege required to propose CVSS score.",
    iconName: "BrainCircuit",
    isAi: true,
    provider: "Com Olho AI Studio",
    inputParams: [
      { key: "autoApplyIfHighConfidence", label: "Auto-Apply if Confidence > 90%", type: "boolean" },
    ],
  },
  {
    id: "act-ai-detect-duplicate",
    name: "Detect Duplicate Findings",
    category: "ai",
    description: "Scans active and resolved database using semantic vector search for twin vulnerabilities.",
    iconName: "Copy",
    isAi: true,
    provider: "Com Olho AI Studio",
    inputParams: [
      { key: "similarityThreshold", label: "Similarity Threshold", type: "select", options: ["80% (Loose)", "90% (Strict)", "95% (Exact Match)"] },
    ],
  },
  {
    id: "act-ai-recommend-reward",
    name: "Recommend Bounty Reward",
    category: "ai",
    description: "Evaluates program bounty grid, exploit quality, and historical precedents.",
    iconName: "Coins",
    isAi: true,
    provider: "Com Olho AI Studio",
    inputParams: [
      { key: "stayWithinBudgetCap", label: "Strictly Cap at Program Tier Limit", type: "boolean" },
    ],
  },
  {
    id: "act-ai-response-draft",
    name: "Generate Researcher Response Draft",
    category: "ai",
    description: "Composes courteous, clear next-step communication for researcher clarification.",
    iconName: "MessageSquareCode",
    isAi: true,
    provider: "Com Olho AI Studio",
    inputParams: [
      { key: "tone", label: "Communication Tone", type: "select", options: ["Friendly & Encouraging", "Concise & Formal", "Security Verification"] },
    ],
  },

  // Ticketing & Issue Tracking
  {
    id: "act-create-jira",
    name: "Create Jira Issue",
    category: "ticketing",
    description: "Bi-directionally sync finding into Jira Cloud/Data Center with severity mapping.",
    iconName: "Layers",
    provider: "Atlassian Jira",
    inputParams: [
      { key: "projectKey", label: "Jira Project", type: "select", options: ["SEC (Security Operations)", "CORE (Core Platform)", "PAY (Payments Gateway)"] },
      { key: "issueType", label: "Issue Type", type: "select", options: ["Bug", "Security Vulnerability", "Task"] },
    ],
  },
  {
    id: "act-create-github-issue",
    name: "Create GitHub / GitLab Issue",
    category: "ticketing",
    description: "Dispatches private security issue into designated repository.",
    iconName: "FolderGit2",
    provider: "GitHub Enterprise",
    inputParams: [
      { key: "repository", label: "Repository", type: "select", options: ["org/core-api", "org/auth-service", "org/payment-ledger"] },
      { key: "label", label: "Security Label", type: "select", options: ["security/p1-critical", "security/p2-high", "cwe-validated"] },
    ],
  },
  {
    id: "act-create-servicenow",
    name: "Create ServiceNow Security Incident",
    category: "ticketing",
    description: "Creates SIR (Security Incident Response) record with enterprise CMDB linkage.",
    iconName: "Building2",
    provider: "ServiceNow ITSM",
    inputParams: [
      { key: "assignmentGroup", label: "Assignment Group", type: "select", options: ["SecOps-L2", "AppSec-Triage", "Cloud-Infra-Sec"] },
    ],
  },

  // Communication & Alerting
  {
    id: "act-send-slack",
    name: "Send Slack Channel Alert",
    category: "communication",
    description: "Broadcasts interactive Block Kit card with quick triage buttons to Slack channel.",
    iconName: "MessageSquare",
    provider: "Slack",
    inputParams: [
      { key: "channel", label: "Slack Channel", type: "select", options: ["#sec-ops-critical", "#triage-feed", "#bounty-notifications"] },
      { key: "mentionTeam", label: "Mention On-Call User", type: "boolean" },
    ],
  },
  {
    id: "act-send-teams",
    name: "Send Microsoft Teams Notification",
    category: "communication",
    description: "Posts Adaptive Card into Microsoft Teams security war room.",
    iconName: "Send",
    provider: "Microsoft Teams",
    inputParams: [
      { key: "channel", label: "Channel Webhook", type: "text" },
    ],
  },
  {
    id: "act-send-email",
    name: "Send Encrypted Email Notification",
    category: "communication",
    description: "Sends customized email template to engineering owners or security managers.",
    iconName: "Mail",
    provider: "SMTP / SES",
    inputParams: [
      { key: "recipientRole", label: "Recipients", type: "select", options: ["Security Admins", "Program Managers", "Asset Owner"] },
    ],
  },

  // SLA Timers
  {
    id: "act-sla-start",
    name: "Start SLA Countdown Timer",
    category: "sla",
    description: "Activates enforceable SLA clock according to report priority tier.",
    iconName: "Clock",
    provider: "Com Olho SLA Engine",
    inputParams: [
      { key: "targetHours", label: "Triage Window (Hours)", type: "number" },
    ],
  },
  {
    id: "act-sla-pause",
    name: "Pause SLA (Awaiting Researcher)",
    category: "sla",
    description: "Freezes timer while pending additional information from researcher.",
    iconName: "PauseCircle",
    provider: "Com Olho SLA Engine",
    inputParams: [],
  },

  // Assignment & Governance
  {
    id: "act-assign-team",
    name: "Assign Security Team / Triager",
    category: "assignment",
    description: "Directs report to specialized triage analyst based on skill or asset type.",
    iconName: "UserCheck",
    provider: "Com Olho IAM",
    inputParams: [
      { key: "team", label: "Assignee Team", type: "select", options: ["Core AppSec", "Cloud & Infrastructure", "API & Microservices", "Mobile Sec"] },
    ],
  },
  {
    id: "act-request-approval",
    name: "Route to Approval Chain",
    category: "governance",
    description: "Holds action pending multi-party sign-off (e.g. Finance + CISO for high payouts).",
    iconName: "GitPullRequest",
    provider: "Com Olho Governance",
    inputParams: [
      { key: "threshold", label: "Payout Trigger Threshold", type: "number" },
      { key: "requiredRoles", label: "Required Sign-offs", type: "select", options: ["Security Admin only", "Security Admin + Finance", "Full Executive Sign-off"] },
    ],
  },
  {
    id: "act-dispatch-webhook",
    name: "Trigger Webhook / Custom API",
    category: "security",
    description: "Dispatches cryptographically signed JSON event to custom internal endpoint.",
    iconName: "Zap",
    provider: "Webhook Bus",
    inputParams: [
      { key: "endpoint", label: "Endpoint URL", type: "text" },
      { key: "secretKey", label: "Signing Secret Token", type: "text" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW TEMPLATES (Production Ready)
// ─────────────────────────────────────────────────────────────────────────────
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl-critical-response",
    name: "Critical P1 Vulnerability Fast-Track",
    description: "Instantly mobilizes incident response when a Critical (CVSS ≥ 9.0) report is submitted. Sends PagerDuty/Slack emergency page, creates high-priority Jira bug, and locks 1-hour initial response SLA.",
    category: "escalation",
    recommendedFor: "High-volume public bug bounties & production web assets",
    popular: true,
    nodesCount: 6,
    estimatedHoursSavedPerMonth: 42,
    triggerEvent: "Report Submitted (P1 Critical)",
    integrationsUsed: ["Slack", "Jira Software", "PagerDuty", "Com Olho SLA Engine"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "Report Submitted",
        subtitle: "Severity equals Critical (CVSS ≥ 9.0)",
        iconName: "FilePlus",
        config: { severity: "critical" },
      },
      {
        id: "node-2",
        type: "ai",
        title: "AI Vulnerability Triage",
        subtitle: "Generate executive summary & verify CVSS exploitability",
        iconName: "Sparkles",
        config: { model: "gemini-3.8-flash", task: "summarize" },
      },
      {
        id: "node-3",
        type: "action",
        title: "Create Jira Ticket",
        subtitle: "Project: SEC, Issue Type: Security Vulnerability",
        iconName: "Layers",
        config: { project: "SEC", priority: "Highest" },
      },
      {
        id: "node-4",
        type: "notification",
        title: "Broadcast to #sec-ops-critical",
        subtitle: "Slack emergency banner with 1-click validate button",
        iconName: "MessageSquare",
        config: { channel: "#sec-ops-critical" },
      },
      {
        id: "node-5",
        type: "action",
        title: "Start 1-Hour SLA Clock",
        subtitle: "Enforce contract response deadline",
        iconName: "Clock",
        config: { targetHours: 1 },
      },
      {
        id: "node-6",
        type: "end",
        title: "Workflow Complete",
        subtitle: "Incident pipeline initiated and logged to audit trail",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
  {
    id: "tpl-duplicate-handling",
    name: "AI-Powered Semantic Duplicate Detection",
    description: "Runs semantic vector comparison against active and resolved reports. Soft-flags likely duplicates with percentage match, alerting triager before payout.",
    category: "triage",
    recommendedFor: "Public programs with repeated submission patterns",
    popular: true,
    nodesCount: 5,
    estimatedHoursSavedPerMonth: 35,
    triggerEvent: "Report Submitted (Any Severity)",
    integrationsUsed: ["Com Olho AI Studio", "Internal Knowledge Base"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "Report Submitted",
        subtitle: "Any incoming report",
        iconName: "FilePlus",
        config: {},
      },
      {
        id: "node-2",
        type: "ai",
        title: "Vector Similarity Engine",
        subtitle: "Compare against last 365 days of findings",
        iconName: "BrainCircuit",
        config: { threshold: "88%" },
      },
      {
        id: "node-3",
        type: "condition",
        title: "Similarity ≥ 85%?",
        subtitle: "Branch based on cluster match confidence",
        iconName: "GitBranch",
        config: { operator: "greater_than", value: 85 },
      },
      {
        id: "node-4",
        type: "action",
        title: "Attach Duplicate Match Notice",
        subtitle: "Link existing report ID and display comparison diff",
        iconName: "Copy",
        config: { tag: "possible-duplicate" },
      },
      {
        id: "node-5",
        type: "end",
        title: "Triager Notified",
        subtitle: "Triager reviews twin report side-by-side",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
  {
    id: "tpl-reward-approval",
    name: "Multi-Tiered Bounty Approval Chain (> $5,000)",
    description: "Requires dual sign-off from Security Admin and Finance Department before any bounty exceeding $5,000 can be disbursed. Automatically releases funds once authorized.",
    category: "rewards",
    recommendedFor: "Enterprises with rigorous compliance and budget governance",
    popular: true,
    nodesCount: 6,
    estimatedHoursSavedPerMonth: 28,
    triggerEvent: "Reward Payout Proposed",
    integrationsUsed: ["Com Olho Governance", "Stripe / Ledger", "Email"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "Reward Proposed",
        subtitle: "Bounty amount specified by triager",
        iconName: "Coins",
        config: {},
      },
      {
        id: "node-2",
        type: "condition",
        title: "Amount > $5,000 USD?",
        subtitle: "Evaluates proposed bounty threshold",
        iconName: "GitBranch",
        config: { operator: "greater_than", value: 5000 },
      },
      {
        id: "node-3",
        type: "approval",
        title: "Security Director Sign-Off",
        subtitle: "Stage 1: Verify technical impact & CWE tier",
        iconName: "ShieldCheck",
        config: { role: "security_admin" },
      },
      {
        id: "node-4",
        type: "approval",
        title: "Finance & Accounting Sign-Off",
        subtitle: "Stage 2: Check quarterly budget allocation",
        iconName: "Building2",
        config: { role: "billing_admin" },
      },
      {
        id: "node-5",
        type: "action",
        title: "Execute Bank Transfer / Payout",
        subtitle: "Disburse to researcher verified wallet",
        iconName: "CreditCard",
        config: { autoDisburse: true },
      },
      {
        id: "node-6",
        type: "end",
        title: "Payment Settled",
        subtitle: "Invoice generated and attached to report ledger",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
  {
    id: "tpl-asset-dns-monitor",
    name: "Subdomain Takeover & DNS Integrity Sentinel",
    description: "Continuously probes verified assets for dangling CNAMEs or abandoned cloud storage buckets. Auto-quarantines affected assets and notifies attack surface team.",
    category: "attack_surface",
    recommendedFor: "Cloud-native infrastructure and fast-moving web assets",
    nodesCount: 5,
    estimatedHoursSavedPerMonth: 22,
    triggerEvent: "DNS Drift Detected",
    integrationsUsed: ["Com Olho Asset Inventory", "Slack", "Cloudflare"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "DNS Drift / Dangling CNAME",
        subtitle: "Asset points to unclaimed AWS S3 or GitHub Pages",
        iconName: "Globe",
        config: {},
      },
      {
        id: "node-2",
        type: "action",
        title: "Tag Asset as At-Risk",
        subtitle: "Set posture status to 'Critical Exposure'",
        iconName: "Target",
        config: { status: "exposed" },
      },
      {
        id: "node-3",
        type: "notification",
        title: "Alert #cloud-sec-ops",
        subtitle: "Send immediate remediation snippet to engineers",
        iconName: "MessageSquare",
        config: { channel: "#cloud-sec-ops" },
      },
      {
        id: "node-4",
        type: "action",
        title: "Auto-Create Jira Remediation Task",
        subtitle: "Assign to DevOps on-call queue",
        iconName: "Layers",
        config: { project: "DEVOPS" },
      },
      {
        id: "node-5",
        type: "end",
        title: "Remediation Underway",
        subtitle: "SLA tracking active until DNS record reclaimed",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
  {
    id: "tpl-vip-researcher-onboarding",
    name: "VIP Elite Researcher Fast-Track Onboarding",
    description: "When an elite researcher (Reputation ≥ 2,500, Trust 100%) registers or is invited, automatically provides access to sandbox credentials, sends customized welcome package, and assigns dedicated concierge triager.",
    category: "triage",
    recommendedFor: "Private boutique bug bounty programs",
    nodesCount: 5,
    estimatedHoursSavedPerMonth: 18,
    triggerEvent: "Elite Researcher Enrolled",
    integrationsUsed: ["Com Olho IAM", "Email", "Slack"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "Researcher Enrolled in Private Program",
        subtitle: "Target program invite accepted",
        iconName: "UserCheck",
        config: {},
      },
      {
        id: "node-2",
        type: "condition",
        title: "Reputation ≥ 2,500 & Trust 100%",
        subtitle: "Verify researcher credential credentials",
        iconName: "GitBranch",
        config: { operator: "greater_than", value: 2500 },
      },
      {
        id: "node-3",
        type: "action",
        title: "Provision Sandbox API Key",
        subtitle: "Generate ephemeral staging credentials",
        iconName: "Key",
        config: { env: "staging" },
      },
      {
        id: "node-4",
        type: "notification",
        title: "Send Private Concierge Welcome",
        subtitle: "Direct message with priority triage communication link",
        iconName: "Mail",
        config: { template: "vip-welcome" },
      },
      {
        id: "node-5",
        type: "end",
        title: "Onboarding Complete",
        subtitle: "Researcher tagged as 'VIP Tier 1'",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
  {
    id: "tpl-webhook-retry-deadletter",
    name: "Webhook Failure Exponential Backoff & Escalation",
    description: "Monitors outgoing webhooks to external SIEMs. If 3 consecutive deliveries fail, pauses endpoint, opens internal triage ticket, and stores payloads in secure dead-letter queue.",
    category: "compliance",
    recommendedFor: "Enterprise SOC & SIEM webhook integrations",
    nodesCount: 5,
    estimatedHoursSavedPerMonth: 14,
    triggerEvent: "Webhook Delivery Error 5xx",
    integrationsUsed: ["Webhook Bus", "Slack", "Jira"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "Webhook Error (3x Failed Retries)",
        subtitle: "External listener returning 500 or timeout",
        iconName: "Unplug",
        config: { errorCount: 3 },
      },
      {
        id: "node-2",
        type: "action",
        title: "Archive to Dead-Letter Vault",
        subtitle: "Preserve encrypted JSON payloads for replay",
        iconName: "Archive",
        config: { retentionDays: 30 },
      },
      {
        id: "node-3",
        type: "action",
        title: "Auto-Pause Webhook Endpoint",
        subtitle: "Prevent further saturation or queue backup",
        iconName: "PauseCircle",
        config: { status: "paused" },
      },
      {
        id: "node-4",
        type: "notification",
        title: "Alert SecOps on Slack",
        subtitle: "Message #sec-ops with failure diagnostics",
        iconName: "MessageSquare",
        config: { channel: "#sec-ops" },
      },
      {
        id: "node-5",
        type: "end",
        title: "Circuit Breaker Active",
        subtitle: "Ready for manual replay once endpoint recovers",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE MOCK WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────
export const INITIAL_WORKFLOWS: WorkflowItem[] = [
  {
    id: "wf-101",
    name: "P1 Critical Finding Emergency Escalation",
    description: "Auto-routes Critical findings to Slack #sec-ops, creates a Jira highest-priority issue, and sets a 1-hour triage SLA countdown.",
    category: "escalation",
    status: "active",
    triggerEvent: "Report Submitted (Critical)",
    triggerCategory: "findings",
    ownerName: "Sarah Chen (Head of SecOps)",
    lastRun: "8 minutes ago",
    avgRuntimeMs: 380,
    executionCount: 142,
    successRate: 99.3,
    lastModified: "2 days ago",
    version: "v2.4.1",
    manualHoursSaved: 54,
    tags: ["High-Priority", "Jira", "Slack", "SLA"],
    nodes: WORKFLOW_TEMPLATES[0].nodes,
  },
  {
    id: "wf-102",
    name: "AI Duplicate Clustering & Triager Pre-check",
    description: "Evaluates incoming reports against historical vulnerability vectors using semantic AI clustering to flag identical reports early.",
    category: "triage",
    status: "active",
    triggerEvent: "Report Submitted (All)",
    triggerCategory: "findings",
    ownerName: "Marcus Brody (AppSec Lead)",
    lastRun: "24 minutes ago",
    avgRuntimeMs: 620,
    executionCount: 890,
    successRate: 98.7,
    lastModified: "1 week ago",
    version: "v3.1.0",
    manualHoursSaved: 112,
    tags: ["AI", "Gemini", "Duplicate-Detection"],
    nodes: WORKFLOW_TEMPLATES[1].nodes,
  },
  {
    id: "wf-103",
    name: "High-Value Bounty Approval Routing (> $5k)",
    description: "Enforces dual approval chain: SecOps Lead sign-off followed by Corporate Finance authorization before payment release.",
    category: "rewards",
    status: "active",
    triggerEvent: "Reward Proposed (> $5,000)",
    triggerCategory: "rewards",
    ownerName: "Elena Rostova (VP Engineering)",
    lastRun: "3 hours ago",
    avgRuntimeMs: 210,
    executionCount: 38,
    successRate: 100,
    lastModified: "3 weeks ago",
    version: "v1.8.0",
    manualHoursSaved: 36,
    tags: ["Finance", "Governance", "Bounty"],
    nodes: WORKFLOW_TEMPLATES[2].nodes,
  },
  {
    id: "wf-104",
    name: "Subdomain Takeover & DNS Drift Sentinel",
    description: "Checks attack surface changes. If a domain becomes dangling, tags asset as Exposed and alerts cloud security team.",
    category: "attack_surface",
    status: "active",
    triggerEvent: "Asset DNS Drift Detected",
    triggerCategory: "assets",
    ownerName: "Alex Vance (Cloud Infra)",
    lastRun: "1 hour ago",
    avgRuntimeMs: 440,
    executionCount: 204,
    successRate: 97.5,
    lastModified: "4 days ago",
    version: "v1.2.2",
    manualHoursSaved: 29,
    tags: ["Attack-Surface", "DNS", "Automation"],
    nodes: WORKFLOW_TEMPLATES[3].nodes,
  },
  {
    id: "wf-105",
    name: "Researcher SLA Breach Escalation to Program Owner",
    description: "If an initial response SLA exceeds 48 hours without triager review, automatically reassigns finding to secondary reviewer and pings manager.",
    category: "escalation",
    status: "paused",
    triggerEvent: "SLA Breached (> 48h)",
    triggerCategory: "sla",
    ownerName: "Sarah Chen (Head of SecOps)",
    lastRun: "Yesterday",
    avgRuntimeMs: 190,
    executionCount: 15,
    successRate: 93.3,
    lastModified: "5 days ago",
    version: "v1.0.1",
    manualHoursSaved: 12,
    tags: ["SLA", "Escalation", "Paused"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "SLA Breached",
        subtitle: "Initial response SLA expired",
        iconName: "Flame",
        config: {},
      },
      {
        id: "node-2",
        type: "action",
        title: "Reassign to Backup Triager",
        subtitle: "Assign to Core AppSec secondary queue",
        iconName: "UserCheck",
        config: { targetQueue: "secondary" },
      },
      {
        id: "node-3",
        type: "notification",
        title: "Email Program Manager",
        subtitle: "Send urgent SLA breach notice",
        iconName: "Mail",
        config: {},
      },
      {
        id: "node-4",
        type: "end",
        title: "Escalation Logged",
        subtitle: "Breach event recorded in analytics",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
  {
    id: "wf-106",
    name: "ServiceNow SIR Auto-Sync for Validated Vulnerabilities",
    description: "Automatically synchronizes accepted vulnerabilities into corporate ServiceNow Security Operations table with assigned owner.",
    category: "compliance",
    status: "active",
    triggerEvent: "Report Accepted / Validated",
    triggerCategory: "findings",
    ownerName: "Marcus Brody (AppSec Lead)",
    lastRun: "45 minutes ago",
    avgRuntimeMs: 510,
    executionCount: 96,
    successRate: 98.9,
    lastModified: "1 month ago",
    version: "v2.0.4",
    manualHoursSaved: 48,
    tags: ["ServiceNow", "Enterprise", "Compliance"],
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        title: "Report Accepted",
        subtitle: "Valid security finding verified",
        iconName: "ShieldCheck",
        config: {},
      },
      {
        id: "node-2",
        type: "action",
        title: "Create ServiceNow SIR",
        subtitle: "Target: SecOps-L2 queue",
        iconName: "Building2",
        config: {},
      },
      {
        id: "node-3",
        type: "end",
        title: "Incident Linked",
        subtitle: "ServiceNow incident number synced back to Com Olho",
        iconName: "CheckCircle2",
        config: {},
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RECENT EXECUTION LOGS
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_EXECUTION_LOGS: ExecutionLog[] = [
  {
    id: "exec-901",
    workflowId: "wf-101",
    workflowName: "P1 Critical Finding Emergency Escalation",
    triggerEvent: "Report Submitted (Critical)",
    startedAt: "8 mins ago",
    durationMs: 382,
    status: "success",
    executedBy: "System (Webhook Engine)",
    actionsCount: 4,
    steps: [
      { name: "Trigger: Report Submitted", type: "trigger", status: "success", durationMs: 12, inputSummary: "Report #1049 (Remote Code Execution in Core Gateway)", outputSummary: "Severity: Critical (CVSS 9.8)" },
      { name: "AI Vulnerability Triage", type: "ai", status: "success", durationMs: 185, inputSummary: "Raw finding description + HTTP dump", outputSummary: "Generated 3-bullet executive summary and verified CWE-78" },
      { name: "Create Jira Ticket", type: "ticketing", status: "success", durationMs: 110, inputSummary: "Project SEC, Priority Highest", outputSummary: "Created SEC-4029" },
      { name: "Send Slack Alert", type: "notification", status: "success", durationMs: 75, inputSummary: "Channel: #sec-ops-critical", outputSummary: "Dispatched Block Kit card with 1-click buttons" },
    ],
    payloadSummary: { reportId: "CO-1049", severity: "CRITICAL", title: "Remote Code Execution via Spring SpEL injection", researcher: "0xCyberNinja" },
  },
  {
    id: "exec-902",
    workflowId: "wf-102",
    workflowName: "AI Duplicate Clustering & Triager Pre-check",
    triggerEvent: "Report Submitted (Medium)",
    startedAt: "24 mins ago",
    durationMs: 614,
    status: "success",
    executedBy: "System (Intake Bus)",
    actionsCount: 3,
    steps: [
      { name: "Trigger: Report Submitted", type: "trigger", status: "success", durationMs: 15, inputSummary: "Report #1048 (Stored XSS on User Profile Bio)", outputSummary: "Severity: Medium (CVSS 5.4)" },
      { name: "Vector Similarity Engine", type: "ai", status: "success", durationMs: 520, inputSummary: "Comparing with 1,420 resolved issues", outputSummary: "Highest similarity 62% (Below 85% duplicate threshold)" },
      { name: "Pass to Triager Queue", type: "action", status: "success", durationMs: 79, inputSummary: "No duplicate detected", outputSummary: "Tagged as 'clean-intake'" },
    ],
    payloadSummary: { reportId: "CO-1048", severity: "MEDIUM", title: "Stored XSS on User Profile Bio", researcher: "bytehunter" },
  },
  {
    id: "exec-903",
    workflowId: "wf-104",
    workflowName: "Subdomain Takeover & DNS Drift Sentinel",
    triggerEvent: "DNS Drift Detected",
    startedAt: "1 hour ago",
    durationMs: 442,
    status: "success",
    executedBy: "Attack Surface Crawler",
    actionsCount: 3,
    steps: [
      { name: "Trigger: Asset DNS Drift", type: "trigger", status: "success", durationMs: 20, inputSummary: "Hostname: legacy-docs.comolho.io", outputSummary: "CNAME points to deleted AWS S3 bucket" },
      { name: "Tag Asset as At-Risk", type: "action", status: "success", durationMs: 110, inputSummary: "Set status to Exposed", outputSummary: "Posture updated to High Risk" },
      { name: "Alert #cloud-sec-ops", type: "notification", status: "success", durationMs: 312, inputSummary: "Channel #cloud-sec-ops", outputSummary: "Dispatched remediation snippet" },
    ],
    payloadSummary: { asset: "legacy-docs.comolho.io", cname: "comolho-docs.s3-website.us-east-1.amazonaws.com", risk: "Subdomain Takeover" },
  },
  {
    id: "exec-904",
    workflowId: "wf-106",
    workflowName: "ServiceNow SIR Auto-Sync for Validated Vulnerabilities",
    triggerEvent: "Report Accepted",
    startedAt: "1 hour 40 mins ago",
    durationMs: 1240,
    status: "failed",
    executedBy: "Marcus Brody",
    actionsCount: 2,
    failureReason: "ServiceNow OAuth 2.0 token expired (HTTP 401 Unauthorized)",
    failedStep: "Create ServiceNow SIR",
    suggestion: "Refresh ServiceNow client credentials in Organization Integrations tab or click Retry.",
    steps: [
      { name: "Trigger: Report Accepted", type: "trigger", status: "success", durationMs: 18, inputSummary: "Report #1042 accepted", outputSummary: "Status: Validated" },
      { name: "Create ServiceNow SIR", type: "ticketing", status: "failed", durationMs: 1222, inputSummary: "Target instance: comolho.service-now.com", outputSummary: "Error: 401 Unauthorized - invalid_token" },
    ],
    payloadSummary: { reportId: "CO-1042", target: "comolho.service-now.com", statusCode: 401 },
  },
  {
    id: "exec-905",
    workflowId: "wf-103",
    workflowName: "High-Value Bounty Approval Routing (> $5k)",
    triggerEvent: "Reward Proposed ($7,500)",
    startedAt: "3 hours ago",
    durationMs: 215,
    status: "success",
    executedBy: "Sarah Chen",
    actionsCount: 3,
    steps: [
      { name: "Trigger: Reward Proposed", type: "trigger", status: "success", durationMs: 14, inputSummary: "Amount $7,500 for P1 Finding", outputSummary: "Exceeds $5,000 threshold" },
      { name: "Create Approval Request", type: "governance", status: "success", durationMs: 110, inputSummary: "Route to Security Director + Finance", outputSummary: "Approval Ticket #APR-442 created" },
      { name: "Notify Approvers via Email", type: "notification", status: "success", durationMs: 91, inputSummary: "Recipients: elena@comolho.io, finance@comolho.io", outputSummary: "Dispatched signature tokens" },
    ],
    payloadSummary: { reportId: "CO-1038", amount: "$7,500 USD", approverStatus: "Pending Dual Sign-off" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PENDING APPROVAL WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────
export const MOCK_APPROVAL_REQUESTS: ApprovalRequest[] = [
  {
    id: "apr-801",
    workflowId: "wf-103",
    workflowName: "High-Value Bounty Approval Routing (> $5k)",
    title: "Reward Payout: $7,500 for Authentication Bypass in Multi-Tenant Auth",
    findingTitle: "Critical Pre-Auth Account Takeover via JWT Confusion",
    researcherName: "0xCyberNinja (Rank #3)",
    amount: 7500,
    currency: "USD",
    requestedAt: "3 hours ago",
    status: "pending",
    urgency: "critical",
    currentStage: "Security Director Sign-Off",
    stages: [
      { role: "Triager", approverName: "Marcus Brody", status: "approved", timestamp: "3h ago", note: "Exploit fully reproduced on staging. High quality PoC." },
      { role: "Security Director", approverName: "Elena Rostova", status: "pending", note: "Awaiting final review of patch verification." },
      { role: "Corporate Finance", approverName: "David Sterling", status: "pending", note: "Quarterly bounty pool has $42,500 balance remaining." },
    ],
  },
  {
    id: "apr-802",
    workflowId: "wf-103",
    workflowName: "High-Value Bounty Approval Routing (> $5k)",
    title: "Reward Payout: $10,000 for Zero-Day SSRF in Cloud Storage Ingest",
    findingTitle: "Blind SSRF to AWS Instance Metadata Service (IMDSv1)",
    researcherName: "vortex_sec (Rank #1)",
    amount: 10000,
    currency: "USD",
    requestedAt: "Yesterday",
    status: "approved",
    urgency: "critical",
    currentStage: "Completed",
    stages: [
      { role: "Triager", approverName: "Sarah Chen", status: "approved", timestamp: "Yesterday 14:20", note: "IMDS access verified. Hotfix deployed to metadata gateway." },
      { role: "Security Director", approverName: "Elena Rostova", status: "approved", timestamp: "Yesterday 16:05", note: "Exceptional research. Maximum tier bounty approved." },
      { role: "Corporate Finance", approverName: "David Sterling", status: "approved", timestamp: "Yesterday 17:30", note: "Wire transfer reference WT-99214 dispatched." },
    ],
  },
  {
    id: "apr-803",
    workflowId: "wf-107",
    workflowName: "Public Disclosure Approval Chain",
    title: "Coordinated Vulnerability Disclosure Request for CVE-2026-4410",
    findingTitle: "Stored XSS leading to Session Hijack in Organization Admin",
    researcherName: "alice_crypto (Rank #12)",
    requestedAt: "2 days ago",
    status: "pending",
    urgency: "normal",
    currentStage: "Legal & PR Sign-Off",
    stages: [
      { role: "AppSec Lead", approverName: "Marcus Brody", status: "approved", timestamp: "2d ago", note: "Customer instances patched. 90-day embargo elapsed." },
      { role: "Legal & PR", approverName: "Sophia Martinez", status: "pending", note: "Reviewing blog post statement before joint advisory." },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM VARIABLES CATALOG
// ─────────────────────────────────────────────────────────────────────────────
export const SYSTEM_VARIABLES: SystemVariable[] = [
  // Finding
  { key: "{{report.id}}", label: "Report ID", category: "finding", description: "Unique identifier of the vulnerability report (e.g. CO-1049).", exampleValue: "CO-1049" },
  { key: "{{report.title}}", label: "Report Title", category: "finding", description: "Researcher submitted title of the vulnerability.", exampleValue: "Remote Code Execution via Spring SpEL" },
  { key: "{{report.severity}}", label: "Severity Level", category: "finding", description: "Current severity rating (CRITICAL, HIGH, MEDIUM, LOW).", exampleValue: "CRITICAL" },
  { key: "{{report.cvss_score}}", label: "CVSS Score", category: "finding", description: "Calculated Common Vulnerability Scoring System decimal.", exampleValue: "9.8" },
  { key: "{{report.cwe_id}}", label: "CWE Identifier", category: "finding", description: "Common Weakness Enumeration classification.", exampleValue: "CWE-78" },
  { key: "{{report.url}}", label: "Report Direct URL", category: "finding", description: "Authenticated link to finding detail view.", exampleValue: "https://comolho.io/findings/CO-1049" },

  // Researcher
  { key: "{{researcher.username}}", label: "Researcher Handle", category: "researcher", description: "Public pseudonym of reporting security researcher.", exampleValue: "0xCyberNinja" },
  { key: "{{researcher.reputation}}", label: "Researcher Reputation", category: "researcher", description: "Global platform reputation score points.", exampleValue: "3,840" },
  { key: "{{researcher.trust_score}}", label: "Researcher Trust Score", category: "researcher", description: "Calculated reliability & signal-to-noise ratio percentage.", exampleValue: "98.5%" },

  // Program & Asset
  { key: "{{program.name}}", label: "Program Name", category: "program", description: "The specific bounty or VDP program scope.", exampleValue: "Northwind Cloud Core Production" },
  { key: "{{asset.target}}", label: "Asset Target", category: "organization", description: "Affected URL, domain, or IP target.", exampleValue: "api.northwindcloud.com" },
  { key: "{{asset.tier}}", label: "Asset Scope Tier", category: "organization", description: "Criticality tier (Tier 1 Mission Critical, Tier 2, etc.).", exampleValue: "Tier 1 - Mission Critical" },

  // Reward
  { key: "{{reward.amount}}", label: "Reward Amount", category: "reward", description: "Allocated or proposed bounty payment value.", exampleValue: "$5,000" },
  { key: "{{reward.currency}}", label: "Reward Currency", category: "reward", description: "Three-letter ISO currency code.", exampleValue: "USD" },

  // System
  { key: "{{system.timestamp}}", label: "Current Timestamp", category: "system", description: "ISO 8601 execution time.", exampleValue: "2026-11-01T08:14:00Z" },
  { key: "{{sla.deadline}}", label: "SLA Deadline", category: "system", description: "Timestamp when current SLA tier will breach.", exampleValue: "2026-11-01T09:14:00Z" },
];

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS OVERVIEW DATA
// ─────────────────────────────────────────────────────────────────────────────
export const AUTOMATION_ANALYTICS = {
  heroMetrics: {
    activeWorkflows: 6,
    totalWorkflows: 8,
    pausedWorkflows: 1,
    draftWorkflows: 1,
    executionsToday: 412,
    successRate: 98.8,
    failedToday: 3,
    avgRuntimeMs: 395,
    manualHoursSavedTotal: 289,
    hoursSavedThisMonth: 84,
  },
  executionsTrend: [
    { date: "Oct 19", count: 280, success: 278, failed: 2 },
    { date: "Oct 20", count: 310, success: 308, failed: 2 },
    { date: "Oct 21", count: 345, success: 342, failed: 3 },
    { date: "Oct 22", count: 290, success: 289, failed: 1 },
    { date: "Oct 23", count: 380, success: 376, failed: 4 },
    { date: "Oct 24", count: 410, success: 407, failed: 3 },
    { date: "Oct 25", count: 395, success: 392, failed: 3 },
    { date: "Oct 26", count: 320, success: 318, failed: 2 },
    { date: "Oct 27", count: 350, success: 347, failed: 3 },
    { date: "Oct 28", count: 420, success: 415, failed: 5 },
    { date: "Oct 29", count: 460, success: 456, failed: 4 },
    { date: "Oct 30", count: 435, success: 432, failed: 3 },
    { date: "Oct 31", count: 470, success: 466, failed: 4 },
    { date: "Nov 01", count: 412, success: 409, failed: 3 },
  ],
  topWorkflowsByVolume: [
    { name: "AI Duplicate Clustering & Triager Pre-check", runs: 890, hoursSaved: 112, successRate: "98.7%" },
    { name: "Subdomain Takeover & DNS Drift Sentinel", runs: 204, hoursSaved: 29, successRate: "97.5%" },
    { name: "P1 Critical Finding Emergency Escalation", runs: 142, hoursSaved: 54, successRate: "99.3%" },
    { name: "ServiceNow SIR Auto-Sync for Validated Vulnerabilities", runs: 96, hoursSaved: 48, successRate: "98.9%" },
    { name: "High-Value Bounty Approval Routing (> $5k)", runs: 38, hoursSaved: 36, successRate: "100%" },
  ],
  triggerDistribution: [
    { label: "Report Submitted", percentage: 48 },
    { label: "Asset DNS Drift", percentage: 22 },
    { label: "Report Accepted", percentage: 14 },
    { label: "Reward Proposed", percentage: 9 },
    { label: "SLA Warning / Breached", percentage: 7 },
  ],
  integrationUtilization: [
    { name: "Slack Block Kit", executions: 380, health: "100%" },
    { name: "Atlassian Jira", executions: 340, health: "100%" },
    { name: "Com Olho AI Studio", executions: 310, health: "100%" },
    { name: "ServiceNow ITSM", executions: 96, health: "92% (Auth Refresh Needed)" },
    { name: "PagerDuty Emergency Bus", executions: 42, health: "100%" },
  ],
};

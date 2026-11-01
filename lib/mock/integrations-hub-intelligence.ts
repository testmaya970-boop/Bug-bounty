export type IntegrationCategory =
  | "all"
  | "issue-tracking"
  | "communication"
  | "identity"
  | "source-control"
  | "itsm"
  | "cloud"
  | "security"
  | "developer";

export interface InstalledIntegration {
  id: string;
  name: string;
  slug: string;
  category: "issue-tracking" | "communication" | "identity" | "source-control" | "itsm" | "cloud" | "security" | "developer";
  categoryLabel: string;
  connectedWorkspace: string;
  ownerName: string;
  ownerEmail: string;
  status: "healthy" | "warning" | "disconnected" | "rate_limited";
  healthScore: number;
  version: string;
  lastSync: string;
  lastActivity: string;
  authMethod: "OAuth 2.0" | "SAML 2.0 / SCIM" | "API Bearer Token" | "HMAC Webhook" | "mTLS Certificate";
  permissions: string[];
  automationsCount: number;
  automations: string[];
  syncStats: {
    requestsToday: number;
    successRate: number;
    avgLatencyMs: number;
  };
  credentialsExpiry: string;
  credentialsStatus: "valid" | "expiring_soon" | "expired";
  warningReason?: string;
  errorLogSnippet?: string;
  docUrl: string;
}

export interface AvailableIntegration {
  id: string;
  name: string;
  slug: string;
  category: "issue-tracking" | "communication" | "identity" | "source-control" | "itsm" | "cloud" | "security" | "developer";
  categoryLabel: string;
  description: string;
  verified: boolean;
  popular: boolean;
  installed: boolean;
  authType: string;
  docUrl: string;
  features: string[];
}

export interface SyncHistoryItem {
  id: string;
  integrationName: string;
  integrationSlug: string;
  event: string;
  status: "success" | "warning" | "failed";
  timestamp: string;
  durationMs: number;
  triggeredBy: string;
  details: string;
  payloadSummary: string;
  canRetry?: boolean;
}

export interface WebhookEndpointItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  secretPrefix: string;
  status: "active" | "degraded" | "paused";
  successRate: number;
  deliveriesToday: number;
  lastDeliveryTime: string;
  lastStatusCode: number;
  retryStrategy: string;
}

export interface HubAuditTimelineEvent {
  id: string;
  action: string;
  integration: string;
  actor: string;
  timestamp: string;
  category: "connection" | "token_rotation" | "webhook" | "permission" | "sync_error";
  status: "success" | "warning" | "alert";
  details: string;
}

export const MOCK_INSTALLED_INTEGRATIONS: InstalledIntegration[] = [
  {
    id: "inst-jira",
    name: "Jira Software Cloud",
    slug: "jira",
    category: "issue-tracking",
    categoryLabel: "Issue Tracking",
    connectedWorkspace: "comolho.atlassian.net (Project: SEC)",
    ownerName: "Sarah Chen",
    ownerEmail: "sarah.chen@comolho.io",
    status: "healthy",
    healthScore: 99,
    version: "v3.4.1",
    lastSync: "3 minutes ago",
    lastActivity: "Auto-created remediation issue SEC-1042 for Critical SQLi",
    authMethod: "OAuth 2.0",
    permissions: [
      "Read & write issues and issue links",
      "Manage project issue attachments",
      "Listen to Jira webhook updates",
      "Synchronize custom vulnerability fields",
    ],
    automationsCount: 4,
    automations: [
      "Critical Bug Auto-Escalation to Engineering",
      "Bounty Payment Jira Resolution Closer",
      "Sprint Security Gatekeeper Sync",
      "CVSS v3.1 Bi-directional Field Sync",
    ],
    syncStats: {
      requestsToday: 1420,
      successRate: 99.8,
      avgLatencyMs: 184,
    },
    credentialsExpiry: "August 14, 2027",
    credentialsStatus: "valid",
    docUrl: "https://docs.unpatched.security/integrations/jira",
  },
  {
    id: "inst-github",
    name: "GitHub Enterprise Cloud",
    slug: "github",
    category: "source-control",
    categoryLabel: "Source Control",
    connectedWorkspace: "github.com/comolho (48 private repositories)",
    ownerName: "Marcus Brody",
    ownerEmail: "marcus.brody@comolho.io",
    status: "healthy",
    healthScore: 100,
    version: "v2.8.0",
    lastSync: "1 minute ago",
    lastActivity: "Verified commit push in core-api repository",
    authMethod: "OAuth 2.0",
    permissions: [
      "Read & write repository scopes",
      "Pull request reviews & status checks",
      "Secret scanning alert synchronization",
      "Webhook event delivery stream",
    ],
    automationsCount: 6,
    automations: [
      "PR Scope Security Linter",
      "Vulnerability Remediation Pull Request Bot",
      "CI/CD Secret Detection Pipeline Gate",
      "Automatic Asset Repo Ingestion",
    ],
    syncStats: {
      requestsToday: 4820,
      successRate: 100,
      avgLatencyMs: 92,
    },
    credentialsExpiry: "April 10, 2027",
    credentialsStatus: "valid",
    docUrl: "https://docs.unpatched.security/integrations/github",
  },
  {
    id: "inst-slack",
    name: "Slack Security Operations",
    slug: "slack",
    category: "communication",
    categoryLabel: "Communication",
    connectedWorkspace: "Com Olho Cyber Workspace (#sec-ops, #triage-feed)",
    ownerName: "Alex Vance",
    ownerEmail: "alex.vance@comolho.io",
    status: "healthy",
    healthScore: 100,
    version: "v4.1.0",
    lastSync: "Realtime (WebSocket)",
    lastActivity: "Dispatched P1 Critical Finding alert to #sec-ops",
    authMethod: "OAuth 2.0",
    permissions: [
      "Send messages and interactive rich blocks",
      "Create incident collaboration channels",
      "Execute slash commands (/unpatched triage)",
      "Manage channel user invites",
    ],
    automationsCount: 5,
    automations: [
      "Critical Finding Instant Dispatch",
      "SLA Breach Escalation Channel Alert",
      "Bounty Disbursal Notification",
      "Weekly Executive Digest Post",
    ],
    syncStats: {
      requestsToday: 890,
      successRate: 99.9,
      avgLatencyMs: 64,
    },
    credentialsExpiry: "November 01, 2027",
    credentialsStatus: "valid",
    docUrl: "https://docs.unpatched.security/integrations/slack",
  },
  {
    id: "inst-okta",
    name: "Okta Workforce Identity",
    slug: "okta",
    category: "identity",
    categoryLabel: "Identity & SSO",
    connectedWorkspace: "comolho.okta.com (42 provisioned users)",
    ownerName: "Alex Vance",
    ownerEmail: "alex.vance@comolho.io",
    status: "healthy",
    healthScore: 100,
    version: "v2.2.0",
    lastSync: "12 minutes ago",
    lastActivity: "SCIM user directory sync verified with 0 errors",
    authMethod: "SAML 2.0 / SCIM",
    permissions: [
      "Read user directory & groups",
      "Push SCIM profile attributes",
      "Validate FIDO2 WebAuthn assertions",
      "Automated deprovisioning hook",
    ],
    automationsCount: 3,
    automations: [
      "Auto-Provisioning Triager Role",
      "FIDO2 Security Key Watchdog",
      "Dormant Account Auto-Suspension",
    ],
    syncStats: {
      requestsToday: 320,
      successRate: 100,
      avgLatencyMs: 140,
    },
    credentialsExpiry: "June 30, 2027",
    credentialsStatus: "valid",
    docUrl: "https://docs.unpatched.security/integrations/okta",
  },
  {
    id: "inst-servicenow",
    name: "ServiceNow ITSM Connector",
    slug: "servicenow",
    category: "itsm",
    categoryLabel: "ITSM",
    connectedWorkspace: "comolho.service-now.com (Incident/Change)",
    ownerName: "Marcus Brody",
    ownerEmail: "marcus.brody@comolho.io",
    status: "warning",
    healthScore: 82,
    version: "v1.9.4",
    lastSync: "45 minutes ago",
    lastActivity: "Synchronized change request CHG003941",
    authMethod: "OAuth 2.0",
    permissions: [
      "Create & update ServiceNow incidents",
      "Read CMDB CI assets",
      "Update change management approvals",
    ],
    automationsCount: 2,
    automations: [
      "ITSM Incident Auto-Ticketing",
      "Emergency Scope Change Synchronization",
    ],
    syncStats: {
      requestsToday: 210,
      successRate: 94.2,
      avgLatencyMs: 420,
    },
    credentialsExpiry: "November 12, 2026",
    credentialsStatus: "expiring_soon",
    warningReason: "OAuth client token expiring in 12 days; 3 API calls throttled by instance rate limit.",
    errorLogSnippet: "HTTP 429: Too Many Requests on endpoint /api/now/table/incident (rate limit 5 req/s exceeded).",
    docUrl: "https://docs.unpatched.security/integrations/servicenow",
  },
  {
    id: "inst-datadog",
    name: "Datadog Security & SIEM",
    slug: "datadog",
    category: "security",
    categoryLabel: "Security & SIEM",
    connectedWorkspace: "http-intake.logs.datadoghq.com (US1)",
    ownerName: "Sarah Chen",
    ownerEmail: "sarah.chen@comolho.io",
    status: "healthy",
    healthScore: 100,
    version: "v2.0",
    lastSync: "30 seconds ago",
    lastActivity: "Streamed tamper-evident audit log batch #94821",
    authMethod: "API Bearer Token",
    permissions: [
      "Write audit event stream",
      "Submit security metrics",
      "Push anomaly telemetry",
    ],
    automationsCount: 3,
    automations: [
      "SIEM Audit Forwarder",
      "High Risk Anomaly Detection Alert",
      "CVSS Metric Trend Stream",
    ],
    syncStats: {
      requestsToday: 8400,
      successRate: 99.99,
      avgLatencyMs: 48,
    },
    credentialsExpiry: "Permanent Token",
    credentialsStatus: "valid",
    docUrl: "https://docs.unpatched.security/integrations/datadog",
  },
  {
    id: "inst-gitlab",
    name: "GitLab Self-Managed",
    slug: "gitlab",
    category: "source-control",
    categoryLabel: "Source Control",
    connectedWorkspace: "gitlab.internal.comolho.io",
    ownerName: "James Thornton",
    ownerEmail: "j.thornton@comolho.io",
    status: "disconnected",
    healthScore: 0,
    version: "v1.4",
    lastSync: "14 days ago",
    lastActivity: "Connection timed out during webhook delivery",
    authMethod: "mTLS Certificate",
    permissions: [
      "Read project repository trees",
      "Submit merge request discussions",
    ],
    automationsCount: 1,
    automations: ["GitLab Vulnerability Mirror"],
    syncStats: {
      requestsToday: 0,
      successRate: 0,
      avgLatencyMs: 0,
    },
    credentialsExpiry: "October 18, 2026",
    credentialsStatus: "expired",
    warningReason: "mTLS client certificate expired; server rejected TLS handshake with SSL_ERROR_EXPIRED_CERT.",
    errorLogSnippet: "Error: connect ECONNREFUSED gitlab.internal.comolho.io:443 - SSL Certificate Verification Failed.",
    docUrl: "https://docs.unpatched.security/integrations/gitlab",
  },
];

export const MOCK_AVAILABLE_INTEGRATIONS: AvailableIntegration[] = [
  // Issue Tracking
  {
    id: "mkt-jira",
    name: "Jira Software",
    slug: "jira",
    category: "issue-tracking",
    categoryLabel: "Issue Tracking",
    description: "Two-way issue tracking, automatic remediation ticket creation, and project status sync.",
    verified: true,
    popular: true,
    installed: true,
    authType: "OAuth 2.0 Cloud",
    docUrl: "https://docs.unpatched.security/integrations/jira",
    features: ["Bi-directional field sync", "Automatic issue closing", "Custom workflow transitions"],
  },
  {
    id: "mkt-linear",
    name: "Linear",
    slug: "linear",
    category: "issue-tracking",
    categoryLabel: "Issue Tracking",
    description: "Ultra-fast issue creation and cycle tracking for security engineering teams.",
    verified: true,
    popular: true,
    installed: false,
    authType: "OAuth 2.0",
    docUrl: "https://docs.unpatched.security/integrations/linear",
    features: ["Team project routing", "Label synchronization", "Instant webhook sync"],
  },
  {
    id: "mkt-gh-issues",
    name: "GitHub Issues",
    slug: "github-issues",
    category: "issue-tracking",
    categoryLabel: "Issue Tracking",
    description: "Convert verified bug bounty reports into private GitHub issues with security labels.",
    verified: true,
    popular: true,
    installed: true,
    authType: "GitHub App",
    docUrl: "https://docs.unpatched.security/integrations/github",
    features: ["Private security advisories", "Milestone assignment", "Branch linking"],
  },
  {
    id: "mkt-azure-devops",
    name: "Azure DevOps Boards",
    slug: "azure-devops",
    category: "issue-tracking",
    categoryLabel: "Issue Tracking",
    description: "Enterprise work item creation and sprint board vulnerability tracking.",
    verified: true,
    popular: false,
    installed: false,
    authType: "OAuth 2.0 / PAT",
    docUrl: "https://docs.unpatched.security/integrations/azure-devops",
    features: ["Work item hierarchies", "Area path routing", "State transitions"],
  },

  // Communication
  {
    id: "mkt-slack",
    name: "Slack",
    slug: "slack",
    category: "communication",
    categoryLabel: "Communication",
    description: "Real-time alerts, critical finding triage feeds, and interactive slash commands.",
    verified: true,
    popular: true,
    installed: true,
    authType: "Slack App OAuth",
    docUrl: "https://docs.unpatched.security/integrations/slack",
    features: ["Dedicated incident channels", "Interactive action buttons", "Weekly KPI summary"],
  },
  {
    id: "mkt-teams",
    name: "Microsoft Teams",
    slug: "teams",
    category: "communication",
    categoryLabel: "Communication",
    description: "Adaptive Cards and alert streaming for Microsoft 365 security workgroups.",
    verified: true,
    popular: true,
    installed: false,
    authType: "Azure AD App",
    docUrl: "https://docs.unpatched.security/integrations/teams",
    features: ["Adaptive card payload", "Channel mention hooks", "Teams meeting launch"],
  },
  {
    id: "mkt-discord",
    name: "Discord",
    slug: "discord",
    category: "communication",
    categoryLabel: "Communication",
    description: "Community notifications, researcher event webhooks, and CTF alert broadcasts.",
    verified: true,
    popular: false,
    installed: false,
    authType: "Webhook URL",
    docUrl: "https://docs.unpatched.security/integrations/discord",
    features: ["Rich embed messages", "Role tagging", "Channel segregation"],
  },

  // Identity
  {
    id: "mkt-okta",
    name: "Okta Workforce Identity",
    slug: "okta",
    category: "identity",
    categoryLabel: "Identity & SSO",
    description: "SAML 2.0 Single Sign-On, SCIM 2.0 provisioning, and FIDO2 policy enforcement.",
    verified: true,
    popular: true,
    installed: true,
    authType: "SAML 2.0 / SCIM",
    docUrl: "https://docs.unpatched.security/integrations/okta",
    features: ["Automated user sync", "Group-to-role mapping", "Immediate deprovisioning"],
  },
  {
    id: "mkt-google-workspace",
    name: "Google Workspace Admin",
    slug: "google",
    category: "identity",
    categoryLabel: "Identity & SSO",
    description: "Google OAuth 2.0 login and Google Cloud Directory group synchronization.",
    verified: true,
    popular: true,
    installed: false,
    authType: "OIDC / SAML",
    docUrl: "https://docs.unpatched.security/integrations/google",
    features: ["Hosted domain check", "Directory group sync", "Titan key support"],
  },
  {
    id: "mkt-entra",
    name: "Microsoft Entra ID",
    slug: "entra",
    category: "identity",
    categoryLabel: "Identity & SSO",
    description: "Azure AD enterprise SSO with conditional access policies and SCIM provisioning.",
    verified: true,
    popular: true,
    installed: false,
    authType: "SAML 2.0 / SCIM",
    docUrl: "https://docs.unpatched.security/integrations/entra",
    features: ["Conditional access", "Intune device compliance", "Dynamic group sync"],
  },
  {
    id: "mkt-onelogin",
    name: "OneLogin by One Identity",
    slug: "onelogin",
    category: "identity",
    categoryLabel: "Identity & SSO",
    description: "Cloud identity management with multi-factor authentication and user lifecycle rules.",
    verified: true,
    popular: false,
    installed: false,
    authType: "SAML 2.0",
    docUrl: "https://docs.unpatched.security/integrations/onelogin",
    features: ["SmartFactor MFA", "Real-time provisioning", "App catalog mapping"],
  },

  // Source Control
  {
    id: "mkt-github",
    name: "GitHub",
    slug: "github",
    category: "source-control",
    categoryLabel: "Source Control",
    description: "Cryptographic repository ownership verification, commit scanning, and pull request checks.",
    verified: true,
    popular: true,
    installed: true,
    authType: "GitHub App",
    docUrl: "https://docs.unpatched.security/integrations/github",
    features: ["Private repo attestation", "Secret scanning alerts", "Security status badges"],
  },
  {
    id: "mkt-gitlab",
    name: "GitLab",
    slug: "gitlab",
    category: "source-control",
    categoryLabel: "Source Control",
    description: "Support for GitLab SaaS and Self-Managed instances for vulnerability issue creation.",
    verified: true,
    popular: true,
    installed: true,
    authType: "OAuth / mTLS",
    docUrl: "https://docs.unpatched.security/integrations/gitlab",
    features: ["CI/CD security reports", "Epics integration", "Subgroup scoping"],
  },
  {
    id: "mkt-bitbucket",
    name: "Bitbucket Cloud",
    slug: "bitbucket",
    category: "source-control",
    categoryLabel: "Source Control",
    description: "Repository scoping and pull request security checks for Atlassian Bitbucket teams.",
    verified: true,
    popular: false,
    installed: false,
    authType: "OAuth 2.0",
    docUrl: "https://docs.unpatched.security/integrations/bitbucket",
    features: ["Workspace repo sync", "Branch permission sync", "Pipeline status check"],
  },

  // ITSM
  {
    id: "mkt-servicenow",
    name: "ServiceNow",
    slug: "servicenow",
    category: "itsm",
    categoryLabel: "ITSM",
    description: "Enterprise IT Service Management incident creation and CMDB asset configuration binding.",
    verified: true,
    popular: true,
    installed: true,
    authType: "OAuth 2.0",
    docUrl: "https://docs.unpatched.security/integrations/servicenow",
    features: ["Incident management", "CMDB integration", "Emergency change requests"],
  },
  {
    id: "mkt-freshservice",
    name: "Freshservice",
    slug: "freshservice",
    category: "itsm",
    categoryLabel: "ITSM",
    description: "Modern cloud service desk incident routing and automated SLA breach escalations.",
    verified: true,
    popular: false,
    installed: false,
    authType: "API Key",
    docUrl: "https://docs.unpatched.security/integrations/freshservice",
    features: ["Ticket assignment", "Priority mapping", "Agent dispatch"],
  },

  // Cloud
  {
    id: "mkt-aws",
    name: "Amazon Web Services (AWS)",
    slug: "aws",
    category: "cloud",
    categoryLabel: "Cloud Infrastructure",
    description: "Cross-account IAM role verification and AWS Security Hub automated finding ingestion.",
    verified: true,
    popular: true,
    installed: false,
    authType: "OIDC Role",
    docUrl: "https://docs.unpatched.security/integrations/aws",
    features: ["Security Hub ASFF sync", "Cross-account OIDC", "CloudTrail telemetry"],
  },
  {
    id: "mkt-azure",
    name: "Microsoft Azure Cloud",
    slug: "azure",
    category: "cloud",
    categoryLabel: "Cloud Infrastructure",
    description: "Azure subscription perimeter verification and Microsoft Defender for Cloud sync.",
    verified: true,
    popular: true,
    installed: false,
    authType: "Managed Identity",
    docUrl: "https://docs.unpatched.security/integrations/azure",
    features: ["Defender for Cloud", "Resource graph sync", "Subscription attestation"],
  },
  {
    id: "mkt-gcp",
    name: "Google Cloud Platform (GCP)",
    slug: "gcp",
    category: "cloud",
    categoryLabel: "Cloud Infrastructure",
    description: "GCP organization perimeter binding and Security Command Center event delivery.",
    verified: true,
    popular: true,
    installed: false,
    authType: "Workload Identity",
    docUrl: "https://docs.unpatched.security/integrations/gcp",
    features: ["Security Command Center", "Asset Inventory API", "Pub/Sub streams"],
  },

  // Security & SIEM
  {
    id: "mkt-splunk",
    name: "Splunk Enterprise & Cloud",
    slug: "splunk",
    category: "security",
    categoryLabel: "Security & SIEM",
    description: "HTTP Event Collector (HEC) ingestion of all bug bounty triage and audit actions.",
    verified: true,
    popular: true,
    installed: false,
    authType: "HEC Token",
    docUrl: "https://docs.unpatched.security/integrations/splunk",
    features: ["CIM compliant format", "SSL verified streaming", "Dashboard templates"],
  },
  {
    id: "mkt-sentinel",
    name: "Microsoft Sentinel",
    slug: "sentinel",
    category: "security",
    categoryLabel: "Security & SIEM",
    description: "Data connector for Microsoft Sentinel log analytics workspace with security alert rules.",
    verified: true,
    popular: true,
    installed: false,
    authType: "REST Data API",
    docUrl: "https://docs.unpatched.security/integrations/sentinel",
    features: ["Incident correlation", "KQL query support", "Playbook automation"],
  },
  {
    id: "mkt-crowdstrike",
    name: "CrowdStrike Falcon",
    slug: "crowdstrike",
    category: "security",
    categoryLabel: "Security & SIEM",
    description: "Host asset matching and endpoint risk telemetry correlation with bounty findings.",
    verified: true,
    popular: true,
    installed: false,
    authType: "Falcon API Client",
    docUrl: "https://docs.unpatched.security/integrations/crowdstrike",
    features: ["AID asset resolution", "Spotlight CVE matching", "Falcon Fusion triggers"],
  },
  {
    id: "mkt-snyk",
    name: "Snyk Security",
    slug: "snyk",
    category: "security",
    categoryLabel: "Security & SIEM",
    description: "Correlate external researcher findings with internal open source dependencies and SAST alerts.",
    verified: true,
    popular: false,
    installed: false,
    authType: "API Key",
    docUrl: "https://docs.unpatched.security/integrations/snyk",
    features: ["Snyk Code correlation", "License compliance check", "Container scan binding"],
  },

  // Developer
  {
    id: "mkt-webhooks",
    name: "Custom Webhook Bus",
    slug: "webhooks",
    category: "developer",
    categoryLabel: "Developer Tools",
    description: "Cryptographically signed (HMAC-SHA256) JSON webhooks delivered to your internal infrastructure.",
    verified: true,
    popular: true,
    installed: true,
    authType: "HMAC-SHA256 Secret",
    docUrl: "https://docs.unpatched.security/integrations/webhooks",
    features: ["Automatic retries", "Secret rotation", "Delivery replay tool"],
  },
  {
    id: "mkt-rest-api",
    name: "Enterprise REST API",
    slug: "rest-api",
    category: "developer",
    categoryLabel: "Developer Tools",
    description: "Full OpenAPI 3.1 specification for programmatic report triage, bounty payouts, and asset management.",
    verified: true,
    popular: true,
    installed: true,
    authType: "Bearer Service Tokens",
    docUrl: "https://docs.unpatched.security/api/v1",
    features: ["Rate limit: 1,000 req/min", "Granular scopes", "SDKs for TypeScript & Python"],
  },
  {
    id: "mkt-graphql",
    name: "GraphQL Federation Mesh",
    slug: "graphql",
    category: "developer",
    categoryLabel: "Developer Tools",
    description: "High-performance GraphQL query and subscription mesh for real-time finding telemetry.",
    verified: true,
    popular: false,
    installed: false,
    authType: "Bearer Token",
    docUrl: "https://docs.unpatched.security/graphql",
    features: ["Real-time subscriptions", "Schema introspection", "Batch query resolution"],
  },
  {
    id: "mkt-cli",
    name: "Unpatched CLI (`unp`)",
    slug: "cli",
    category: "developer",
    categoryLabel: "Developer Tools",
    description: "Command-line toolkit for developers and DevSecOps engineers to triage reports and run scopes.",
    verified: true,
    popular: false,
    installed: false,
    authType: "API Key",
    docUrl: "https://docs.unpatched.security/cli",
    features: ["Shell autocompletion", "CI/CD headless mode", "Bulk export utilities"],
  },
];

export const MOCK_SYNC_HISTORY: SyncHistoryItem[] = [
  {
    id: "sync-01",
    integrationName: "Jira Software Cloud",
    integrationSlug: "jira",
    event: "Remediation Issue Created",
    status: "success",
    timestamp: "3 minutes ago",
    durationMs: 184,
    triggeredBy: "Sarah Chen (Security Admin)",
    details: "Created Jira ticket SEC-1042 for Report #4892 (SQL Injection in Order Ingest).",
    payloadSummary: "HTTP 201 Created (issue_id: 104928, key: SEC-1042)",
  },
  {
    id: "sync-02",
    integrationName: "GitHub Enterprise Cloud",
    integrationSlug: "github",
    event: "Security Scope Sync",
    status: "success",
    timestamp: "8 minutes ago",
    durationMs: 92,
    triggeredBy: "Automated Cron Worker",
    details: "Synchronized branch protection rules and private repository inventory across 48 repos.",
    payloadSummary: "48 repositories scanned, 0 drift anomalies detected.",
  },
  {
    id: "sync-03",
    integrationName: "ServiceNow ITSM Connector",
    integrationSlug: "servicenow",
    event: "Change Request Sync",
    status: "warning",
    timestamp: "45 minutes ago",
    durationMs: 840,
    triggeredBy: "Marcus Brody",
    details: "Change record CHG003941 updated, but batch attachment sync throttled (HTTP 429).",
    payloadSummary: "HTTP 429: Too Many Requests on endpoint /api/now/table/incident.",
    canRetry: true,
  },
  {
    id: "sync-04",
    integrationName: "Slack Security Operations",
    integrationSlug: "slack",
    event: "Critical Notification Dispatched",
    status: "success",
    timestamp: "1 hour ago",
    durationMs: 64,
    triggeredBy: "Report Triage Engine",
    details: "Delivered interactive message with CVSS 9.8 alert to channel #sec-ops.",
    payloadSummary: "HTTP 200 OK (ts: 1730419200.001900)",
  },
  {
    id: "sync-05",
    integrationName: "GitLab Self-Managed",
    integrationSlug: "gitlab",
    event: "Webhook Handshake Verification",
    status: "failed",
    timestamp: "3 hours ago",
    durationMs: 1520,
    triggeredBy: "System Health Monitor",
    details: "Connection timed out: SSL certificate expired on gitlab.internal.comolho.io.",
    payloadSummary: "Error: connect ECONNREFUSED gitlab.internal.comolho.io:443",
    canRetry: true,
  },
  {
    id: "sync-06",
    integrationName: "Okta Workforce Identity",
    integrationSlug: "okta",
    event: "SCIM Directory Sync",
    status: "success",
    timestamp: "5 hours ago",
    durationMs: 140,
    triggeredBy: "Okta SCIM Ingest Hook",
    details: "Refreshed user attributes and security group mapping for 42 workforce members.",
    payloadSummary: "42 users validated, 6 group memberships synced.",
  },
];

export const MOCK_WEBHOOK_ENDPOINTS: WebhookEndpointItem[] = [
  {
    id: "wh-01",
    name: "Production SIEM Audit Stream",
    url: "https://siem-collector.internal.comolho.io/v1/unpatched-ingest",
    events: ["report.created", "report.triaged", "bounty.paid", "member.role_changed"],
    secretPrefix: "whsec_948a2bc...",
    status: "active",
    successRate: 99.98,
    deliveriesToday: 4180,
    lastDeliveryTime: "42 seconds ago",
    lastStatusCode: 200,
    retryStrategy: "Exponential backoff (3 retries)",
  },
  {
    id: "wh-02",
    name: "DevSecOps Jira Auto-Ticket Dispatcher",
    url: "https://automation.internal.comolho.io/webhooks/jira-bridge",
    events: ["report.triaged", "finding.severity_changed"],
    secretPrefix: "whsec_21bc99a...",
    status: "active",
    successRate: 99.8,
    deliveriesToday: 820,
    lastDeliveryTime: "8 minutes ago",
    lastStatusCode: 200,
    retryStrategy: "Immediate retry + dead letter queue",
  },
  {
    id: "wh-03",
    name: "Cloudflare Workers WAF Blocklist Sync",
    url: "https://waf-sync.comolho.workers.dev/feed",
    events: ["scope.asset_verified", "scope.asset_quarantined"],
    secretPrefix: "whsec_77df41e...",
    status: "active",
    successRate: 100,
    deliveriesToday: 140,
    lastDeliveryTime: "1 hour ago",
    lastStatusCode: 200,
    retryStrategy: "Exponential backoff",
  },
  {
    id: "wh-04",
    name: "Legacy Security Audit Backup",
    url: "https://backup-logs.staging.comolho.net/ingest",
    events: ["audit.*"],
    secretPrefix: "whsec_04ee88f...",
    status: "degraded",
    successRate: 88.5,
    deliveriesToday: 64,
    lastDeliveryTime: "2 hours ago",
    lastStatusCode: 504,
    retryStrategy: "Manual retry required",
  },
];

export const MOCK_HUB_AUDIT_TIMELINE: HubAuditTimelineEvent[] = [
  {
    id: "hub-aud-01",
    action: "Jira Cloud Connected",
    integration: "Jira Software",
    actor: "Sarah Chen",
    timestamp: "Today at 21:10",
    category: "connection",
    status: "success",
    details: "Granted OAuth 2.0 scopes for comolho.atlassian.net.",
  },
  {
    id: "hub-aud-02",
    action: "API Bearer Token Rotated",
    integration: "Datadog Security & SIEM",
    actor: "Sarah Chen",
    timestamp: "Today at 18:40",
    category: "token_rotation",
    status: "success",
    details: "Rotated ingest token to maintain 90-day rotation compliance.",
  },
  {
    id: "hub-aud-03",
    action: "ServiceNow Rate Limit Throttled",
    integration: "ServiceNow ITSM Connector",
    actor: "System Worker",
    timestamp: "Today at 17:15",
    category: "sync_error",
    status: "warning",
    details: "Endpoint /api/now/table/incident returned HTTP 429 Too Many Requests.",
  },
  {
    id: "hub-aud-04",
    action: "Webhook Endpoint Secret Rotated",
    integration: "Production SIEM Audit Stream",
    actor: "Alex Vance",
    timestamp: "Oct 28, 2026",
    category: "webhook",
    status: "success",
    details: "Rotated HMAC-SHA256 signature secret.",
  },
  {
    id: "hub-aud-05",
    action: "GitLab Handshake Failed",
    integration: "GitLab Self-Managed",
    actor: "Health Monitor",
    timestamp: "Oct 26, 2026",
    category: "sync_error",
    status: "alert",
    details: "mTLS Certificate expired on gitlab.internal.comolho.io.",
  },
];

export type SettingsCategoryId =
  | "general"
  | "regional"
  | "program-defaults"
  | "researcher-defaults"
  | "notifications"
  | "feature-flags"
  | "api-developer"
  | "data-management"
  | "privacy"
  | "advanced"
  | "danger";

export interface FeatureFlagItem {
  id: string;
  key: string;
  name: string;
  description: string;
  category: "Core Platform" | "Intelligence & Automation" | "Developer & API" | "Early Access";
  rolloutStatus: "GA" | "Enterprise" | "Beta" | "Experimental";
  enabled: boolean;
  requiresApproval?: boolean;
  impactNote: string;
  updatedAt: string;
}

export interface OrgApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  environment: "production" | "staging" | "sandbox";
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  ipRestrictions: string[];
  status: "Active" | "Expiring Soon" | "Revoked";
}

export interface CustomHeaderRule {
  id: string;
  headerName: string;
  headerValueMasked: string;
  scope: "All Outbound Webhooks" | "Asset Verification Probes" | "SCIM Provisioning";
  enabled: boolean;
}

export interface CustomMetadataEntry {
  id: string;
  key: string;
  value: string;
  visibility: "Internal Only" | "API Exposed" | "Audit Log Tag";
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  type: "Automated Daily" | "Pre-Change Snapshot" | "Manual Export";
  size: string;
  encrypted: boolean;
  region: string;
  status: "Verified" | "Archived";
}

export interface DangerActionItem {
  id:
    | "transfer-ownership"
    | "archive-org"
    | "delete-org"
    | "remove-programs"
    | "disconnect-integrations"
    | "delete-api-keys";
  title: string;
  description: string;
  impactSummary: string;
  buttonLabel: string;
  severity: "warning" | "critical";
  requiresMfa: boolean;
  confirmationPhrase: string;
}

export interface OrganizationSettingsState {
  // 1. General
  general: {
    organizationName: string;
    legalEntityName: string;
    workspaceSlug: string;
    organizationIdentifier: string;
    defaultLanguage: string;
    timeZone: string;
    dateFormat: string;
    currency: string;
    businessHoursStart: string;
    businessHoursEnd: string;
    organizationOwnerName: string;
    organizationOwnerEmail: string;
    organizationOwnerRole: string;
    supportContactEmail: string;
    securityEscalationEmail: string;
    billingContactEmail: string;
  };
  // 2. Regional Settings
  regional: {
    country: string;
    region: string;
    dataResidencyZone: string;
    locale: string;
    currency: string;
    exchangeRateLock: boolean;
    taxRegion: string;
    vatOrTaxId: string;
    workingDays: string[];
    businessHoursWindow: string;
    slaClockMode: "Business Hours Only" | "24x7 Continuous" | "Severity-Tiered (P1 24x7, P2-P4 Business)";
    holidayCalendar: string;
    upcomingHolidaysCount: number;
  };
  // 3. Program Defaults
  programDefaults: {
    defaultVisibility: "Private Invite-Only" | "Public Listed" | "Unlisted Application";
    defaultSlaFirstResponseHours: number;
    defaultSlaTriageHours: number;
    defaultSlaBountyHours: number;
    defaultSlaResolutionDays: number;
    defaultSeverityMatrix: "CVSS v3.1 Standard" | "CVSS v4.0 Enterprise" | "Business Risk Contextual";
    defaultRewardCurrency: string;
    defaultIntakeWorkflow: "Com Olho Managed Triage" | "Internal SecOps Queue" | "Hybrid Co-Triage";
    defaultScopeTemplate: string;
    defaultAutomationPack: string;
    defaultNotificationRouting: string;
    requirePoCAttachment: boolean;
    autoDeduplicateReports: boolean;
  };
  // 4. Researcher Defaults
  researcherDefaults: {
    defaultHallOfFameVisibility: "Public Opt-In" | "Public By Default" | "Private Verified Only";
    defaultCommunicationMode: "Structured Thread + Markdown" | "Strict Milestone Updates Only" | "PGP Encrypted Allowed";
    defaultDisclosureTimelineDays: number;
    disclosurePolicyMode: "Coordinated Mutual Agreement" | "Scheduled 90-Day Standard" | "Restricted / No Public Disclosure";
    defaultSafeHarborTier: "Full Gold Safe Harbor" | "Standard Good-Faith Protection" | "Custom Legal Addendum";
    minSignalScoreForPrivateInvite: number;
    requireIdentityKycForPayout: boolean;
    requireBackgroundCheckForCriticalAssets: boolean;
    reputationPenaltyOnNdaBreach: boolean;
    allowCollaborativeSplitBounties: boolean;
  };
  // 5. Notifications
  notifications: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    slackEnabled: boolean;
    slackDefaultChannel: string;
    teamsEnabled: boolean;
    teamsWebhookTarget: string;
    digestFrequency: "Real-Time" | "Hourly Batch" | "Daily Executive Digest" | "Weekly Rollup";
    maintenanceAlerts: boolean;
    securityAlerts: boolean;
    billingAlerts: boolean;
    slaBreachPreWarningMinutes: number;
    criticalP1PagerDutyEscalation: boolean;
  };
  // 6. Feature Flags
  featureFlags: FeatureFlagItem[];
  // 7. API & Developer
  apiDeveloper: {
    apiKeys: OrgApiKeyItem[];
    webhookSignatureAlgorithm: "HMAC-SHA256 (v2)" | "Ed25519 Asymmetric";
    webhookRetryPolicy: "Exponential Backoff (7 attempts / 24h)" | "Linear (5 attempts / 1h)" | "Fail Fast (No Retry)";
    webhookTimeoutSeconds: number;
    rateLimitRequestsPerMinute: number;
    rateLimitBurstConcurrency: number;
    graphqlComplexityLimit: number;
    allowedOrigins: string[];
    developerMode: boolean;
    sdkAccessEnabled: boolean;
    openApiSpecExposure: "Authenticated Org Admins" | "All Workspace Members" | "Disabled";
  };
  // 8. Data Management
  dataManagement: {
    automatedBackupsEnabled: boolean;
    backupFrequency: "Every 6 Hours" | "Daily at 02:00 UTC" | "Weekly Snapshot";
    backupEncryptionKeyMode: "Platform KMS (AES-256-GCM)" | "Customer-Managed Key (AWS KMS BYOK)";
    reportRetentionPolicy: "7 Years (Compliance Standard)" | "5 Years" | "3 Years" | "Indefinite";
    attachmentSanitizationOnArchive: boolean;
    auditLogExportS3Bucket: string;
    lastExportCompletedAt: string;
    snapshots: BackupSnapshot[];
  };
  // 9. Privacy
  privacy: {
    piiAutoRedactionInAttachments: boolean;
    exifMetadataStripping: boolean;
    researcherIpAnonymization: boolean;
    consentBannerEnforcement: "Strict GDPR / UK-GDPR" | "CCPA / CPRA Notice" | "Global Minimal";
    cookiePreferencePolicy: "Essential Security Cookies Only" | "Essential + Telemetry";
    researcherProfilePrivacy: "Pseudonymous Handle Only" | "Verified Legal Name to Org Admins";
    organizationDirectoryVisibility: "Public Verified Enterprise" | "Authenticated Researchers Only" | "Stealth / Invite-Only";
    dpoContactEmail: string;
  };
  // 10. Advanced
  advanced: {
    environmentMode: "Production" | "Staging Mirror" | "Hybrid Evaluation";
    sandboxModeEnabled: boolean;
    maintenanceModeEnabled: boolean;
    maintenanceBannerMessage: string;
    strictIpAllowlistEnforcement: boolean;
    enforceHardwareWebAuthnForAdmins: boolean;
    customHeaders: CustomHeaderRule[];
    customMetadata: CustomMetadataEntry[];
  };
}

export const INITIAL_ORGANIZATION_SETTINGS: OrganizationSettingsState = {
  general: {
    organizationName: "Northwind Cloud Security",
    legalEntityName: "Northwind Cloud Infrastructure, Inc.",
    workspaceSlug: "northwind-cloud",
    organizationIdentifier: "org_nw_01J9X7K2A8V4M6P3Q9R5",
    defaultLanguage: "en-US",
    timeZone: "America/New_York (UTC-05:00)",
    dateFormat: "YYYY-MM-DD (ISO 8601)",
    currency: "USD ($)",
    businessHoursStart: "08:30",
    businessHoursEnd: "18:00",
    organizationOwnerName: "Elena Vance",
    organizationOwnerEmail: "e.vance@northwindcloud.io",
    organizationOwnerRole: "VP of Information Security (Primary Owner)",
    supportContactEmail: "secops-intake@northwindcloud.io",
    securityEscalationEmail: "psirt-pageduty@northwindcloud.io",
    billingContactEmail: "finops-ap@northwindcloud.io",
  },
  regional: {
    country: "United States",
    region: "US-East (Northern Virginia / Ashburn)",
    dataResidencyZone: "US Sovereign & Commercial Multi-AZ",
    locale: "en-US (United States)",
    currency: "USD — United States Dollar",
    exchangeRateLock: true,
    taxRegion: "US Federal (IRS W-9 / W-8BEN Jurisdiction)",
    vatOrTaxId: "EIN 84-3920184",
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    businessHoursWindow: "08:30 – 18:00 EST/EDT",
    slaClockMode: "Severity-Tiered (P1 24x7, P2-P4 Business)",
    holidayCalendar: "NYSE / US Federal + 2 Security Stand-Down Days",
    upcomingHolidaysCount: 9,
  },
  programDefaults: {
    defaultVisibility: "Private Invite-Only",
    defaultSlaFirstResponseHours: 12,
    defaultSlaTriageHours: 36,
    defaultSlaBountyHours: 120,
    defaultSlaResolutionDays: 30,
    defaultSeverityMatrix: "CVSS v4.0 Enterprise",
    defaultRewardCurrency: "USD ($)",
    defaultIntakeWorkflow: "Hybrid Co-Triage",
    defaultScopeTemplate: "Cloud Core API + Wildcard Subdomains v3",
    defaultAutomationPack: "Enterprise P1 Escalation + Jira Bi-Directional Sync",
    defaultNotificationRouting: "#sec-bounty-triage + PagerDuty SecOps",
    requirePoCAttachment: true,
    autoDeduplicateReports: true,
  },
  researcherDefaults: {
    defaultHallOfFameVisibility: "Public Opt-In",
    defaultCommunicationMode: "Structured Thread + Markdown",
    defaultDisclosureTimelineDays: 90,
    disclosurePolicyMode: "Coordinated Mutual Agreement",
    defaultSafeHarborTier: "Full Gold Safe Harbor",
    minSignalScoreForPrivateInvite: 4.5,
    requireIdentityKycForPayout: true,
    requireBackgroundCheckForCriticalAssets: false,
    reputationPenaltyOnNdaBreach: true,
    allowCollaborativeSplitBounties: true,
  },
  notifications: {
    emailEnabled: true,
    inAppEnabled: true,
    slackEnabled: true,
    slackDefaultChannel: "#sec-bounty-triage",
    teamsEnabled: false,
    teamsWebhookTarget: "https://northwind.webhook.office.com/webhookb2/secops-bridge",
    digestFrequency: "Daily Executive Digest",
    maintenanceAlerts: true,
    securityAlerts: true,
    billingAlerts: true,
    slaBreachPreWarningMinutes: 120,
    criticalP1PagerDutyEscalation: true,
  },
  featureFlags: [
    {
      id: "ff-private-programs",
      key: "org.programs.private_invite_engine",
      name: "Private Bug Bounty Programs",
      description: "Launch invitation-only security programs with custom NDA gates and signal-based researcher matching.",
      category: "Core Platform",
      rolloutStatus: "GA",
      enabled: true,
      impactNote: "4 active private programs currently rely on this module.",
      updatedAt: "2026-03-14",
    },
    {
      id: "ff-public-programs",
      key: "org.programs.public_directory",
      name: "Public Bug Bounty Programs",
      description: "List public bounty programs in the Com Olho global directory with open researcher submissions.",
      category: "Core Platform",
      rolloutStatus: "GA",
      enabled: true,
      impactNote: "2 public programs visible in directory.",
      updatedAt: "2026-02-20",
    },
    {
      id: "ff-vdp",
      key: "org.programs.vdp_intake",
      name: "Vulnerability Disclosure Program (VDP)",
      description: "Enable ISO 29147 compliant public disclosure portals and security.txt hosted intake workflows.",
      category: "Core Platform",
      rolloutStatus: "GA",
      enabled: true,
      impactNote: "Powers /.well-known/security.txt intake endpoint.",
      updatedAt: "2026-01-19",
    },
    {
      id: "ff-ai-triage",
      key: "org.intelligence.assisted_dedup_clustering",
      name: "Assisted Report Clustering & PoC Verification",
      description: "Automatically cluster duplicate vulnerability submissions and validate CVSS vector consistency during intake.",
      category: "Intelligence & Automation",
      rolloutStatus: "Enterprise",
      enabled: true,
      impactNote: "Zero external model training; runs in isolated tenant VPC.",
      updatedAt: "2026-03-28",
    },
    {
      id: "ff-api-access",
      key: "org.developer.rest_graphql_api",
      name: "Organization REST & GraphQL API Access",
      description: "Allow programmatic access to reports, asset scopes, payouts, and audit logs via scoped organization tokens.",
      category: "Developer & API",
      rolloutStatus: "GA",
      enabled: true,
      impactNote: "3 active production API tokens depend on this flag.",
      updatedAt: "2026-01-10",
    },
    {
      id: "ff-integrations",
      key: "org.ecosystem.external_connectors",
      name: "External Ecosystem Integrations",
      description: "Enable bi-directional connectors for Jira, GitHub, Slack, PagerDuty, CrowdStrike, and Splunk.",
      category: "Core Platform",
      rolloutStatus: "GA",
      enabled: true,
      impactNote: "8 connected integrations currently active.",
      updatedAt: "2026-02-11",
    },
    {
      id: "ff-automation",
      key: "org.workflows.automation_engine",
      name: "Visual Workflow Automation Engine",
      description: "Execute event-driven triage, routing, SLA escalation, and reward calculation rules automatically.",
      category: "Intelligence & Automation",
      rolloutStatus: "GA",
      enabled: true,
      impactNote: "7 active workflows executing ~180 actions/week.",
      updatedAt: "2026-03-05",
    },
    {
      id: "ff-beta-ephemeral-sandboxes",
      key: "org.beta.ephemeral_repro_containers",
      name: "Ephemeral PoC Reproduction Sandboxes",
      description: "Spin up isolated, one-click container environments directly from researcher curl/HTTP trace attachments.",
      category: "Early Access",
      rolloutStatus: "Beta",
      enabled: true,
      impactNote: "Beta preview enabled for Triage Leads and SecOps Admins.",
      updatedAt: "2026-04-02",
    },
    {
      id: "ff-exp-continuous-asm-diff",
      key: "org.experimental.autonomous_scope_drift",
      name: "Autonomous Cloud Scope Drift Detection",
      description: "Continuously compare AWS/GCP DNS changes against program scope rules and suggest scope updates automatically.",
      category: "Early Access",
      rolloutStatus: "Experimental",
      enabled: false,
      requiresApproval: true,
      impactNote: "Experimental feature; may generate high-frequency asset alerts.",
      updatedAt: "2026-04-10",
    },
  ],
  apiDeveloper: {
    apiKeys: [
      {
        id: "key-prod-siem",
        name: "Splunk Enterprise SIEM Log Forwarder",
        prefix: "co_live_98f3a1...d40e",
        scopes: ["reports:read", "audit_logs:read", "events:stream"],
        environment: "production",
        createdBy: "Elena Vance",
        createdAt: "2026-01-15",
        expiresAt: "2027-01-15",
        lastUsedAt: "2 minutes ago",
        ipRestrictions: ["198.51.100.42/32", "198.51.100.43/32"],
        status: "Active",
      },
      {
        id: "key-prod-cicd",
        name: "GitHub Actions Asset Scope Sync",
        prefix: "co_live_41c9b7...82a1",
        scopes: ["assets:write", "programs:read"],
        environment: "production",
        createdBy: "Marcus Thorne",
        createdAt: "2025-11-04",
        expiresAt: "2026-05-04",
        lastUsedAt: "18 minutes ago",
        ipRestrictions: ["203.0.113.0/24"],
        status: "Expiring Soon",
      },
      {
        id: "key-stg-sandbox",
        name: "SecOps Staging Webhook Harness",
        prefix: "co_stg_77e2d0...19f4",
        scopes: ["reports:read", "webhooks:test"],
        environment: "staging",
        createdBy: "Priya Nair",
        createdAt: "2026-03-01",
        expiresAt: "2026-09-01",
        lastUsedAt: "3 hours ago",
        ipRestrictions: ["0.0.0.0/0 (Staging Only)"],
        status: "Active",
      },
    ],
    webhookSignatureAlgorithm: "HMAC-SHA256 (v2)",
    webhookRetryPolicy: "Exponential Backoff (7 attempts / 24h)",
    webhookTimeoutSeconds: 10,
    rateLimitRequestsPerMinute: 1200,
    rateLimitBurstConcurrency: 60,
    graphqlComplexityLimit: 2500,
    allowedOrigins: [
      "https://security.northwindcloud.io",
      "https://secops-console.internal.northwind.io",
      "https://api.northwindcloud.io",
    ],
    developerMode: false,
    sdkAccessEnabled: true,
    openApiSpecExposure: "Authenticated Org Admins",
  },
  dataManagement: {
    automatedBackupsEnabled: true,
    backupFrequency: "Every 6 Hours",
    backupEncryptionKeyMode: "Customer-Managed Key (AWS KMS BYOK)",
    reportRetentionPolicy: "7 Years (Compliance Standard)",
    attachmentSanitizationOnArchive: true,
    auditLogExportS3Bucket: "s3://northwind-secops-compliance-vault-us-east-1/com-olho/",
    lastExportCompletedAt: "2026-04-17 06:00 UTC",
    snapshots: [
      {
        id: "snap-20260417-0600",
        timestamp: "2026-04-17 06:00 UTC",
        type: "Automated Daily",
        size: "4.82 GB",
        encrypted: true,
        region: "us-east-1 (Ashburn)",
        status: "Verified",
      },
      {
        id: "snap-20260415-1422",
        timestamp: "2026-04-15 14:22 UTC",
        type: "Pre-Change Snapshot",
        size: "4.79 GB",
        encrypted: true,
        region: "us-east-1 (Ashburn)",
        status: "Verified",
      },
      {
        id: "snap-20260401-0000",
        timestamp: "2026-04-01 00:00 UTC",
        type: "Manual Export",
        size: "4.61 GB",
        encrypted: true,
        region: "us-west-2 (DR Replica)",
        status: "Archived",
      },
    ],
  },
  privacy: {
    piiAutoRedactionInAttachments: true,
    exifMetadataStripping: true,
    researcherIpAnonymization: true,
    consentBannerEnforcement: "Strict GDPR / UK-GDPR",
    cookiePreferencePolicy: "Essential Security Cookies Only",
    researcherProfilePrivacy: "Pseudonymous Handle Only",
    organizationDirectoryVisibility: "Public Verified Enterprise",
    dpoContactEmail: "dpo-privacy@northwindcloud.io",
  },
  advanced: {
    environmentMode: "Production",
    sandboxModeEnabled: false,
    maintenanceModeEnabled: false,
    maintenanceBannerMessage:
      "Scheduled maintenance window in progress: new vulnerability submissions are queued and SLA timers are paused.",
    strictIpAllowlistEnforcement: true,
    enforceHardwareWebAuthnForAdmins: true,
    customHeaders: [
      {
        id: "hdr-1",
        headerName: "X-Northwind-Tenant-ID",
        headerValueMasked: "nw-prod-99481-secops",
        scope: "All Outbound Webhooks",
        enabled: true,
      },
      {
        id: "hdr-2",
        headerName: "X-Northwind-Scanner-Token",
        headerValueMasked: "Bearer nw_probe_************8f2a",
        scope: "Asset Verification Probes",
        enabled: true,
      },
      {
        id: "hdr-3",
        headerName: "X-SCIM-Correlation-Source",
        headerValueMasked: "com-olho-iam-v2",
        scope: "SCIM Provisioning",
        enabled: true,
      },
    ],
    customMetadata: [
      {
        id: "meta-1",
        key: "cost_center_code",
        value: "CC-4410-SECOPS",
        visibility: "Audit Log Tag",
      },
      {
        id: "meta-2",
        key: "soc2_trust_scope_id",
        value: "TSC-2026-NW-CORE",
        visibility: "API Exposed",
      },
      {
        id: "meta-3",
        key: "pagerduty_escalation_policy",
        value: "EP-NORTHWIND-PSIRT-TIER1",
        visibility: "Internal Only",
      },
    ],
  },
};

export const DANGER_ZONE_ACTIONS: DangerActionItem[] = [
  {
    id: "transfer-ownership",
    title: "Transfer Organization Ownership",
    description:
      "Reassign primary legal and administrative ownership of this organization workspace to another verified Organization Administrator.",
    impactSummary:
      "Current owner is downgraded to Standard Admin; billing authority and root KMS controls transfer immediately.",
    buttonLabel: "Transfer Ownership",
    severity: "warning",
    requiresMfa: true,
    confirmationPhrase: "TRANSFER NORTHWIND-CLOUD",
  },
  {
    id: "disconnect-integrations",
    title: "Disconnect All External Integrations",
    description:
      "Immediately revoke OAuth tokens, webhook secrets, and bi-directional sync pipelines across Jira, GitHub, Slack, PagerDuty, and Splunk.",
    impactSummary:
      "8 connected integrations and 7 dependent automation workflows will halt immediately.",
    buttonLabel: "Disconnect Integrations",
    severity: "warning",
    requiresMfa: true,
    confirmationPhrase: "DISCONNECT ALL INTEGRATIONS",
  },
  {
    id: "delete-api-keys",
    title: "Revoke All Organization API Keys",
    description:
      "Invalidate every active Production, Staging, and Sandbox API token and terminate ongoing GraphQL/REST sessions.",
    impactSummary:
      "3 active API tokens (including SIEM forwarding and CI/CD scope sync) will return HTTP 401 immediately.",
    buttonLabel: "Delete All API Keys",
    severity: "warning",
    requiresMfa: true,
    confirmationPhrase: "REVOKE ALL API KEYS",
  },
  {
    id: "remove-programs",
    title: "Unpublish & Remove All Programs",
    description:
      "Close intake across all Public, Private, and VDP programs, freeze open report threads, and remove listings from the directory.",
    impactSummary:
      "6 active programs will stop accepting submissions; pending rewards must still be settled.",
    buttonLabel: "Remove All Programs",
    severity: "critical",
    requiresMfa: true,
    confirmationPhrase: "REMOVE ALL PROGRAMS",
  },
  {
    id: "archive-org",
    title: "Archive Organization Workspace",
    description:
      "Place the entire organization in read-only compliance archive mode. All programs pause, API writes lock, and historical reports remain queryable for audits.",
    impactSummary:
      "Workspace enters read-only state; can be restored by Primary Owner within retention window.",
    buttonLabel: "Archive Organization",
    severity: "critical",
    requiresMfa: true,
    confirmationPhrase: "ARCHIVE NORTHWIND-CLOUD",
  },
  {
    id: "delete-org",
    title: "Permanently Delete Organization",
    description:
      "Irreversibly cryptographic-shred all programs, vulnerability reports, attachments, researcher threads, tax records, and audit history after a mandatory 14-day cool-down.",
    impactSummary:
      "Permanent destruction of org_nw_01J9X7K2A8V4M6P3Q9R5. Cannot be undone once cool-down completes.",
    buttonLabel: "Delete Organization",
    severity: "critical",
    requiresMfa: true,
    confirmationPhrase: "DELETE NORTHWIND-CLOUD PERMANENTLY",
  },
];

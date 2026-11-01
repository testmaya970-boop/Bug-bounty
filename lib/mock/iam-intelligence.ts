import type { OrganizationRole } from "../../types/auth";

export interface IAMMember {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  department: "Security Operations" | "Cloud Infrastructure" | "DevOps & SRE" | "Engineering" | "Governance & Risk" | "Finance";
  role: OrganizationRole;
  team: string;
  assignedProgramsCount: number;
  assignedPrograms: string[];
  mfaEnabled: boolean;
  mfaType: "Security Key (FIDO2)" | "Authenticator App (TOTP)" | "None";
  lastLogin: string;
  lastLoginRelative: string;
  deviceTrust: "Managed (MDM)" | "Verified Corporate" | "Unverified BYOD";
  status: "active" | "suspended" | "pending_mfa";
  location: string;
  avatarSeed: string;
}

export interface IAMTeam {
  id: string;
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  membersCount: number;
  programsCount: number;
  programs: string[];
  assetsManagedCount: number;
  openReportsCount: number;
  lastActivity: string;
  tier: "Tier 1 - Critical" | "Tier 2 - Operational" | "Tier 3 - Support";
}

export interface PermissionMatrixRow {
  category: string;
  description: string;
  owner: { create: boolean; read: boolean; update: boolean; delete: boolean; notes: string };
  admin: { create: boolean; read: boolean; update: boolean; delete: boolean; notes: string };
  manager: { create: boolean; read: boolean; update: boolean; delete: boolean; notes: string };
  analyst: { create: boolean; read: boolean; update: boolean; delete: boolean; notes: string };
  finance: { create: boolean; read: boolean; update: boolean; delete: boolean; notes: string };
  viewer: { create: boolean; read: boolean; update: boolean; delete: boolean; notes: string };
}

export interface PendingInvitationItem {
  id: string;
  inviteeName: string;
  email: string;
  invitedBy: string;
  sentDate: string;
  expirationDate: string;
  assignedRole: OrganizationRole;
  assignedTeam: string;
  department: string;
}

export interface AccessRequestItem {
  id: string;
  userName: string;
  userEmail: string;
  currentRole: string;
  requestedRole: string;
  requestedPrograms: string[];
  requestedAssets: string[];
  businessReason: string;
  submittedAt: string;
  urgency: "Urgent" | "High" | "Standard";
  status: "pending" | "approved" | "rejected";
}

export interface IdentityProvider {
  id: string;
  name: string;
  logoType: "google" | "microsoft" | "okta" | "ping" | "onelogin";
  status: "connected" | "syncing" | "degraded" | "configured" | "available";
  connected: boolean;
  lastSync: string;
  usersSynced: number;
  groupsSynced: number;
  errorCount: number;
  domain: string;
  protocol: "SAML 2.0" | "OIDC";
}

export interface SCIMHealth {
  enabled: boolean;
  provisioningUrl: string;
  usersManaged: number;
  groupsSynced: number;
  lastSyncTimestamp: string;
  syncDurationSeconds: number;
  recentFailuresCount: number;
  autoDeprovisioning: boolean;
  logs: {
    id: string;
    action: string;
    targetUser: string;
    timestamp: string;
    status: "success" | "warning" | "failed";
    details: string;
  }[];
}

export interface APICredential {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  status: "active" | "revoked" | "expiring_soon";
  maskedPrefix: string;
}

export interface SecuritySession {
  id: string;
  userName: string;
  userEmail: string;
  location: string;
  ipAddress: string;
  device: string;
  browser: string;
  os: string;
  loginMethod: "SSO (Okta)" | "Google Workspace" | "Password + WebAuthn" | "Service Token";
  mfaVerified: boolean;
  riskScore: "Low" | "Moderate" | "Elevated";
  lastActive: string;
  isCurrentSession?: boolean;
}

export interface IAMTimelineEvent {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  category: "role" | "mfa" | "sso" | "scim" | "token" | "session" | "invite";
  details: string;
  severity: "info" | "success" | "warning" | "security";
}

export const MOCK_IAM_MEMBERS: IAMMember[] = [
  {
    id: "mem-01",
    name: "Alex Vance",
    email: "alex.vance@comolho.io",
    jobTitle: "VP of Information Security",
    department: "Security Operations",
    role: "owner",
    team: "Security Team",
    assignedProgramsCount: 5,
    assignedPrograms: ["Core Bug Bounty", "Cloud Infrastructure VDP", "Zero-Day Response"],
    mfaEnabled: true,
    mfaType: "Security Key (FIDO2)",
    lastLogin: "2026-10-31T21:40:00Z",
    lastLoginRelative: "18 minutes ago",
    deviceTrust: "Managed (MDM)",
    status: "active",
    location: "San Francisco, USA",
    avatarSeed: "AV",
  },
  {
    id: "mem-02",
    name: "Sarah Chen",
    email: "sarah.chen@comolho.io",
    jobTitle: "Lead AppSec Architect",
    department: "Security Operations",
    role: "security_admin",
    team: "Security Team",
    assignedProgramsCount: 4,
    assignedPrograms: ["Core Bug Bounty", "Payments & FinTech Scope", "API Gateway VDP"],
    mfaEnabled: true,
    mfaType: "Security Key (FIDO2)",
    lastLogin: "2026-10-31T20:15:00Z",
    lastLoginRelative: "1 hour ago",
    deviceTrust: "Managed (MDM)",
    status: "active",
    location: "New York, USA",
    avatarSeed: "SC",
  },
  {
    id: "mem-03",
    name: "Marcus Brody",
    email: "marcus.brody@comolho.io",
    jobTitle: "Principal Cloud Security Engineer",
    department: "Cloud Infrastructure",
    role: "security_admin",
    team: "Cloud Team",
    assignedProgramsCount: 3,
    assignedPrograms: ["Cloud Infrastructure VDP", "Kubernetes & Mesh"],
    mfaEnabled: true,
    mfaType: "Authenticator App (TOTP)",
    lastLogin: "2026-10-31T17:30:00Z",
    lastLoginRelative: "4 hours ago",
    deviceTrust: "Managed (MDM)",
    status: "active",
    location: "Austin, USA",
    avatarSeed: "MB",
  },
  {
    id: "mem-04",
    name: "Elena Rostova",
    email: "elena.rostova@comolho.io",
    jobTitle: "Senior Bounty Program Manager",
    department: "Governance & Risk",
    role: "program_manager",
    team: "Security Team",
    assignedProgramsCount: 4,
    assignedPrograms: ["Core Bug Bounty", "Mobile Applications (iOS/Android)"],
    mfaEnabled: true,
    mfaType: "Security Key (FIDO2)",
    lastLogin: "2026-10-31T15:10:00Z",
    lastLoginRelative: "6 hours ago",
    deviceTrust: "Managed (MDM)",
    status: "active",
    location: "London, UK",
    avatarSeed: "ER",
  },
  {
    id: "mem-05",
    name: "David Kim",
    email: "david.kim@comolho.io",
    jobTitle: "Vulnerability Triager & Analyst",
    department: "Security Operations",
    role: "triager",
    team: "Red Team",
    assignedProgramsCount: 2,
    assignedPrograms: ["Core Bug Bounty", "API Gateway VDP"],
    mfaEnabled: true,
    mfaType: "Authenticator App (TOTP)",
    lastLogin: "2026-10-31T12:00:00Z",
    lastLoginRelative: "9 hours ago",
    deviceTrust: "Verified Corporate",
    status: "active",
    location: "Toronto, Canada",
    avatarSeed: "DK",
  },
  {
    id: "mem-06",
    name: "Maya Lin",
    email: "maya.lin@comolho.io",
    jobTitle: "Director of FinTech Operations",
    department: "Finance",
    role: "billing_admin",
    team: "Finance",
    assignedProgramsCount: 5,
    assignedPrograms: ["All Active Bounty Programs"],
    mfaEnabled: true,
    mfaType: "Security Key (FIDO2)",
    lastLogin: "2026-10-30T19:00:00Z",
    lastLoginRelative: "Yesterday",
    deviceTrust: "Managed (MDM)",
    status: "active",
    location: "Singapore",
    avatarSeed: "ML",
  },
  {
    id: "mem-07",
    name: "James Thornton",
    email: "j.thornton@comolho.io",
    jobTitle: "Senior DevOps Engineer",
    department: "DevOps & SRE",
    role: "program_manager",
    team: "DevOps",
    assignedProgramsCount: 2,
    assignedPrograms: ["Kubernetes & Mesh"],
    mfaEnabled: false,
    mfaType: "None",
    lastLogin: "2026-10-25T11:20:00Z",
    lastLoginRelative: "6 days ago",
    deviceTrust: "Unverified BYOD",
    status: "pending_mfa",
    location: "Berlin, Germany",
    avatarSeed: "JT",
  },
  {
    id: "mem-08",
    name: "Carlos Rivera",
    email: "carlos.r@external-audit.com",
    jobTitle: "External Security Auditor",
    department: "Governance & Risk",
    role: "triager",
    team: "Security Team",
    assignedProgramsCount: 1,
    assignedPrograms: ["Zero-Day Response"],
    mfaEnabled: true,
    mfaType: "Authenticator App (TOTP)",
    lastLogin: "2026-09-18T10:00:00Z",
    lastLoginRelative: "43 days ago",
    deviceTrust: "Unverified BYOD",
    status: "suspended",
    location: "Madrid, Spain",
    avatarSeed: "CR",
  },
];

export const MOCK_IAM_TEAMS: IAMTeam[] = [
  {
    id: "team-sec",
    name: "Security Team",
    description: "Core InfoSec, Threat Hunting, and Incident Operations Center",
    ownerName: "Sarah Chen",
    ownerEmail: "sarah.chen@comolho.io",
    membersCount: 8,
    programsCount: 5,
    programs: ["Core Bug Bounty", "Zero-Day Response", "API Gateway VDP"],
    assetsManagedCount: 64,
    openReportsCount: 12,
    lastActivity: "12 minutes ago",
    tier: "Tier 1 - Critical",
  },
  {
    id: "team-cloud",
    name: "Cloud Infrastructure Team",
    description: "Multi-cloud posture, AWS/GCP architecture and perimeter controls",
    ownerName: "Marcus Brody",
    ownerEmail: "marcus.brody@comolho.io",
    membersCount: 6,
    programsCount: 3,
    programs: ["Cloud Infrastructure VDP", "Kubernetes & Mesh"],
    assetsManagedCount: 128,
    openReportsCount: 4,
    lastActivity: "2 hours ago",
    tier: "Tier 1 - Critical",
  },
  {
    id: "team-red",
    name: "Red Team & Triage",
    description: "Offensive security simulations and incoming bug bounty triage queue",
    ownerName: "David Kim",
    ownerEmail: "david.kim@comolho.io",
    membersCount: 5,
    programsCount: 4,
    programs: ["Core Bug Bounty", "Payments & FinTech Scope"],
    assetsManagedCount: 32,
    openReportsCount: 9,
    lastActivity: "45 minutes ago",
    tier: "Tier 1 - Critical",
  },
  {
    id: "team-devops",
    name: "DevOps & Platform Engineering",
    description: "CI/CD pipelines, container registries, build systems and deployments",
    ownerName: "James Thornton",
    ownerEmail: "j.thornton@comolho.io",
    membersCount: 7,
    programsCount: 2,
    programs: ["Kubernetes & Mesh"],
    assetsManagedCount: 48,
    openReportsCount: 2,
    lastActivity: "Yesterday",
    tier: "Tier 2 - Operational",
  },
  {
    id: "team-eng",
    name: "Product Engineering",
    description: "Full-stack application developers and core services developers",
    ownerName: "Elena Rostova",
    ownerEmail: "elena.rostova@comolho.io",
    membersCount: 24,
    programsCount: 3,
    programs: ["Core Bug Bounty", "Mobile Applications (iOS/Android)"],
    assetsManagedCount: 92,
    openReportsCount: 15,
    lastActivity: "18 minutes ago",
    tier: "Tier 2 - Operational",
  },
  {
    id: "team-fin",
    name: "Finance & Treasury",
    description: "Bounty pool management, escrow reconciliation, and tax documentation",
    ownerName: "Maya Lin",
    ownerEmail: "maya.lin@comolho.io",
    membersCount: 4,
    programsCount: 5,
    programs: ["All Active Bounty Programs"],
    assetsManagedCount: 8,
    openReportsCount: 0,
    lastActivity: "3 hours ago",
    tier: "Tier 3 - Support",
  },
];

export const MOCK_PERMISSION_MATRIX: PermissionMatrixRow[] = [
  {
    category: "Executive Dashboard",
    description: "High-level metrics, health status, and KPI summaries",
    owner: { create: true, read: true, update: true, delete: true, notes: "Full control" },
    admin: { create: true, read: true, update: true, delete: false, notes: "Manage KPIs" },
    manager: { create: false, read: true, update: false, delete: false, notes: "Read-only" },
    analyst: { create: false, read: true, update: false, delete: false, notes: "Read-only" },
    finance: { create: false, read: true, update: false, delete: false, notes: "Financial cards" },
    viewer: { create: false, read: true, update: false, delete: false, notes: "Basic summary" },
  },
  {
    category: "Engagements & Programs",
    description: "Bounty program policies, scope boundaries, reward tiers, and launch",
    owner: { create: true, read: true, update: true, delete: true, notes: "Full lifecycle" },
    admin: { create: true, read: true, update: true, delete: false, notes: "Publish & update" },
    manager: { create: false, read: true, update: true, delete: false, notes: "Update scopes" },
    analyst: { create: false, read: true, update: false, delete: false, notes: "View scope" },
    finance: { create: false, read: true, update: false, delete: false, notes: "View budget" },
    viewer: { create: false, read: true, update: false, delete: false, notes: "Read-only" },
  },
  {
    category: "Vulnerability Reports",
    description: "Triage, severity scoring, CVSS validation, comments, and resolution",
    owner: { create: true, read: true, update: true, delete: true, notes: "Override triage" },
    admin: { create: true, read: true, update: true, delete: true, notes: "Full triage" },
    manager: { create: true, read: true, update: true, delete: false, notes: "Accept & close" },
    analyst: { create: true, read: true, update: true, delete: false, notes: "Triage & tag" },
    finance: { create: false, read: true, update: false, delete: false, notes: "View payouts" },
    viewer: { create: false, read: true, update: false, delete: false, notes: "Redacted view" },
  },
  {
    category: "Payments & Ledger",
    description: "Disburse bounties, fund balance, configure budgets, tax forms",
    owner: { create: true, read: true, update: true, delete: true, notes: "Disburse & fund" },
    admin: { create: true, read: true, update: true, delete: false, notes: "Approve up to $5k" },
    manager: { create: false, read: true, update: false, delete: false, notes: "View approvals" },
    analyst: { create: false, read: false, update: false, delete: false, notes: "No access" },
    finance: { create: true, read: true, update: true, delete: false, notes: "Full financial" },
    viewer: { create: false, read: false, update: false, delete: false, notes: "No access" },
  },
  {
    category: "Attack Surface Assets",
    description: "Inventory, DNS verification, domain verification, tiering, approval",
    owner: { create: true, read: true, update: true, delete: true, notes: "Full ownership" },
    admin: { create: true, read: true, update: true, delete: true, notes: "Verify & tier" },
    manager: { create: true, read: true, update: true, delete: false, notes: "Submit assets" },
    analyst: { create: false, read: true, update: false, delete: false, notes: "View inventory" },
    finance: { create: false, read: true, update: false, delete: false, notes: "Read-only" },
    viewer: { create: false, read: true, update: false, delete: false, notes: "Public assets" },
  },
  {
    category: "Integrations & Webhooks",
    description: "Jira sync, Slack alerts, ServiceNow connectors, custom webhooks",
    owner: { create: true, read: true, update: true, delete: true, notes: "Full tokens" },
    admin: { create: true, read: true, update: true, delete: false, notes: "Connect apps" },
    manager: { create: false, read: true, update: false, delete: false, notes: "View status" },
    analyst: { create: false, read: true, update: false, delete: false, notes: "Trigger sync" },
    finance: { create: false, read: false, update: false, delete: false, notes: "No access" },
    viewer: { create: false, read: false, update: false, delete: false, notes: "No access" },
  },
  {
    category: "Audit Logs & Security",
    description: "Tamper-evident logs, authentication events, API keys, compliance",
    owner: { create: false, read: true, update: false, delete: false, notes: "Export all" },
    admin: { create: false, read: true, update: false, delete: false, notes: "View & search" },
    manager: { create: false, read: true, update: false, delete: false, notes: "Team scope" },
    analyst: { create: false, read: false, update: false, delete: false, notes: "No access" },
    finance: { create: false, read: true, update: false, delete: false, notes: "Payment audit" },
    viewer: { create: false, read: false, update: false, delete: false, notes: "No access" },
  },
  {
    category: "Identity & Members (IAM)",
    description: "Invite users, assign roles, enforce MFA, configure SSO & SCIM",
    owner: { create: true, read: true, update: true, delete: true, notes: "Manage owners" },
    admin: { create: true, read: true, update: true, delete: false, notes: "Manage members" },
    manager: { create: false, read: true, update: false, delete: false, notes: "View team" },
    analyst: { create: false, read: false, update: false, delete: false, notes: "No access" },
    finance: { create: false, read: false, update: false, delete: false, notes: "No access" },
    viewer: { create: false, read: false, update: false, delete: false, notes: "No access" },
  },
];

export const MOCK_PENDING_INVITATIONS: PendingInvitationItem[] = [
  {
    id: "inv-01",
    inviteeName: "Rachel Zane",
    email: "rachel.zane@comolho.io",
    invitedBy: "Alex Vance",
    sentDate: "2026-10-30T14:00:00Z",
    expirationDate: "2026-11-06T14:00:00Z",
    assignedRole: "security_admin",
    assignedTeam: "Security Team",
    department: "Security Operations",
  },
  {
    id: "inv-02",
    inviteeName: "Liam O'Connor",
    email: "liam.oc@comolho.io",
    invitedBy: "Sarah Chen",
    sentDate: "2026-10-29T10:30:00Z",
    expirationDate: "2026-11-05T10:30:00Z",
    assignedRole: "triager",
    assignedTeam: "Red Team",
    department: "Security Operations",
  },
  {
    id: "inv-03",
    inviteeName: "Ananya Sharma",
    email: "ananya.sharma@comolho.io",
    invitedBy: "Marcus Brody",
    sentDate: "2026-10-28T09:15:00Z",
    expirationDate: "2026-11-04T09:15:00Z",
    assignedRole: "program_manager",
    assignedTeam: "Cloud Team",
    department: "Cloud Infrastructure",
  },
];

export const MOCK_ACCESS_REQUESTS: AccessRequestItem[] = [
  {
    id: "req-01",
    userName: "James Thornton",
    userEmail: "j.thornton@comolho.io",
    currentRole: "Program Manager",
    requestedRole: "Security Admin",
    requestedPrograms: ["Kubernetes & Mesh", "Core Bug Bounty"],
    requestedAssets: ["k8s-prod.us-east.internal", "vault.comolho.net"],
    businessReason: "Need elevated role to manage Kubernetes production scope and verify ingress controller vulnerabilities.",
    submittedAt: "2026-10-31T18:45:00Z",
    urgency: "High",
    status: "pending",
  },
  {
    id: "req-02",
    userName: "David Kim",
    userEmail: "david.kim@comolho.io",
    currentRole: "Triager",
    requestedRole: "Program Manager",
    requestedPrograms: ["Zero-Day Response"],
    requestedAssets: ["api.comolho.io"],
    businessReason: "Stepping up as secondary program manager for zero-day triage during European timezone shifts.",
    submittedAt: "2026-10-31T11:20:00Z",
    urgency: "Standard",
    status: "pending",
  },
];

export const MOCK_IDENTITY_PROVIDERS: IdentityProvider[] = [
  {
    id: "idp-okta",
    name: "Okta Workforce Identity Cloud",
    logoType: "okta",
    status: "connected",
    connected: true,
    lastSync: "4 minutes ago",
    usersSynced: 42,
    groupsSynced: 6,
    errorCount: 0,
    domain: "comolho.okta.com",
    protocol: "SAML 2.0",
  },
  {
    id: "idp-google",
    name: "Google Workspace Admin",
    logoType: "google",
    status: "connected",
    connected: true,
    lastSync: "12 minutes ago",
    usersSynced: 38,
    groupsSynced: 5,
    errorCount: 0,
    domain: "comolho.io",
    protocol: "OIDC",
  },
  {
    id: "idp-entra",
    name: "Microsoft Entra ID (Azure AD)",
    logoType: "microsoft",
    status: "configured",
    connected: false,
    lastSync: "Never",
    usersSynced: 0,
    groupsSynced: 0,
    errorCount: 0,
    domain: "login.microsoftonline.com",
    protocol: "SAML 2.0",
  },
  {
    id: "idp-ping",
    name: "Ping Identity PingFederate",
    logoType: "ping",
    status: "available",
    connected: false,
    lastSync: "Never",
    usersSynced: 0,
    groupsSynced: 0,
    errorCount: 0,
    domain: "auth.pingidentity.com",
    protocol: "SAML 2.0",
  },
  {
    id: "idp-onelogin",
    name: "OneLogin by One Identity",
    logoType: "onelogin",
    status: "available",
    connected: false,
    lastSync: "Never",
    usersSynced: 0,
    groupsSynced: 0,
    errorCount: 0,
    domain: "comolho.onelogin.com",
    protocol: "SAML 2.0",
  },
];

export const MOCK_SCIM_HEALTH: SCIMHealth = {
  enabled: true,
  provisioningUrl: "https://api.unpatched.security/v1/scim/v2/org_3333333301",
  usersManaged: 42,
  groupsSynced: 6,
  lastSyncTimestamp: "2026-10-31T21:45:00Z",
  syncDurationSeconds: 1.84,
  recentFailuresCount: 0,
  autoDeprovisioning: true,
  logs: [
    {
      id: "scim-01",
      action: "User Provisioned",
      targetUser: "alex.vance@comolho.io",
      timestamp: "Today at 21:45",
      status: "success",
      details: "Attribute mapping refreshed; groups: ['SecOps', 'Owners']",
    },
    {
      id: "scim-02",
      action: "Role Synchronized",
      targetUser: "sarah.chen@comolho.io",
      timestamp: "Today at 21:45",
      status: "success",
      details: "Role updated to security_admin via Okta SCIM push",
    },
    {
      id: "scim-03",
      action: "Session Validated",
      targetUser: "marcus.brody@comolho.io",
      timestamp: "Today at 18:30",
      status: "success",
      details: "SCIM heartbeat verified against Okta tenant",
    },
    {
      id: "scim-04",
      action: "Group Membership Push",
      targetUser: "Team: Red Team",
      timestamp: "Yesterday at 14:10",
      status: "success",
      details: "5 active members synced to role mapping table",
    },
  ],
};

export const MOCK_API_CREDENTIALS: APICredential[] = [
  {
    id: "tok-01",
    name: "Production CI/CD Vulnerability Scanner",
    ownerName: "Sarah Chen",
    ownerEmail: "sarah.chen@comolho.io",
    scopes: ["reports:read", "reports:write", "assets:read", "scope:read"],
    createdAt: "2026-08-15",
    lastUsedAt: "4 minutes ago",
    expiresAt: "2027-08-15",
    status: "active",
    maskedPrefix: "unp_live_948a...",
  },
  {
    id: "tok-02",
    name: "Jira Security Automation Gateway",
    ownerName: "Alex Vance",
    ownerEmail: "alex.vance@comolho.io",
    scopes: ["findings:sync", "comments:post", "webhooks:listen"],
    createdAt: "2026-09-01",
    lastUsedAt: "12 minutes ago",
    expiresAt: "2027-09-01",
    status: "active",
    maskedPrefix: "unp_live_21bc...",
  },
  {
    id: "tok-03",
    name: "ServiceNow Incident Connector",
    ownerName: "Marcus Brody",
    ownerEmail: "marcus.brody@comolho.io",
    scopes: ["reports:read", "audit:read"],
    createdAt: "2026-07-20",
    lastUsedAt: "2 days ago",
    expiresAt: "2026-11-20",
    status: "expiring_soon",
    maskedPrefix: "unp_live_77df...",
  },
  {
    id: "tok-04",
    name: "Legacy Splunk SIEM Ingest Token",
    ownerName: "Carlos Rivera",
    ownerEmail: "carlos.r@external-audit.com",
    scopes: ["audit:read", "events:stream"],
    createdAt: "2026-01-10",
    lastUsedAt: "45 days ago",
    expiresAt: "2026-10-01",
    status: "revoked",
    maskedPrefix: "unp_live_04ee...",
  },
];

export const MOCK_SECURITY_SESSIONS: SecuritySession[] = [
  {
    id: "sess-01",
    userName: "Alex Vance",
    userEmail: "alex.vance@comolho.io",
    location: "San Francisco, CA, USA",
    ipAddress: "198.51.100.44",
    device: "MacBook Pro 16-inch (M3 Max)",
    browser: "Chrome 130.0",
    os: "macOS Sonoma 14.6",
    loginMethod: "SSO (Okta)",
    mfaVerified: true,
    riskScore: "Low",
    lastActive: "Active now",
    isCurrentSession: true,
  },
  {
    id: "sess-02",
    userName: "Sarah Chen",
    userEmail: "sarah.chen@comolho.io",
    location: "New York, NY, USA",
    ipAddress: "192.0.2.78",
    device: "MacBook Air 15-inch",
    browser: "Safari 17.5",
    os: "macOS Sequoia 15.0",
    loginMethod: "SSO (Okta)",
    mfaVerified: true,
    riskScore: "Low",
    lastActive: "1 hour ago",
  },
  {
    id: "sess-03",
    userName: "David Kim",
    userEmail: "david.kim@comolho.io",
    location: "Toronto, Canada",
    ipAddress: "203.0.113.19",
    device: "ThinkPad X1 Carbon",
    browser: "Firefox 132.0",
    os: "Ubuntu 24.04 LTS",
    loginMethod: "Password + WebAuthn",
    mfaVerified: true,
    riskScore: "Low",
    lastActive: "4 hours ago",
  },
  {
    id: "sess-04",
    userName: "James Thornton",
    userEmail: "j.thornton@comolho.io",
    location: "Berlin, Germany",
    ipAddress: "185.199.108.153",
    device: "Dell XPS 15",
    browser: "Chrome 129.0",
    os: "Windows 11 Enterprise",
    loginMethod: "Google Workspace",
    mfaVerified: false,
    riskScore: "Moderate",
    lastActive: "6 days ago",
  },
];

export const MOCK_IAM_TIMELINE: IAMTimelineEvent[] = [
  {
    id: "evt-01",
    action: "SCIM Sync Completed",
    actor: "Okta System Agent",
    target: "42 Users & 6 Groups",
    timestamp: "Today at 21:45",
    category: "scim",
    details: "All attributes synchronized with 0 errors across organization directory.",
    severity: "success",
  },
  {
    id: "evt-02",
    action: "FIDO2 Security Key Registered",
    actor: "Sarah Chen",
    target: "YubiKey 5C NFC",
    timestamp: "Today at 19:20",
    category: "mfa",
    details: "Primary WebAuthn credential enrolled and verified.",
    severity: "success",
  },
  {
    id: "evt-03",
    action: "API Credential Created",
    actor: "Alex Vance",
    target: "Jira Security Automation Gateway",
    timestamp: "Today at 14:10",
    category: "token",
    details: "Issued with scopes: findings:sync, comments:post, webhooks:listen.",
    severity: "info",
  },
  {
    id: "evt-04",
    action: "Invitation Dispatched",
    actor: "Alex Vance",
    target: "rachel.zane@comolho.io",
    timestamp: "Yesterday at 14:00",
    category: "invite",
    details: "Assigned role: security_admin in Security Team.",
    severity: "info",
  },
  {
    id: "evt-05",
    action: "Dormant Member Suspended",
    actor: "Alex Vance",
    target: "carlos.r@external-audit.com",
    timestamp: "Oct 28, 2026",
    category: "role",
    details: "Auto-suspended due to 30+ days of inactivity per security policy.",
    severity: "warning",
  },
  {
    id: "evt-06",
    action: "Elevation Request Submitted",
    actor: "James Thornton",
    target: "Role: Security Admin",
    timestamp: "Oct 27, 2026",
    category: "role",
    details: "Pending review by organization owners.",
    severity: "security",
  },
];

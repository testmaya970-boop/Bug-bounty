import type { EngagementType, ProgramType } from "../types/program";

export type StudioStepId =
  | "welcome"
  | "blueprint"
  | "details"
  | "scope"
  | "rewards"
  | "access"
  | "automation"
  | "review"
  | "launch";

export interface StudioStepMeta {
  id: StudioStepId;
  index: number;
  shortLabel: string;
  title: string;
  subtitle: string;
}

export const STUDIO_STEPS: readonly StudioStepMeta[] = [
  {
    id: "welcome",
    index: 1,
    shortLabel: "Welcome",
    title: "Launch a New Security Program",
    subtitle: "Create a professional security program in minutes using guided best practices.",
  },
  {
    id: "blueprint",
    index: 2,
    shortLabel: "Blueprint",
    title: "Select an Industry Blueprint",
    subtitle: "Start with battle-tested scope templates, reward matrices, SLAs, and triage workflows.",
  },
  {
    id: "details",
    index: 3,
    shortLabel: "Details",
    title: "Program Identity & Governance",
    subtitle: "Define ownership, visibility posture, lifecycle state, and operational launch window.",
  },
  {
    id: "scope",
    index: 4,
    shortLabel: "Scope",
    title: "Interactive Scope Studio",
    subtitle: "Assemble verified attack surface assets, inspect coverage telemetry, and resolve scope conflicts.",
  },
  {
    id: "rewards",
    index: 5,
    shortLabel: "Rewards",
    title: "Rewards Matrix & Safe Harbor Policies",
    subtitle: "Calibrate severity payouts, forecast monthly spend, and preview researcher-facing disclosure rules.",
  },
  {
    id: "access",
    index: 6,
    shortLabel: "Access",
    title: "Researcher Access & Cohort Curation",
    subtitle: "Select high-signal security researchers, past participants, and specialized testing groups.",
  },
  {
    id: "automation",
    index: 7,
    shortLabel: "Automation",
    title: "Automation & Ecosystem Integrations",
    subtitle: "See which issue trackers, chat alerts and webhooks are connected for your organization.",
  },
  {
    id: "review",
    index: 8,
    shortLabel: "Review",
    title: "Program Readiness & Pre-Flight Review",
    subtitle: "Audit every operational dimension and verify launch readiness before going live.",
  },
  {
    id: "launch",
    index: 9,
    shortLabel: "Launch",
    title: "Confirm & Deploy Security Program",
    subtitle: "Execute immediate deployment, schedule a timed rollout, or commit as a verified draft.",
  },
] as const;

export type WelcomeEngagementOptionId =
  | "continuous_bug_bounty"
  | "vdp"
  | "private_engagement"
  | "pentest_campaign";

export interface WelcomeEngagementOption {
  id: WelcomeEngagementOptionId;
  title: string;
  tagline: string;
  description: string;
  typicalDuration: string;
  recommendedUseCase: string;
  badge: string;
  programType: ProgramType;
  engagementType: EngagementType;
  defaultVisibility: StudioVisibilityMode;
  highlights: string[];
}

export const WELCOME_ENGAGEMENT_OPTIONS: readonly WelcomeEngagementOption[] = [
  {
    id: "continuous_bug_bounty",
    title: "Continuous Bug Bounty",
    tagline: "Pay-for-impact continuous offensive testing",
    description:
      "Incentivize elite global researchers to continuously test production applications, APIs, and cloud infrastructure with severity-calibrated rewards.",
    typicalDuration: "Continuous / Always-On",
    recommendedUseCase: "Production SaaS platforms, customer APIs & high-velocity cloud deployments",
    badge: "Most Popular",
    programType: "bounty",
    engagementType: "bug_bounty",
    defaultVisibility: "Public",
    highlights: ["Dynamic severity reward matrix", "Continuous testing", "Managed Triage available"],
  },
  {
    id: "vdp",
    title: "Vulnerability Disclosure Program (VDP)",
    tagline: "Standardized compliance & safe harbor intake",
    description:
      "Establish a compliant, public-facing security.txt and disclosure channel with legal Safe Harbor and structured SLA tracking—without mandatory cash bounties.",
    typicalDuration: "Permanent Baseline",
    recommendedUseCase: "SOC 2, ISO 27001, NIS2 & federal compliance mandates across all domains",
    badge: "Compliance Ready",
    programType: "vdp",
    engagementType: "response",
    defaultVisibility: "Public",
    highlights: ["ISO 29147 compliant intake", "Automated Safe Harbor terms", "Reputation-only recognition"],
  },
  {
    id: "private_engagement",
    title: "Private Engagement",
    tagline: "Invite-only testing with vetted specialists",
    description:
      "Restrict program visibility and asset access to hand-picked researchers with proven signal scores, NDA clearance, and domain expertise.",
    typicalDuration: "4–12 Weeks or Ongoing",
    recommendedUseCase: "Pre-launch features, sensitive financial/health systems & zero-trust boundaries",
    badge: "High Signal",
    programType: "bounty",
    engagementType: "bug_bounty",
    defaultVisibility: "Invite Only",
    highlights: ["Curated researcher cohort", "Zero public footprint", "Graduated scope expansion"],
  },
  {
    id: "pentest_campaign",
    title: "Pentest Campaign",
    tagline: "Timeboxed, methodology-driven assessment",
    description:
      "Run a structured, deadline-driven security campaign combining OWASP/PTES checklists with competitive researcher incentives and executive attestation.",
    typicalDuration: "2–4 Weeks Timeboxed",
    recommendedUseCase: "Quarterly release gates, M&A technical due diligence & auditor sign-off",
    badge: "Timeboxed",
    programType: "bounty",
    engagementType: "pentest",
    defaultVisibility: "Private",
    highlights: ["Fixed launch & end window", "Compliance attestation report", "Dedicated lead triager"],
  },
] as const;

export type BlueprintId =
  | "saas"
  | "fintech"
  | "healthcare"
  | "government"
  | "enterprise_cloud"
  | "mobile_app"
  | "api_platform"
  | "ai_platform"
  | "kubernetes"
  | "internal_network"
  | "blank";

export interface SeverityRange {
  min: number;
  max: number;
}

export interface RewardMatrixConfig {
  critical: SeverityRange;
  high: SeverityRange;
  medium: SeverityRange;
  low: SeverityRange;
  informational: SeverityRange;
}

export interface PolicyConfig {
  disclosureTimelineDays: number;
  safeHarborType: "Full Legal Safe Harbor" | "Conditional Safe Harbor" | "Standard Authorization";
  responseSlaHours: number;
  triageSlaHours: number;
  resolutionSlaDays: number;
  duplicateHandling: "First valid reporter receives 100% reward" | "Split bounty within 24h window" | "Reputation credit for duplicates";
  outOfScopeRules: string[];
  autoCloseDays: number;
  severityScoring: "CVSS v3.1" | "CVSS v4.0" | "OWASP Risk Rating";
}

export interface ProgramBlueprint {
  id: BlueprintId;
  name: string;
  category: string;
  estimatedSetupMinutes: number;
  summary: string;
  recommendedProgramName: string;
  recommendedDescription: string;
  businessUnit: string;
  severityScoring: "CVSS v3.1" | "CVSS v4.0" | "OWASP Risk Rating";
  defaultAssetIds: string[];
  rewardMatrix: RewardMatrixConfig;
  monthlyBudgetEstimate: number;
  policy: PolicyConfig;
  defaultIntegrations: string[];
  defaultAutomations: string[];
  defaultWorkflowSummary: string;
  complianceTags: string[];
}

export const PROGRAM_BLUEPRINTS: readonly ProgramBlueprint[] = [
  {
    id: "saas",
    name: "SaaS Platform",
    category: "B2B Cloud Application",
    estimatedSetupMinutes: 3,
    summary: "Multi-tenant web apps, SSO/IAM boundaries, GraphQL/REST APIs, and workspace RBAC isolation.",
    recommendedProgramName: "Cloud Core & Multi-Tenant SaaS Bounty",
    recommendedDescription:
      "Continuous security testing across your multi-tenant control plane, identity federation, and customer workspace APIs.",
    businessUnit: "Core Cloud Platform",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 5000, max: 15000 },
      high: { min: 2000, max: 5000 },
      medium: { min: 500, max: 1800 },
      low: { min: 150, max: 400 },
      informational: { min: 0, max: 50 },
    },
    monthlyBudgetEstimate: 28500,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 12,
      triageSlaHours: 24,
      resolutionSlaDays: 14,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Volumetric DDoS or automated credential stuffing against production tenants",
        "Social engineering, phishing, or physical security testing of employees",
        "Missing SPF/DKIM/DMARC records without demonstrable spoofing impact",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v3.1",
    },
    defaultIntegrations: ["jira", "slack", "github", "email", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Intake → AI Deduplication → Triage (<24h) → Jira Sync → Auto Payout on Fix",
    complianceTags: ["SOC 2 Type II", "ISO 27001", "GDPR"],
  },
  {
    id: "fintech",
    name: "FinTech",
    category: "Financial & Ledger Systems",
    estimatedSetupMinutes: 4,
    summary: "High-value payment rails, ledger integrity, wire transfer APIs, and KYC/AML verification flows.",
    recommendedProgramName: "Treasury & Payment Rails Security Program",
    recommendedDescription:
      "High-assurance bug bounty covering payment settlement APIs, cryptographic signing services, and double-entry ledger integrity.",
    businessUnit: "Payments & Financial Infrastructure",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 10000, max: 25000 },
      high: { min: 4000, max: 9000 },
      medium: { min: 1000, max: 3000 },
      low: { min: 250, max: 750 },
      informational: { min: 0, max: 100 },
    },
    monthlyBudgetEstimate: 46000,
    policy: {
      disclosureTimelineDays: 120,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 6,
      triageSlaHours: 12,
      resolutionSlaDays: 7,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Testing against live ACH/Wire settlement endpoints outside designated sandbox headers",
        "Automated carding or brute-force enumeration of PAN/IBAN identifiers",
        "Rate-limiting findings on non-authenticated marketing pages",
      ],
      autoCloseDays: 21,
      severityScoring: "CVSS v4.0",
    },
    defaultIntegrations: ["jira", "slack", "github", "email", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Instant P1 Page → 6h Response SLA → Ledger Isolation Check → Dual-Approval Payout",
    complianceTags: ["PCI-DSS 4.0", "SOX", "SOC 2 Type II"],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    category: "Clinical & HIPAA Systems",
    estimatedSetupMinutes: 4,
    summary: "PHI data enclaves, FHIR interoperability APIs, patient portals, and telehealth endpoints.",
    recommendedProgramName: "Health Cloud & FHIR Interoperability Program",
    recommendedDescription:
      "Zero-PHI synthetic testing environment covering clinical APIs, patient identity brokers, and encrypted storage enclaves.",
    businessUnit: "Regulated Health Systems",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 6000, max: 18000 },
      high: { min: 2500, max: 6000 },
      medium: { min: 750, max: 2000 },
      low: { min: 200, max: 500 },
      informational: { min: 0, max: 0 },
    },
    monthlyBudgetEstimate: 31000,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 8,
      triageSlaHours: 24,
      resolutionSlaDays: 10,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Accessing, downloading, or exfiltrating more than 1 synthetic patient record to prove impact",
        "Disrupting clinical telemetry or emergency notification webhooks",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v3.1",
    },
    defaultIntegrations: ["jira", "teams", "github", "email"],
    defaultAutomations: [],
    defaultWorkflowSummary: "PHI Redaction Check → HIPAA Compliance Triage → Clinical Eng Escalation",
    complianceTags: ["HIPAA", "HITRUST", "FDA Cyber"],
  },
  {
    id: "government",
    name: "Government",
    category: "Public Sector & FedRAMP",
    estimatedSetupMinutes: 5,
    summary: "CISA BOD 20-01 aligned vulnerability disclosure and cleared-researcher boundary testing.",
    recommendedProgramName: "Federal & Public Sector Boundary Program",
    recommendedDescription:
      "FedRAMP High boundary testing aligned with CISA directive requirements and coordinated vulnerability disclosure protocols.",
    businessUnit: "Public Sector & Defense",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 4000, max: 12000 },
      high: { min: 1500, max: 4000 },
      medium: { min: 500, max: 1500 },
      low: { min: 150, max: 350 },
      informational: { min: 0, max: 0 },
    },
    monthlyBudgetEstimate: 22000,
    policy: {
      disclosureTimelineDays: 120,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 24,
      triageSlaHours: 48,
      resolutionSlaDays: 30,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Testing from embargoed jurisdictions or non-verified VPN egress nodes",
        "Physical intrusion or supply-chain tampering",
      ],
      autoCloseDays: 45,
      severityScoring: "CVSS v3.1",
    },
    defaultIntegrations: ["azure_devops", "teams", "email", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Clearance Verification → CISA Severity Tagging → POA&M Ticket Creation",
    complianceTags: ["FedRAMP High", "NIST 800-53", "CISA BOD 20-01"],
  },
  {
    id: "enterprise_cloud",
    name: "Enterprise Cloud",
    category: "Multi-Cloud Control Plane",
    estimatedSetupMinutes: 4,
    summary: "AWS/GCP/Azure control planes, IAM cross-account roles, Terraform modules, and edge gateways.",
    recommendedProgramName: "Multi-Cloud Control Plane & IAM Bounty",
    recommendedDescription:
      "Offensive security assessment of cloud account boundaries, workload identity federation, and global edge routing.",
    businessUnit: "Cloud Infrastructure & SRE",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 7500, max: 20000 },
      high: { min: 3000, max: 7500 },
      medium: { min: 800, max: 2500 },
      low: { min: 200, max: 600 },
      informational: { min: 0, max: 50 },
    },
    monthlyBudgetEstimate: 36000,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 8,
      triageSlaHours: 24,
      resolutionSlaDays: 14,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Modifying IAM policies affecting shared production availability",
        "Resource exhaustion of cloud nat-gateways or DNS resolvers",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v4.0",
    },
    defaultIntegrations: ["jira", "slack", "github", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Cloud Asset Correlation → Blast-Radius Scoring → SRE Pager Escalation",
    complianceTags: ["CSA STAR", "ISO 27017", "SOC 2"],
  },
  {
    id: "mobile_app",
    name: "Mobile Application",
    category: "iOS & Android Ecosystems",
    estimatedSetupMinutes: 3,
    summary: "iOS/Android binaries, deep-link handlers, biometric auth enclave, and mobile BFF APIs.",
    recommendedProgramName: "Mobile Client & Biometric Auth Bounty",
    recommendedDescription:
      "Security evaluation of iOS App Store and Android Play Store builds, local keychain storage, certificate pinning, and mobile GraphQL BFF.",
    businessUnit: "Mobile Experience Team",
    severityScoring: "OWASP Risk Rating",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 4000, max: 12000 },
      high: { min: 1500, max: 4500 },
      medium: { min: 400, max: 1200 },
      low: { min: 100, max: 300 },
      informational: { min: 0, max: 50 },
    },
    monthlyBudgetEstimate: 19500,
    policy: {
      disclosureTimelineDays: 60,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 12,
      triageSlaHours: 24,
      resolutionSlaDays: 14,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Findings requiring physical root/jailbreak access without remote exploitation chain",
        "Lack of binary obfuscation without demonstrable credential extraction",
      ],
      autoCloseDays: 30,
      severityScoring: "OWASP Risk Rating",
    },
    defaultIntegrations: ["linear", "slack", "github", "email"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Binary Version Check → OWASP MASVS Mapping → Linear Issue Creation",
    complianceTags: ["OWASP MASVS L2", "SOC 2"],
  },
  {
    id: "api_platform",
    name: "API Platform",
    category: "Developer APIs & Webhooks",
    estimatedSetupMinutes: 3,
    summary: "REST/GraphQL/gRPC gateways, OAuth2 token exchange, rate limiters, and webhook signing.",
    recommendedProgramName: "Developer API & GraphQL Gateway Bounty",
    recommendedDescription:
      "Focused testing on BOLA/IDOR, OAuth 2.1 scopes, webhook SSRF prevention, and tenant rate-limiting bypasses.",
    businessUnit: "Developer Platform & Ecosystem",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 5000, max: 14000 },
      high: { min: 2000, max: 5000 },
      medium: { min: 600, max: 1800 },
      low: { min: 150, max: 400 },
      informational: { min: 0, max: 50 },
    },
    monthlyBudgetEstimate: 24000,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 12,
      triageSlaHours: 24,
      resolutionSlaDays: 14,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Exceeding 50 requests/second per researcher test token",
        "Introspection query enabled on public documentation sandbox",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v3.1",
    },
    defaultIntegrations: ["linear", "slack", "github", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "OpenAPI Endpoint Match → BOLA Replay Verification → GitHub PR Link",
    complianceTags: ["OWASP API Top 10", "ISO 27001"],
  },
  {
    id: "ai_platform",
    name: "AI Platform",
    category: "LLM, RAG & Agentic Systems",
    estimatedSetupMinutes: 4,
    summary: "Foundation model endpoints, vector RAG pipelines, agent tool-execution sandboxes, and prompt guardrails.",
    recommendedProgramName: "AI Inference & Agent Sandbox Bounty",
    recommendedDescription:
      "Red-teaming and vulnerability research across LLM inference gateways, cross-tenant RAG vector stores, and code-interpreter container escapes.",
    businessUnit: "Applied AI & Foundation Models",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 8000, max: 20000 },
      high: { min: 3000, max: 8000 },
      medium: { min: 800, max: 2500 },
      low: { min: 200, max: 500 },
      informational: { min: 0, max: 100 },
    },
    monthlyBudgetEstimate: 38000,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 8,
      triageSlaHours: 24,
      resolutionSlaDays: 14,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Cosmetic jailbreaks or benign hallucinations without cross-tenant data access or tool execution",
        "Token exhaustion attacks against shared GPU inference clusters",
      ],
      autoCloseDays: 21,
      severityScoring: "CVSS v4.0",
    },
    defaultIntegrations: ["linear", "slack", "github", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "MITRE ATLAS Classification → Sandbox Escape Reproduction → Model Guardrail Patch",
    complianceTags: ["NIST AI RMF", "OWASP LLM Top 10", "EU AI Act"],
  },
  {
    id: "kubernetes",
    name: "Kubernetes Infrastructure",
    category: "Container & Service Mesh",
    estimatedSetupMinutes: 4,
    summary: "EKS/GKE clusters, Envoy/Istio service mesh, container registries, and eBPF runtime enforcement.",
    recommendedProgramName: "Kubernetes Runtime & Service Mesh Bounty",
    recommendedDescription:
      "Testing container isolation, kube-apiserver RBAC, admission controllers, and signed OCI image supply chains.",
    businessUnit: "Platform Engineering & Runtime",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 7000, max: 18000 },
      high: { min: 2500, max: 6500 },
      medium: { min: 750, max: 2000 },
      low: { min: 200, max: 500 },
      informational: { min: 0, max: 50 },
    },
    monthlyBudgetEstimate: 32000,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 12,
      triageSlaHours: 24,
      resolutionSlaDays: 14,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Terminating control-plane etcd nodes or disrupting cluster CNI routing",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v4.0",
    },
    defaultIntegrations: ["jira", "slack", "gitlab", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Pod Escape Verification → CIS Benchmark Correlation → Helm Chart Hotfix",
    complianceTags: ["CIS Kubernetes", "SLSA Level 3", "SOC 2"],
  },
  {
    id: "internal_network",
    name: "Internal Corporate Network",
    category: "Zero-Trust & Enterprise Corp",
    estimatedSetupMinutes: 5,
    summary: "Zero-trust bastion, VPN concentrators, internal ASN IP blocks, and employee SSO identity endpoints.",
    recommendedProgramName: "Zero-Trust Perimeter & Corporate ASN Program",
    recommendedDescription:
      "Perimeter and assumed-breach assessment across corporate IP ranges, zero-trust access proxies, and internal developer portals.",
    businessUnit: "Corporate Security & IT Infrastructure",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 6000, max: 15000 },
      high: { min: 2000, max: 5500 },
      medium: { min: 600, max: 1800 },
      low: { min: 150, max: 400 },
      informational: { min: 0, max: 50 },
    },
    monthlyBudgetEstimate: 26000,
    policy: {
      disclosureTimelineDays: 120,
      safeHarborType: "Conditional Safe Harbor",
      responseSlaHours: 12,
      triageSlaHours: 24,
      resolutionSlaDays: 21,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Lateral movement into employee workstation subnets",
        "Password spraying against corporate Active Directory accounts",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v3.1",
    },
    defaultIntegrations: ["jira", "slack", "email", "webhooks"],
    defaultAutomations: [],
    defaultWorkflowSummary: "ASN Telemetry Match → SOC Alert Correlation → Firewall/Bastion Patch",
    complianceTags: ["NIST Zero Trust", "ISO 27001"],
  },
  {
    id: "blank",
    name: "Start Blank",
    category: "Custom Architecture",
    estimatedSetupMinutes: 8,
    summary: "Configure scope categories, severity sliders, disclosure SLAs, and workflow automations from scratch.",
    recommendedProgramName: "Custom Security Engagement",
    recommendedDescription:
      "Tailored security program with custom asset scope, bespoke severity thresholds, and organization-specific triage rules.",
    businessUnit: "Security Operations",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: [],
    rewardMatrix: {
      critical: { min: 3000, max: 10000 },
      high: { min: 1200, max: 3000 },
      medium: { min: 400, max: 1000 },
      low: { min: 100, max: 250 },
      informational: { min: 0, max: 0 },
    },
    monthlyBudgetEstimate: 15000,
    policy: {
      disclosureTimelineDays: 90,
      safeHarborType: "Full Legal Safe Harbor",
      responseSlaHours: 24,
      triageSlaHours: 48,
      resolutionSlaDays: 30,
      duplicateHandling: "First valid reporter receives 100% reward",
      outOfScopeRules: [
        "Denial of Service (DoS/DDoS) or automated scanner traffic exceeding 20 req/sec",
        "Social engineering or physical security testing",
      ],
      autoCloseDays: 30,
      severityScoring: "CVSS v3.1",
    },
    defaultIntegrations: ["email"],
    defaultAutomations: [],
    defaultWorkflowSummary: "Standard Triage Intake → Manual Severity Review → Researcher Resolution",
    complianceTags: ["Custom Policy"],
  },
] as const;

export type AssetCategory =
  | "Domains"
  | "APIs"
  | "Mobile Apps"
  | "Web Apps"
  | "Repositories"
  | "Cloud Accounts"
  | "IP Ranges"
  | "Containers"
  | "Kubernetes"
  | "AI Models";

export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  "Domains",
  "APIs",
  "Mobile Apps",
  "Web Apps",
  "Repositories",
  "Cloud Accounts",
  "IP Ranges",
  "Containers",
  "Kubernetes",
  "AI Models",
] as const;

export interface StudioAsset {
  id: string;
  /** The scope rule's asset type this becomes when the program is created. */
  targetType: StudioTargetType;
  identifier: string;
  title: string;
  category: AssetCategory;
  /** We don't record an asset's environment; real assets are "Unspecified". */
  environment: "Production" | "Staging" | "Sandbox" | "Disaster Recovery" | "Unspecified";
  verified: boolean;
  verificationMethod: string;
  riskTier: "Critical" | "High" | "Medium" | "Low";
  businessImpact: "Mission Critical" | "Revenue Core" | "Operational" | "Internal";
  ownerTeam: string;
  tags: string[];
  estimatedEndpoints: number;
   duplicateGroupKey?: string;
  conflictsWithAssetId?: string;
}

// Assets come from the organization's real inventory (StudioAsset[] built by the page).

/** The asset types our scope rules accept (actions/scope.ts). */
export type StudioTargetType = "domain" | "url" | "ip_cidr" | "ios_app" | "android_app" | "source_code" | "hardware" | "ai_model";
export const STUDIO_TARGET_TYPES: readonly { value: StudioTargetType; label: string; category: AssetCategory }[] = [
  { value: "domain", label: "Domain", category: "Domains" },
  { value: "url", label: "URL / API", category: "APIs" },
  { value: "ip_cidr", label: "IP / CIDR", category: "IP Ranges" },
  { value: "ios_app", label: "iOS app", category: "Mobile Apps" },
  { value: "android_app", label: "Android app", category: "Mobile Apps" },
  { value: "source_code", label: "Source code", category: "Repositories" },
  { value: "hardware", label: "Hardware", category: "Containers" },
  { value: "ai_model", label: "AI model", category: "AI Models" },
];

/** A studio asset from real facts only. Risk and impact follow the asset's reward group (a
 * crown jewel pays top critical bounties) and its open reports; environment, owner and tags
 * aren't recorded, so they stay empty. */
export function makeStudioAsset(id: string, targetType: StudioTargetType, identifier: string, verified: boolean, facts: { crownJewel?: boolean; openReports?: number } = {}): StudioAsset {
  const category = STUDIO_TARGET_TYPES.find((t) => t.value === targetType)?.category ?? "Domains";
  return {
    id,
    targetType,
    identifier,
    title: identifier,
    category,
    environment: "Unspecified",
    verified,
    verificationMethod: verified ? "DNS TXT record" : "",
    riskTier: facts.crownJewel ? "Critical" : (facts.openReports ?? 0) > 0 ? "High" : "Low",
    businessImpact: facts.crownJewel ? "Mission Critical" : "Operational",
    ownerTeam: "",
    tags: [],
    estimatedEndpoints: 1,
  };
}

export type ResearcherCohortTab =
  | "Recommended Researchers"
  | "Past Participants"
  | "Top Performers"
  | "Internal Groups"
  | "Invite by Email"
  | "Invite by Link";

export interface StudioResearcher {
  id: string;
  handle: string;
  name: string;
  avatarInitials: string;
  country: string;
  countryCode: string;
  cohortCategory: "Recommended Researchers" | "Past Participants" | "Top Performers" | "Internal Groups";
  reputation: number;
  signalScore: number;
  acceptanceRate: number;
  averageSeverity: "Critical" | "High" | "Medium";
  responseTimeHours: number;
  recentActivity: string;
  skills: string[];
  languages: string[];
  industryExperience: string[];
  availability: "Available Now" | "Limited Capacity" | "Booked";
  verifiedKyc: boolean;
  pastValidReports: number;
  bountiesFinalized: number;
}

// Researcher suggestions come from the public leaderboard (StudioResearcher[] built by the page).

export type AutomationCategory =
  | "Issue Tracking"
  | "Communication"
  | "Developer"
  | "Notifications"
  | "AI"
  | "Workflow";

export interface StudioIntegrationModule {
  id: string;
  name: string;
  category: AutomationCategory;
  provider: string;
  description: string;
  status: "Connected" | "Available" | "Warning";
  healthPercent: number;
  latencyLabel: string;
  warningNote?: string;
  /** Not built yet: shown as Coming soon and can't be enabled. */
  comingSoon?: boolean;
}

/** Integrations and workflow modules shown on the Automation step. Status is set by the page from
 * the organization's real connections; `comingSoon` ones are not built yet and can't be enabled.
 * Integrations are organization-wide (Settings > Integrations); the studio only reports them. */
export const STUDIO_AUTOMATION_MODULES: readonly StudioIntegrationModule[] = [
  { id: "jira", name: "Jira", category: "Issue Tracking", provider: "Atlassian", description: "Create and sync Jira issues from accepted reports.", status: "Available", healthPercent: 0, latencyLabel: "" },
  { id: "azure_devops", name: "Azure DevOps Boards", category: "Issue Tracking", provider: "Microsoft", description: "Work items from accepted reports.", status: "Available", healthPercent: 0, latencyLabel: "", comingSoon: true },
  { id: "linear", name: "Linear", category: "Issue Tracking", provider: "Linear", description: "Issues from accepted reports.", status: "Available", healthPercent: 0, latencyLabel: "", comingSoon: true },
  { id: "servicenow", name: "ServiceNow", category: "Issue Tracking", provider: "ServiceNow", description: "Incidents from accepted reports.", status: "Available", healthPercent: 0, latencyLabel: "" },
  { id: "slack", name: "Slack", category: "Communication", provider: "Slack", description: "Report and program alerts in a Slack channel.", status: "Available", healthPercent: 0, latencyLabel: "" },
  { id: "teams", name: "Microsoft Teams", category: "Communication", provider: "Microsoft", description: "Report and program alerts in a Teams channel.", status: "Available", healthPercent: 0, latencyLabel: "" },
  { id: "discord", name: "Discord", category: "Communication", provider: "Discord", description: "Alerts in a Discord channel.", status: "Available", healthPercent: 0, latencyLabel: "", comingSoon: true },
  { id: "github", name: "GitHub", category: "Developer", provider: "GitHub", description: "Open issues in a linked repository.", status: "Available", healthPercent: 0, latencyLabel: "" },
  { id: "gitlab", name: "GitLab", category: "Developer", provider: "GitLab", description: "Open issues in a linked project.", status: "Available", healthPercent: 0, latencyLabel: "" },
  { id: "email", name: "Email notifications", category: "Notifications", provider: "Unpatched", description: "Report, payment and program emails to your team.", status: "Connected", healthPercent: 0, latencyLabel: "" },
  { id: "webhooks", name: "Signed webhooks", category: "Notifications", provider: "Unpatched", description: "HMAC-signed event delivery to your endpoint, with retries.", status: "Available", healthPercent: 0, latencyLabel: "" },
  // AI modules are not built yet; kept out of the studio until they are.
  // { id: "ai_duplicate", name: "Duplicate Detection", category: "AI", ... },
  // { id: "ai_severity", name: "Severity Recommendation", category: "AI", ... },
  // { id: "ai_triage", name: "AI Triage", category: "AI", ... },
  // { id: "auto_assign", name: "Auto Assignment", category: "AI", ... },
  { id: "auto_verify_scope", name: "Auto Verify Scope", category: "Workflow", provider: "Unpatched", description: "Re-check domain ownership on a schedule.", status: "Available", healthPercent: 0, latencyLabel: "", comingSoon: true },
  { id: "auto_escalation", name: "Auto Escalation", category: "Workflow", provider: "Unpatched", description: "Escalate reports that miss their SLA.", status: "Available", healthPercent: 0, latencyLabel: "", comingSoon: true },
  { id: "sla_alerts", name: "SLA Alerts", category: "Workflow", provider: "Unpatched", description: "Alerts before an SLA is breached.", status: "Available", healthPercent: 0, latencyLabel: "", comingSoon: true },
];

export type StudioVisibilityMode = "Public" | "Private" | "Invite Only" | "VDP";
export type StudioLifecycleMode = "Draft" | "Scheduled" | "Active";

export interface LaunchStudioState {
  currentStep: StudioStepId;
  welcomeChoice: WelcomeEngagementOptionId;
  blueprintId: BlueprintId;
  programName: string;
  shortDescription: string;
  businessUnit: string;
  productOwner: string;
  securityContact: string;
  visibility: StudioVisibilityMode;
  lifecycle: StudioLifecycleMode;
  launchDate: string;
  endDate: string;
  selectedAssetIds: string[];
  rewardMatrix: RewardMatrixConfig;
  monthlyBudgetReserve: number;
  policy: PolicyConfig;
  invitedResearcherIds: string[];
  invitedEmails: string[];
  inviteLinkEnabled: boolean;
  enabledModuleIds: string[];
}

/** The organization defaults a new engagement starts from (organization settings). */
export type StudioDefaults = { visibility: "public" | "private"; firstResponseHours: number; triageHours: number; resolutionDays: number; disclosureDays: number; safeHarbor: boolean };

/** A blank engagement: no template text, the organization's defaults for policy and visibility. */
export function createInitialStudioState(defaults?: StudioDefaults): LaunchStudioState {
  const defaultBlueprint = PROGRAM_BLUEPRINTS[0]; // reward and policy shape only; no template text
  const policy = structuredClone(defaultBlueprint.policy);
  if (defaults) {
    policy.responseSlaHours = defaults.firstResponseHours;
    policy.triageSlaHours = defaults.triageHours;
    policy.resolutionSlaDays = defaults.resolutionDays;
    policy.disclosureTimelineDays = defaults.disclosureDays;
    policy.safeHarborType = defaults.safeHarbor ? "Full Legal Safe Harbor" : "Standard Authorization";
  }
  return {
    currentStep: "welcome",
    welcomeChoice: "continuous_bug_bounty",
    blueprintId: defaultBlueprint.id,
    programName: "",
    shortDescription: "",
    businessUnit: "",
    productOwner: "",
    securityContact: "",
    visibility: defaults?.visibility === "private" ? "Private" : "Public",
    lifecycle: "Active",
    launchDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    selectedAssetIds: [...defaultBlueprint.defaultAssetIds],
    rewardMatrix: structuredClone(defaultBlueprint.rewardMatrix),
    monthlyBudgetReserve: defaultBlueprint.monthlyBudgetEstimate,
    policy,
    invitedResearcherIds: [],
    invitedEmails: [],
    inviteLinkEnabled: false,
    enabledModuleIds: [],
  };
}

export interface ScopeTelemetryWarning {
  id: string;
  type: "unverified" | "duplicate" | "conflict" | "missing_production";
  severity: "warning" | "critical";
  title: string;
  detail: string;
  affectedAssetIds: string[];
}

export interface ScopeTelemetryReport {
  totalSelected: number;
  coveragePercent: number;
  verificationPercent: number;
  estimatedAttackSurfaceEndpoints: number;
  attackSurfaceRating: "Comprehensive" | "Focused" | "Narrow" | "Minimal";
  criticalAssetsCount: number;
  businessImpactLabel: "Tier-0 Mission Critical" | "High Revenue Core" | "Standard Operational" | "Low Exposure";
  categoriesCovered: number;
  warnings: ScopeTelemetryWarning[];
}

export function calculateScopeTelemetry(
  selectedAssetIds: readonly string[],
  catalog: readonly StudioAsset[],
): ScopeTelemetryReport {
  const selectedSet = new Set(selectedAssetIds);
  const selectedAssets = catalog.filter((a) => selectedSet.has(a.id));
  const totalSelected = selectedAssets.length;

  const totalCatalogSize = Math.max(1, catalog.length);
  const categoriesCovered = new Set(selectedAssets.map((a) => a.category)).size;
  const rawCoverage = Math.round(
    Math.min(100, (totalSelected / Math.min(8, totalCatalogSize)) * 65 + (categoriesCovered / ASSET_CATEGORIES.length) * 35),
  );
  const coveragePercent = totalSelected === 0 ? 0 : Math.max(12, rawCoverage);

  const verifiedCount = selectedAssets.filter((a) => a.verified).length;
  const verificationPercent = totalSelected === 0 ? 0 : Math.round((verifiedCount / totalSelected) * 100);

  const estimatedAttackSurfaceEndpoints = selectedAssets.reduce((sum, a) => sum + a.estimatedEndpoints, 0);
  const attackSurfaceRating: ScopeTelemetryReport["attackSurfaceRating"] =
    estimatedAttackSurfaceEndpoints >= 160
      ? "Comprehensive"
      : estimatedAttackSurfaceEndpoints >= 80
        ? "Focused"
        : estimatedAttackSurfaceEndpoints >= 25
          ? "Narrow"
          : "Minimal";

  const criticalAssetsCount = selectedAssets.filter((a) => a.riskTier === "Critical").length;
  const hasMissionCritical = selectedAssets.some((a) => a.businessImpact === "Mission Critical");
  const hasRevenueCore = selectedAssets.some((a) => a.businessImpact === "Revenue Core");

  const businessImpactLabel: ScopeTelemetryReport["businessImpactLabel"] = hasMissionCritical
    ? "Tier-0 Mission Critical"
    : hasRevenueCore
      ? "High Revenue Core"
      : totalSelected > 0
        ? "Standard Operational"
        : "Low Exposure";

  const warnings: ScopeTelemetryWarning[] = [];

  // 1. Unverified assets warning
  const unverifiedAssets = selectedAssets.filter((a) => !a.verified);
  if (unverifiedAssets.length > 0) {
    warnings.push({
      id: "warn-unverified",
      type: "unverified",
      severity: "warning",
      title: `${unverifiedAssets.length} unverified asset${unverifiedAssets.length > 1 ? "s" : ""} in scope`,
      detail: `${unverifiedAssets.map((a) => a.identifier).join(", ")} pending ownership verification (${unverifiedAssets[0].verificationMethod}).`,
      affectedAssetIds: unverifiedAssets.map((a) => a.id),
    });
  }

  // 2. Duplicate assets warning
  const groupMap = new Map<string, StudioAsset[]>();
  for (const asset of selectedAssets) {
    if (asset.duplicateGroupKey) {
      const list = groupMap.get(asset.duplicateGroupKey) ?? [];
      list.push(asset);
      groupMap.set(asset.duplicateGroupKey, list);
    }
  }
  for (const [key, group] of groupMap.entries()) {
    if (group.length > 1) {
      warnings.push({
        id: `warn-dup-${key}`,
        type: "duplicate",
        severity: "warning",
        title: "Overlapping wildcard & root domain",
        detail: `${group.map((a) => a.identifier).join(" and ")} overlap in target scope. Keep the wildcard rule to avoid duplicate researcher confusion.`,
        affectedAssetIds: group.map((a) => a.id),
      });
    }
  }

  // 3. Conflicting scopes warning
  const conflictingAssets = selectedAssets.filter(
    (a) => a.conflictsWithAssetId && selectedSet.has(a.conflictsWithAssetId),
  );
  if (conflictingAssets.length > 0) {
    warnings.push({
      id: "warn-conflict",
      type: "conflict",
      severity: "warning",
      title: "Conflicting scope definition detected",
      detail: "Selected assets overlap, so a report could match more than one entry.",
      affectedAssetIds: conflictingAssets.map((a) => a.id),
    });
  }

  return {
    totalSelected,
    coveragePercent,
    verificationPercent,
    estimatedAttackSurfaceEndpoints,
    attackSurfaceRating,
    criticalAssetsCount,
    businessImpactLabel,
    categoriesCovered,
    warnings,
  };
}

export interface RewardForecastReport {
  averagePayout: number;
  estimatedMonthlySpend: number;
  annualizedProjection: number;
  expectedMonthlyValidReports: number;
  historicalComparisonLabel: string;
  historicalDeltaPercent: number;
  competitivenessTier: "Top 10% Market Leader" | "Competitive Enterprise" | "Below Industry Median" | "VDP (Recognition Only)";
  recommendations: string[];
}

export function calculateRewardForecast(
  rewardMatrix: RewardMatrixConfig,
  visibility: StudioVisibilityMode,
  selectedAssetCount: number,
): RewardForecastReport {
  if (visibility === "VDP") {
    return {
      averagePayout: 0,
      estimatedMonthlySpend: 0,
      annualizedProjection: 0,
      expectedMonthlyValidReports: Math.max(4, selectedAssetCount * 2),
      historicalComparisonLabel: "VDP mode — reputation & Hall of Fame recognition only",
      historicalDeltaPercent: 0,
      competitivenessTier: "VDP (Recognition Only)",
      recommendations: [
        "Consider adding a discretionary bonus pool ($500–$2,500) for exceptional Critical RCE or auth-bypass reports.",
      ],
    };
  }

  const critMid = (rewardMatrix.critical.min + rewardMatrix.critical.max) / 2;
  const highMid = (rewardMatrix.high.min + rewardMatrix.high.max) / 2;
  const medMid = (rewardMatrix.medium.min + rewardMatrix.medium.max) / 2;
  const lowMid = (rewardMatrix.low.min + rewardMatrix.low.max) / 2;

  // Weighted industry severity distribution: 8% Critical, 22% High, 45% Medium, 25% Low
  const averagePayout = Math.round(critMid * 0.08 + highMid * 0.22 + medMid * 0.45 + lowMid * 0.25);

  const visibilityMultiplier = visibility === "Public" ? 1.35 : visibility === "Private" ? 1.0 : 0.85;
  const expectedMonthlyValidReports = Math.max(
    3,
    Math.round((Math.max(2, selectedAssetCount) * 2.2) * visibilityMultiplier),
  );
  const estimatedMonthlySpend = Math.round((averagePayout * expectedMonthlyValidReports) / 100) * 100;
  const annualizedProjection = estimatedMonthlySpend * 12;

  const industryMedianCritMax = 12000;
  const historicalDeltaPercent = Math.round(
    ((rewardMatrix.critical.max - industryMedianCritMax) / industryMedianCritMax) * 100,
  );

  const competitivenessTier: RewardForecastReport["competitivenessTier"] =
    rewardMatrix.critical.max >= 15000
      ? "Top 10% Market Leader"
      : rewardMatrix.critical.max >= 8000
        ? "Competitive Enterprise"
        : "Below Industry Median";

  const historicalComparisonLabel =
    historicalDeltaPercent >= 0
      ? `+${historicalDeltaPercent}% above enterprise peer median ($12,000 Critical cap)`
      : `${historicalDeltaPercent}% below enterprise peer median ($12,000 Critical cap)`;

  const recommendations: string[] = [];
  if (rewardMatrix.critical.max < 10000) {
    recommendations.push(
      "Raising Critical max bounty to $12,000+ attracts 2.4× more Top-100 researchers during launch week.",
    );
  } else {
    recommendations.push(
      "Critical tier ($" +
        rewardMatrix.critical.min.toLocaleString("en-US") +
        "–$" +
        rewardMatrix.critical.max.toLocaleString("en-US") +
        ") is calibrated in the top decile for enterprise cloud programs.",
    );
  }
  if (rewardMatrix.high.min < rewardMatrix.medium.max) {
    recommendations.push(
      "High minimum overlaps with Medium maximum—align thresholds for unambiguous researcher expectations.",
    );
  } else {
    recommendations.push(
      "Severity bands have clean non-overlapping separation across Critical, High, Medium, and Low tiers.",
    );
  }

  return {
    averagePayout,
    estimatedMonthlySpend,
    annualizedProjection,
    expectedMonthlyValidReports,
    historicalComparisonLabel,
    historicalDeltaPercent,
    competitivenessTier,
    recommendations,
  };
}

export interface ReadinessCheckItem {
  id: string;
  label: string;
  status: "complete" | "warning";
  detail: string;
  targetStep: StudioStepId;
}

export interface ProgramReadinessReport {
  score: number;
  gradeLabel: "Launch Ready" | "Ready with Advisories" | "Needs Attention";
  items: ReadinessCheckItem[];
}

export function calculateReadinessReport(
  state: LaunchStudioState,
  catalog: readonly StudioAsset[],
  /** Integration modules the organization has actually connected. */
  connectedModuleIds: readonly string[] = [],
): ProgramReadinessReport {
  const scopeTelemetry = calculateScopeTelemetry(state.selectedAssetIds, catalog);
  const scopeComplete = state.selectedAssetIds.length >= 1;
  const policyPublished =
    state.policy.responseSlaHours > 0 &&
    state.policy.resolutionSlaDays > 0 &&
    state.policy.disclosureTimelineDays >= 30;
  const budgetConfigured =
    state.visibility === "VDP" || state.rewardMatrix.critical.max > 0;
  const researchersInvited =
    state.visibility === "Public" ||
    state.invitedResearcherIds.length > 0 ||
    state.invitedEmails.length > 0;
  const automationEnabled = connectedModuleIds.some((id) => id !== "email");
  const slackConnected = connectedModuleIds.includes("slack") || connectedModuleIds.includes("teams");
  const allDnsVerified = scopeTelemetry.verificationPercent === 100 && state.selectedAssetIds.length > 0;

  const items: ReadinessCheckItem[] = [
    {
      id: "check-scope",
      label: "Scope Complete",
      status: scopeComplete ? "complete" : "warning",
      detail: scopeComplete
        ? `${state.selectedAssetIds.length} assets configured (${scopeTelemetry.criticalAssetsCount} Critical tier)`
        : "Add at least one asset to scope",
      targetStep: "scope",
    },
    {
      id: "check-policy",
      label: "Policy Published",
      status: policyPublished ? "complete" : "warning",
      detail: policyPublished
        ? `${state.policy.safeHarborType} · ${state.policy.responseSlaHours}h Response SLA`
        : "Configure response SLA and disclosure policy",
      targetStep: "rewards",
    },
    {
      id: "check-budget",
      label: "Budget Configured",
      status: budgetConfigured ? "complete" : "warning",
      detail:
        state.visibility === "VDP"
          ? "VDP mode (No monetary bounty required)"
          : `$${state.monthlyBudgetReserve.toLocaleString("en-US")}/mo reserve · up to $${state.rewardMatrix.critical.max.toLocaleString("en-US")} Critical`,
      targetStep: "rewards",
    },
    {
      id: "check-researchers",
      label: "Researchers Invited",
      status: researchersInvited ? "complete" : "warning",
      detail:
        state.invitedResearcherIds.length + state.invitedEmails.length > 0
          ? `${state.invitedResearcherIds.length} vetted researchers + ${state.invitedEmails.length} direct invite(s)`
          : "Public discovery enabled",
      targetStep: "access",
    },
    {
      id: "check-automation",
      label: "Integration connected",
      status: automationEnabled ? "complete" : "warning",
      detail: automationEnabled
        ? `${connectedModuleIds.filter((id) => id !== "email").length} connected for your organization`
        : "Connect Jira, Slack, GitHub or a webhook in Integrations",
      targetStep: "automation",
    },
    {
      id: "check-slack",
      label: slackConnected ? "Chat alerts connected" : "Slack or Teams not connected",
      status: slackConnected ? "complete" : "warning",
      detail: slackConnected
        ? "Realtime P1 alerts routed to #sec-ops"
        : "Optional: Connect Slack for real-time P1 notifications",
      targetStep: "automation",
    },
    {
      id: "check-dns",
      label: allDnsVerified ? "DNS verification complete" : "DNS verification pending",
      status: allDnsVerified ? "complete" : "warning",
      detail: allDnsVerified
        ? `100% of ${state.selectedAssetIds.length} in-scope assets verified`
        : `${100 - scopeTelemetry.verificationPercent}% of selected scope awaiting DNS TXT check`,
      targetStep: "scope",
    },
  ];

  let score = 62;
  if (scopeComplete) score += 10;
  if (policyPublished) score += 8;
  if (budgetConfigured) score += 6;
  if (researchersInvited) score += 5;
  if (automationEnabled) score += 5;
  if (slackConnected) score += 2;
  if (allDnsVerified) score += 2;
  if (!state.programName.trim()) score -= 20;

  const clampedScore = Math.max(25, Math.min(100, score));
  const gradeLabel: ProgramReadinessReport["gradeLabel"] =
    clampedScore >= 90 ? "Launch Ready" : clampedScore >= 75 ? "Ready with Advisories" : "Needs Attention";

  return {
    score: clampedScore,
    gradeLabel,
    items,
  };
}

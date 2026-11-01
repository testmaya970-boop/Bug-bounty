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
    subtitle: "Wire issue trackers, chat ops, developer pipelines, AI triage, and SLA escalation workflows.",
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
    highlights: ["Dynamic severity reward matrix", "Continuous asset sync", "Managed AI triage included"],
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
    recommendedProgramName: "Northwind Cloud Core & Multi-Tenant SaaS Bounty",
    recommendedDescription:
      "Continuous security testing across Northwind Cloud's multi-tenant control plane, identity federation, and customer workspace APIs.",
    businessUnit: "Core Cloud Platform",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: ["asset-dom-1", "asset-dom-2", "asset-api-1", "asset-web-1", "asset-repo-1"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_verify_scope", "sla_alerts"],
    defaultWorkflowSummary: "Intake → AI Deduplication → Triage (<24h) → Jira Sync → Auto Payout on Fix",
    complianceTags: ["SOC 2 Type II", "ISO 27001", "GDPR"],
  },
  {
    id: "fintech",
    name: "FinTech",
    category: "Financial & Ledger Systems",
    estimatedSetupMinutes: 4,
    summary: "High-value payment rails, ledger integrity, wire transfer APIs, and KYC/AML verification flows.",
    recommendedProgramName: "Northwind Treasury & Payment Rails Security Program",
    recommendedDescription:
      "High-assurance bug bounty covering payment settlement APIs, cryptographic signing services, and double-entry ledger integrity.",
    businessUnit: "Payments & Financial Infrastructure",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: ["asset-dom-1", "asset-api-1", "asset-api-2", "asset-web-1", "asset-cloud-1"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_assign", "auto_verify_scope", "auto_escalation", "sla_alerts"],
    defaultWorkflowSummary: "Instant P1 Page → 6h Response SLA → Ledger Isolation Check → Dual-Approval Payout",
    complianceTags: ["PCI-DSS 4.0", "SOX", "SOC 2 Type II"],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    category: "Clinical & HIPAA Systems",
    estimatedSetupMinutes: 4,
    summary: "PHI data enclaves, FHIR interoperability APIs, patient portals, and telehealth endpoints.",
    recommendedProgramName: "Northwind Health Cloud & FHIR Interoperability Program",
    recommendedDescription:
      "Zero-PHI synthetic testing environment covering clinical APIs, patient identity brokers, and encrypted storage enclaves.",
    businessUnit: "Regulated Health Systems",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: ["asset-dom-1", "asset-api-1", "asset-web-2", "asset-mob-1", "asset-cloud-1"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_verify_scope", "sla_alerts"],
    defaultWorkflowSummary: "PHI Redaction Check → HIPAA Compliance Triage → Clinical Eng Escalation",
    complianceTags: ["HIPAA", "HITRUST", "FDA Cyber"],
  },
  {
    id: "government",
    name: "Government",
    category: "Public Sector & FedRAMP",
    estimatedSetupMinutes: 5,
    summary: "CISA BOD 20-01 aligned vulnerability disclosure and cleared-researcher boundary testing.",
    recommendedProgramName: "Northwind Federal & Public Sector Boundary Program",
    recommendedDescription:
      "FedRAMP High boundary testing aligned with CISA directive requirements and coordinated vulnerability disclosure protocols.",
    businessUnit: "Public Sector & Defense",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: ["asset-dom-1", "asset-dom-3", "asset-ip-1", "asset-web-1"],
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
    defaultAutomations: ["ai_duplicate", "auto_verify_scope", "auto_escalation", "sla_alerts"],
    defaultWorkflowSummary: "Clearance Verification → CISA Severity Tagging → POA&M Ticket Creation",
    complianceTags: ["FedRAMP High", "NIST 800-53", "CISA BOD 20-01"],
  },
  {
    id: "enterprise_cloud",
    name: "Enterprise Cloud",
    category: "Multi-Cloud Control Plane",
    estimatedSetupMinutes: 4,
    summary: "AWS/GCP/Azure control planes, IAM cross-account roles, Terraform modules, and edge gateways.",
    recommendedProgramName: "Northwind Multi-Cloud Control Plane & IAM Bounty",
    recommendedDescription:
      "Offensive security assessment of cloud account boundaries, workload identity federation, and global edge routing.",
    businessUnit: "Cloud Infrastructure & SRE",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: ["asset-cloud-1", "asset-cloud-2", "asset-k8s-1", "asset-ip-1", "asset-dom-1"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_assign", "auto_verify_scope", "sla_alerts"],
    defaultWorkflowSummary: "Cloud Asset Correlation → Blast-Radius Scoring → SRE Pager Escalation",
    complianceTags: ["CSA STAR", "ISO 27017", "SOC 2"],
  },
  {
    id: "mobile_app",
    name: "Mobile Application",
    category: "iOS & Android Ecosystems",
    estimatedSetupMinutes: 3,
    summary: "iOS/Android binaries, deep-link handlers, biometric auth enclave, and mobile BFF APIs.",
    recommendedProgramName: "Northwind Mobile Client & Biometric Auth Bounty",
    recommendedDescription:
      "Security evaluation of iOS App Store and Android Play Store builds, local keychain storage, certificate pinning, and mobile GraphQL BFF.",
    businessUnit: "Mobile Experience Team",
    severityScoring: "OWASP Risk Rating",
    defaultAssetIds: ["asset-mob-1", "asset-mob-2", "asset-api-1", "asset-dom-2"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "sla_alerts"],
    defaultWorkflowSummary: "Binary Version Check → OWASP MASVS Mapping → Linear Issue Creation",
    complianceTags: ["OWASP MASVS L2", "SOC 2"],
  },
  {
    id: "api_platform",
    name: "API Platform",
    category: "Developer APIs & Webhooks",
    estimatedSetupMinutes: 3,
    summary: "REST/GraphQL/gRPC gateways, OAuth2 token exchange, rate limiters, and webhook signing.",
    recommendedProgramName: "Northwind Developer API & GraphQL Gateway Bounty",
    recommendedDescription:
      "Focused testing on BOLA/IDOR, OAuth 2.1 scopes, webhook SSRF prevention, and tenant rate-limiting bypasses.",
    businessUnit: "Developer Platform & Ecosystem",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: ["asset-api-1", "asset-api-2", "asset-dom-2", "asset-repo-1"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_assign", "auto_verify_scope", "sla_alerts"],
    defaultWorkflowSummary: "OpenAPI Endpoint Match → BOLA Replay Verification → GitHub PR Link",
    complianceTags: ["OWASP API Top 10", "ISO 27001"],
  },
  {
    id: "ai_platform",
    name: "AI Platform",
    category: "LLM, RAG & Agentic Systems",
    estimatedSetupMinutes: 4,
    summary: "Foundation model endpoints, vector RAG pipelines, agent tool-execution sandboxes, and prompt guardrails.",
    recommendedProgramName: "Northwind AI Inference & Agent Sandbox Bounty",
    recommendedDescription:
      "Red-teaming and vulnerability research across LLM inference gateways, cross-tenant RAG vector stores, and code-interpreter container escapes.",
    businessUnit: "Applied AI & Foundation Models",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: ["asset-ai-1", "asset-ai-2", "asset-api-1", "asset-cont-1", "asset-k8s-1"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_assign", "auto_verify_scope", "auto_escalation", "sla_alerts"],
    defaultWorkflowSummary: "MITRE ATLAS Classification → Sandbox Escape Reproduction → Model Guardrail Patch",
    complianceTags: ["NIST AI RMF", "OWASP LLM Top 10", "EU AI Act"],
  },
  {
    id: "kubernetes",
    name: "Kubernetes Infrastructure",
    category: "Container & Service Mesh",
    estimatedSetupMinutes: 4,
    summary: "EKS/GKE clusters, Envoy/Istio service mesh, container registries, and eBPF runtime enforcement.",
    recommendedProgramName: "Northwind Kubernetes Runtime & Service Mesh Bounty",
    recommendedDescription:
      "Testing container isolation, kube-apiserver RBAC, admission controllers, and signed OCI image supply chains.",
    businessUnit: "Platform Engineering & Runtime",
    severityScoring: "CVSS v4.0",
    defaultAssetIds: ["asset-k8s-1", "asset-cont-1", "asset-cloud-1", "asset-repo-2"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "ai_triage", "auto_verify_scope", "sla_alerts"],
    defaultWorkflowSummary: "Pod Escape Verification → CIS Benchmark Correlation → Helm Chart Hotfix",
    complianceTags: ["CIS Kubernetes", "SLSA Level 3", "SOC 2"],
  },
  {
    id: "internal_network",
    name: "Internal Corporate Network",
    category: "Zero-Trust & Enterprise Corp",
    estimatedSetupMinutes: 5,
    summary: "Zero-trust bastion, VPN concentrators, internal ASN IP blocks, and employee SSO identity endpoints.",
    recommendedProgramName: "Northwind Zero-Trust Perimeter & Corporate ASN Program",
    recommendedDescription:
      "Perimeter and assumed-breach assessment across corporate IP ranges, zero-trust access proxies, and internal developer portals.",
    businessUnit: "Corporate Security & IT Infrastructure",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: ["asset-ip-1", "asset-dom-3", "asset-web-2", "asset-cloud-2"],
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
    defaultAutomations: ["ai_duplicate", "ai_severity", "auto_verify_scope", "auto_escalation", "sla_alerts"],
    defaultWorkflowSummary: "ASN Telemetry Match → SOC Alert Correlation → Firewall/Bastion Patch",
    complianceTags: ["NIST Zero Trust", "ISO 27001"],
  },
  {
    id: "blank",
    name: "Start Blank",
    category: "Custom Architecture",
    estimatedSetupMinutes: 8,
    summary: "Configure scope categories, severity sliders, disclosure SLAs, and workflow automations from scratch.",
    recommendedProgramName: "Northwind Custom Security Engagement",
    recommendedDescription:
      "Tailored security program with custom asset scope, bespoke severity thresholds, and organization-specific triage rules.",
    businessUnit: "Security Operations",
    severityScoring: "CVSS v3.1",
    defaultAssetIds: ["asset-dom-1", "asset-api-1"],
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
    defaultAutomations: ["ai_duplicate", "sla_alerts"],
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
  identifier: string;
  title: string;
  category: AssetCategory;
  environment: "Production" | "Staging" | "Sandbox" | "Disaster Recovery";
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

export const STUDIO_ASSET_CATALOG: readonly StudioAsset[] = [
  {
    id: "asset-dom-1",
    identifier: "*.northwind.cloud",
    title: "Primary Production Wildcard Domain",
    category: "Domains",
    environment: "Production",
    verified: true,
    verificationMethod: "DNS TXT Verified",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "Edge & Traffic Engineering",
    tags: ["Wildcard", "Edge", "TLS 1.3", "SOC2"],
    estimatedEndpoints: 42,
    duplicateGroupKey: "northwind-root-domain",
  },
  {
    id: "asset-dom-2",
    identifier: "auth.northwind.cloud",
    title: "Zero-Trust Identity & SSO Broker",
    category: "Domains",
    environment: "Production",
    verified: true,
    verificationMethod: "DNS TXT Verified",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "IAM & Identity Security",
    tags: ["OAuth2", "SAML", "Passkeys", "Tier-0"],
    estimatedEndpoints: 18,
  },
  {
    id: "asset-dom-3",
    identifier: "staging-id.northwind.cloud",
    title: "Pre-Production Identity Federation Mesh",
    category: "Domains",
    environment: "Staging",
    verified: false,
    verificationMethod: "Pending DNS TXT propagation",
    riskTier: "High",
    businessImpact: "Operational",
    ownerTeam: "IAM & Identity Security",
    tags: ["Staging", "Federation", "OIDC"],
    estimatedEndpoints: 14,
  },
  {
    id: "asset-dom-4",
    identifier: "northwind.cloud",
    title: "Apex Root Domain (Overlaps *.northwind.cloud)",
    category: "Domains",
    environment: "Production",
    verified: true,
    verificationMethod: "DNS TXT Verified",
    riskTier: "High",
    businessImpact: "Revenue Core",
    ownerTeam: "Edge & Traffic Engineering",
    tags: ["Apex", "Marketing", "Edge"],
    estimatedEndpoints: 9,
    duplicateGroupKey: "northwind-root-domain",
    conflictsWithAssetId: "asset-dom-1",
  },
  {
    id: "asset-api-1",
    identifier: "https://api.northwind.cloud/v2/*",
    title: "Core Customer GraphQL & REST Gateway",
    category: "APIs",
    environment: "Production",
    verified: true,
    verificationMethod: "mTLS + OpenAPI Schema Token",
    riskTier: "Critical",
    businessImpact: "Revenue Core",
    ownerTeam: "API Platform Group",
    tags: ["GraphQL", "REST", "BOLA-Sensitive", "PCI"],
    estimatedEndpoints: 86,
  },
  {
    id: "asset-api-2",
    identifier: "https://ledger-api.northwind.cloud/v1/*",
    title: "Treasury & Settlement Webhook Engine",
    category: "APIs",
    environment: "Production",
    verified: true,
    verificationMethod: "API Header Attestation",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "Payments & Ledger Core",
    tags: ["Fintech", "HMAC", "Webhooks", "High-Value"],
    estimatedEndpoints: 34,
  },
  {
    id: "asset-mob-1",
    identifier: "com.northwind.cloud.ios",
    title: "Northwind Enterprise iOS Client (v6.4)",
    category: "Mobile Apps",
    environment: "Production",
    verified: true,
    verificationMethod: "Apple App Attest",
    riskTier: "High",
    businessImpact: "Revenue Core",
    ownerTeam: "Mobile Platform",
    tags: ["iOS", "Swift", "SecureEnclave", "MASVS"],
    estimatedEndpoints: 22,
  },
  {
    id: "asset-mob-2",
    identifier: "cloud.northwind.android",
    title: "Northwind Enterprise Android Client (v6.4)",
    category: "Mobile Apps",
    environment: "Production",
    verified: true,
    verificationMethod: "Play Integrity Verified",
    riskTier: "High",
    businessImpact: "Revenue Core",
    ownerTeam: "Mobile Platform",
    tags: ["Android", "Kotlin", "Keystore", "MASVS"],
    estimatedEndpoints: 22,
  },
  {
    id: "asset-web-1",
    identifier: "https://console.northwind.cloud",
    title: "Enterprise Multi-Tenant Control Console",
    category: "Web Apps",
    environment: "Production",
    verified: true,
    verificationMethod: "Meta Tag + DNS Verified",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "Console Experience",
    tags: ["Next.js", "RBAC", "CSP-Strict", "Multi-Tenant"],
    estimatedEndpoints: 64,
  },
  {
    id: "asset-web-2",
    identifier: "https://admin-portal.northwind.internal",
    title: "Internal Backoffice Support & Billing Portal",
    category: "Web Apps",
    environment: "Staging",
    verified: true,
    verificationMethod: "Zero-Trust Bastion Cert",
    riskTier: "High",
    businessImpact: "Internal",
    ownerTeam: "Internal Tools & Ops",
    tags: ["Internal", "Admin", "Zero-Trust"],
    estimatedEndpoints: 29,
  },
  {
    id: "asset-repo-1",
    identifier: "github.com/northwind-cloud/zero-trust-sdk",
    title: "Northwind Zero-Trust Policy Engine SDK",
    category: "Repositories",
    environment: "Production",
    verified: true,
    verificationMethod: "GitHub App Installation",
    riskTier: "High",
    businessImpact: "Revenue Core",
    ownerTeam: "Security Engineering",
    tags: ["Rust", "Go", "Open-Source", "Cryptography"],
    estimatedEndpoints: 15,
  },
  {
    id: "asset-repo-2",
    identifier: "github.com/northwind-cloud/k8s-admission-controller",
    title: "Kubernetes OPA Gatekeeper & Admission Webhook",
    category: "Repositories",
    environment: "Production",
    verified: true,
    verificationMethod: "GitHub App Installation",
    riskTier: "High",
    businessImpact: "Operational",
    ownerTeam: "Platform Engineering",
    tags: ["Go", "Kubernetes", "Admission-Control"],
    estimatedEndpoints: 11,
  },
  {
    id: "asset-cloud-1",
    identifier: "aws://arn:aws:iam::891377210492:root",
    title: "AWS Production Control Plane Account (us-east-1)",
    category: "Cloud Accounts",
    environment: "Production",
    verified: true,
    verificationMethod: "AWS OIDC Role Trust",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "Cloud Infrastructure SRE",
    tags: ["AWS", "IAM", "KMS", "S3-Enclave"],
    estimatedEndpoints: 50,
  },
  {
    id: "asset-cloud-2",
    identifier: "gcp://projects/northwind-prod-mesh-01",
    title: "GCP Analytics & BigQuery Data Enclave",
    category: "Cloud Accounts",
    environment: "Disaster Recovery",
    verified: false,
    verificationMethod: "Pending Workload Identity binding",
    riskTier: "Medium",
    businessImpact: "Operational",
    ownerTeam: "Data Platform",
    tags: ["GCP", "BigQuery", "VPC-SC"],
    estimatedEndpoints: 24,
  },
  {
    id: "asset-ip-1",
    identifier: "198.51.100.0/24 (AS64512)",
    title: "Northwind Anycast Edge & BGP Perimeter Block",
    category: "IP Ranges",
    environment: "Production",
    verified: true,
    verificationMethod: "RPKI ROA + ARIN WHOIS",
    riskTier: "High",
    businessImpact: "Mission Critical",
    ownerTeam: "Network & Edge SRE",
    tags: ["BGP", "Anycast", "IPv4", "DDoS-Shielded"],
    estimatedEndpoints: 254,
  },
  {
    id: "asset-cont-1",
    identifier: "oci://registry.northwind.cloud/runtime/enclave-worker:v4.2",
    title: "Hardened Distroless Worker Container Image",
    category: "Containers",
    environment: "Production",
    verified: true,
    verificationMethod: "Cosign Sigstore Attestation",
    riskTier: "High",
    businessImpact: "Revenue Core",
    ownerTeam: "Platform Runtime",
    tags: ["OCI", "Cosign", "SLSA-3", "gVisor"],
    estimatedEndpoints: 12,
  },
  {
    id: "asset-k8s-1",
    identifier: "k8s://prod-us-east-mesh-01.eks.northwind.cloud",
    title: "Primary Multi-Tenant EKS Production Cluster",
    category: "Kubernetes",
    environment: "Production",
    verified: true,
    verificationMethod: "OIDC Issuer Discovery",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "Platform Runtime",
    tags: ["EKS", "Istio", "Cilium-eBPF", "Tier-0"],
    estimatedEndpoints: 48,
  },
  {
    id: "asset-ai-1",
    identifier: "ai://inference.northwind.cloud/models/nw-copilot-v3",
    title: "Northwind Enterprise Copilot & RAG Orchestrator",
    category: "AI Models",
    environment: "Production",
    verified: true,
    verificationMethod: "Model Card Signed Hash",
    riskTier: "Critical",
    businessImpact: "Revenue Core",
    ownerTeam: "Applied AI Security",
    tags: ["LLM", "RAG", "Tool-Use", "Prompt-Shield"],
    estimatedEndpoints: 19,
  },
  {
    id: "asset-ai-2",
    identifier: "ai://sandbox.northwind.cloud/agents/code-exec-v2",
    title: "Autonomous Code-Interpreter Agent Sandbox",
    category: "AI Models",
    environment: "Sandbox",
    verified: true,
    verificationMethod: "Firecracker MicroVM Attested",
    riskTier: "Critical",
    businessImpact: "Mission Critical",
    ownerTeam: "Applied AI Security",
    tags: ["Agentic", "Firecracker", "Sandbox-Escape"],
    estimatedEndpoints: 16,
  },
] as const;

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
}

export const STUDIO_RESEARCHERS: readonly StudioResearcher[] = [
  {
    id: "res-1",
    handle: "nullvector",
    name: "Soren Lindqvist",
    avatarInitials: "SL",
    country: "Sweden",
    countryCode: "SE",
    cohortCategory: "Recommended Researchers",
    reputation: 9840,
    signalScore: 97,
    acceptanceRate: 94,
    averageSeverity: "Critical",
    responseTimeHours: 1.8,
    recentActivity: "Submitted RCE chain in Envoy WASM filter · 2d ago",
    skills: ["Cloud IAM", "Kubernetes", "GraphQL", "Rust"],
    languages: ["English", "Swedish"],
    industryExperience: ["SaaS Platform", "Enterprise Cloud", "Kubernetes Infrastructure"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 42,
  },
  {
    id: "res-2",
    handle: "kestrel_sec",
    name: "Maya Lin",
    avatarInitials: "ML",
    country: "United States",
    countryCode: "US",
    cohortCategory: "Past Participants",
    reputation: 8920,
    signalScore: 95,
    acceptanceRate: 92,
    averageSeverity: "Critical",
    responseTimeHours: 2.1,
    recentActivity: "Found OAuth2 cross-tenant token confusion · 4d ago",
    skills: ["OAuth2 / OIDC", "API Security", "Multi-Tenant SaaS", "SSRF"],
    languages: ["English", "Mandarin"],
    industryExperience: ["SaaS Platform", "FinTech", "API Platform"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 38,
  },
  {
    id: "res-3",
    handle: "cipher_weaver",
    name: "Rafael Mendes",
    avatarInitials: "RM",
    country: "Brazil",
    countryCode: "BR",
    cohortCategory: "Top Performers",
    reputation: 11450,
    signalScore: 98,
    acceptanceRate: 96,
    averageSeverity: "Critical",
    responseTimeHours: 1.4,
    recentActivity: "Discovered ledger race condition in settlement API · 1d ago",
    skills: ["FinTech Ledger", "Race Conditions", "gRPC", "Cryptography"],
    languages: ["English", "Portuguese", "Spanish"],
    industryExperience: ["FinTech", "API Platform", "SaaS Platform"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 61,
  },
  {
    id: "res-4",
    handle: "aegis_zero",
    name: "Ananya Rao",
    avatarInitials: "AR",
    country: "India",
    countryCode: "IN",
    cohortCategory: "Recommended Researchers",
    reputation: 7650,
    signalScore: 93,
    acceptanceRate: 90,
    averageSeverity: "High",
    responseTimeHours: 2.6,
    recentActivity: "Demonstrated RAG vector cross-tenant leakage · 3d ago",
    skills: ["LLM Red Teaming", "Agent Sandboxes", "Python", "Cloud Accounts"],
    languages: ["English", "Hindi"],
    industryExperience: ["AI Platform", "SaaS Platform", "Healthcare"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 29,
  },
  {
    id: "res-5",
    handle: "valkyrie_bin",
    name: "Clara Hoffmann",
    avatarInitials: "CH",
    country: "Germany",
    countryCode: "DE",
    cohortCategory: "Top Performers",
    reputation: 9180,
    signalScore: 96,
    acceptanceRate: 93,
    averageSeverity: "High",
    responseTimeHours: 1.9,
    recentActivity: "Bypassed iOS SecureEnclave biometric attestation · 5d ago",
    skills: ["iOS / Swift", "Android NDK", "Reverse Engineering", "mTLS"],
    languages: ["English", "German"],
    industryExperience: ["Mobile Application", "FinTech", "Healthcare"],
    availability: "Limited Capacity",
    verifiedKyc: true,
    pastValidReports: 35,
  },
  {
    id: "res-6",
    handle: "bastion_hound",
    name: "Liam O'Connor",
    avatarInitials: "LO",
    country: "Ireland",
    countryCode: "IE",
    cohortCategory: "Past Participants",
    reputation: 6890,
    signalScore: 91,
    acceptanceRate: 89,
    averageSeverity: "High",
    responseTimeHours: 3.2,
    recentActivity: "Identified BGP route leak & ASN metadata exposure · 6d ago",
    skills: ["Network ASN", "Zero-Trust", "Kubernetes", "eBPF"],
    languages: ["English"],
    industryExperience: ["Internal Corporate Network", "Government", "Kubernetes Infrastructure"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 24,
  },
  {
    id: "res-7",
    handle: "nw_redteam_core",
    name: "Northwind Offensive Security Guild",
    avatarInitials: "NW",
    country: "United States",
    countryCode: "US",
    cohortCategory: "Internal Groups",
    reputation: 12000,
    signalScore: 99,
    acceptanceRate: 98,
    averageSeverity: "Critical",
    responseTimeHours: 0.8,
    recentActivity: "Completed Q3 continuous purple-team validation · 12h ago",
    skills: ["Purple Team", "Cloud IAM", "Zero-Trust", "LLM Red Teaming"],
    languages: ["English"],
    industryExperience: ["SaaS Platform", "Enterprise Cloud", "AI Platform"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 84,
  },
  {
    id: "res-8",
    handle: "fhir_warden",
    name: "Dr. Kenji Takahashi",
    avatarInitials: "KT",
    country: "Japan",
    countryCode: "JP",
    cohortCategory: "Recommended Researchers",
    reputation: 8110,
    signalScore: 94,
    acceptanceRate: 91,
    averageSeverity: "High",
    responseTimeHours: 2.4,
    recentActivity: "Reported IDOR in HL7 FHIR patient bundle export · 3d ago",
    skills: ["FHIR / HL7", "API Security", "HIPAA Enclaves", "OAuth2 / OIDC"],
    languages: ["English", "Japanese"],
    industryExperience: ["Healthcare", "Government", "API Platform"],
    availability: "Available Now",
    verifiedKyc: true,
    pastValidReports: 31,
  },
] as const;

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
}

export const STUDIO_AUTOMATION_MODULES: readonly StudioIntegrationModule[] = [
  // Issue Tracking
  {
    id: "jira",
    name: "Jira Software Enterprise",
    category: "Issue Tracking",
    provider: "Atlassian",
    description: "Bi-directional sync between triaged findings and SECENG Jira epics with CVSS priority mapping.",
    status: "Connected",
    healthPercent: 99.9,
    latencyLabel: "118ms sync",
  },
  {
    id: "azure_devops",
    name: "Azure DevOps Boards",
    category: "Issue Tracking",
    provider: "Microsoft",
    description: "Route FedRAMP and cloud infrastructure findings directly to Azure Boards work items.",
    status: "Available",
    healthPercent: 100,
    latencyLabel: "Ready to bind",
  },
  {
    id: "linear",
    name: "Linear Security Triage",
    category: "Issue Tracking",
    provider: "Linear",
    description: "Instant issue creation in engineering cycles with automatic SLA labels and PR status sync.",
    status: "Connected",
    healthPercent: 99.8,
    latencyLabel: "64ms sync",
  },
  // Communication
  {
    id: "slack",
    name: "Slack Security Operations",
    category: "Communication",
    provider: "Slack",
    description: "Dispatch P1 Critical alerts to #sec-ops and #triage-feed with interactive triage actions.",
    status: "Connected",
    healthPercent: 100,
    latencyLabel: "Realtime WebSocket",
  },
  {
    id: "teams",
    name: "Microsoft Teams SOC Bridge",
    category: "Communication",
    provider: "Microsoft",
    description: "Adaptive card notifications for executive escalation and incident response war-rooms.",
    status: "Available",
    healthPercent: 99.5,
    latencyLabel: "Webhook ready",
  },
  {
    id: "discord",
    name: "Discord Researcher Community Bridge",
    category: "Communication",
    provider: "Discord",
    description: "Private researcher channel announcements for scope expansions and bonus multipliers.",
    status: "Available",
    healthPercent: 99.2,
    latencyLabel: "Bot ready",
  },
  // Developer
  {
    id: "github",
    name: "GitHub Advanced Security & PR Link",
    category: "Developer",
    provider: "GitHub",
    description: "Correlate reported vulnerabilities with commits, trigger re-testing on PR merge, and verify patches.",
    status: "Connected",
    healthPercent: 99.9,
    latencyLabel: "82ms webhook",
  },
  {
    id: "gitlab",
    name: "GitLab CI/CD Pipeline Gate",
    category: "Developer",
    provider: "GitLab",
    description: "Link container and Kubernetes findings to GitLab merge requests and registry scans.",
    status: "Available",
    healthPercent: 99.7,
    latencyLabel: "OAuth ready",
  },
  // Notifications
  {
    id: "email",
    name: "Encrypted PGP Executive Digest",
    category: "Notifications",
    provider: "Com Olho Mail",
    description: "Deliver S/MIME & PGP encrypted notifications to Security Contact and Product Owner.",
    status: "Connected",
    healthPercent: 100,
    latencyLabel: "DKIM verified",
  },
  {
    id: "webhooks",
    name: "SIEM / Splunk HMAC Event Stream",
    category: "Notifications",
    provider: "Custom Webhook",
    description: "Stream signed JSON audit events for every report submission, state transition, and payout.",
    status: "Connected",
    healthPercent: 99.6,
    latencyLabel: "45ms p95",
  },
  // AI
  {
    id: "ai_duplicate",
    name: "Duplicate Detection",
    category: "AI",
    provider: "Com Olho Neural Triage",
    description: "Semantic vector matching across historical reports, stack traces, and PoC payloads to flag duplicates.",
    status: "Connected",
    healthPercent: 99.9,
    latencyLabel: "98.4% precision",
  },
  {
    id: "ai_severity",
    name: "Severity Recommendation",
    category: "AI",
    provider: "Com Olho Neural Triage",
    description: "Automatically compute CVSS v3.1/v4.0 environmental score based on target asset criticality.",
    status: "Connected",
    healthPercent: 99.9,
    latencyLabel: "Instant scoring",
  },
  {
    id: "ai_triage",
    name: "AI Triage",
    category: "AI",
    provider: "Com Olho Neural Triage",
    description: "Validate proof-of-concept steps, extract affected endpoints, and draft reproduction summaries.",
    status: "Connected",
    healthPercent: 99.7,
    latencyLabel: "Saves ~42m/report",
  },
  {
    id: "auto_assign",
    name: "Auto Assignment",
    category: "AI",
    provider: "Com Olho Neural Triage",
    description: "Route validated reports to the owning engineering team based on Scope Studio asset ownership.",
    status: "Connected",
    healthPercent: 100,
    latencyLabel: "Zero-touch routing",
  },
  // Workflow
  {
    id: "auto_verify_scope",
    name: "Auto Verify Scope",
    category: "Workflow",
    provider: "Com Olho Engine",
    description: "Automatically validate that reported hostnames and endpoints match active in-scope rules.",
    status: "Connected",
    healthPercent: 100,
    latencyLabel: "Strict boundary",
  },
  {
    id: "auto_escalation",
    name: "Auto Escalation",
    category: "Workflow",
    provider: "Com Olho Engine",
    description: "Page on-call Security Admin if a Critical finding remains unacknowledged past 50% of Response SLA.",
    status: "Connected",
    healthPercent: 100,
    latencyLabel: "SLA guardian",
  },
  {
    id: "sla_alerts",
    name: "SLA Alerts",
    category: "Workflow",
    provider: "Com Olho Engine",
    description: "Proactive breach warnings at 75% and 90% of response, triage, and resolution SLA windows.",
    status: "Connected",
    healthPercent: 100,
    latencyLabel: "Active monitor",
  },
] as const;

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

export function createInitialStudioState(): LaunchStudioState {
  const defaultBlueprint = PROGRAM_BLUEPRINTS[0]; // SaaS Platform
  return {
    currentStep: "welcome",
    welcomeChoice: "continuous_bug_bounty",
    blueprintId: defaultBlueprint.id,
    programName: defaultBlueprint.recommendedProgramName,
    shortDescription: defaultBlueprint.recommendedDescription,
    businessUnit: defaultBlueprint.businessUnit,
    productOwner: "Elena Rostova (VP Security Engineering)",
    securityContact: "security-triage@northwind.cloud",
    visibility: "Public",
    lifecycle: "Active",
    launchDate: "2026-11-15",
    endDate: "",
    selectedAssetIds: [...defaultBlueprint.defaultAssetIds],
    rewardMatrix: structuredClone(defaultBlueprint.rewardMatrix),
    monthlyBudgetReserve: defaultBlueprint.monthlyBudgetEstimate,
    policy: structuredClone(defaultBlueprint.policy),
    invitedResearcherIds: ["res-1", "res-2", "res-3", "res-4", "res-7"],
    invitedEmails: ["sec-lead@partner-audit.io"],
    inviteLinkEnabled: true,
    enabledModuleIds: [...defaultBlueprint.defaultIntegrations, ...defaultBlueprint.defaultAutomations],
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
  catalog: readonly StudioAsset[] = STUDIO_ASSET_CATALOG,
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
  const hasStagingAndProd =
    selectedAssets.some((a) => a.environment === "Staging") &&
    selectedAssets.some((a) => a.environment === "Production");
  if (conflictingAssets.length > 0 || hasStagingAndProd) {
    warnings.push({
      id: "warn-conflict",
      type: "conflict",
      severity: "warning",
      title: hasStagingAndProd
        ? "Mixed Production & Staging SLA boundaries"
        : "Conflicting scope definition detected",
      detail: hasStagingAndProd
        ? "Staging assets share a single bounty table with Production assets. Consider applying a lower reward multiplier to non-production targets."
        : "Selected assets have overlapping routing policies that may cause ambiguous triage attribution.",
      affectedAssetIds: conflictingAssets.map((a) => a.id),
    });
  }

  // 4. Missing production assets warning
  const prodAssetsSelected = selectedAssets.filter((a) => a.environment === "Production");
  if (prodAssetsSelected.length === 0) {
    warnings.push({
      id: "warn-missing-prod",
      type: "missing_production",
      severity: "critical",
      title: "Missing production assets in scope",
      detail: "No verified Production environment assets are currently included. Add at least one production domain or API gateway.",
      affectedAssetIds: [],
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
  catalog: readonly StudioAsset[] = STUDIO_ASSET_CATALOG,
): ProgramReadinessReport {
  const scopeTelemetry = calculateScopeTelemetry(state.selectedAssetIds, catalog);
  const scopeComplete = state.selectedAssetIds.length >= 2 && scopeTelemetry.criticalAssetsCount >= 1;
  const policyPublished =
    state.policy.responseSlaHours > 0 &&
    state.policy.resolutionSlaDays > 0 &&
    state.policy.disclosureTimelineDays >= 30;
  const budgetConfigured =
    state.visibility === "VDP" || (state.rewardMatrix.critical.max > 0 && state.monthlyBudgetReserve >= 5000);
  const researchersInvited =
    state.visibility === "Public" ||
    state.invitedResearcherIds.length > 0 ||
    state.invitedEmails.length > 0;
  const automationEnabled = state.enabledModuleIds.some((id) =>
    ["ai_duplicate", "ai_severity", "ai_triage", "auto_verify_scope", "sla_alerts"].includes(id),
  );
  const slackConnected = state.enabledModuleIds.includes("slack");
  const allDnsVerified = scopeTelemetry.verificationPercent === 100 && state.selectedAssetIds.length > 0;

  const items: ReadinessCheckItem[] = [
    {
      id: "check-scope",
      label: "Scope Complete",
      status: scopeComplete ? "complete" : "warning",
      detail: scopeComplete
        ? `${state.selectedAssetIds.length} assets configured (${scopeTelemetry.criticalAssetsCount} Critical tier)`
        : "Select at least 2 assets including 1 Critical asset",
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
      label: "Automation Enabled",
      status: automationEnabled ? "complete" : "warning",
      detail: automationEnabled
        ? `${state.enabledModuleIds.length} active integrations & neural triage workflows`
        : "Enable AI deduplication or SLA alerts",
      targetStep: "automation",
    },
    {
      id: "check-slack",
      label: slackConnected ? "Slack security channel connected" : "Slack not connected",
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

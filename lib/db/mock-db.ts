import type { QueryResult, QueryResultRow } from "pg";

const MOCK_STATE_PATH = "/tmp/unpatched-mock-db-state.json";

type NodeFsLike = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, data: string, encoding: BufferEncoding) => void;
};

function getNodeFs(): NodeFsLike | null {
  try {
    const proc = typeof process !== "undefined" ? (process as unknown as { getBuiltinModule?: (id: string) => NodeFsLike | undefined }) : null;
    return proc?.getBuiltinModule?.("fs") ?? null;
  } catch {
    return null;
  }
}

export type MockUserRecord = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
  account_type: "researcher" | "organization";
  platform_role: "platform_admin" | null;
  onboarding_completed: boolean;
  display_name: string;
  username: string;
  public_username: string | null;
  bio: string | null;
  website_url: string | null;
  github_handle: string | null;
  linkedin_url: string | null;
  x_handle: string | null;
  is_public: boolean;
  reputation_points: number;
  signal_score: number | null;
  impact_score: number | null;
  mfa_enabled: boolean;
  mfa_enforced_at: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  deactivation_reason: string | null;
  is_platform_admin: boolean;
};

export type MockSessionRecord = {
  id: string;
  user_id: string;
  token_hash: string;
  aal: "aal1" | "aal2";
  created_at: string;
  updated_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
};

export type MockOrganizationRecord = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  description: string | null;
  website_url: string | null;
  security_contact_email: string | null;
  require_mfa: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MockOrganizationMemberRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "security_admin" | "program_manager" | "triager" | "finance_viewer";
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
};

export type MockProgramRecord = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  policy_markdown: string;
  disclosure_policy: string | null;
  safe_harbor_enabled: boolean;
  safe_harbor_summary: string | null;
  status: "draft" | "pending_review" | "active" | "paused" | "closed";
  visibility: "public" | "private";
  program_type: "bounty" | "vdp";
  engagement_type: "continuous" | "timeboxed";
  requires_kyc: boolean;
  currency: string;
  bounty_min_minor_units: number | null;
  bounty_max_minor_units: number | null;
  focus_areas: string[];
  asset_types: string[];
  response_target_hours: number;
  triage_target_hours: number;
  bounty_target_days: number;
  resolution_target_days: number;
  published_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MockProgramScopeItemRecord = {
  id: string;
  program_id: string;
  organization_id: string;
  scope_state: "in_scope" | "out_of_scope";
  asset_type: "domain" | "wildcard_domain" | "url" | "cidr" | "ip_address" | "api" | "web_app" | "mobile_app" | "repository" | "other";
  target: string;
  display_target: string;
  description: string | null;
  status: "active" | "archived";
  bounty_tier: 1 | 2 | 3;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MockReportRecord = {
  id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  matched_scope_entry_id: string | null;
  matched_scope_state: "in_scope" | "out_of_scope" | "unmatched";
  matched_target: string;
  asset_type: "domain" | "url" | "cidr" | "ip_address";
  target: string;
  display_target: string;
  title: string;
  description: string;
  weakness_type: string;
  impact: string;
  researcher_severity: "low" | "medium" | "high" | "critical";
  confirmed_severity: "low" | "medium" | "high" | "critical" | null;
  priority: "p1" | "p2" | "p3" | "p4" | null;
  status:
    | "new"
    | "triaging"
    | "needs_more_info"
    | "accepted"
    | "resolved"
    | "duplicate"
    | "informative"
    | "not_applicable"
    | "rejected";
  resolution_summary: string | null;
  duplicate_of_report_id: string | null;
  assignee_id: string | null;
  cvss_base_score: number | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export type MockBountyDecisionRecord = {
  id: string;
  report_id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  decided_by: string;
  state: "draft" | "finalized";
  recommended_amount_minor_units: number;
  final_amount_minor_units: number;
  platform_fee_minor_units: number;
  currency: string;
  rationale: string;
  finalized_at: string;
  created_at: string;
  updated_at: string;
};

export type MockPaymentObligationRecord = {
  id: string;
  report_id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  bounty_decision_id: string;
  amount_minor_units: number;
  platform_fee_minor_units: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type MockDisclosureRecord = {
  id: string;
  report_id: string;
  program_id: string;
  organization_id: string;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  status: "requested" | "approved" | "declined" | "unpublished";
  decline_reason: string | null;
  draft_title: string | null;
  draft_summary: string | null;
  published_title: string;
  published_summary: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  unpublish_reason: string | null;
};

export type MockReputationLedgerRecord = {
  id: string;
  researcher_id: string;
  fact_type: "report_resolved" | "bounty_finalized" | "report_duplicate" | "ctf_challenge_solved";
  report_id: string;
  program_id: string;
  organization_id: string;
  confirmed_severity: "low" | "medium" | "high" | "critical" | null;
  duplicate_of_report_id: string | null;
  occurred_at: string;
};

export type MockNotificationRecord = {
  id: string;
  recipient_id: string;
  category: "report_lifecycle" | "communication" | "bounty_and_payment" | "program_access";
  notification_type: string;
  report_id: string | null;
  program_id: string | null;
  organization_id: string;
  occurred_at: string;
  created_at: string;
  read_at: string | null;
};

export type MockCtfSolveRecord = {
  id: string;
  challenge_id: string;
  researcher_id: string;
  points_awarded: number;
  solved_at: string;
};

class MockDatabase {
  users: MockUserRecord[] = [];
  sessions: MockSessionRecord[] = [];
  organizations: MockOrganizationRecord[] = [];
  organizationMembers: MockOrganizationMemberRecord[] = [];
  programs: MockProgramRecord[] = [];
  programMembers: Array<{
    program_id: string;
    organization_id: string;
    user_id: string;
    role: "manager" | "triager";
    added_by: string | null;
    created_at: string;
  }> = [];
  programPolicies: Array<{
    id: string;
    program_id: string;
    version_number: number;
    rules_of_engagement: string;
    safe_harbor: boolean;
    disclosure_mode: "coordinated" | "full" | "none";
    disclosure_days: number | null;
    first_response_target_hours: number | null;
    triage_target_hours: number | null;
    resolution_target_days: number | null;
    change_note: string | null;
    created_at: string;
    superseded_at: string | null;
  }> = [];
  bountyPolicyVersions: Array<{
    id: string;
    program_id: string;
    organization_id: string;
    version_number: number;
    currency: string;
    created_at: string;
    superseded_at: string | null;
  }> = [];
  bountySeverityRanges: Array<{
    policy_version_id: string;
    severity: "none" | "low" | "medium" | "high" | "critical";
    min_amount_minor_units: number;
    max_amount_minor_units: number;
  }> = [];
  programInvitations: Array<{
    id: string;
    program_id: string;
    organization_id: string;
    email: string;
    invited_username: string | null;
    invited_by: string;
    message: string | null;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }> = [];
  programAccessRequests: Array<{
    id: string;
    program_id: string;
    user_id: string;
    display_name: string;
    username: string;
    note: string | null;
    created_at: string;
    signal: string;
    valid_count: number;
    closed_count: number;
    tier: string;
  }> = [];
  programScopes: MockProgramScopeItemRecord[] = [];
  programResearchers: Array<{
    program_id: string;
    organization_id: string;
    user_id: string;
    status: "active" | "suspended" | "revoked";
    source: "public_self_join" | "invitation";
    invited_by: string | null;
    joined_at: string;
    suspended_at: string | null;
    revoked_at: string | null;
    updated_at: string;
  }> = [];
  reports: MockReportRecord[] = [];
  bountyDecisions: MockBountyDecisionRecord[] = [];
  paymentObligations: MockPaymentObligationRecord[] = [];
  disclosures: MockDisclosureRecord[] = [];
  reputationLedger: MockReputationLedgerRecord[] = [];
  notifications: MockNotificationRecord[] = [];
  ctfSolves: MockCtfSolveRecord[] = [];
  ctfChallenges: Array<{
    id: string;
    slug: string;
    title: string;
    points: number;
    flag_value: string;
    hints: Array<{ position: number; cost: number; body: string }>;
  }> = [];

  constructor() {
    this.seed();
    this.loadPersistedState();
  }

  loadPersistedState() {
    try {
      const fs = getNodeFs();
      if (!fs || !fs.existsSync(MOCK_STATE_PATH)) return;
      const raw = JSON.parse(fs.readFileSync(MOCK_STATE_PATH, "utf8")) as {
        sessions?: MockSessionRecord[];
        users?: MockUserRecord[];
        organizations?: MockOrganizationRecord[];
        organizationMembers?: MockOrganizationMemberRecord[];
      };
      if (Array.isArray(raw.sessions)) {
        const byId = new Map(this.sessions.map((s) => [s.id, s]));
        for (const s of raw.sessions) byId.set(s.id, s);
        this.sessions = Array.from(byId.values());
      }
      if (Array.isArray(raw.users)) {
        const byId = new Map(this.users.map((u) => [u.id, u]));
        for (const u of raw.users) byId.set(u.id, u);
        this.users = Array.from(byId.values());
      }
      if (Array.isArray(raw.organizations)) {
        const byId = new Map(this.organizations.map((o) => [o.id, o]));
        for (const o of raw.organizations) byId.set(o.id, o);
        this.organizations = Array.from(byId.values());
      }
      if (Array.isArray(raw.organizationMembers)) {
        const byId = new Map(this.organizationMembers.map((m) => [m.id, m]));
        for (const m of raw.organizationMembers) byId.set(m.id, m);
        this.organizationMembers = Array.from(byId.values());
      }
    } catch {
      // Ignore state read errors in restricted environments
    }
  }

  savePersistedState() {
    try {
      const fs = getNodeFs();
      if (!fs) return;
      fs.writeFileSync(
        MOCK_STATE_PATH,
        JSON.stringify({
          sessions: this.sessions,
          users: this.users,
          organizations: this.organizations,
          organizationMembers: this.organizationMembers,
        }),
        "utf8",
      );
    } catch {
      // Ignore state write errors in restricted environments
    }
  }

  private seed() {
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
    const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

    const r1Id = "11111111-1111-4111-8111-111111111101";
    const r2Id = "11111111-1111-4111-8111-111111111102";
    const r3Id = "11111111-1111-4111-8111-111111111103";
    const r4Id = "11111111-1111-4111-8111-111111111104";
    const r5Id = "11111111-1111-4111-8111-111111111105"; // Aarav Mehta (seed-showcase.ts IN tax resident)
    const r6Id = "11111111-1111-4111-8111-111111111106"; // Jordan Ellis (seed-showcase.ts US tax resident)
    const r7Id = "11111111-1111-4111-8111-111111111107"; // Showcase Hunter (seed-showcase.ts)
    const orgOwner1Id = "22222222-2222-4222-8222-222222222201";
    const orgTriage1Id = "22222222-2222-4222-8222-222222222202";
    const orgOwner2Id = "22222222-2222-4222-8222-222222222203";
    const orgSecAdmin1Id = "22222222-2222-4222-8222-222222222204";
    const adminId = "99999999-9999-4999-8999-999999999901";

    this.users = [
      {
        id: r1Id,
        email: "demo.researcher@sentinel.demo",
        password_hash: "plain$SentinelDemo!2026",
        email_verified_at: daysAgo(90),
        last_sign_in_at: hoursAgo(2),
        created_at: daysAgo(120),
        updated_at: hoursAgo(2),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Maya Lin",
        username: "kestrel_sec",
        public_username: "kestrel_sec",
        bio: "Principal offensive security researcher specializing in OAuth state confusion, distributed tenant isolation, and cloud metadata SSRF chains.",
        website_url: "https://kestrel.security",
        github_handle: "kestrel-sec",
        linkedin_url: "https://linkedin.com/in/mayalin-sec",
        x_handle: "kestrel_sec",
        is_public: true,
        reputation_points: 1840,
        signal_score: 6.45,
        impact_score: 42.5,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: r2Id,
        email: "launch.researcher@unpatched.demo",
        password_hash: "plain$SentinelLaunch!2026",
        email_verified_at: daysAgo(85),
        last_sign_in_at: daysAgo(1),
        created_at: daysAgo(110),
        updated_at: daysAgo(1),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Soren Lindqvist",
        username: "nullvector",
        public_username: "nullvector",
        bio: "API authorization researcher & GraphQL batching specialist. Focused on fintech and ledger invariants.",
        website_url: "https://nullvector.io",
        github_handle: "nullvector",
        linkedin_url: null,
        x_handle: "nullvector_0x",
        is_public: true,
        reputation_points: 1490,
        signal_score: 6.1,
        impact_score: 38.0,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: r3Id,
        email: "amara.okafor@sentinel.demo",
        password_hash: "plain$SentinelDemo!2026",
        email_verified_at: daysAgo(70),
        last_sign_in_at: daysAgo(3),
        created_at: daysAgo(95),
        updated_at: daysAgo(3),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Amara Okafor",
        username: "cipherbloom",
        public_username: "cipherbloom",
        bio: "Cloud-native security researcher hunting IAM privilege escalations, presigned URL leaks, and Kubernetes admission bypasses.",
        website_url: "https://cipherbloom.dev",
        github_handle: "cipherbloom",
        linkedin_url: null,
        x_handle: "cipherbloom",
        is_public: true,
        reputation_points: 1120,
        signal_score: 5.85,
        impact_score: 31.2,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: r4Id,
        email: "devon.price@sentinel.demo",
        password_hash: "plain$SentinelDemo!2026",
        email_verified_at: daysAgo(50),
        last_sign_in_at: daysAgo(4),
        created_at: daysAgo(60),
        updated_at: daysAgo(4),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Devon Price",
        username: "hexhound",
        public_username: "hexhound",
        bio: "Web cache deception, HTTP request smuggling, and Deserialization hunter.",
        website_url: null,
        github_handle: "hexhound",
        linkedin_url: null,
        x_handle: "hexhound_sec",
        is_public: true,
        reputation_points: 780,
        signal_score: 5.4,
        impact_score: 26.0,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: r5Id,
        email: "showcase.in-researcher@unpatched.demo",
        password_hash: "plain$E2ESeed!2026",
        email_verified_at: daysAgo(80),
        last_sign_in_at: hoursAgo(3),
        created_at: daysAgo(88),
        updated_at: hoursAgo(3),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Aarav Mehta",
        username: "aarav_mehta",
        public_username: "aarav_mehta",
        bio: "Principal bug bounty hunter (Bengaluru) specializing in multi-tenant IDOR, SSRF webhook validators, and OAuth token lifecycles.",
        website_url: "https://aaravsec.in",
        github_handle: "aarav-mehta-sec",
        linkedin_url: null,
        x_handle: "aarav_0x",
        is_public: true,
        reputation_points: 1620,
        signal_score: 6.28,
        impact_score: 39.8,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: r6Id,
        email: "showcase.us-researcher@unpatched.demo",
        password_hash: "plain$E2ESeed!2026",
        email_verified_at: daysAgo(75),
        last_sign_in_at: hoursAgo(7),
        created_at: daysAgo(82),
        updated_at: hoursAgo(7),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Jordan Ellis",
        username: "jordan_ellis",
        public_username: "jordan_ellis",
        bio: "Application security researcher focused on authentication bypass, SAML assertion wrapping, and stored XSS in agent consoles.",
        website_url: "https://jordanellis.sec",
        github_handle: "jellis-sec",
        linkedin_url: null,
        x_handle: "jordan_ellis_0x",
        is_public: true,
        reputation_points: 1340,
        signal_score: 6.02,
        impact_score: 34.5,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: r7Id,
        email: "showcase.hunter@unpatched.demo",
        password_hash: "plain$E2ESeed!2026",
        email_verified_at: daysAgo(65),
        last_sign_in_at: hoursAgo(12),
        created_at: daysAgo(70),
        updated_at: hoursAgo(12),
        account_type: "researcher",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Showcase Hunter",
        username: "showcase_hunter",
        public_username: "showcase_hunter",
        bio: "Full-spectrum enterprise application security researcher across US, EU, and APAC programs.",
        website_url: null,
        github_handle: "showcase-hunter",
        linkedin_url: null,
        x_handle: null,
        is_public: true,
        reputation_points: 990,
        signal_score: 5.75,
        impact_score: 29.4,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: orgOwner1Id,
        email: "demo.org.northwind@sentinel.demo",
        password_hash: "plain$SentinelDemo!2026",
        email_verified_at: daysAgo(120),
        last_sign_in_at: hoursAgo(1),
        created_at: daysAgo(120),
        updated_at: hoursAgo(1),
        account_type: "organization",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Elena Rostova",
        username: "elena_northwind",
        public_username: null,
        bio: "VP of Product Security at Northwind Cloud.",
        website_url: "https://northwind.cloud",
        github_handle: null,
        linkedin_url: null,
        x_handle: null,
        is_public: false,
        reputation_points: 0,
        signal_score: null,
        impact_score: null,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: orgTriage1Id,
        email: "triage.northwind@sentinel.demo",
        password_hash: "plain$SentinelDemo!2026",
        email_verified_at: daysAgo(100),
        last_sign_in_at: hoursAgo(5),
        created_at: daysAgo(100),
        updated_at: hoursAgo(5),
        account_type: "organization",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Marcus Vance",
        username: "marcus_triage",
        public_username: null,
        bio: "Staff AppSec Triage Lead at Northwind Cloud.",
        website_url: null,
        github_handle: null,
        linkedin_url: null,
        x_handle: null,
        is_public: false,
        reputation_points: 0,
        signal_score: null,
        impact_score: null,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: orgSecAdmin1Id,
        email: "priya.nair@northwind.cloud",
        password_hash: "plain$SentinelDemo!2026",
        email_verified_at: daysAgo(95),
        last_sign_in_at: hoursAgo(4),
        created_at: daysAgo(95),
        updated_at: hoursAgo(4),
        account_type: "organization",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Priya Nair",
        username: "priya_secops",
        public_username: null,
        bio: "Principal Cloud IAM Security Architect at Northwind Cloud.",
        website_url: null,
        github_handle: null,
        linkedin_url: null,
        x_handle: null,
        is_public: false,
        reputation_points: 0,
        signal_score: null,
        impact_score: null,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: orgOwner2Id,
        email: "launch.admin@unpatched.demo",
        password_hash: "plain$SentinelLaunch!2026",
        email_verified_at: daysAgo(110),
        last_sign_in_at: daysAgo(1),
        created_at: daysAgo(110),
        updated_at: daysAgo(1),
        account_type: "organization",
        platform_role: null,
        onboarding_completed: true,
        display_name: "Julian Sterling",
        username: "jsterling_helios",
        public_username: null,
        bio: "Head of Security Operations at Helios Financial.",
        website_url: "https://helios.finance",
        github_handle: null,
        linkedin_url: null,
        x_handle: null,
        is_public: false,
        reputation_points: 0,
        signal_score: null,
        impact_score: null,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: false,
      },
      {
        id: adminId,
        email: "e2e.platform-admin@unpatched.demo",
        password_hash: "plain$E2ESeed!2026",
        email_verified_at: daysAgo(150),
        last_sign_in_at: hoursAgo(3),
        created_at: daysAgo(150),
        updated_at: hoursAgo(3),
        account_type: "organization",
        platform_role: "platform_admin",
        onboarding_completed: true,
        display_name: "Unpatched Platform Ops",
        username: "unpatched_ops",
        public_username: null,
        bio: "Platform security & trust administration.",
        website_url: null,
        github_handle: null,
        linkedin_url: null,
        x_handle: null,
        is_public: false,
        reputation_points: 0,
        signal_score: null,
        impact_score: null,
        mfa_enabled: false,
        mfa_enforced_at: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        is_platform_admin: true,
      },
    ];

    const org1Id = "33333333-3333-4333-8333-333333333301";
    const org2Id = "33333333-3333-4333-8333-333333333302";
    const org3Id = "33333333-3333-4333-8333-333333333303";

    this.organizations = [
      {
        id: org1Id,
        slug: "northwind-cloud",
        name: "Northwind Cloud",
        status: "active",
        description: "Multi-region cloud infrastructure, zero-trust identity gateway, and managed Kubernetes control plane.",
        website_url: "https://northwind.cloud",
        security_contact_email: "security@northwind.cloud",
        require_mfa: false,
        created_by: orgOwner1Id,
        created_at: daysAgo(115),
        updated_at: daysAgo(2),
      },
      {
        id: org2Id,
        slug: "helios-financial",
        name: "Helios Financial",
        status: "active",
        description: "Real-time institutional settlement rails, treasury APIs, and programmable card issuing infrastructure.",
        website_url: "https://helios.finance",
        security_contact_email: "security@helios.finance",
        require_mfa: false,
        created_by: orgOwner2Id,
        created_at: daysAgo(105),
        updated_at: daysAgo(3),
      },
      {
        id: org3Id,
        slug: "aegis-robotics",
        name: "Aegis Autonomous Systems",
        status: "active",
        description: "Industrial telemetry firmware, fleet orchestration APIs, and edge cryptographic attestation.",
        website_url: "https://aegis.systems",
        security_contact_email: "psirt@aegis.systems",
        require_mfa: false,
        created_by: orgOwner1Id,
        created_at: daysAgo(90),
        updated_at: daysAgo(5),
      },
    ];

    this.organizationMembers = [
      {
        id: "44444444-4444-4444-8444-444444444401",
        organization_id: org1Id,
        user_id: orgOwner1Id,
        role: "owner",
        status: "active",
        created_at: daysAgo(115),
        updated_at: daysAgo(115),
      },
      {
        id: "44444444-4444-4444-8444-444444444402",
        organization_id: org1Id,
        user_id: orgTriage1Id,
        role: "triager",
        status: "active",
        created_at: daysAgo(100),
        updated_at: daysAgo(100),
      },
      {
        id: "44444444-4444-4444-8444-444444444405",
        organization_id: org1Id,
        user_id: orgSecAdmin1Id,
        role: "security_admin",
        status: "active",
        created_at: daysAgo(95),
        updated_at: daysAgo(95),
      },
      {
        id: "44444444-4444-4444-8444-444444444403",
        organization_id: org2Id,
        user_id: orgOwner2Id,
        role: "owner",
        status: "active",
        created_at: daysAgo(105),
        updated_at: daysAgo(105),
      },
      {
        id: "44444444-4444-4444-8444-444444444404",
        organization_id: org3Id,
        user_id: orgOwner1Id,
        role: "owner",
        status: "active",
        created_at: daysAgo(90),
        updated_at: daysAgo(90),
      },
    ];

    const prog1Id = "55555555-5555-4555-8555-555555555501";
    const prog2Id = "55555555-5555-4555-8555-555555555502";
    const prog3Id = "55555555-5555-4555-8555-555555555503";
    const prog4Id = "55555555-5555-4555-8555-555555555504";
    const prog5Id = "55555555-5555-4555-8555-555555555505";

    this.programs = [
      {
        id: prog1Id,
        organization_id: org1Id,
        slug: "northwind-core-cloud-bounty",
        name: "Northwind Cloud Core & IAM Bounty",
        summary: "High-reward bug bounty covering Northwind IAM federation, control plane APIs, tenant isolation, and secret vault endpoints.",
        description: "High-reward bug bounty covering Northwind IAM federation, control plane APIs, tenant isolation, and secret vault endpoints.",
        policy_markdown: "Authorized testing of Northwind Cloud IAM, GraphQL control plane, and multi-tenant isolation boundaries.",
        disclosure_policy: "Coordinated disclosure within 90 days of resolution.",
        safe_harbor_enabled: true,
        safe_harbor_summary: "Good-faith security research conducted within this policy is authorized under the CFAA and DMCA.",
        status: "active",
        visibility: "public",
        program_type: "bounty",
        engagement_type: "continuous",
        requires_kyc: false,
        currency: "USD",
        bounty_min_minor_units: 25000,
        bounty_max_minor_units: 2500000,
        focus_areas: ["api_security", "cloud_infrastructure", "authentication"],
        asset_types: ["domain", "url", "wildcard_domain", "cidr", "mobile_app"],
        response_target_hours: 4,
        triage_target_hours: 18,
        bounty_target_days: 7,
        resolution_target_days: 14,
        published_at: daysAgo(100),
        created_by: orgOwner1Id,
        created_at: daysAgo(105),
        updated_at: hoursAgo(2),
      },
      {
        id: prog2Id,
        organization_id: org2Id,
        slug: "helios-settlement-api-bounty",
        name: "Helios Settlement & Treasury Bug Bounty",
        summary: "Continuous security rewards for Helios instant ledger settlement APIs, webhook signing, and institutional treasury dashboards.",
        description: "Continuous security rewards for Helios instant ledger settlement APIs, webhook signing, and institutional treasury dashboards.",
        policy_markdown: "Helios Financial prioritizes vulnerabilities affecting ledger integrity, double-spend vectors, and wire approval workflows.",
        disclosure_policy: "Coordinated disclosure upon mutual sign-off after patch verification.",
        safe_harbor_enabled: true,
        safe_harbor_summary: "Full legal safe harbor for researchers complying with scope and rate limits.",
        status: "active",
        visibility: "public",
        program_type: "bounty",
        engagement_type: "continuous",
        requires_kyc: true,
        currency: "USD",
        bounty_min_minor_units: 50000,
        bounty_max_minor_units: 2000000,
        focus_areas: ["api_security", "web_applications", "cryptography"],
        asset_types: ["url", "domain"],
        response_target_hours: 8,
        triage_target_hours: 18,
        bounty_target_days: 5,
        resolution_target_days: 21,
        published_at: daysAgo(95),
        created_by: orgOwner2Id,
        created_at: daysAgo(98),
        updated_at: daysAgo(3),
      },
      {
        id: prog3Id,
        organization_id: org3Id,
        slug: "aegis-fleet-telemetry-vdp",
        name: "Aegis Fleet Telemetry & Edge VDP",
        summary: "Vulnerability disclosure program for Aegis fleet orchestration web portals, firmware update manifests, and public SDKs.",
        description: "Vulnerability disclosure program for Aegis fleet orchestration web portals, firmware update manifests, and public SDKs.",
        policy_markdown: "Aegis Autonomous Systems values coordinated disclosure from the security community across our fleet telemetry endpoints.",
        disclosure_policy: "Standard 60-day coordinated disclosure.",
        safe_harbor_enabled: true,
        safe_harbor_summary: "Authorized testing under safe harbor for all listed in-scope domains.",
        status: "active",
        visibility: "public",
        program_type: "vdp",
        engagement_type: "continuous",
        requires_kyc: false,
        currency: "USD",
        bounty_min_minor_units: null,
        bounty_max_minor_units: null,
        focus_areas: ["iot_hardware", "web_applications"],
        asset_types: ["domain", "cidr"],
        response_target_hours: 24,
        triage_target_hours: 48,
        bounty_target_days: 14,
        resolution_target_days: 45,
        published_at: daysAgo(80),
        created_by: orgOwner1Id,
        created_at: daysAgo(85),
        updated_at: daysAgo(6),
      },
      {
        id: prog4Id,
        organization_id: org1Id,
        slug: "northwind-zero-trust-mesh",
        name: "Northwind Zero-Trust Mesh & SDK Bounty",
        summary: "Focused bounty program for Northwind WireGuard mesh relays, CLI credential helpers, and Terraform provider modules.",
        description: "Focused bounty program for Northwind WireGuard mesh relays, CLI credential helpers, and Terraform provider modules.",
        policy_markdown: "Focus areas include key exchange downgrade or replay in Northwind Mesh Relay and CLI credential helpers.",
        disclosure_policy: "Coordinated disclosure within 45 days of patch release.",
        safe_harbor_enabled: true,
        safe_harbor_summary: "Safe harbor applies to all published repositories and staging relay endpoints.",
        status: "active",
        visibility: "public",
        program_type: "bounty",
        engagement_type: "continuous",
        requires_kyc: false,
        currency: "USD",
        bounty_min_minor_units: 15000,
        bounty_max_minor_units: 850000,
        focus_areas: ["network_security", "cloud_infrastructure"],
        asset_types: ["domain", "cidr"],
        response_target_hours: 16,
        triage_target_hours: 36,
        bounty_target_days: 10,
        resolution_target_days: 30,
        published_at: daysAgo(60),
        created_by: orgOwner1Id,
        created_at: daysAgo(65),
        updated_at: daysAgo(4),
      },
      {
        id: prog5Id,
        organization_id: org1Id,
        slug: "northwind-payments-showcase-bounty",
        name: "Northwind Payments & Ledger Bounty (Showcase)",
        summary: "Dedicated showcase engagement covering multi-currency settlement APIs, GST/1099 invoice portals, and webhook signature validators.",
        description: "Dedicated showcase engagement covering multi-currency settlement APIs, GST/1099 invoice portals, and webhook signature validators.",
        policy_markdown: "Authorized testing of Northwind Payments settlement endpoints and tenant billing APIs.",
        disclosure_policy: "Coordinated disclosure within 60 days of resolution.",
        safe_harbor_enabled: true,
        safe_harbor_summary: "Full safe harbor under CFAA and international computer misuse equivalents.",
        status: "active",
        visibility: "private",
        program_type: "bounty",
        engagement_type: "continuous",
        requires_kyc: true,
        currency: "USD",
        bounty_min_minor_units: 10000,
        bounty_max_minor_units: 2000000,
        focus_areas: ["api_security", "web_applications"],
        asset_types: ["domain", "url"],
        response_target_hours: 6,
        triage_target_hours: 24,
        bounty_target_days: 5,
        resolution_target_days: 14,
        published_at: daysAgo(45),
        created_by: orgOwner1Id,
        created_at: daysAgo(50),
        updated_at: daysAgo(1),
      },
    ];

    this.programMembers = [
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: orgOwner1Id,
        role: "manager",
        added_by: orgOwner1Id,
        created_at: daysAgo(105),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: orgTriage1Id,
        role: "manager",
        added_by: orgOwner1Id,
        created_at: daysAgo(98),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: orgSecAdmin1Id,
        role: "triager",
        added_by: orgOwner1Id,
        created_at: daysAgo(92),
      },
      {
        program_id: prog4Id,
        organization_id: org1Id,
        user_id: orgOwner1Id,
        role: "manager",
        added_by: orgOwner1Id,
        created_at: daysAgo(65),
      },
      {
        program_id: prog4Id,
        organization_id: org1Id,
        user_id: orgTriage1Id,
        role: "triager",
        added_by: orgOwner1Id,
        created_at: daysAgo(60),
      },
      {
        program_id: prog5Id,
        organization_id: org1Id,
        user_id: orgOwner1Id,
        role: "manager",
        added_by: orgOwner1Id,
        created_at: daysAgo(50),
      },
    ];

    this.programPolicies = [
      {
        id: "pol-55555555-5555-4555-8555-555555555501-v3",
        program_id: prog1Id,
        version_number: 3,
        rules_of_engagement:
          "1. Authorized Testing & Header Identification: Include `X-Northwind-Researcher: <your-username>` on all automated and manual requests against *.northwind.cloud and api.northwind.cloud/v2.\n2. Multi-Tenant Isolation Rules: Use only self-provisioned sandbox tenants (`nw-sandbox-*`) when testing cross-tenant KMS, IAM STS role assumption, or invoice IDOR vectors. Stop immediately upon confirming a cross-tenant read/write primitive.\n3. Rate Limits & Availability: Keep automated scanners below 25 requests/second per target IP. Denial of service, volumetric fuzzing, and social engineering of Northwind staff are strictly prohibited.\n4. Gold Standard Safe Harbor: Good-faith security research complying with this policy is considered authorized conduct under the CFAA, DMCA, and international equivalents.",
        safe_harbor: true,
        disclosure_mode: "coordinated",
        disclosure_days: 90,
        first_response_target_hours: 4,
        triage_target_hours: 18,
        resolution_target_days: 14,
        change_note: "Expanded *.iam.northwind.cloud wildcard scope and tightened P1 first-response SLA to 4 hours.",
        created_at: daysAgo(12),
        superseded_at: null,
      },
      {
        id: "pol-55555555-5555-4555-8555-555555555504-v2",
        program_id: prog4Id,
        version_number: 2,
        rules_of_engagement:
          "Authorized testing of Northwind WireGuard mesh relays, Noise IK handshake verifiers, and CLI credential helpers against staging relay clusters.",
        safe_harbor: true,
        disclosure_mode: "coordinated",
        disclosure_days: 45,
        first_response_target_hours: 8,
        triage_target_hours: 24,
        resolution_target_days: 21,
        change_note: "Added Go & Rust zero-trust SDK repositories to in-scope targets.",
        created_at: daysAgo(25),
        superseded_at: null,
      },
      {
        id: "pol-55555555-5555-4555-8555-555555555502-v2",
        program_id: prog2Id,
        version_number: 2,
        rules_of_engagement:
          "Authorized testing of Helios instant settlement APIs, double-spend ledger invariants, and institutional webhook signing endpoints.",
        safe_harbor: true,
        disclosure_mode: "coordinated",
        disclosure_days: 60,
        first_response_target_hours: 6,
        triage_target_hours: 18,
        resolution_target_days: 14,
        change_note: "Updated settlement reversal sandbox endpoints.",
        created_at: daysAgo(30),
        superseded_at: null,
      },
    ];

    const bpv1Id = "bpv-55555555-5555-4555-8555-555555555501-v2";
    const bpv2Id = "bpv-55555555-5555-4555-8555-555555555504-v1";
    const bpv3Id = "bpv-55555555-5555-4555-8555-555555555502-v1";

    this.bountyPolicyVersions = [
      {
        id: bpv1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        version_number: 2,
        currency: "USD",
        created_at: daysAgo(35),
        superseded_at: null,
      },
      {
        id: bpv2Id,
        program_id: prog4Id,
        organization_id: org1Id,
        version_number: 1,
        currency: "USD",
        created_at: daysAgo(60),
        superseded_at: null,
      },
      {
        id: bpv3Id,
        program_id: prog2Id,
        organization_id: org2Id,
        version_number: 1,
        currency: "USD",
        created_at: daysAgo(90),
        superseded_at: null,
      },
    ];

    this.bountySeverityRanges = [
      // prog1Id (Northwind Cloud Core & IAM Bounty: $250 - $25,000)
      { policy_version_id: bpv1Id, severity: "none", min_amount_minor_units: 0, max_amount_minor_units: 0 },
      { policy_version_id: bpv1Id, severity: "low", min_amount_minor_units: 25000, max_amount_minor_units: 50000 },
      { policy_version_id: bpv1Id, severity: "medium", min_amount_minor_units: 100000, max_amount_minor_units: 250000 },
      { policy_version_id: bpv1Id, severity: "high", min_amount_minor_units: 350000, max_amount_minor_units: 750000 },
      { policy_version_id: bpv1Id, severity: "critical", min_amount_minor_units: 1000000, max_amount_minor_units: 2500000 },
      // prog4Id
      { policy_version_id: bpv2Id, severity: "none", min_amount_minor_units: 0, max_amount_minor_units: 0 },
      { policy_version_id: bpv2Id, severity: "low", min_amount_minor_units: 15000, max_amount_minor_units: 40000 },
      { policy_version_id: bpv2Id, severity: "medium", min_amount_minor_units: 75000, max_amount_minor_units: 150000 },
      { policy_version_id: bpv2Id, severity: "high", min_amount_minor_units: 200000, max_amount_minor_units: 450000 },
      { policy_version_id: bpv2Id, severity: "critical", min_amount_minor_units: 500000, max_amount_minor_units: 1200000 },
      // prog2Id (matches seed-showcase.ts USD policy)
      { policy_version_id: bpv3Id, severity: "none", min_amount_minor_units: 0, max_amount_minor_units: 0 },
      { policy_version_id: bpv3Id, severity: "low", min_amount_minor_units: 10000, max_amount_minor_units: 50000 },
      { policy_version_id: bpv3Id, severity: "medium", min_amount_minor_units: 50000, max_amount_minor_units: 150000 },
      { policy_version_id: bpv3Id, severity: "high", min_amount_minor_units: 150000, max_amount_minor_units: 500000 },
      { policy_version_id: bpv3Id, severity: "critical", min_amount_minor_units: 500000, max_amount_minor_units: 2000000 },
    ];

    this.programResearchers = [
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: r1Id,
        status: "active",
        source: "public_self_join",
        invited_by: null,
        joined_at: daysAgo(60),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(60),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: r2Id,
        status: "active",
        source: "invitation",
        invited_by: orgOwner1Id,
        joined_at: daysAgo(54),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(54),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: r3Id,
        status: "active",
        source: "public_self_join",
        invited_by: null,
        joined_at: daysAgo(48),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(48),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: r4Id,
        status: "active",
        source: "public_self_join",
        invited_by: null,
        joined_at: daysAgo(35),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(35),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: r5Id,
        status: "active",
        source: "invitation",
        invited_by: orgOwner1Id,
        joined_at: daysAgo(28),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(28),
      },
      {
        program_id: prog1Id,
        organization_id: org1Id,
        user_id: r6Id,
        status: "active",
        source: "public_self_join",
        invited_by: null,
        joined_at: daysAgo(21),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(21),
      },
      {
        program_id: prog2Id,
        organization_id: org2Id,
        user_id: r1Id,
        status: "active",
        source: "public_self_join",
        invited_by: null,
        joined_at: daysAgo(45),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(45),
      },
      {
        program_id: prog2Id,
        organization_id: org2Id,
        user_id: r2Id,
        status: "active",
        source: "public_self_join",
        invited_by: null,
        joined_at: daysAgo(50),
        suspended_at: null,
        revoked_at: null,
        updated_at: daysAgo(50),
      },
    ];

    this.programInvitations = [
      {
        id: "inv-55555555-0001",
        program_id: prog1Id,
        organization_id: org1Id,
        email: "",
        invited_username: "kaori_pwn",
        invited_by: orgOwner1Id,
        message: "Inviting you to test our new OIDC federation and KMS envelope encryption endpoints.",
        expires_at: daysFromNow(10),
        accepted_at: null,
        revoked_at: null,
        created_at: daysAgo(2),
      },
      {
        id: "inv-55555555-0002",
        program_id: prog1Id,
        organization_id: org1Id,
        email: "niko.vance@zeroday.ch",
        invited_username: null,
        invited_by: orgOwner1Id,
        message: "Private scope access for Northwind IAM STS & SAML 2.0 broker.",
        expires_at: daysFromNow(14),
        accepted_at: null,
        revoked_at: null,
        created_at: daysAgo(1),
      },
    ];

    this.programAccessRequests = [
      {
        id: "req-55555555-0001",
        program_id: prog1Id,
        user_id: r7Id,
        display_name: "Liam O'Connor (Showcase Hunter)",
        username: "showcase_hunter",
        note: "Extensive track record auditing multi-tenant AWS/GCP IAM control planes, SAML signature wrapping, and OAuth PKCE flows (21 resolved reports across US/EU/IN showcase programs).",
        created_at: hoursAgo(9),
        signal: "6.18",
        valid_count: 21,
        closed_count: 23,
        tier: "gold",
      },
    ];

    const scope1Id = "66666666-6666-4666-8666-666666666601";
    const scope2Id = "66666666-6666-4666-8666-666666666602";
    const scope3Id = "66666666-6666-4666-8666-666666666603";
    const scope4Id = "66666666-6666-4666-8666-666666666604";
    const scope5Id = "66666666-6666-4666-8666-666666666605";
    const scope6Id = "66666666-6666-4666-8666-666666666606";
    const scope7Id = "66666666-6666-4666-8666-666666666607";
    const scope8Id = "66666666-6666-4666-8666-666666666608";
    const scope9Id = "66666666-6666-4666-8666-666666666609";
    const scope10Id = "66666666-6666-4666-8666-666666666610";

    this.programScopes = [
      {
        id: scope1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "in_scope",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2",
        display_target: "https://api.northwind.cloud/v2",
        description: "Control plane REST & GraphQL APIs. Include X-Northwind-Researcher header.",
        status: "active",
        bounty_tier: 1,
        sort_order: 1,
        created_at: daysAgo(100),
        updated_at: daysAgo(100),
      },
      {
        id: scope2Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "in_scope",
        asset_type: "domain",
        target: "auth.northwind.cloud",
        display_target: "auth.northwind.cloud",
        description: "OIDC / SAML SSO broker, WebAuthn passkeys, and MFA enrollment flows.",
        status: "active",
        bounty_tier: 1,
        sort_order: 2,
        created_at: daysAgo(100),
        updated_at: daysAgo(100),
      },
      {
        id: scope6Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "in_scope",
        asset_type: "wildcard_domain",
        target: "*.iam.northwind.cloud",
        display_target: "*.iam.northwind.cloud",
        description: "Federated STS workload identity endpoints and regional token exchange gateways.",
        status: "active",
        bounty_tier: 1,
        sort_order: 3,
        created_at: daysAgo(45),
        updated_at: daysAgo(12),
      },
      {
        id: scope7Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "in_scope",
        asset_type: "domain",
        target: "vault.northwind.cloud",
        display_target: "vault.northwind.cloud",
        description: "Customer-managed KMS envelope encryption and ephemeral secret leasing service.",
        status: "active",
        bounty_tier: 1,
        sort_order: 4,
        created_at: daysAgo(40),
        updated_at: daysAgo(10),
      },
      {
        id: scope8Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "in_scope",
        asset_type: "cidr",
        target: "198.51.100.0/24",
        display_target: "198.51.100.0/24",
        description: "Production Anycast API edge ingress and mTLS termination cluster.",
        status: "active",
        bounty_tier: 2,
        sort_order: 5,
        created_at: daysAgo(30),
        updated_at: daysAgo(8),
      },
      {
        id: scope9Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "in_scope",
        asset_type: "mobile_app",
        target: "io.northwind.authenticator",
        display_target: "io.northwind.authenticator",
        description: "Northwind Push MFA & Hardware Attestation mobile client (iOS & Android).",
        status: "active",
        bounty_tier: 2,
        sort_order: 6,
        created_at: daysAgo(20),
        updated_at: daysAgo(5),
      },
      {
        id: scope3Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "out_of_scope",
        asset_type: "domain",
        target: "status.northwind.cloud",
        display_target: "status.northwind.cloud",
        description: "Third-party hosted status page.",
        status: "active",
        bounty_tier: 3,
        sort_order: 7,
        created_at: daysAgo(100),
        updated_at: daysAgo(100),
      },
      {
        id: scope10Id,
        program_id: prog1Id,
        organization_id: org1Id,
        scope_state: "out_of_scope",
        asset_type: "domain",
        target: "blog.northwind.cloud",
        display_target: "blog.northwind.cloud",
        description: "Static marketing & engineering blog hosted on external CDN.",
        status: "active",
        bounty_tier: 3,
        sort_order: 8,
        created_at: daysAgo(90),
        updated_at: daysAgo(90),
      },
      {
        id: scope4Id,
        program_id: prog2Id,
        organization_id: org2Id,
        scope_state: "in_scope",
        asset_type: "url",
        target: "https://api.helios.finance/v1/settlements",
        display_target: "https://api.helios.finance/v1/settlements",
        description: "Sandbox settlement API. Test credentials provisioned upon sign-in.",
        status: "active",
        bounty_tier: 1,
        sort_order: 1,
        created_at: daysAgo(95),
        updated_at: daysAgo(95),
      },
      {
        id: scope5Id,
        program_id: prog3Id,
        organization_id: org3Id,
        scope_state: "in_scope",
        asset_type: "domain",
        target: "fleet.aegis.systems",
        display_target: "fleet.aegis.systems",
        description: "Fleet telemetry console and OTA manifest verifier.",
        status: "active",
        bounty_tier: 2,
        sort_order: 1,
        created_at: daysAgo(80),
        updated_at: daysAgo(80),
      },
    ];

    const rep1Id = "77777777-7777-4777-8777-777777777701";
    const rep2Id = "77777777-7777-4777-8777-777777777702";
    const rep3Id = "77777777-7777-4777-8777-777777777703";
    const rep4Id = "77777777-7777-4777-8777-777777777704";
    const rep5Id = "77777777-7777-4777-8777-777777777705";
    const rep6Id = "77777777-7777-4777-8777-777777777706";
    const rep7Id = "77777777-7777-4777-8777-777777777707";
    const rep8Id = "77777777-7777-4777-8777-777777777708";
    const rep9Id = "77777777-7777-4777-8777-777777777709";
    const rep10Id = "77777777-7777-4777-8777-777777777710";
    const rep11Id = "77777777-7777-4777-8777-777777777711";
    const rep12Id = "77777777-7777-4777-8777-777777777712";
    const rep13Id = "77777777-7777-4777-8777-777777777713";
    const rep14Id = "77777777-7777-4777-8777-777777777714";

    this.reports = [
      {
        id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r1Id,
        matched_scope_entry_id: scope1Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.northwind.cloud/v2",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2/graphql",
        display_target: "https://api.northwind.cloud/v2/graphql",
        title: "Cross-tenant KMS key policy read/write via unvalidated X-Forwarded-Tenant-Id header in GraphQL batch mutation",
        description: "When executing batched GraphQL mutations against `/v2/graphql`, the tenant context resolver caches the first sub-operation's `X-Forwarded-Tenant-Id` header if the request is signed with an ephemeral workload token.",
        weakness_type: "broken_access_control",
        impact: "Complete cross-tenant compromise of customer-managed encryption key policies across any organization UUID.",
        researcher_severity: "critical",
        confirmed_severity: "critical",
        priority: "p1",
        status: "resolved",
        resolution_summary: "Patched in release v2026.03.14-rc2 by binding tenant context strictly to the verified JWT claim per resolver.",
        duplicate_of_report_id: null,
        assignee_id: orgTriage1Id,
        cvss_base_score: 9.6,
        submitted_at: daysAgo(30),
        created_at: daysAgo(30),
        updated_at: daysAgo(14),
      },
      {
        id: rep2Id,
        program_id: prog2Id,
        organization_id: org2Id,
        researcher_id: r2Id,
        matched_scope_entry_id: scope4Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.helios.finance/v1/settlements",
        asset_type: "url",
        target: "https://api.helios.finance/v1/settlements/reverse",
        display_target: "https://api.helios.finance/v1/settlements/reverse",
        title: "Race condition in concurrent settlement reversal allows double-crediting sub-ledger settlement accounts",
        description: "Parallel `POST /v1/settlements/:id/reverse` requests issued within the same 15ms database read-committed window bypass the idempotency check before the settlement row transitions to `REVERSED`.",
        weakness_type: "business_logic",
        impact: "An authenticated merchant can multiply settlement credits and drain institutional liquidity pools.",
        researcher_severity: "critical",
        confirmed_severity: "critical",
        priority: "p1",
        status: "resolved",
        resolution_summary: "Enforced SELECT FOR UPDATE NOWAIT row locking prior to evaluating settlement reversal state transitions.",
        duplicate_of_report_id: null,
        assignee_id: orgOwner2Id,
        cvss_base_score: 8.7,
        submitted_at: daysAgo(21),
        created_at: daysAgo(21),
        updated_at: daysAgo(8),
      },
      {
        id: rep3Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r3Id,
        matched_scope_entry_id: scope2Id,
        matched_scope_state: "in_scope",
        matched_target: "auth.northwind.cloud",
        asset_type: "domain",
        target: "auth.northwind.cloud",
        display_target: "auth.northwind.cloud",
        title: "OIDC PKCE downgrade on `/oauth/authorize` when `code_challenge_method` is omitted for public CLI clients",
        description: "Public OAuth clients registered for `northwind-cli` enforce PKCE when `code_challenge_method=S256` is supplied, but silently skip verification during `/oauth/token` exchange if `code_challenge` was omitted during authorization.",
        weakness_type: "broken_authentication",
        impact: "Allows authorization code interception on workstation custom URI handlers to yield full cloud CLI sessions.",
        researcher_severity: "high",
        confirmed_severity: "high",
        priority: "p2",
        status: "resolved",
        resolution_summary: "Mandated code_challenge_method=S256 on all public native/CLI clients at authorization and token endpoints.",
        duplicate_of_report_id: null,
        assignee_id: orgTriage1Id,
        cvss_base_score: 8.1,
        submitted_at: daysAgo(15),
        created_at: daysAgo(15),
        updated_at: daysAgo(4),
      },
      {
        id: rep4Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r1Id,
        matched_scope_entry_id: scope1Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.northwind.cloud/v2",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2/webhooks/test-delivery",
        display_target: "https://api.northwind.cloud/v2/webhooks/test-delivery",
        title: "SSRF in webhook delivery preview via DNS rebinding against link-local workload identity endpoint",
        description: "The `/v2/webhooks/test-delivery` endpoint validates the target DNS A record prior to connecting, but performs a second DNS lookup inside the HTTP client pool without pinning the resolved IP.",
        weakness_type: "ssrf",
        impact: "Exposes ephemeral worker IAM credentials for the webhook dispatch cluster.",
        researcher_severity: "critical",
        confirmed_severity: "critical",
        priority: "p1",
        status: "triaging",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: orgTriage1Id,
        cvss_base_score: 9.1,
        submitted_at: daysAgo(2),
        created_at: daysAgo(2),
        updated_at: hoursAgo(3),
      },
      {
        id: rep5Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r2Id,
        matched_scope_entry_id: scope1Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.northwind.cloud/v2",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2/iam/assume-role",
        display_target: "https://api.northwind.cloud/v2/iam/assume-role",
        title: "Unauthenticated STS role assumption via forged SAML assertion signature wrapping in multi-IdP federation",
        description: "The XML signature verifier in `/v2/iam/assume-role` validates the `<ds:Signature>` against the root `<samlp:Response>` but extracts the subject NameID from the first `<saml:Assertion>` node regardless of reference URI binding.",
        weakness_type: "broken_authentication",
        impact: "Allows an attacker with a valid signed assertion from any sandbox IdP to forge organization owner credentials.",
        researcher_severity: "critical",
        confirmed_severity: "critical",
        priority: "p1",
        status: "new",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: null,
        cvss_base_score: 9.8,
        submitted_at: hoursAgo(4),
        created_at: hoursAgo(4),
        updated_at: hoursAgo(2),
      },
      // Showcase findings from scripts/seed-showcase.ts (TAX_FINDINGS + Showcase Hunter)
      {
        id: rep7Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r5Id,
        matched_scope_entry_id: scope1Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.northwind.cloud/v2",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2/billing/invoices",
        display_target: "https://api.northwind.cloud/v2/billing/invoices",
        title: "IDOR exposes multi-tenant billing invoices and GST/tax schedules to unprivileged IAM roles",
        description: "The invoice download endpoint takes a sequential UUIDv7 invoice identifier and verifies authentication but omits the caller's organization_id predicate when streaming PDFs from object storage.",
        weakness_type: "idor",
        impact: "Any authenticated tenant user can enumerate and download another organization's tax invoices and billing records.",
        researcher_severity: "high",
        confirmed_severity: "high",
        priority: "p2",
        status: "accepted",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: orgTriage1Id,
        cvss_base_score: 8.3,
        submitted_at: daysAgo(4),
        created_at: daysAgo(4),
        updated_at: hoursAgo(8),
      },
      {
        id: rep8Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r6Id,
        matched_scope_entry_id: scope2Id,
        matched_scope_state: "in_scope",
        matched_target: "auth.northwind.cloud",
        asset_type: "domain",
        target: "auth.northwind.cloud",
        display_target: "auth.northwind.cloud",
        title: "Password reset token remains valid after password rotation and WebAuthn MFA enrollment",
        description: "Reset links issued via `/auth/recovery` remain active for their full 24h TTL even after the user changes their password or enrolls a hardware security key.",
        weakness_type: "broken_authentication",
        impact: "Account takeover from any leaked or delayed recovery email despite subsequent credential rotation.",
        researcher_severity: "high",
        confirmed_severity: "high",
        priority: "p2",
        status: "needs_more_info",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: orgSecAdmin1Id,
        cvss_base_score: 7.5,
        submitted_at: daysAgo(6),
        created_at: daysAgo(6),
        updated_at: hoursAgo(14),
      },
      {
        id: rep9Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r7Id,
        matched_scope_entry_id: scope2Id,
        matched_scope_state: "in_scope",
        matched_target: "auth.northwind.cloud",
        asset_type: "domain",
        target: "auth.northwind.cloud",
        display_target: "auth.northwind.cloud",
        title: "Stored XSS in support ticket subject and organization display name in IAM admin console",
        description: "The display-name field on the account settings page is rendered without HTML entity encoding inside the support staff audit drawer.",
        weakness_type: "cross_site_scripting",
        impact: "An attacker can execute arbitrary JavaScript in the session of any security admin reviewing tenant audit logs.",
        researcher_severity: "high",
        confirmed_severity: "high",
        priority: "p2",
        status: "resolved",
        resolution_summary: "Strict context-aware output encoding and CSP nonce enforcement deployed across the IAM admin console.",
        duplicate_of_report_id: null,
        assignee_id: orgTriage1Id,
        cvss_base_score: 8.0,
        submitted_at: daysAgo(19),
        created_at: daysAgo(19),
        updated_at: daysAgo(7),
      },
      {
        id: rep10Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r5Id,
        matched_scope_entry_id: scope7Id,
        matched_scope_state: "in_scope",
        matched_target: "vault.northwind.cloud",
        asset_type: "domain",
        target: "vault.northwind.cloud",
        display_target: "vault.northwind.cloud",
        title: "KMS envelope DEK cache persists plaintext key material across tenant lease revocation",
        description: "When a secret lease is explicitly revoked via `POST /v1/sys/leases/revoke`, the regional memory cache retains the unwrapped data encryption key for up to 300 seconds.",
        weakness_type: "cryptographic_issue",
        impact: "Compromised workload pods can decrypt newly written secrets for 5 minutes after emergency lease revocation.",
        researcher_severity: "critical",
        confirmed_severity: "critical",
        priority: "p1",
        status: "accepted",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: orgOwner1Id,
        cvss_base_score: 9.2,
        submitted_at: daysAgo(5),
        created_at: daysAgo(5),
        updated_at: hoursAgo(5),
      },
      {
        id: rep11Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r4Id,
        matched_scope_entry_id: scope1Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.northwind.cloud/v2",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2/tokens/introspect",
        display_target: "https://api.northwind.cloud/v2/tokens/introspect",
        title: "Timing side-channel in service-account HMAC signature comparison on `/v2/tokens/introspect`",
        description: "Early byte-by-byte return in legacy HMAC token introspection leaks signature prefix validity over 4,000 sampled requests.",
        weakness_type: "cryptographic_issue",
        impact: "Theoretical signature forgery on non-rotated v1 service account tokens.",
        researcher_severity: "medium",
        confirmed_severity: "medium",
        priority: "p3",
        status: "triaging",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: orgSecAdmin1Id,
        cvss_base_score: 5.9,
        submitted_at: daysAgo(1),
        created_at: daysAgo(1),
        updated_at: hoursAgo(9),
      },
      {
        id: rep12Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r3Id,
        matched_scope_entry_id: scope6Id,
        matched_scope_state: "in_scope",
        matched_target: "*.iam.northwind.cloud",
        asset_type: "domain",
        target: "sts-ap-south.iam.northwind.cloud",
        display_target: "sts-ap-south.iam.northwind.cloud",
        title: "Open redirect in post-logout `return_to` parameter on regional STS portal",
        description: "The `return_to` query parameter accepts protocol-relative URLs beginning with `//\\` when parsed by the regional edge proxy.",
        weakness_type: "broken_access_control",
        impact: "Phishing vector after federated SSO sign-out.",
        researcher_severity: "low",
        confirmed_severity: "low",
        priority: "p4",
        status: "new",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: null,
        cvss_base_score: 4.3,
        submitted_at: hoursAgo(11),
        created_at: hoursAgo(11),
        updated_at: hoursAgo(11),
      },
      {
        id: rep13Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r4Id,
        matched_scope_entry_id: scope1Id,
        matched_scope_state: "in_scope",
        matched_target: "https://api.northwind.cloud/v2",
        asset_type: "url",
        target: "https://api.northwind.cloud/v2/webhooks/test-delivery",
        display_target: "https://api.northwind.cloud/v2/webhooks/test-delivery",
        title: "Duplicate: SSRF via IPv6 mapped IPv4 link-local address in webhook validator",
        description: "Webhook test endpoint allows `::ffff:169.254.169.254` to bypass IPv4 CIDR blocklist.",
        weakness_type: "ssrf",
        impact: "Metadata service exposure.",
        researcher_severity: "high",
        confirmed_severity: "high",
        priority: "p2",
        status: "duplicate",
        resolution_summary: "Marked as duplicate of #77777777-7777-4777-8777-777777777704.",
        duplicate_of_report_id: rep4Id,
        assignee_id: orgTriage1Id,
        cvss_base_score: 7.7,
        submitted_at: daysAgo(2),
        created_at: daysAgo(2),
        updated_at: daysAgo(1),
      },
      {
        id: rep14Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r6Id,
        matched_scope_entry_id: scope2Id,
        matched_scope_state: "in_scope",
        matched_target: "auth.northwind.cloud",
        asset_type: "domain",
        target: "auth.northwind.cloud",
        display_target: "auth.northwind.cloud",
        title: "Verbose stack trace returned on malformed CBOR WebAuthn attestation object",
        description: "Supplying a truncated CBOR map during passkey registration returns internal Go package line numbers in the 400 error payload.",
        weakness_type: "information_disclosure",
        impact: "Minor internal library version disclosure without state or memory leak.",
        researcher_severity: "low",
        confirmed_severity: "low",
        priority: "p4",
        status: "informative",
        resolution_summary: "Closed as informative; error serializer sanitized in routine maintenance.",
        duplicate_of_report_id: null,
        assignee_id: orgSecAdmin1Id,
        cvss_base_score: 3.1,
        submitted_at: daysAgo(10),
        created_at: daysAgo(10),
        updated_at: daysAgo(8),
      },
      {
        id: rep6Id,
        program_id: prog4Id,
        organization_id: org1Id,
        researcher_id: r3Id,
        matched_scope_entry_id: scope2Id,
        matched_scope_state: "in_scope",
        matched_target: "auth.northwind.cloud",
        asset_type: "domain",
        target: "relay-eu-central.northwind.cloud",
        display_target: "relay-eu-central.northwind.cloud",
        title: "WireGuard mesh relay session key reuse after control-plane node eviction allows stale peer packet injection",
        description: "When a mesh peer is evicted via the control-plane API, regional relay nodes retain the Noise IK session key in the fast-path kernel table until the 180-second rekey timer expires.",
        weakness_type: "cryptographic_issue",
        impact: "Revoked mesh peers can continue injecting UDP frames into isolated VPC subnets for up to 3 minutes post-revocation.",
        researcher_severity: "medium",
        confirmed_severity: "medium",
        priority: "p3",
        status: "accepted",
        resolution_summary: null,
        duplicate_of_report_id: null,
        assignee_id: orgTriage1Id,
        cvss_base_score: 6.5,
        submitted_at: daysAgo(5),
        created_at: daysAgo(5),
        updated_at: daysAgo(1),
      },
    ];

    const bd1Id = "88888888-8888-4888-8888-888888888801";
    const bd2Id = "88888888-8888-4888-8888-888888888802";
    const bd3Id = "88888888-8888-4888-8888-888888888803";
    const bd4Id = "88888888-8888-4888-8888-888888888804";

    this.bountyDecisions = [
      {
        id: bd1Id,
        report_id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r1Id,
        decided_by: orgOwner1Id,
        state: "finalized",
        recommended_amount_minor_units: 1200000,
        final_amount_minor_units: 1350000,
        platform_fee_minor_units: 135000,
        currency: "USD",
        rationale: "Critical cross-tenant KMS policy bypass with clean reproduction and remediation notes.",
        finalized_at: daysAgo(20),
        created_at: daysAgo(25),
        updated_at: daysAgo(20),
      },
      {
        id: bd2Id,
        report_id: rep2Id,
        program_id: prog2Id,
        organization_id: org2Id,
        researcher_id: r2Id,
        decided_by: orgOwner2Id,
        state: "finalized",
        recommended_amount_minor_units: 1500000,
        final_amount_minor_units: 1750000,
        platform_fee_minor_units: 175000,
        currency: "USD",
        rationale: "High-impact single-packet race condition on settlement reversals.",
        finalized_at: daysAgo(12),
        created_at: daysAgo(16),
        updated_at: daysAgo(12),
      },
      {
        id: bd3Id,
        report_id: rep3Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r3Id,
        decided_by: orgOwner1Id,
        state: "finalized",
        recommended_amount_minor_units: 450000,
        final_amount_minor_units: 500000,
        platform_fee_minor_units: 50000,
        currency: "USD",
        rationale: "High severity OIDC PKCE downgrade affecting public CLI clients.",
        finalized_at: daysAgo(6),
        created_at: daysAgo(10),
        updated_at: daysAgo(6),
      },
      {
        id: bd4Id,
        report_id: rep9Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r7Id,
        decided_by: orgOwner1Id,
        state: "finalized",
        recommended_amount_minor_units: 250000,
        final_amount_minor_units: 350000,
        platform_fee_minor_units: 35000,
        currency: "USD",
        rationale: "High impact stored XSS in support staff audit drawer (Showcase award).",
        finalized_at: daysAgo(3),
        created_at: daysAgo(5),
        updated_at: daysAgo(3),
      },
    ];

    this.paymentObligations = [
      {
        id: "90000000-0000-4000-8000-000000000001",
        report_id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r1Id,
        bounty_decision_id: bd1Id,
        amount_minor_units: 1350000,
        platform_fee_minor_units: 135000,
        currency: "USD",
        status: "paid",
        created_at: daysAgo(20),
        updated_at: daysAgo(19),
      },
      {
        id: "90000000-0000-4000-8000-000000000002",
        report_id: rep2Id,
        program_id: prog2Id,
        organization_id: org2Id,
        researcher_id: r2Id,
        bounty_decision_id: bd2Id,
        amount_minor_units: 1750000,
        platform_fee_minor_units: 175000,
        currency: "USD",
        status: "paid",
        created_at: daysAgo(12),
        updated_at: daysAgo(11),
      },
      {
        id: "90000000-0000-4000-8000-000000000003",
        report_id: rep3Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r3Id,
        bounty_decision_id: bd3Id,
        amount_minor_units: 500000,
        platform_fee_minor_units: 50000,
        currency: "USD",
        status: "paid",
        created_at: daysAgo(6),
        updated_at: daysAgo(5),
      },
      {
        id: "90000000-0000-4000-8000-000000000004",
        report_id: rep9Id,
        program_id: prog1Id,
        organization_id: org1Id,
        researcher_id: r7Id,
        bounty_decision_id: bd4Id,
        amount_minor_units: 350000,
        platform_fee_minor_units: 35000,
        currency: "USD",
        status: "paid",
        created_at: daysAgo(3),
        updated_at: daysAgo(2),
      },
    ];

    this.disclosures = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
        report_id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        requested_by: r1Id,
        requested_at: daysAgo(16),
        decided_by: orgOwner1Id,
        decided_at: daysAgo(14),
        status: "approved",
        decline_reason: null,
        draft_title: "Cross-tenant KMS key policy read/write via GraphQL batch context caching",
        draft_summary: null,
        published_title: "Cross-tenant KMS key policy read/write via GraphQL batch context caching",
        published_summary: "Northwind Cloud resolved a critical tenant-context caching flaw in batched GraphQL mutations (CWE-639) that allowed an authenticated workload token to modify KMS key policies across tenants when supplying a secondary X-Forwarded-Tenant-Id header. All production clusters were patched within 14 hours of triage.",
        published_at: daysAgo(14),
        unpublished_at: null,
        unpublish_reason: null,
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
        report_id: rep2Id,
        program_id: prog2Id,
        organization_id: org2Id,
        requested_by: orgOwner2Id,
        requested_at: daysAgo(9),
        decided_by: r2Id,
        decided_at: daysAgo(8),
        status: "approved",
        decline_reason: null,
        draft_title: "Race condition in concurrent settlement reversal state transition",
        draft_summary: null,
        published_title: "Race condition in concurrent settlement reversal state transition",
        published_summary: "Helios Financial remediated a race condition (CWE-362) in the /v1/settlements/:id/reverse endpoint where concurrent HTTP/2 multiplexed reversal requests could bypass read-committed idempotency checks. Row-level locking (SELECT FOR UPDATE) is now enforced.",
        published_at: daysAgo(8),
        unpublished_at: null,
        unpublish_reason: null,
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
        report_id: rep3Id,
        program_id: prog1Id,
        organization_id: org1Id,
        requested_by: r3Id,
        requested_at: daysAgo(5),
        decided_by: orgOwner1Id,
        decided_at: daysAgo(4),
        status: "approved",
        decline_reason: null,
        draft_title: "OIDC PKCE downgrade on public CLI OAuth client authorization flow",
        draft_summary: null,
        published_title: "OIDC PKCE downgrade on public CLI OAuth client authorization flow",
        published_summary: "Northwind Identity (auth.northwind.cloud) enforced strict S256 PKCE verification on /oauth/authorize and /oauth/token for all public native and CLI OAuth clients, closing a downgrade path where omitted code_challenge parameters bypassed verifier checks.",
        published_at: daysAgo(4),
        unpublished_at: null,
        unpublish_reason: null,
      },
    ];

    this.reputationLedger = [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01",
        researcher_id: r1Id,
        fact_type: "report_resolved",
        report_id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        confirmed_severity: "critical",
        duplicate_of_report_id: null,
        occurred_at: daysAgo(18),
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
        researcher_id: r1Id,
        fact_type: "bounty_finalized",
        report_id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        confirmed_severity: "critical",
        duplicate_of_report_id: null,
        occurred_at: daysAgo(20),
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03",
        researcher_id: r2Id,
        fact_type: "report_resolved",
        report_id: rep2Id,
        program_id: prog2Id,
        organization_id: org2Id,
        confirmed_severity: "critical",
        duplicate_of_report_id: null,
        occurred_at: daysAgo(10),
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb04",
        researcher_id: r3Id,
        fact_type: "report_resolved",
        report_id: rep3Id,
        program_id: prog1Id,
        organization_id: org1Id,
        confirmed_severity: "high",
        duplicate_of_report_id: null,
        occurred_at: daysAgo(5),
      },
    ];

    this.notifications = [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccc01",
        recipient_id: r1Id,
        category: "report_lifecycle",
        notification_type: "report_triaged",
        report_id: rep4Id,
        program_id: prog1Id,
        organization_id: org1Id,
        occurred_at: daysAgo(1),
        created_at: daysAgo(1),
        read_at: null,
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccc02",
        recipient_id: r1Id,
        category: "bounty_and_payment",
        notification_type: "bounty_finalized",
        report_id: rep1Id,
        program_id: prog1Id,
        organization_id: org1Id,
        occurred_at: daysAgo(20),
        created_at: daysAgo(20),
        read_at: daysAgo(19),
      },
    ];

    this.ctfChallenges = [
      {
        id: "web-idor-invoice-01",
        slug: "tenant-header-shadowing",
        title: "Tenant Header Shadowing in Edge Gateway",
        points: 100,
        flag_value: "UNPATCHED{uNd3rSc0r3_h34d3r_sMuGgL1nG}",
        hints: [
          { position: 1, cost: 10, body: "Compare how Envoy and Node handle headers with underscores vs hyphens." },
        ],
      },
      {
        id: "auth-jwt-jku-02",
        slug: "jwt-jku-ssrf-chain",
        title: "JWKS URI Redirect to Internal Metadata Signer",
        points: 250,
        flag_value: "UNPATCHED{jKu_r3d1r3cT_k3y_1nj3cT10n}",
        hints: [
          { position: 1, cost: 25, body: "Inspect the path normalization in the jku allowlist verifier." },
        ],
      },
      {
        id: "graphql-batch-rate-limit-bypass",
        slug: "graphql-batch-rate-limit-bypass",
        title: "GraphQL Aliasing & Batch Lockout Evasion",
        points: 150,
        flag_value: "UNPATCHED{gR4pHqL_aL1aS_mUlT1pL3x}",
        hints: [
          { position: 1, cost: 15, body: "Use GraphQL field aliases inside a single POST document." },
        ],
      },
      {
        id: "cloud-s3-policy-04",
        slug: "presigned-s3-policy-injection",
        title: "Cloud Artifact Presigned POST Policy Escalation",
        points: 400,
        flag_value: "UNPATCHED{s3_pR3f1x_b0uNd4rY_bYp4sS}",
        hints: [
          { position: 1, cost: 40, body: "Notice the missing trailing slash in the starts-with prefix condition." },
        ],
      },
    ];

    this.ctfSolves = [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01",
        challenge_id: "web-idor-invoice-01",
        researcher_id: r1Id,
        points_awarded: 100,
        solved_at: daysAgo(20),
      },
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02",
        challenge_id: "auth-jwt-jku-02",
        researcher_id: r1Id,
        points_awarded: 250,
        solved_at: daysAgo(18),
      },
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03",
        challenge_id: "web-idor-invoice-01",
        researcher_id: r2Id,
        points_awarded: 100,
        solved_at: daysAgo(14),
      },
    ];
  }
}

const globalForMockDb = globalThis as unknown as { __unpatchedMockDb?: MockDatabase };
export const mockDb = globalForMockDb.__unpatchedMockDb ?? (globalForMockDb.__unpatchedMockDb = new MockDatabase());

function makeResult<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

export class MockPoolClient {
  private currentUserId: string | null = null;
  private currentRole: string = "anon";

  release(): void {
    // No-op for in-memory client
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    textOrConfig: string | { text: string; values?: unknown[] },
    valuesArg?: unknown[],
  ): Promise<QueryResult<R>> {
    const rawSql = typeof textOrConfig === "string" ? textOrConfig : textOrConfig.text;
    const values = (typeof textOrConfig === "string" ? valuesArg : textOrConfig.values) ?? [];
    const sql = rawSql.replace(/\s+/g, " ").trim();
    const sqlLower = sql.toLowerCase();

    if (
      sqlLower === "begin" ||
      sqlLower === "commit" ||
      sqlLower === "rollback" ||
      sqlLower.startsWith("set local role") ||
      sqlLower === "select 1"
    ) {
      return makeResult<R>([]);
    }

    if (sqlLower.includes("set_config('request.jwt.claim.sub'") || sqlLower.includes("set_config('app.current_claims'")) {
      this.currentUserId = typeof values[0] === "string" && values[0].length > 0 ? values[0] : null;
      this.currentRole = typeof values[1] === "string" ? values[1] : "authenticated";
      return makeResult<R>([]);
    }

    // Check rate-limit helper queries (`select public.check_... as ok`)
    if (
      sqlLower.includes("check_sign_in_rate_limit") ||
      sqlLower.includes("check_sign_up_rate_limit") ||
      sqlLower.includes("check_client_error_rate_limit")
    ) {
      return makeResult<R>([{ ok: true } as unknown as R]);
    }

    // RPC dispatch: SELECT * FROM public.<fn>(...) or app.<fn>(...)
    const rpcMatch = sql.match(/from\s+(?:public|app)\.([a-z0-9_]+)\s*\(|select\s+(?:public|app)\.([a-z0-9_]+)\s*\(/i);
    if (rpcMatch && !sqlLower.includes("from public.users")) {
      const fnName = (rpcMatch[1] || rpcMatch[2]).toLowerCase();
      const scalarAlias = sqlLower.includes("as result");
      const rows = this.handleRpc(fnName, values);
      if (scalarAlias) {
        const firstRow = rows[0];
        const scalarVal =
          firstRow && typeof firstRow === "object" && "result" in firstRow
            ? (firstRow as { result: unknown }).result
            : firstRow ?? null;
        return makeResult<R>([{ result: scalarVal } as unknown as R]);
      }
      return makeResult<R>(rows as unknown as R[]);
    }

    return makeResult<R>(this.handleSql(sql, sqlLower, values) as unknown as R[]);
  }

  private handleRpc(fnName: string, values: unknown[]): Record<string, unknown>[] {
    switch (fnName) {
      case "get_session_gate": {
        const sessionId = String(values[0] ?? "");
        let session = mockDb.sessions.find((s) => s.id === sessionId && !s.revoked_at);
        if (!session) {
          mockDb.loadPersistedState();
          session = mockDb.sessions.find((s) => s.id === sessionId && !s.revoked_at);
        }
        if (!session) return [];
        const user = mockDb.users.find((u) => u.id === session.user_id);
        if (!user) return [];
        return [
          {
            user_id: user.id,
            aal: session.aal,
            token_hash: session.token_hash,
            updated_at: session.updated_at,
            deactivated: Boolean(user.deactivated_at),
            mfa_enrolled: user.mfa_enabled,
            mfa_session_verified: true,
            platform_admin: user.is_platform_admin,
          },
        ];
      }

      case "touch_session": {
        const sessionId = String(values[0] ?? "");
        const session = mockDb.sessions.find((s) => s.id === sessionId);
        if (session) session.updated_at = new Date().toISOString();
        return [];
      }

      case "am_i_platform_admin": {
        const user = mockDb.users.find((u) => u.id === this.currentUserId);
        return [{ am_i_platform_admin: Boolean(user?.is_platform_admin) }];
      }

      case "get_my_platform_staff": {
        const user = mockDb.users.find((u) => u.id === this.currentUserId);
        return [
          {
            platform_admin: Boolean(user?.is_platform_admin),
            triage_analyst: false,
            analyst_needs_mfa: false,
          },
        ];
      }

      case "get_my_researcher_actions": {
        return [
          {
            collaboration_invitations: "0",
            acknowledgements_to_answer: "1",
            mentorship_requests_to_answer: "0",
            cve_eligible_reports: "1",
            unaccepted_agreements: "0",
            upcoming_events: "2",
            identity_verified: true,
          },
        ];
      }

      case "get_program_severity_status_breakdown": {
        const progId = String(values[0] ?? "");
        const progReports = mockDb.reports.filter((r) => r.program_id === progId);
        const map = new Map<string, { severity: string; status: string; count: number }>();
        for (const r of progReports) {
          const sev = r.confirmed_severity ?? r.researcher_severity ?? "medium";
          const status = r.status === "needs_more_info" ? "needs_information" : r.status;
          const key = `${sev}::${status}`;
          const cur = map.get(key);
          if (cur) cur.count += 1;
          else map.set(key, { severity: sev, status, count: 1 });
        }
        // Add historical resolved/closed showcase volume for prog1Id so analytics & acceptance rate reflect 90d history
        if (progId === "55555555-5555-4555-8555-555555555501") {
          const resolvedHighKey = "high::resolved";
          const resolvedMedKey = "medium::resolved";
          const resolvedLowKey = "low::resolved";
          map.set(resolvedHighKey, {
            severity: "high",
            status: "resolved",
            count: (map.get(resolvedHighKey)?.count ?? 0) + 5,
          });
          map.set(resolvedMedKey, {
            severity: "medium",
            status: "resolved",
            count: (map.get(resolvedMedKey)?.count ?? 0) + 4,
          });
          map.set(resolvedLowKey, {
            severity: "low",
            status: "resolved",
            count: (map.get(resolvedLowKey)?.count ?? 0) + 2,
          });
        }
        return Array.from(map.values());
      }

      case "get_organization_severity_status_breakdown": {
        const orgId = String(values[0] ?? "");
        const orgReports = mockDb.reports.filter((r) => r.organization_id === orgId);
        const map = new Map<string, { severity: string; status: string; count: number }>();
        for (const r of orgReports) {
          const sev = r.confirmed_severity ?? r.researcher_severity ?? "medium";
          const status = r.status === "needs_more_info" ? "needs_information" : r.status;
          const key = `${sev}::${status}`;
          const cur = map.get(key);
          if (cur) cur.count += 1;
          else map.set(key, { severity: sev, status, count: 1 });
        }
        return Array.from(map.values());
      }

      case "get_program_weekly_report_volume": {
        const now = Date.now();
        return Array.from({ length: 8 }, (_, idx) => {
          const weekDate = new Date(now - (7 - idx) * 7 * 86_400_000).toISOString().slice(0, 10);
          return {
            week_start: weekDate,
            submitted_count: 3 + (idx % 3),
            resolved_count: 2 + (idx % 2),
            other_closed_count: idx % 2,
          };
        });
      }

      case "get_program_resolution_performance": {
        const progId = String(values[0] ?? "");
        const progReports = mockDb.reports.filter((r) => r.program_id === progId);
        const openReports = progReports.filter((r) =>
          ["new", "triaging", "needs_more_info", "needs_information", "accepted"].includes(r.status),
        );
        return [
          {
            median_hours_to_first_triage: 3.1,
            median_days_to_resolution: 5.4,
            open_count: openReports.length,
            aging_0_to_7_days_count: Math.max(0, openReports.length - 1),
            aging_8_to_30_days_count: openReports.length > 0 ? 1 : 0,
            aging_31_to_60_days_count: 0,
            aging_over_60_days_count: 0,
          },
        ];
      }

      case "get_program_policy": {
        const progId = String(values[0] ?? "");
        const pol = mockDb.programPolicies.find((p) => p.program_id === progId && !p.superseded_at);
        return pol ? [pol] : [];
      }

      case "publish_program_policy": {
        const progId = String(values[0] ?? "");
        const rulesOfEngagement = String(values[1] ?? "");
        const safeHarbor = Boolean(values[2]);
        const disclosureMode = (values[3] as "coordinated" | "full" | "none") ?? "coordinated";
        const disclosureDays = values[4] != null ? Number(values[4]) : null;
        const firstResponseTargetHours = values[5] != null ? Number(values[5]) : null;
        const triageTargetHours = values[6] != null ? Number(values[6]) : null;
        const resolutionTargetDays = values[7] != null ? Number(values[7]) : null;
        const changeNote = values[8] != null ? String(values[8]) : null;
        const now = new Date().toISOString();
        const existing = mockDb.programPolicies.filter((p) => p.program_id === progId);
        for (const p of existing) p.superseded_at = now;
        const nextVer = existing.length + 1;
        const created = {
          id: `pol-${progId}-v${nextVer}`,
          program_id: progId,
          version_number: nextVer,
          rules_of_engagement: rulesOfEngagement,
          safe_harbor: safeHarbor,
          disclosure_mode: disclosureMode,
          disclosure_days: disclosureDays,
          first_response_target_hours: firstResponseTargetHours,
          triage_target_hours: triageTargetHours,
          resolution_target_days: resolutionTargetDays,
          change_note: changeNote,
          created_at: now,
          superseded_at: null,
        };
        mockDb.programPolicies.push(created);
        return [created];
      }

      case "create_bounty_policy_version": {
        const progId = String(values[0] ?? "");
        const currency = String(values[1] ?? "USD");
        const prog = mockDb.programs.find((p) => p.id === progId);
        const orgId = prog?.organization_id ?? "33333333-3333-4333-8333-333333333301";
        const now = new Date().toISOString();
        const existing = mockDb.bountyPolicyVersions.filter((b) => b.program_id === progId);
        for (const b of existing) b.superseded_at = now;
        const nextVer = existing.length + 1;
        const verId = `bpv-${progId}-v${nextVer}`;
        const versionRow = {
          id: verId,
          program_id: progId,
          organization_id: orgId,
          version_number: nextVer,
          currency,
          created_at: now,
          superseded_at: null,
        };
        mockDb.bountyPolicyVersions.push(versionRow);
        const tiers: Array<"none" | "low" | "medium" | "high" | "critical"> = ["none", "low", "medium", "high", "critical"];
        tiers.forEach((sev, idx) => {
          const minVal = Number(values[2 + idx * 2] ?? 0);
          const maxVal = Number(values[3 + idx * 2] ?? 0);
          mockDb.bountySeverityRanges.push({
            policy_version_id: verId,
            severity: sev,
            min_amount_minor_units: minVal,
            max_amount_minor_units: maxVal,
          });
        });
        return [versionRow];
      }

      case "list_program_access_requests": {
        const progId = String(values[0] ?? "");
        return mockDb.programAccessRequests.filter((r) => r.program_id === progId);
      }

      case "get_program_join_info": {
        const progId = String(values[0] ?? "");
        const prog = mockDb.programs.find((p) => p.id === progId);
        return [
          {
            join_mode: prog?.visibility === "private" ? "request" : "open",
            min_signal: "5.0",
            min_valid_reports: 2,
            my_request_id: null,
            my_request_status: null,
            my_request_at: null,
            my_decision_note: null,
          },
        ];
      }

      case "suggest_program_researchers": {
        const progId = String(values[0] ?? "");
        const enrolledIds = new Set(
          mockDb.programResearchers.filter((pr) => pr.program_id === progId).map((pr) => pr.user_id),
        );
        return mockDb.users
          .filter((u) => u.account_type === "researcher" && !enrolledIds.has(u.id))
          .map((u) => ({
            researcher_id: u.id,
            display_name: u.display_name,
            public_username: u.public_username ?? u.username,
            score: String(u.reputation_points),
            resolved_count: "8",
            bounty_finalized_count: "5",
          }));
      }

      case "get_organization_resolution_performance": {
        const orgId = String(values[0] ?? "");
        const orgReports = mockDb.reports.filter((r) => r.organization_id === orgId);
        const openReports = orgReports.filter((r) =>
          ["new", "triaging", "needs_more_info", "needs_information", "accepted"].includes(r.status),
        );
        return [
          {
            median_hours_to_first_triage: 3.4,
            median_days_to_resolution: 6.2,
            open_count: openReports.length,
            aging_0_to_7_days_count: openReports.length,
            aging_8_to_30_days_count: 0,
            aging_31_to_60_days_count: 0,
            aging_over_60_days_count: 0,
          },
        ];
      }

      case "get_organization_bounty_spend_summary": {
        const orgId = String(values[0] ?? "");
        const decisions = mockDb.bountyDecisions.filter(
          (b) => b.organization_id === orgId && b.state === "finalized",
        );
        const obligations = mockDb.paymentObligations.filter((o) => o.organization_id === orgId);
        const totalAwarded = decisions.reduce((acc, b) => acc + b.final_amount_minor_units, 0);
        const totalPaid = obligations
          .filter((o) => o.status === "paid")
          .reduce((acc, o) => acc + o.amount_minor_units, 0);
        return [
          {
            currency: "USD",
            total_awarded_minor_units: totalAwarded || 1850000,
            total_paid_minor_units: totalPaid || 1850000,
            total_outstanding_minor_units: Math.max(0, totalAwarded - totalPaid),
            award_count: decisions.length || 2,
            paid_critical_count: 1,
            paid_high_count: 1,
            paid_medium_count: 0,
            paid_low_count: 0,
            paid_none_count: 0,
          },
        ];
      }

      case "get_organization_dashboard": {
        const orgId = String(values[0] ?? "");
        const pDays = Number(values[1] ?? 90);
        const orgReports = mockDb.reports.filter((r) => r.organization_id === orgId);
        const progs = mockDb.programs.filter((p) => p.organization_id === orgId);
        const sinceDate = new Date(Date.now() - pDays * 86_400_000).toISOString();

        const weekly = [];
        const now = Date.now();
        for (let i = 11; i >= 0; i--) {
          const wkDate = new Date(now - i * 7 * 86_400_000).toISOString();
          weekly.push({
            week: wkDate,
            critical: i % 3 === 0 ? 1 : 0,
            high: i % 2 === 0 ? 2 : 1,
            medium: 2 + (i % 3),
            low: 1,
            none: 0,
            unrated: 0,
            median_hours_to_triage: 3.5 + (i % 4) * 0.5,
          });
        }

        const validCount = orgReports.filter((r) => r.status === "accepted" || r.status === "resolved").length || 18;
        const totalReceived = orgReports.length || 24;
        const openCount = orgReports.filter((r) => ["new", "triaging", "needs_information", "accepted"].includes(r.status)).length || 14;

        const dashboardData = {
          since: sinceDate,
          kpis: {
            current: {
              received: totalReceived,
              valid: validCount,
              decided: Math.max(1, totalReceived - 2),
              researchers: 12,
              median_hours_to_triage: 4.2,
              median_days_to_resolution: 8,
            },
            previous: {
              received: Math.round(totalReceived * 0.85),
              valid: Math.round(validCount * 0.8),
              decided: Math.max(1, Math.round((totalReceived - 2) * 0.85)),
              researchers: 9,
              median_hours_to_triage: 6.8,
              median_days_to_resolution: 11,
            },
          },
          open_backlog: openCount,
          awards: [
            {
              currency: "USD",
              awarded: 2450000,
              awarded_previous: 1950000,
            },
          ],
          weekly,
          weaknesses: [
            { weakness: "server_side_request_forgery", count: 7 },
            { weakness: "insecure_direct_object_reference", count: 6 },
            { weakness: "cross_site_scripting", count: 5 },
            { weakness: "sql_injection", count: 3 },
            { weakness: "privilege_escalation", count: 2 },
            { weakness: "open_redirect", count: 1 },
          ],
          assets: [
            { target: "api.northwind.cloud", count: 9, valid: 8 },
            { target: "console.northwind.cloud", count: 6, valid: 5 },
            { target: "billing.northwind.cloud", count: 5, valid: 4 },
            { target: "auth.northwind.cloud", count: 4, valid: 3 },
          ],
          programs: progs.map((p) => ({
            program_id: p.id,
            name: p.name,
            status: p.status,
            received: 12,
            valid: 9,
            open: 4,
          })),
          researchers: [
            { name: "Sarah Vance", valid: 8, submitted: 9 },
            { name: "David Chen", valid: 6, submitted: 7 },
            { name: "Emily Watson", valid: 4, submitted: 5 },
          ],
        };

        return [{ get_organization_dashboard: dashboardData }];
      }

      case "get_organization_response_metrics": {
        const orgId = String(values[0] ?? "");
        const pDays = Number(values[1] ?? 90);
        const progs = mockDb.programs.filter((p) => p.organization_id === orgId);
        const sinceDate = new Date(Date.now() - pDays * 86_400_000).toISOString();

        const baseStat = {
          measured: 18,
          met: 17,
          breached: 1,
          median_hours: 3.4,
          p90_hours: 11.2,
        };

        const responseMetrics = {
          since: sinceDate,
          reports: 24,
          metrics: [
            {
              metric: "first_response",
              benchmark_hours: 4.0,
              benchmark_orgs: 48,
              measured: 24,
              met: 23,
              breached: 1,
              median_hours: 1.8,
              p90_hours: 4.5,
            },
            {
              metric: "triage",
              benchmark_hours: 24.0,
              benchmark_orgs: 48,
              measured: 20,
              met: 19,
              breached: 1,
              median_hours: 8.5,
              p90_hours: 22.0,
            },
            {
              metric: "bounty",
              benchmark_hours: 72.0,
              benchmark_orgs: 42,
              measured: 15,
              met: 15,
              breached: 0,
              median_hours: 28.0,
              p90_hours: 64.0,
            },
            {
              metric: "resolution",
              benchmark_hours: 168.0,
              benchmark_orgs: 45,
              measured: 12,
              met: 11,
              breached: 1,
              median_hours: 96.0,
              p90_hours: 160.0,
            },
          ],
          programs: progs.map((p) => ({
            program_id: p.id,
            name: p.name,
            reports: 12,
            metrics: {
              first_response: { ...baseStat, median_hours: 1.6, p90_hours: 3.8 },
              triage: { ...baseStat, median_hours: 7.2, p90_hours: 18.5 },
              bounty: { ...baseStat, median_hours: 24.0, p90_hours: 56.0 },
              resolution: { ...baseStat, median_hours: 88.0, p90_hours: 144.0 },
            },
          })),
        };

        return [{ get_organization_response_metrics: responseMetrics }];
      }

      case "get_organization_sla_summary": {
        const orgId = String(values[0] ?? "");
        const progs = mockDb.programs.filter((p) => p.organization_id === orgId);
        return progs.map((p) => ({
          program_id: p.id,
          report_count: "12",
          first_response_tracked: "12",
          first_response_breached: "1",
          triage_tracked: "10",
          triage_breached: "1",
          resolution_tracked: "8",
          resolution_breached: "0",
          median_first_response_hours: "2.4",
        }));
      }

      case "get_organization_weekly_bounty_spend": {
        const rows = [];
        const now = Date.now();
        for (let i = 11; i >= 0; i--) {
          const wkDate = new Date(now - i * 7 * 86_400_000).toISOString().slice(0, 10);
          rows.push({
            week_start: wkDate,
            currency: "USD",
            paid_minor_units: i % 2 === 0 ? 250000 : 150000,
            payout_count: i % 2 === 0 ? 2 : 1,
          });
        }
        return rows;
      }

      case "get_organization_program_bounty_spend": {
        const orgId = String(values[0] ?? "");
        const progs = mockDb.programs.filter((p) => p.organization_id === orgId);
        return progs.map((p, idx) => ({
          program_id: p.id,
          currency: "USD",
          total_paid_minor_units: idx === 0 ? 1250000 : 600000,
          payout_count: idx === 0 ? 5 : 2,
        }));
      }

      case "get_my_researcher_dashboard": {
        const pDays = Number(values[0] ?? 90);
        const sinceDate = new Date(Date.now() - pDays * 86_400_000).toISOString();
        const weekly = [];
        const now = Date.now();
        for (let i = 11; i >= 0; i--) {
          const wkDate = new Date(now - i * 7 * 86_400_000).toISOString();
          weekly.push({
            week: wkDate,
            submitted: i % 2 === 0 ? 2 : 1,
            valid: i % 2 === 0 ? 1 : 1,
            invalid: 0,
          });
        }
        const dashboard = {
          since: sinceDate,
          kpis: {
            current: { submitted: 16, valid: 12, decided: 14, median_hours_to_first_response: 2.5 },
            previous: { submitted: 12, valid: 9, decided: 10, median_hours_to_first_response: 3.8 },
          },
          reputation: 640,
          reputation_previous: 480,
          awards: [{ currency: "USD", awarded: 1250000, awarded_previous: 850000, paid: 1250000 }],
          status: [
            { status: "accepted", count: 7 },
            { status: "resolved", count: 5 },
            { status: "triaging", count: 2 },
            { status: "new", count: 2 },
          ],
          severity: [
            { severity: "critical", count: 2 },
            { severity: "high", count: 5 },
            { severity: "medium", count: 4 },
            { severity: "low", count: 1 },
          ],
          weekly,
          reputation_weekly: weekly.map((w, idx) => ({ week: w.week, score: 200 + idx * 40 })),
          earnings_weekly: weekly.map((w) => ({ currency: "USD", week: w.week, amount: 100000 })),
          programs: mockDb.programs.slice(0, 3).map((p) => ({
            program_id: p.id,
            name: p.name,
            submitted: 5,
            valid: 4,
          })),
        };
        return [{ get_my_researcher_dashboard: dashboard }];
      }

      case "get_platform_dashboard": {
        const pDays = Number(values[0] ?? 90);
        const sinceDate = new Date(Date.now() - pDays * 86_400_000).toISOString();
        const weekly = [];
        const now = Date.now();
        for (let i = 11; i >= 0; i--) {
          const wkDate = new Date(now - i * 7 * 86_400_000).toISOString();
          weekly.push({
            week: wkDate,
            reports: 8 + (i % 4),
            valid: 6 + (i % 3),
            researchers: 3 + (i % 2),
            organization_accounts: 1,
          });
        }
        const dashboard = {
          since: sinceDate,
          reports: {
            current: { reports: 88, valid: 68, decided: 74 },
            previous: { reports: 72, valid: 54, decided: 60 },
          },
          signups: {
            current: { researchers: 28, organization_accounts: 6 },
            previous: { researchers: 22, organization_accounts: 4 },
          },
          totals: {
            active_organizations: mockDb.organizations.length,
            researchers: mockDb.users.filter((u) => u.account_type === "researcher").length,
            active_programs: mockDb.programs.filter((p) => p.status === "active").length,
            pending_launches: 1,
            kyc_pending: 0,
            open_mediations: 0,
            errors_24h: 0,
          },
          payouts: [{ currency: "USD", paid: 8450000, paid_previous: 6200000 }],
          weekly,
          programs_by_status: [
            { status: "active", count: mockDb.programs.filter((p) => p.status === "active").length },
            { status: "pending_review", count: 0 },
            { status: "draft", count: mockDb.programs.filter((p) => p.status === "draft").length },
          ],
          top_organizations: mockDb.organizations.map((o) => ({
            organization_id: o.id,
            name: o.name,
            reports: 24,
            valid: 18,
          })),
        };
        return [{ get_platform_dashboard: dashboard }];
      }

      case "get_organization_activity_dashboard": {
        const orgId = String(values[0] ?? "");
        const pDays = Number(values[1] ?? 90);
        const sinceDate = new Date(Date.now() - pDays * 86_400_000).toISOString();
        const weekly = [];
        const now = Date.now();
        for (let i = 11; i >= 0; i--) {
          const wkDate = new Date(now - i * 7 * 86_400_000).toISOString();
          weekly.push({
            week: wkDate,
            reports: 3,
            programs: 1,
            team: 1,
            money: 1,
            other: 0,
          });
        }
        const dashboard = {
          since: sinceDate,
          kpis: {
            current: { actions: 48, people: 6, sensitive: 4 },
            previous: { actions: 36, people: 5, sensitive: 3 },
          },
          weekly,
          top_actions: [
            { action: "report.resolved", count: 12, sensitive: false },
            { action: "report.bounty_finalized", count: 8, sensitive: true },
            { action: "member.invited", count: 5, sensitive: false },
          ],
          top_people: [
            { name: "Alex Vance", is_member: true, count: 24 },
            { name: "Elena Rostova", is_member: true, count: 16 },
          ],
        };
        return [{ get_organization_activity_dashboard: dashboard }];
      }

      case "get_organization_onboarding": {
        const orgId = String(values[0] ?? "");
        const org = mockDb.organizations.find((o) => o.id === orgId) ?? mockDb.organizations[0];
        const progs = mockDb.programs.filter((p) => p.organization_id === org.id);
        const firstProg = progs[0] ?? null;
        return [
          {
            get_organization_onboarding: {
              organization_name: org.name,
              billing_profile: true,
              team_invited: true,
              admins_mfa: true,
              jira_connected: true,
              program_created: progs.length > 0,
              scope_added: true,
              policy_published: true,
              bounty_table: true,
              reward_groups: true,
              funded: true,
              submitted: true,
              in_review: false,
              launched: true,
              researchers_joined: true,
              public: true,
              pilot_program_id: firstProg?.id ?? null,
              pilot_program_name: firstProg?.name ?? null,
              pilot_researchers: 14,
              pilot_valid_reports: 6,
              pilot_days: 45,
              first_program_id: firstProg?.id ?? null,
            },
          },
        ];
      }

      case "get_managed_triage_performance": {
        return [
          {
            reports_handled: "18",
            first_response_met: "18",
            first_response_measured: "18",
            triage_met: "17",
            triage_measured: "18",
            open_escalations: "1",
            assessments: "18",
          },
        ];
      }

      case "list_public_programs": {
        const search = typeof values[0] === "string" ? values[0].trim().toLowerCase() : "";
        const statusFilter = typeof values[1] === "string" ? values[1] : null;
        const focusArea = typeof values[2] === "string" ? values[2] : null;
        const assetType = typeof values[3] === "string" ? values[3] : null;
        const programType = typeof values[4] === "string" ? values[4] : null;
        const uid = this.currentUserId;

        return mockDb.programs
          .filter((p) => p.visibility === "public" && (p.status === "active" || p.status === "paused"))
          .filter((p) => (!statusFilter ? true : p.status === statusFilter))
          .filter((p) => (!programType ? true : p.program_type === programType))
          .filter((p) => (!focusArea ? true : p.focus_areas.includes(focusArea)))
          .filter((p) => (!assetType ? true : p.asset_types.includes(assetType)))
          .filter((p) => {
            if (!search) return true;
            const org = mockDb.organizations.find((o) => o.id === p.organization_id);
            return (
              p.name.toLowerCase().includes(search) ||
              p.description.toLowerCase().includes(search) ||
              (org?.name.toLowerCase().includes(search) ?? false)
            );
          })
          .map((p) => {
            const org = mockDb.organizations.find((o) => o.id === p.organization_id)!;
            const scopes = mockDb.programScopes.filter((s) => s.program_id === p.id);
            const joined = Boolean(
              uid &&
                mockDb.programResearchers.some(
                  (pr) => pr.program_id === p.id && pr.user_id === uid && pr.status === "active",
                ),
            );
            return {
              id: p.id,
              slug: p.slug,
              organization_id: p.organization_id,
              name: p.name,
              summary: p.summary,
              organization_name: org.name,
              organization_slug: org.slug,
              status: p.status,
              visibility: p.visibility,
              program_type: p.program_type,
              reward_type: p.program_type,
              description: p.description,
              updated_at: p.updated_at,
              requires_kyc: p.requires_kyc,
              bounty_min_minor_units: p.bounty_min_minor_units,
              bounty_max_minor_units: p.bounty_max_minor_units,
              bounty_currency: p.currency,
              currency: p.currency,
              reward_min: p.bounty_min_minor_units ? p.bounty_min_minor_units / 100 : null,
              reward_max: p.bounty_max_minor_units ? p.bounty_max_minor_units / 100 : null,
              joined,
              sort_value: p.updated_at,
              focus_areas: p.focus_areas,
              asset_types: p.asset_types,
              active_researcher_count: 14,
              resolved_report_count: mockDb.reports.filter((r) => r.program_id === p.id && r.status === "resolved").length + 6,
              in_scope_count: scopes.filter((s) => s.scope_state === "in_scope").length,
              out_of_scope_count: scopes.filter((s) => s.scope_state === "out_of_scope").length,
            };
          });
      }

      case "get_public_program":
      case "get_public_program_by_slug": {
        const idOrSlug = String(values[0] ?? "");
        const p = mockDb.programs.find((prog) => prog.id === idOrSlug || prog.slug === idOrSlug);
        if (!p) return [];
        const org = mockDb.organizations.find((o) => o.id === p.organization_id)!;
        return [
          {
            id: p.id,
            slug: p.slug,
            organization_id: p.organization_id,
            name: p.name,
            organization_name: org.name,
            status: p.status,
            program_type: p.program_type,
            description: p.description,
            updated_at: p.updated_at,
            requires_kyc: p.requires_kyc,
            bounty_min_minor_units: p.bounty_min_minor_units,
            bounty_max_minor_units: p.bounty_max_minor_units,
            bounty_currency: p.currency,
          },
        ];
      }

      case "list_top_bounty_programs": {
        const limit = typeof values[0] === "number" ? values[0] : 6;
        return mockDb.programs
          .filter((p) => p.program_type === "bounty" && p.bounty_max_minor_units != null)
          .sort((a, b) => (b.bounty_max_minor_units ?? 0) - (a.bounty_max_minor_units ?? 0))
          .slice(0, limit)
          .map((p) => {
            const org = mockDb.organizations.find((o) => o.id === p.organization_id)!;
            return {
              id: p.id,
              organization_id: p.organization_id,
              name: p.name,
              organization_name: org.name,
              status: p.status,
              bounty_min_minor_units: p.bounty_min_minor_units!,
              bounty_max_minor_units: p.bounty_max_minor_units!,
              bounty_currency: p.currency,
            };
          });
      }

      case "list_public_program_scope":
      case "list_public_program_scope_by_slug": {
        const idOrSlug = String(values[0] ?? "");
        const prog = mockDb.programs.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
        if (!prog) return [];
        return mockDb.programScopes
          .filter((s) => s.program_id === prog.id && s.status === "active")
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({
            id: s.id,
            asset_type: s.asset_type,
            display_target: s.display_target,
            scope_state: s.scope_state,
            description: s.description,
          }));
      }

      case "join_public_program": {
        const progId = String(values[0] ?? "");
        const uid = this.currentUserId ?? mockDb.users[0].id;
        const prog = mockDb.programs.find((p) => p.id === progId);
        if (prog) {
          const exists = mockDb.programResearchers.some(
            (pr) => pr.program_id === progId && pr.user_id === uid,
          );
          if (!exists) {
            const now = new Date().toISOString();
            mockDb.programResearchers.push({
              program_id: prog.id,
              organization_id: prog.organization_id,
              user_id: uid,
              status: "active",
              source: "public_self_join",
              invited_by: null,
              joined_at: now,
              suspended_at: null,
              revoked_at: null,
              updated_at: now,
            });
          }
        }
        return [];
      }

      case "list_my_program_participations": {
        const uid = this.currentUserId;
        if (!uid) return [];
        return mockDb.programResearchers
          .filter((pr) => pr.user_id === uid)
          .map((pr) => {
            const p = mockDb.programs.find((prog) => prog.id === pr.program_id)!;
            const o = mockDb.organizations.find((org) => org.id === pr.organization_id)!;
            return {
              program_id: p.id,
              organization_id: o.id,
              program_name: p.name,
              program_status: p.status,
              organization_name: o.name,
              status: pr.status,
              joined_at: pr.joined_at,
            };
          });
      }

      case "list_my_pending_program_invitations":
      case "list_my_pending_invitations": {
        return [];
      }

      case "list_public_disclosures": {
        const limit = typeof values[0] === "number" ? values[0] : 50;
        return mockDb.disclosures
          .filter((d) => d.status === "approved" && d.published_at != null)
          .slice(0, limit)
          .map((d) => {
            const r = mockDb.reports.find((rep) => rep.id === d.report_id)!;
            const p = mockDb.programs.find((prog) => prog.id === d.program_id)!;
            const o = mockDb.organizations.find((org) => org.id === d.organization_id)!;
            const u = mockDb.users.find((usr) => usr.id === r.researcher_id)!;
            return {
              report_id: r.id,
              published_title: d.published_title,
              published_summary: d.published_summary,
              severity: r.confirmed_severity ?? r.researcher_severity,
              program_id: p.id,
              program_name: p.name,
              organization_id: o.id,
              organization_name: o.name,
              researcher_username: u.public_username,
              published_at: d.published_at!,
            };
          });
      }

      case "get_public_disclosure": {
        const reportId = String(values[0] ?? "");
        return this.handleRpc("list_public_disclosures", [100]).filter((d) => d.report_id === reportId);
      }

      case "get_public_leaderboard":
      case "get_researcher_leaderboard": {
        const limit = typeof values[0] === "number" ? values[0] : 50;
        return mockDb.users
          .filter((u) => u.account_type === "researcher" && u.is_public)
          .sort((a, b) => b.reputation_points - a.reputation_points)
          .slice(0, limit)
          .map((u) => {
            const resolvedCount = mockDb.reports.filter(
              (r) => r.researcher_id === u.id && r.status === "resolved",
            ).length;
            const bountyCount = mockDb.bountyDecisions.filter(
              (b) => b.researcher_id === u.id && b.state === "finalized",
            ).length;
            return {
              researcher_id: u.id,
              user_id: u.id,
              display_name: u.display_name,
              public_username: u.public_username,
              username: u.username,
              score: u.reputation_points,
              reputation_points: u.reputation_points,
              resolved_count: Math.max(1, resolvedCount),
              bounty_finalized_count: Math.max(1, bountyCount),
            };
          });
      }

      case "get_my_leaderboard_position": {
        const uid = this.currentUserId;
        const researchers = mockDb.users
          .filter((u) => u.account_type === "researcher")
          .sort((a, b) => b.reputation_points - a.reputation_points);
        const idx = researchers.findIndex((u) => u.id === uid);
        if (idx < 0) return [];
        return [
          {
            rank: idx + 1,
            score: researchers[idx].reputation_points,
            total_researchers: researchers.length,
          },
        ];
      }

      case "get_researcher_reputation_score": {
        const uid = String(values[0] ?? this.currentUserId ?? "");
        const u = mockDb.users.find((usr) => usr.id === uid);
        return [{ get_researcher_reputation_score: u?.reputation_points ?? 120 }];
      }

      case "get_public_researcher_profile": {
        const username = String(values[0] ?? "").toLowerCase();
        const u = mockDb.users.find(
          (usr) => usr.account_type === "researcher" && usr.public_username?.toLowerCase() === username,
        );
        if (!u) return [];
        return [
          {
            researcher_id: u.id,
            display_name: u.display_name,
            public_username: u.public_username!,
            biography: u.bio,
            hacking_interests: ["api_security", "cloud_infrastructure"],
            security_focus: ["web_applications", "authentication"],
            score: u.reputation_points,
            resolved_count: 6,
            bounty_finalized_count: 4,
          },
        ];
      }

      case "get_researcher_badges": {
        return [
          { badge_key: "resolver", tier: "gold", current_value: 6, next_threshold: 10 },
          { badge_key: "bounty_earner", tier: "silver", current_value: 4, next_threshold: 5 },
          { badge_key: "critical_finder", tier: "silver", current_value: 2, next_threshold: 5 },
        ];
      }

      case "get_my_home_dashboard_summary": {
        const uid = this.currentUserId ?? mockDb.users[0].id;
        const myReports = mockDb.reports.filter((r) => r.researcher_id === uid);
        return [
          {
            get_my_home_dashboard_summary: {
              reputationSummary: [
                { factType: "report_resolved", count: 4 },
                { factType: "bounty_finalized", count: 3 },
                { factType: "ctf_challenge_solved", count: 2 },
              ],
              reputationSeverityCounts: [
                { severity: "critical", count: 2 },
                { severity: "high", count: 2 },
              ],
              reportStatusCounts: [
                { status: "resolved", count: myReports.filter((r) => r.status === "resolved").length || 1 },
                { status: "triaging", count: myReports.filter((r) => r.status === "triaging").length || 1 },
              ],
              reportsNeedingResponse: myReports.filter((r) => r.status === "needs_more_info").length,
            },
          },
        ];
      }

      case "get_my_reputation_summary": {
        return [
          { fact_type: "report_resolved", fact_count: 4 },
          { fact_type: "bounty_finalized", fact_count: 3 },
          { fact_type: "ctf_challenge_solved", fact_count: 2 },
        ];
      }

      case "list_my_ctf_solves":
      case "list_ctf_solves_for_actor": {
        const uid = (typeof values[0] === "string" ? values[0] : this.currentUserId) ?? mockDb.users[0].id;
        return mockDb.ctfSolves
          .filter((s) => s.researcher_id === uid)
          .map((s) => ({
            challenge_id: s.challenge_id,
            points_awarded: s.points_awarded,
            solved_at: s.solved_at,
          }));
      }

      case "list_ctf_challenges": {
        return mockDb.ctfChallenges.map((c, idx) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          points: c.points,
          sort_order: idx + 1,
        }));
      }

      case "get_ctf_leaderboard": {
        const researchers = mockDb.users.filter((u) => u.account_type === "researcher");
        return researchers.map((u, idx) => ({
          rank: String(idx + 1),
          researcher_id: u.id,
          display_name: u.display_name,
          public_username: u.public_username,
          points: String(350 - idx * 50),
          challenges_solved: String(Math.max(1, 3 - idx)),
        }));
      }

      case "get_ctf_solve_counts": {
        const counts = new Map<string, number>();
        for (const s of mockDb.ctfSolves) {
          counts.set(s.challenge_id, (counts.get(s.challenge_id) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([challenge_id, solves]) => ({
          challenge_id,
          solves: String(solves),
        }));
      }

      case "submit_ctf_flag": {
        const challengeIdOrSlug = String(values[0] ?? "");
        const flag = String(values[1] ?? "").trim();
        const uid = this.currentUserId ?? mockDb.users[0].id;
        const challenge = mockDb.ctfChallenges.find(
          (c) => c.id === challengeIdOrSlug || c.slug === challengeIdOrSlug,
        );
        const isCorrect = challenge ? challenge.flag_value === flag : flag.startsWith("UNPATCHED{");
        const pts = challenge?.points ?? 150;
        const targetId = challenge?.id ?? challengeIdOrSlug;
        const alreadySolved = mockDb.ctfSolves.some(
          (s) => s.challenge_id === targetId && s.researcher_id === uid,
        );
        if (isCorrect && !alreadySolved) {
          mockDb.ctfSolves.push({
            id: globalThis.crypto.randomUUID(),
            challenge_id: targetId,
            researcher_id: uid,
            points_awarded: pts,
            solved_at: new Date().toISOString(),
          });
        }
        return [
          {
            correct: isCorrect,
            is_correct: isCorrect,
            points_awarded: isCorrect && !alreadySolved ? pts : 0,
            already_solved: alreadySolved,
          },
        ];
      }

      case "list_ctf_hints": {
        const challengeId = String(values[0] ?? "");
        const ch = mockDb.ctfChallenges.find((c) => c.id === challengeId || c.slug === challengeId);
        return (ch?.hints ?? [{ position: 1, cost: 15, body: "Inspect the request headers and authorization boundary." }]).map(
          (h) => ({
            hint_position: h.position,
            cost: h.cost,
            taken: false,
            body: null,
          }),
        );
      }

      case "take_ctf_hint": {
        const challengeId = String(values[0] ?? "");
        const pos = Number(values[1] ?? 1);
        const ch = mockDb.ctfChallenges.find((c) => c.id === challengeId || c.slug === challengeId);
        const hint = ch?.hints.find((h) => h.position === pos) ?? {
          position: pos,
          cost: 15,
          body: "Inspect the request headers and authorization boundary.",
        };
        return [{ hint_position: hint.position, cost: hint.cost, body: hint.body }];
      }

      case "get_ctf_writeups": {
        return [
          {
            writeup_id: "writeup-1",
            is_official: true,
            author_name: "Unpatched Security Labs",
            body: "By contrasting proxy header normalization against upstream header parsing, an attacker can smuggle a secondary tenant identifier past the edge gateway.",
            published_at: new Date().toISOString(),
            is_mine: false,
          },
        ];
      }

      case "create_user": {
        const email = String(values[0] ?? "").trim().toLowerCase();
        const passwordHash = String(values[1] ?? "");
        const displayName = String(values[2] ?? email.split("@")[0]);
        const username = String(values[3] ?? email.split("@")[0].replace(/[^a-z0-9_]/gi, "_"));
        const now = new Date().toISOString();
        const newUser: MockUserRecord = {
          id: globalThis.crypto.randomUUID(),
          email,
          password_hash: passwordHash,
          email_verified_at: now,
          last_sign_in_at: now,
          created_at: now,
          updated_at: now,
          account_type: "researcher",
          platform_role: null,
          onboarding_completed: true,
          display_name: displayName,
          username,
          public_username: username,
          bio: null,
          website_url: null,
          github_handle: null,
          linkedin_url: null,
          x_handle: null,
          is_public: true,
          reputation_points: 100,
          signal_score: 5.0,
          impact_score: 20.0,
          mfa_enabled: false,
          mfa_enforced_at: null,
          deactivated_at: null,
          deactivated_by: null,
          deactivation_reason: null,
          is_platform_admin: false,
        };
        mockDb.users.push(newUser);
        mockDb.savePersistedState();
        return [{ id: newUser.id, email: newUser.email, display_name: newUser.display_name, username: newUser.username }];
      }

      case "get_report_sla": {
        const repId = String(values[0] ?? "");
        const rep = mockDb.reports.find((r) => r.id === repId);
        const now = Date.now();
        const submittedMs = rep ? new Date(rep.submitted_at).getTime() : now - 4 * 3_600_000;
        const isResolved = rep?.status === "resolved";
        const isTriaged = rep && rep.status !== "new";
        return [
          {
            first_response_due_at: new Date(submittedMs + 4 * 3_600_000).toISOString(),
            first_response_at: isTriaged ? new Date(submittedMs + 1.4 * 3_600_000).toISOString() : null,
            triage_due_at: new Date(submittedMs + 18 * 3_600_000).toISOString(),
            triaged_at: isTriaged ? new Date(submittedMs + 3.1 * 3_600_000).toISOString() : null,
            resolution_due_at: new Date(submittedMs + 14 * 86_400_000).toISOString(),
            resolved_at: isResolved ? rep?.updated_at ?? new Date().toISOString() : null,
          },
        ];
      }

      case "list_assignable_staff": {
        const orgId = String(values[0] ?? "33333333-3333-4333-8333-333333333301");
        return mockDb.organizationMembers
          .filter((m) => m.organization_id === orgId && m.status === "active")
          .map((m) => {
            const u = mockDb.users.find((usr) => usr.id === m.user_id);
            return {
              user_id: m.user_id,
              display_name: u?.display_name ?? "Security Engineer",
              role: m.role,
            };
          });
      }

      case "start_triage":
      case "accept_report":
      case "mark_informative":
      case "mark_not_applicable":
      case "reject_report": {
        const repId = String(values[0] ?? "");
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (rep) {
          rep.status =
            fnName === "start_triage"
              ? "triaging"
              : fnName === "accept_report"
                ? "accepted"
                : fnName === "mark_informative"
                  ? "informative"
                  : fnName === "mark_not_applicable"
                    ? "not_applicable"
                    : "rejected";
          rep.updated_at = new Date().toISOString();
          mockDb.savePersistedState();
          return this.handleSql(`select * from public.reports where id = $1`, `select * from public.reports where id = $1`, [repId]);
        }
        return [];
      }

      case "request_information": {
        const repId = String(values[0] ?? "");
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (rep) {
          rep.status = "needs_more_info";
          rep.updated_at = new Date().toISOString();
          mockDb.savePersistedState();
          return this.handleSql(`select * from public.reports where id = $1`, `select * from public.reports where id = $1`, [repId]);
        }
        return [];
      }

      case "resolve_report": {
        const repId = String(values[0] ?? "");
        const summary = String(values[1] ?? "Patched and verified in production.");
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (rep) {
          rep.status = "resolved";
          rep.resolution_summary = summary;
          rep.updated_at = new Date().toISOString();
          mockDb.savePersistedState();
          return this.handleSql(`select * from public.reports where id = $1`, `select * from public.reports where id = $1`, [repId]);
        }
        return [];
      }

      case "set_report_severity": {
        const repId = String(values[0] ?? "");
        const sev = String(values[1] ?? "high") as MockReportRecord["confirmed_severity"];
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (rep) {
          rep.confirmed_severity = sev;
          rep.updated_at = new Date().toISOString();
          mockDb.savePersistedState();
          return this.handleSql(`select * from public.reports where id = $1`, `select * from public.reports where id = $1`, [repId]);
        }
        return [];
      }

      case "set_report_priority": {
        const repId = String(values[0] ?? "");
        const prio = (values[1] as MockReportRecord["priority"]) ?? null;
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (rep) {
          rep.priority = prio;
          rep.updated_at = new Date().toISOString();
          mockDb.savePersistedState();
          return this.handleSql(`select * from public.reports where id = $1`, `select * from public.reports where id = $1`, [repId]);
        }
        return [];
      }

      case "assign_report": {
        const repId = String(values[0] ?? "");
        const assigneeId = values[1] ? String(values[1]) : null;
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (rep) {
          rep.assignee_id = assigneeId;
          rep.updated_at = new Date().toISOString();
          mockDb.savePersistedState();
          return this.handleSql(`select * from public.reports where id = $1`, `select * from public.reports where id = $1`, [repId]);
        }
        return [];
      }

      case "calculate_bounty_recommendation": {
        const repId = String(values[0] ?? "");
        const rep = mockDb.reports.find((r) => r.id === repId);
        if (!rep) return [];
        const existing = mockDb.bountyDecisions.find((d) => d.report_id === repId);
        if (existing) return [existing];
        const now = new Date().toISOString();
        const created: MockBountyDecisionRecord = {
          id: globalThis.crypto.randomUUID(),
          report_id: rep.id,
          program_id: rep.program_id,
          organization_id: rep.organization_id,
          researcher_id: rep.researcher_id,
          decided_by: this.currentUserId ?? "22222222-2222-4222-8222-222222222201",
          state: "draft",
          recommended_amount_minor_units: rep.confirmed_severity === "critical" ? 1200000 : 450000,
          final_amount_minor_units: rep.confirmed_severity === "critical" ? 1200000 : 450000,
          platform_fee_minor_units: rep.confirmed_severity === "critical" ? 120000 : 45000,
          currency: "USD",
          rationale: "Recommended based on confirmed severity and Tier 1 asset scope.",
          finalized_at: now,
          created_at: now,
          updated_at: now,
        };
        mockDb.bountyDecisions.push(created);
        mockDb.savePersistedState();
        return [created];
      }

      case "finalize_bounty": {
        const repId = String(values[0] ?? "");
        const amountMinor = Number(values[1] ?? 500000);
        const note = String(values[2] ?? "Awarded for verified finding.");
        const dec = mockDb.bountyDecisions.find((d) => d.report_id === repId);
        const now = new Date().toISOString();
        if (dec) {
          dec.state = "finalized";
          dec.final_amount_minor_units = amountMinor;
          dec.platform_fee_minor_units = Math.round(amountMinor * 0.1);
          dec.rationale = note;
          dec.finalized_at = now;
          dec.updated_at = now;
          mockDb.savePersistedState();
          return [dec];
        }
        return [];
      }

      case "list_organization_assets": {
        const orgId = String(values[0] ?? "33333333-3333-4333-8333-333333333301");
        const filterAssetType = values[1] ? String(values[1]) : null;
        const filterProgramId = values[2] ? String(values[2]) : null;
        const includeRetired = Boolean(values[6]);

        const orgPrograms = mockDb.programs.filter((p) => p.organization_id === orgId);
        const orgProgramIds = new Set(orgPrograms.map((p) => p.id));

        type GroupedAsset = {
          asset_id: string;
          asset_type: string;
          display_identifier: string;
          programs: { program_id: string; program_name: string; scope_state: "in_scope" | "out_of_scope" }[];
          open_reports: number;
          total_reports: number;
          last_report_at: string | null;
        };

        const assetMap = new Map<string, GroupedAsset>();

        const seedAssets: {
          id: string;
          target: string;
          type: string;
          programId: string;
          scopeState: "in_scope" | "out_of_scope";
        }[] = [
          { id: "asset-01", target: "https://api.northwind.cloud/v2", type: "url", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-02", target: "auth.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-03", target: "*.iam.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-04", target: "vault.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-05", target: "198.51.100.0/24", type: "ip_cidr", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-06", target: "io.northwind.authenticator", type: "ios_app", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-07", target: "gateway.us-east-1.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555504", scopeState: "in_scope" },
          { id: "asset-08", target: "kms.internal.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555501", scopeState: "in_scope" },
          { id: "asset-09", target: "https://billing.northwind.cloud/v1/invoices", type: "url", programId: "55555555-5555-4555-8555-555555555505", scopeState: "in_scope" },
          { id: "asset-10", target: "northwind/mesh-relay-core", type: "source_code", programId: "55555555-5555-4555-8555-555555555504", scopeState: "in_scope" },
          { id: "asset-11", target: "status.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555501", scopeState: "out_of_scope" },
          { id: "asset-12", target: "blog.northwind.cloud", type: "domain", programId: "55555555-5555-4555-8555-555555555501", scopeState: "out_of_scope" },
        ];

        const scopesForOrg = mockDb.programScopes.filter((s) => orgProgramIds.has(s.program_id));
        const allScopeItems = [
          ...seedAssets,
          ...scopesForOrg.map((s) => ({
            id: s.id,
            target: s.display_target || s.target,
            type: s.asset_type === "wildcard_domain" ? "domain" : s.asset_type === "cidr" ? "ip_cidr" : s.asset_type === "mobile_app" ? "ios_app" : s.asset_type,
            programId: s.program_id,
            scopeState: s.scope_state as "in_scope" | "out_of_scope",
          })),
        ];

        for (const item of allScopeItems) {
          const prog = mockDb.programs.find((p) => p.id === item.programId) ?? orgPrograms[0];
          if (!prog || prog.organization_id !== orgId) continue;
          if (filterProgramId && filterProgramId !== "all" && item.programId !== filterProgramId) continue;

          let existing = assetMap.get(item.target);
          if (!existing) {
            const matchingReports = mockDb.reports.filter(
              (r) =>
                r.organization_id === orgId &&
                (r.display_target.includes(item.target) || item.target.includes(r.display_target) || r.target.includes(item.target)),
            );
            const openReports = matchingReports.filter(
              (r) => r.status === "new" || r.status === "triaging" || r.status === "accepted" || r.status === "needs_more_info",
            ).length;
            const lastReport = matchingReports.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0];

            existing = {
              asset_id: item.id,
              asset_type: item.type,
              display_identifier: item.target,
              programs: [],
              open_reports: openReports,
              total_reports: matchingReports.length,
              last_report_at: lastReport ? lastReport.submitted_at : null,
            };
            assetMap.set(item.target, existing);
          }

          if (!existing.programs.some((p) => p.program_id === item.programId)) {
            existing.programs.push({
              program_id: item.programId,
              program_name: prog.name,
              scope_state: item.scopeState,
            });
          }
        }

        let result = Array.from(assetMap.values());

        if (filterAssetType && filterAssetType !== "all") {
          result = result.filter((a) => a.asset_type === filterAssetType);
        }

        if (!includeRetired) {
          result = result.filter((a) => a.programs.some((p) => p.scope_state === "in_scope"));
        }

        return result;
      }

      default:
        return [];
    }
  }

  private handleSql(sql: string, sqlLower: string, values: unknown[]): Record<string, unknown>[] {
    // 1. Sessions insert / delete
    if (sqlLower.startsWith("insert into public.sessions")) {
      const userId = String(values[0] ?? "");
      const tokenHash = String(values[1] ?? "");
      const userAgent = typeof values[2] === "string" ? values[2] : null;
      const ip = typeof values[3] === "string" ? values[3] : null;
      const now = new Date().toISOString();
      const session: MockSessionRecord = {
        id: globalThis.crypto.randomUUID(),
        user_id: userId,
        token_hash: tokenHash,
        aal: "aal1",
        created_at: now,
        updated_at: now,
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        revoked_at: null,
        ip,
        user_agent: userAgent,
      };
      mockDb.sessions.push(session);
      mockDb.savePersistedState();
      return [{ id: session.id, user_id: session.user_id, aal: session.aal }];
    }

    if (sqlLower.startsWith("delete from public.sessions")) {
      const idOrUser = String(values[0] ?? "");
      mockDb.sessions = mockDb.sessions.filter((s) => s.id !== idOrUser && s.user_id !== idOrUser);
      mockDb.savePersistedState();
      return [];
    }

    // 2. MFA factors check
    if (sqlLower.includes("from public.mfa_factors")) {
      return [];
    }

    // 3. Users lookup
    if (sqlLower.includes("from public.users")) {
      if (sqlLower.includes("where email = $1") || sqlLower.includes("where u.email = $1")) {
        const email = String(values[0] ?? "").trim().toLowerCase();
        const u = mockDb.users.find((usr) => usr.email.toLowerCase() === email);
        if (!u) return [];
        return [
          {
            id: u.id,
            email: u.email,
            password_hash: u.password_hash,
            email_verified_at: u.email_verified_at,
            deactivated_at: u.deactivated_at,
            display_name: u.display_name,
            username: u.username,
            public_username: u.public_username,
            platform_role: u.platform_role,
            account_type: u.account_type,
          },
        ];
      }
      if (sqlLower.includes("where id = $1")) {
        const id = String(values[0] ?? this.currentUserId ?? "");
        const u = mockDb.users.find((usr) => usr.id === id);
        if (!u) return [];
        return [
          {
            id: u.id,
            email: u.email,
            platform_role: u.platform_role,
            account_type: u.account_type,
            username: u.username,
            public_username: u.public_username,
            display_name: u.display_name,
            biography: u.bio,
          },
        ];
      }
      return mockDb.users;
    }

    if (sqlLower.includes("password_sign_in_blocked")) {
      return [{ blocked: false }];
    }

    // 4. Organization memberships
    if (sqlLower.includes("from public.organization_members")) {
      const enrichMember = (m: MockOrganizationMemberRecord) => {
        const o = mockDb.organizations.find((org) => org.id === m.organization_id)!;
        const u = mockDb.users.find((usr) => usr.id === m.user_id);
        return {
          organization_id: o.id,
          id: o.id,
          slug: o.slug,
          name: o.name,
          user_id: m.user_id,
          role: m.role,
          status: m.status,
          invited_by: null,
          joined_at: m.created_at,
          suspended_at: null,
          removed_at: null,
          updated_at: m.updated_at,
          username: u?.username ?? "member",
          display_name: u?.display_name ?? "Organization Member",
          email: u?.email ?? null,
        };
      };

      if (sqlLower.includes("where m.organization_id = $1 and m.user_id = $2")) {
        const orgId = String(values[0] ?? "");
        const uid = String(values[1] ?? this.currentUserId ?? "");
        return mockDb.organizationMembers
          .filter((m) => m.organization_id === orgId && m.user_id === uid)
          .map(enrichMember);
      }

      if (sqlLower.includes("where m.organization_id = $1") || sqlLower.includes("where organization_id = $1")) {
        const orgId = String(values[0] ?? "");
        return mockDb.organizationMembers
          .filter((m) => m.organization_id === orgId)
          .map(enrichMember);
      }

      const uid = String(values[0] ?? this.currentUserId ?? "");
      return mockDb.organizationMembers
        .filter((m) => m.user_id === uid && m.status === "active")
        .map((m) => {
          const o = mockDb.organizations.find((org) => org.id === m.organization_id)!;
          return {
            organization_id: o.id,
            id: o.id,
            slug: o.slug,
            name: o.name,
            role: m.role,
            status: o.status,
          };
        });
    }

    // 4b. Organization audit logs
    if (sqlLower.includes("from public.audit_logs")) {
      const orgOrRepId = String(values[0] ?? "");
      const org = mockDb.organizations.find((o) => o.id === orgOrRepId) ?? mockDb.organizations[0];
      const now = Date.now();
      const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
      if (sqlLower.includes("entity_type = 'report'")) {
        return [
          {
            id: `audit-rep-${orgOrRepId}-1`,
            actor_id: "22222222-2222-4222-8222-222222222202",
            action: "report.triage_started",
            entity_type: "report",
            entity_id: orgOrRepId,
            metadata: { from: "new", to: "triaging", note: "Reproduced in isolated staging cluster." },
            created_at: hoursAgo(6),
          },
          {
            id: `audit-rep-${orgOrRepId}-2`,
            actor_id: org.created_by,
            action: "report.severity_set",
            entity_type: "report",
            entity_id: orgOrRepId,
            metadata: { severity: "critical", cvss_base_score: 9.1 },
            created_at: hoursAgo(4),
          },
        ];
      }
      return [
        {
          id: "audit-01",
          actor_id: "22222222-2222-4222-8222-222222222202",
          action: "report.triage_started",
          entity_type: "report",
          entity_id: "77777777-7777-4777-8777-777777777704",
          metadata: { from: "new", to: "triaging", title: "SSRF in webhook delivery preview via DNS rebinding" },
          created_at: hoursAgo(6),
        },
        {
          id: "audit-02",
          actor_id: org.created_by,
          action: "bounty.finalized",
          entity_type: "bounty_decision",
          entity_id: "88888888-8888-4888-8888-888888888803",
          metadata: { amount_minor_units: 500000, currency: "USD", report_title: "OIDC PKCE downgrade on `/oauth/authorize`" },
          created_at: hoursAgo(28),
        },
        {
          id: "audit-03",
          actor_id: "22222222-2222-4222-8222-222222222202",
          action: "report.severity_set",
          entity_type: "report",
          entity_id: "77777777-7777-4777-8777-777777777706",
          metadata: { severity: "medium", cvss_base_score: 6.5 },
          created_at: hoursAgo(36),
        },
        {
          id: "audit-04",
          actor_id: org.created_by,
          action: "scope.asset_added",
          entity_type: "program_scope_entry",
          entity_id: "66666666-6666-4666-8666-666666666602",
          metadata: { target: "auth.northwind.cloud", asset_type: "domain", scope_state: "in_scope" },
          created_at: hoursAgo(72),
        },
        {
          id: "audit-05",
          actor_id: org.created_by,
          action: "report_disclosure.approved",
          entity_type: "disclosure",
          entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
          metadata: { published_title: "OIDC PKCE downgrade on public CLI OAuth client authorization flow" },
          created_at: hoursAgo(96),
        },
      ];
    }

    // 5. Organizations
    if (sqlLower.includes("from public.organizations")) {
      const id = String(values[0] ?? "");
      return mockDb.organizations.filter((o) => (!id ? true : o.id === id || o.slug === id));
    }

    // 6. Organization logos
    if (sqlLower.includes("from public.organization_logos")) {
      return [];
    }

    // 7. Programs
    if (sqlLower.includes("from public.programs")) {
      if (sqlLower.includes("where p.organization_id = $1") || sqlLower.includes("where organization_id = $1")) {
        const orgId = String(values[0] ?? "");
        return mockDb.programs
          .filter((p) => p.organization_id === orgId)
          .map((p) => ({
            ...p,
            creator_display_name: "Elena Rostova",
          }));
      }
      if (sqlLower.includes("where p.id = $1") || sqlLower.includes("where id = $1")) {
        const progId = String(values[0] ?? "");
        return mockDb.programs
          .filter((p) => p.id === progId)
          .map((p) => ({
            ...p,
            creator_display_name: "Elena Rostova",
          }));
      }
      return mockDb.programs;
    }

    // 8. Program scope entries
    if (sqlLower.includes("from public.program_scope_entries")) {
      const progId = String(values[0] ?? "");
      return mockDb.programScopes.filter((s) => (!progId ? true : s.program_id === progId));
    }

    // 8b. Program members
    if (sqlLower.includes("from public.program_members")) {
      const progId = String(values[0] ?? "");
      const uid = typeof values[1] === "string" ? values[1] : null;
      return mockDb.programMembers
        .filter((pm) => (!progId ? true : pm.program_id === progId))
        .filter((pm) => (!uid ? true : pm.user_id === uid))
        .map((pm) => {
          const u = mockDb.users.find((usr) => usr.id === pm.user_id);
          return {
            ...pm,
            display_name: u?.display_name ?? "Program Manager",
          };
        });
    }

    // 8c. Program bounty policy versions & severity ranges
    if (sqlLower.includes("from public.program_bounty_policy_versions")) {
      const progId = String(values[0] ?? "");
      return mockDb.bountyPolicyVersions.filter(
        (v) => (!progId ? true : v.program_id === progId) && !v.superseded_at,
      );
    }

    if (sqlLower.includes("from public.program_bounty_policy_severity_ranges")) {
      const versionId = String(values[0] ?? "");
      return mockDb.bountySeverityRanges.filter((r) =>
        !versionId ? true : r.policy_version_id === versionId,
      );
    }

    // 8d. Program invitations
    if (sqlLower.includes("from public.program_invitations")) {
      const progId = String(values[0] ?? "");
      return mockDb.programInvitations.filter(
        (inv) => (!progId ? true : inv.program_id === progId) && !inv.accepted_at && !inv.revoked_at,
      );
    }

    // 9. Program researchers
    if (sqlLower.includes("from public.program_researchers")) {
      const progId = String(values[0] ?? "");
      const uid = typeof values[1] === "string" ? values[1] : null;
      return mockDb.programResearchers
        .filter((pr) => (!progId ? true : pr.program_id === progId))
        .filter((pr) => (!uid ? true : pr.user_id === uid))
        .map((pr) => {
          const u = mockDb.users.find((usr) => usr.id === pr.user_id);
          return {
            ...pr,
            username: u?.username ?? "researcher",
            display_name: u?.display_name ?? "Researcher",
            alias_local_part: u?.username ?? null,
          };
        });
    }

    // 10. Reputation ledger
    if (sqlLower.includes("from public.reputation_ledger")) {
      const uid = String(values[0] ?? this.currentUserId ?? "");
      return mockDb.reputationLedger.filter((r) => (!uid ? true : r.researcher_id === uid));
    }

    // 11. Report drafts count
    if (sqlLower.includes("from public.report_drafts")) {
      if (sqlLower.includes("count(")) return [{ count: 0 }];
      return [];
    }

    // 11b. Report messages
    if (sqlLower.includes("from public.report_messages")) {
      const repId = String(values[0] ?? "");
      const rep = mockDb.reports.find((r) => r.id === repId);
      const u = rep ? mockDb.users.find((usr) => usr.id === rep.researcher_id) : null;
      const now = Date.now();
      const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
      return [
        {
          id: `msg-${repId}-1`,
          report_id: repId,
          author_id: rep?.researcher_id ?? "11111111-1111-4111-8111-111111111101",
          author_context: "researcher",
          visibility: "researcher_visible",
          body: "Attached the full HTTP/2 request/response trace and DNS rebinding reproduction script against `nw-sandbox-09`. No production tenant data was accessed.",
          created_at: hoursAgo(12),
          author_display_name: u?.display_name ?? "Soren Lindqvist",
        },
        {
          id: `msg-${repId}-2`,
          report_id: repId,
          author_id: "22222222-2222-4222-8222-222222222202",
          author_context: "organization",
          visibility: "researcher_visible",
          body: "Thank you for the detailed report and clean sandbox reproduction. We have reproduced the unpinned dialer resolution in `us-east-1` staging and escalated to the Cloud IAM & Edge engineering team as P1.",
          created_at: hoursAgo(5),
          author_display_name: "Marcus Vance",
        },
        {
          id: `msg-${repId}-3`,
          report_id: repId,
          author_id: "22222222-2222-4222-8222-222222222205",
          author_context: "organization",
          visibility: "internal",
          body: "Internal Triage Note: Confirmed affected Go package `pkg/webhook/dispatcher.go:L142`. Hotfix PR #4892 pins the resolved IP in `net.Dialer.Control` and blocks link-local `169.254.0.0/16` and `fe80::/10` at the socket level.",
          created_at: hoursAgo(3),
          author_display_name: "Priya Nair",
        },
      ];
    }

    // 11c. Report evidence
    if (sqlLower.includes("from public.report_evidence")) {
      const repId = String(values[0] ?? "");
      const rep = mockDb.reports.find((r) => r.id === repId);
      const u = rep ? mockDb.users.find((usr) => usr.id === rep.researcher_id) : null;
      const now = Date.now();
      const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
      return [
        {
          id: `ev-${repId}-1`,
          report_id: repId,
          author_id: rep?.researcher_id ?? "11111111-1111-4111-8111-111111111101",
          author_context: "researcher",
          visibility: "researcher_visible",
          evidence_type: "code",
          content: `POST /v2/webhooks/test-delivery HTTP/2\nHost: ${rep?.display_target?.replace(/^https?:\/\//, "").split("/")[0] ?? "api.northwind.cloud"}\nAuthorization: Bearer nw_live_sbx_99481a0f8c2e41b\nX-Northwind-Researcher: ${u?.username ?? "nullvector"}\nContent-Type: application/json\n\n{\n  "target": "${rep?.display_target ?? "https://api.northwind.cloud/v2"}",\n  "verify_tls": true,\n  "trace_context": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"\n}`,
          object_key: null,
          original_filename: null,
          content_type: null,
          size_bytes: null,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          created_at: hoursAgo(14),
          author_display_name: u?.display_name ?? "Soren Lindqvist",
        },
      ];
    }

    // 12. Reports
    if (sqlLower.includes("from public.reports")) {
      if (sqlLower.includes("count(")) {
        const progId = String(values[0] ?? "");
        const progReports = mockDb.reports.filter((r) => r.program_id === progId);
        if (sqlLower.includes("status = 'new'")) {
          return [{ count: String(progReports.filter((r) => r.status === "new").length) }];
        }
        if (sqlLower.includes("status = 'needs_information'")) {
          return [{ count: String(progReports.filter((r) => r.status === "needs_more_info").length) }];
        }
        return [{ count: String(progReports.length) }];
      }
      const enrichReport = (r: MockReportRecord) => {
        const p = mockDb.programs.find((prog) => prog.id === r.program_id);
        const o = mockDb.organizations.find((org) => org.id === r.organization_id);
        const u = mockDb.users.find((usr) => usr.id === r.researcher_id);
        const a = r.assignee_id ? mockDb.users.find((usr) => usr.id === r.assignee_id) : null;
        const sev = r.confirmed_severity ?? r.researcher_severity ?? "medium";
        const score = r.cvss_base_score ?? (sev === "critical" ? 9.4 : sev === "high" ? 8.1 : sev === "medium" ? 6.2 : 4.1);
        const vector =
          sev === "critical"
            ? "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N"
            : sev === "high"
              ? "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N"
              : "CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N";
        return {
          ...r,
          status: r.status === "needs_more_info" ? "needs_information" : r.status,
          program_name: p?.name ?? "Security Program",
          organization_name: o?.name ?? "Organization",
          researcher_display_name: u?.display_name ?? "Researcher",
          researcher_username: u?.username ?? "researcher",
          assignee_display_name: a?.display_name ?? null,
          cvss_attack_vector: "network",
          cvss_attack_complexity: sev === "medium" || sev === "low" ? "high" : "low",
          cvss_privileges_required: "low",
          cvss_user_interaction: "none",
          cvss_scope: sev === "critical" ? "changed" : "unchanged",
          cvss_confidentiality_impact: sev === "low" ? "low" : "high",
          cvss_integrity_impact: sev === "low" ? "none" : "high",
          cvss_availability_impact: "none",
          cvss_base_score: score,
          researcher_cvss_version: "3.1",
          researcher_cvss_vector: vector,
          researcher_cvss_score: score,
        };
      };

      if (sqlLower.includes("where r.id = $1") || sqlLower.includes("where id = $1")) {
        const repId = String(values[0] ?? "");
        return mockDb.reports.filter((r) => r.id === repId).map(enrichReport);
      }
      if (sqlLower.includes("researcher_id = $1")) {
        const uid = String(values[0] ?? this.currentUserId ?? "");
        return mockDb.reports.filter((r) => r.researcher_id === uid).map(enrichReport);
      }
      if (sqlLower.includes("program_id = $1") && !sqlLower.includes("organization_id = $1")) {
        const progId = String(values[0] ?? "");
        return mockDb.reports.filter((r) => r.program_id === progId).map(enrichReport);
      }
      if (sqlLower.includes("organization_id = $1")) {
        const orgId = String(values[0] ?? "");
        let list = mockDb.reports.filter((r) => r.organization_id === orgId).map(enrichReport);

        // Apply dynamic positional parameters from listReportsForOrganization / listOpenReportsForOrganization
        const extractParam = (pattern: RegExp): unknown => {
          const m = sqlLower.match(pattern);
          if (!m) return undefined;
          const idx = Number(m[1]) - 1;
          return values[idx];
        };

        const progFilter = extractParam(/r\.program_id\s*=\s*\$(\d+)/);
        if (typeof progFilter === "string") {
          list = list.filter((r) => r.program_id === progFilter);
        }

        const statusAny = extractParam(/r\.status\s*=\s*any\(\$(\d+)\)/);
        if (Array.isArray(statusAny)) {
          list = list.filter((r) => statusAny.includes(r.status));
        }

        const statusEq = extractParam(/r\.status\s*=\s*\$(\d+)/);
        if (typeof statusEq === "string") {
          list = list.filter((r) => r.status === statusEq);
        }

        const sevEq = extractParam(/r\.confirmed_severity\s*=\s*\$(\d+)/);
        if (typeof sevEq === "string") {
          list = list.filter((r) => r.confirmed_severity === sevEq);
        }

        if (sqlLower.includes("r.assignee_id is null")) {
          list = list.filter((r) => !r.assignee_id);
        } else {
          const assigneeEq = extractParam(/r\.assignee_id\s*=\s*\$(\d+)/);
          if (typeof assigneeEq === "string") {
            list = list.filter((r) => r.assignee_id === assigneeEq);
          }
        }

        const ilikeParam = extractParam(/r\.title\s+ilike\s+\$(\d+)/);
        if (typeof ilikeParam === "string") {
          const needle = ilikeParam.replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase();
          if (needle) {
            list = list.filter(
              (r) =>
                r.title.toLowerCase().includes(needle) ||
                r.display_target.toLowerCase().includes(needle) ||
                r.researcher_username.toLowerCase().includes(needle) ||
                r.id.toLowerCase().includes(needle),
            );
          }
        }

        const oldestFirst = sqlLower.includes("order by r.submitted_at asc");
        list.sort((a, b) =>
          oldestFirst
            ? a.submitted_at.localeCompare(b.submitted_at)
            : b.submitted_at.localeCompare(a.submitted_at),
        );

        return list;
      }
      return mockDb.reports.map(enrichReport);
    }

    // 13. Payment obligations & bounty decisions
    if (sqlLower.includes("from public.payment_obligations")) {
      const enrichObligation = (o: MockPaymentObligationRecord) => {
        const r = mockDb.reports.find((rep) => rep.id === o.report_id);
        const p = mockDb.programs.find((prog) => prog.id === o.program_id);
        const org = mockDb.organizations.find((item) => item.id === o.organization_id);
        return {
          ...o,
          report_title: r?.title ?? "Vulnerability Report",
          program_name: p?.name ?? "Program",
          organization_name: org?.name ?? "Organization",
        };
      };
      if (sqlLower.includes("researcher_id = $1")) {
        const uid = String(values[0] ?? this.currentUserId ?? "");
        return mockDb.paymentObligations.filter((o) => o.researcher_id === uid).map(enrichObligation);
      }
      return mockDb.paymentObligations.map(enrichObligation);
    }

    if (sqlLower.includes("from public.report_bounty_decisions")) {
      const repId = String(values[0] ?? "");
      return mockDb.bountyDecisions
        .filter((d) => (!repId ? true : d.report_id === repId))
        .map((d) => {
          const decider = mockDb.users.find((u) => u.id === d.decided_by);
          return {
            ...d,
            decided_by_display_name: decider?.display_name ?? "Security Admin",
            finalized_by_display_name: d.finalized_at ? (decider?.display_name ?? "Security Admin") : null,
          };
        });
    }

    // 14. Notifications
    if (sqlLower.includes("from public.notifications")) {
      const uid = this.currentUserId ?? String(values[0] ?? "");
      const unread = mockDb.notifications.filter((n) => n.recipient_id === uid && !n.read_at);
      if (sqlLower.includes("count(")) {
        return [{ count: unread.length }];
      }
      return mockDb.notifications.filter((n) => (!uid ? true : n.recipient_id === uid));
    }

    // 15. Email aliases
    if (sqlLower.includes("from public.researcher_email_aliases")) {
      const uid = String(values[0] ?? this.currentUserId ?? "");
      const u = mockDb.users.find((usr) => usr.id === uid);
      return u ? [{ local_part: `${u.username}.rsch` }] : [];
    }

    return [];
  }
}


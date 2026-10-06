import type { AuthenticatedUser, OrganizationMembership, OrganizationRole } from "@/types/auth";

export class AuthorizationError extends Error { constructor(message = "Forbidden") { super(message); this.name = "AuthorizationError"; } }

export function requireAuthenticated(user: AuthenticatedUser | null): asserts user is AuthenticatedUser {
  if (!user) throw new AuthorizationError("Authentication required");
}

export function requirePlatformAdmin(user: AuthenticatedUser | null) {
  requireAuthenticated(user);
  if (user.platformRole !== "platform_admin") throw new AuthorizationError();
}

export function requireOrganizationRole(user: AuthenticatedUser | null, membership: OrganizationMembership | null, organizationId: string, allowed: OrganizationMembership["role"][]) {
  requireAuthenticated(user);
  if (!membership || membership.userId !== user.id || membership.organizationId !== organizationId || membership.status !== "active" || !allowed.includes(membership.role)) throw new AuthorizationError();
}

// --- Organization role capability model ---------------------------------------------
// This is the single source of truth for "what can this role do" text shown in the
// Organization Control Center (member table, member detail, invite/role-change
// confirmations). The database re-derives and enforces the same rules independently
// (see the 202608260001 migration) -- this module exists so the UI never has to
// hand-write copy that could drift from what the server actually allows.

export const ORGANIZATION_ROLES: readonly OrganizationRole[] = ["owner", "security_admin", "program_manager", "triager", "billing_admin"];

const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Owner",
  security_admin: "Security Admin",
  program_manager: "Program Manager",
  triager: "Triager",
  billing_admin: "Billing Admin",
};

export function organizationRoleLabel(role: OrganizationRole): string {
  return ROLE_LABELS[role];
}

const MEMBER_MANAGEMENT_ROLES: readonly OrganizationRole[] = ["owner", "security_admin"];

/** Can invite, suspend, reactivate, and remove members. Matches has_org_role checks used by suspend/reactivate/remove/invite RPCs. */
export function canManageMembers(role: OrganizationRole): boolean {
  return MEMBER_MANAGEMENT_ROLES.includes(role);
}

/** Only an owner can change an existing member's organization role. Matches change_member_role's actor check. */
export function canChangeRoles(role: OrganizationRole): boolean {
  return role === "owner";
}

/** Only an owner can invite (or promote) someone into the owner role. Matches invite/change RPC checks. */
export function canGrantRole(actorRole: OrganizationRole, targetRole: OrganizationRole): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  return canManageMembers(actorRole);
}

const PROGRAM_CREATION_ROLES: readonly OrganizationRole[] = ["owner", "security_admin"];

/**
 * Can create a new program in the organization. Matches create_program's
 * private.has_org_role check (202608260004). A distinct capability from
 * canManageMembers even though the allowed-role set is identical today -- see
 * docs/decisions/0004-program-authorization.md.
 */
export function canCreateProgram(role: OrganizationRole): boolean {
  return PROGRAM_CREATION_ROLES.includes(role);
}

const PAYMENT_ROLES: readonly OrganizationRole[] = ["owner", "security_admin", "billing_admin"];

/** Payouts, payment obligations, platform fees. Matches lock_and_authorize_report_for_
 * payments / lock_and_authorize_obligation_for_finance (202609250012). */
export function canManagePayments(role: OrganizationRole): boolean {
  return PAYMENT_ROLES.includes(role);
}

/** Org-wide analytics (severity, volume, resolution time). Matches the role list
 * private.authorize_organization_read is given in 202610060004. */
export function canViewOrganizationAnalytics(role: OrganizationRole): boolean {
  return MEMBER_MANAGEMENT_ROLES.includes(role);
}

const RESEARCHER_INTEL_ROLES: readonly OrganizationRole[] = ["owner", "security_admin", "program_manager"];

/** The organization's researcher list (list_researchers_for_organization, 202610060004). */
export function canViewOrganizationResearchers(role: OrganizationRole): boolean {
  return RESEARCHER_INTEL_ROLES.includes(role);
}

export type OrganizationAccessSummary = {
  role: OrganizationRole;
  label: string;
  organizationAccess: "Full" | "Limited";
  can: string[];
  cannot: string[];
  note?: string;
};

// Mirrors what the database enforces (db/migrations/202609250012_organization_role_
// permissions.sql) -- change both together. "Assigned" means an owner or security admin
// put this person on the program (Program team panel on the program page).
const ACCESS_SUMMARIES: Record<OrganizationRole, OrganizationAccessSummary> = {
  owner: {
    role: "owner",
    label: ROLE_LABELS.owner,
    organizationAccess: "Full",
    can: [
      "Everything a Security Admin can do",
      "Invite other owners and change anyone's role",
      "Manage organization identity and settings",
    ],
    cannot: [],
    note: "An organization always keeps at least one owner.",
  },
  security_admin: {
    role: "security_admin",
    label: ROLE_LABELS.security_admin,
    organizationAccess: "Full",
    can: [
      "Create, launch, pause, and close every program",
      "Edit scope, program settings, and researcher access on every program",
      "Read and triage every report, and decide bounties",
      "Run payouts and see platform fees",
      "Invite, suspend, and remove members (except owners), and assign program teams",
    ],
    cannot: ["Change an existing member's role", "Invite or remove owners"],
  },
  program_manager: {
    role: "program_manager",
    label: ROLE_LABELS.program_manager,
    organizationAccess: "Limited",
    can: [
      "Run the programs they are assigned to: scope, settings, researcher access, launch and pause",
      "Read and triage every report in those programs",
      "Decide and finalize bounty amounts in those programs",
    ],
    cannot: ["See programs they are not assigned to", "Run payouts or see platform fees", "Manage organization members or roles"],
  },
  triager: {
    role: "triager",
    label: ROLE_LABELS.triager,
    organizationAccess: "Limited",
    can: [
      "Read every report in the programs they are assigned to",
      "Triage those reports: status, severity, messages to the researcher, evidence",
    ],
    cannot: ["See programs they are not assigned to", "Change scope or program settings", "Decide bounties or run payouts", "Manage members"],
  },
  billing_admin: {
    role: "billing_admin",
    label: ROLE_LABELS.billing_admin,
    organizationAccess: "Limited",
    can: [
      "See every bounty payment and platform fee (Payments page)",
      "Create payment obligations and record payouts",
    ],
    cannot: ["Read report contents -- only each payment's report title", "Triage reports or change programs", "Manage members"],
  },
};

export function describeOrganizationAccess(role: OrganizationRole): OrganizationAccessSummary {
  return ACCESS_SUMMARIES[role];
}

/** Real, role-specific consequence text for the role-change confirmation dialog -- never generic copy. */
export function describeRoleChangeImpact(currentRole: OrganizationRole, newRole: OrganizationRole): string {
  if (currentRole === newRole) return "This member's role and access will not change.";
  const current = describeOrganizationAccess(currentRole);
  const next = describeOrganizationAccess(newRole);
  const gained = next.can.filter((item) => !current.can.includes(item));
  const lost = current.can.filter((item) => !next.can.includes(item));
  const parts: string[] = [];
  if (gained.length) parts.push(`Gains: ${gained.join("; ")}.`);
  if (lost.length) parts.push(`Loses: ${lost.join("; ")}.`);
  if (!parts.length) parts.push("Organization-level capabilities are unchanged; only the role label differs.");
  return parts.join(" ");
}

type OwnerCheckMember = Pick<OrganizationMembership, "userId" | "role" | "status">;

/**
 * Client-side preview only, for warning copy before a request is sent. The database is
 * the actual enforcement point (see the LAST_OWNER check in the mutation RPCs) because
 * this list can be stale the instant another admin acts concurrently.
 */
export function isLastActiveOwner(members: OwnerCheckMember[], userId: string): boolean {
  const member = members.find((candidate) => candidate.userId === userId);
  if (!member || member.role !== "owner" || member.status !== "active") return false;
  return !members.some((candidate) => candidate.userId !== userId && candidate.role === "owner" && candidate.status === "active");
}

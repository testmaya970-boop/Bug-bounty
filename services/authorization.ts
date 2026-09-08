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

export type OrganizationAccessSummary = {
  role: OrganizationRole;
  label: string;
  organizationAccess: "Full" | "Limited";
  can: string[];
  cannot: string[];
  note?: string;
};

const ACCESS_SUMMARIES: Record<OrganizationRole, OrganizationAccessSummary> = {
  owner: {
    role: "owner",
    label: ROLE_LABELS.owner,
    organizationAccess: "Full",
    can: [
      "Manage organization identity and settings",
      "Invite and manage members, including other owners",
      "Change organization roles",
      "View organization audit activity",
      "Access every program in this organization",
    ],
    cannot: [],
  },
  security_admin: {
    role: "security_admin",
    label: ROLE_LABELS.security_admin,
    organizationAccess: "Full",
    can: [
      "Invite members (except as owner)",
      "Suspend, reactivate, or remove members",
      "Manage program access where authorized",
      "View organization security activity",
      "Manage security-related settings",
    ],
    cannot: ["Change an existing member's organization role", "Manage organization identity or billing", "Transfer ownership"],
  },
  program_manager: {
    role: "program_manager",
    label: ROLE_LABELS.program_manager,
    organizationAccess: "Limited",
    can: ["Manage assigned programs", "Manage members within assigned programs", "View data in assigned programs"],
    cannot: ["Manage organization members or roles", "Access programs not assigned to them", "View organization-wide audit activity", "Manage billing"],
  },
  triager: {
    role: "triager",
    label: ROLE_LABELS.triager,
    organizationAccess: "Limited",
    can: ["Access triage workflows for assigned programs"],
    cannot: ["Manage organization or program membership", "Access programs not assigned to them", "View organization-wide audit activity", "Manage billing"],
  },
  billing_admin: {
    role: "billing_admin",
    label: ROLE_LABELS.billing_admin,
    organizationAccess: "Limited",
    can: [],
    cannot: ["Manage members", "Change organization roles", "Manage organization settings", "Access program data"],
    note: "Billing capabilities are intentionally not implemented in this slice; this role currently grants no additional access.",
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

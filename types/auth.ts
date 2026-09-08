export type PlatformRole = "researcher" | "organization_owner" | "program_manager" | "triager" | "platform_admin";

// Sentinel's own profile fields (public.users), not a mirror of the Supabase Auth user
// object -- session/credential/provider-internal fields stay in the auth layer and are
// never duplicated here.
export type AuthenticatedUser = { id: string; platformRole: PlatformRole | null; username: string; displayName: string; email: string | null };

export type OrganizationRole = "owner" | "security_admin" | "program_manager" | "triager" | "billing_admin";
export type OrganizationMemberStatus = "active" | "suspended" | "removed";
export type OrganizationMembership = { organizationId: string; userId: string; role: OrganizationRole; status: OrganizationMemberStatus };

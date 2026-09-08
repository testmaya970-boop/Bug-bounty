import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { OrganizationRole } from "@/types/auth";
import type { OrganizationStatus, PendingInvitationForUser } from "@/types/organization";

export type OrganizationSummary = { id: string; slug: string; name: string; role: OrganizationRole; status: OrganizationStatus };

type OrganizationRow = { role: OrganizationRole; id: string; slug: string; name: string; status: OrganizationStatus };

/** Organizations the signed-in user actively belongs to. Never a query parameterized by a client-supplied user id -- the userId param here is only ever the already-verified caller's own id (see callers), RLS still independently scopes this to rows `organization_members.user_id = auth.uid()` regardless. */
export async function listCurrentUserOrganizations(userId: string): Promise<OrganizationSummary[]> {
  try {
    const rows = await withActorTransaction(userId, (client) =>
      client.query<OrganizationRow>(
        `select m.role, o.id, o.slug, o.name, o.status
         from public.organization_members m
         join public.organizations o on o.id = m.organization_id
         where m.user_id = $1 and m.status = 'active'`,
        [userId],
      ).then((r) => r.rows),
    );
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, role: row.role, status: row.status }));
  } catch (error) {
    throw new Error("Organizations could not be loaded.");
  }
}

/**
 * A cheap existence check, not a full list -- used purely to decide whether the
 * "Organization" nav group has anything real to lead to at all (see AppShell). A
 * researcher with no organization membership has no use for "Organizations"/"Settings"
 * in their nav: both routes' own empty states already just point back at "create one," so
 * showing them as persistent chrome to every researcher is noise, not a real capability.
 * `limit 1` makes this a real LIMIT-1 index lookup, not a full count -- existence, not a
 * total.
 */
export async function hasAnyOrganizationMembership(userId: string): Promise<boolean> {
  try {
    const rows = await withActorTransaction(userId, (client) =>
      client.query("select organization_id from public.organization_members where user_id = $1 and status = 'active' limit 1", [userId]).then((r) => r.rows),
    );
    return rows.length > 0;
  } catch (error) {
    throw new Error("Organization membership could not be checked.");
  }
}

/**
 * `idempotencyKey` should be generated once per form mount (not per submit) so a
 * double-click or a network-retry-after-timeout replays the same key and returns the
 * organization already created, rather than creating a second one -- enforced by a real
 * unique constraint in the database (202608260003), not just a disabled button.
 */
export async function createOrganization(name: string, idempotencyKey?: string): Promise<OrganizationSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ id: string; slug: string; name: string }>(client, "public.create_organization", [name, idempotencyKey ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return { id: row.id, slug: row.slug, name: row.name, role: "owner", status: "active" };
}

type PendingInvitationRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: OrganizationRole;
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
};

function mapPendingInvitationRow(row: PendingInvitationRow): PendingInvitationForUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
    invitedByName: row.invited_by_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Invitations addressed to the signed-in user's own email, across every organization.
 * No userId parameter (unlike its siblings above) -- list_my_pending_invitations matches
 * by the caller's own auth.uid() email inside the RPC itself, with no id-based filter
 * this function could apply client-side, so there is nothing here to thread through. */
export async function listMyPendingInvitations(): Promise<PendingInvitationForUser[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PendingInvitationRow>(client, "public.list_my_pending_invitations"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapPendingInvitationRow);
}

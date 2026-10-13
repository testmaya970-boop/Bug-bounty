import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { generateInvitationToken, hashInvitationToken } from "@/services/invitations";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import type { OrganizationRole } from "@/types/auth";
import type { OrganizationAuditEventRecord, OrganizationInvitationRecord, OrganizationMemberRecord } from "@/types/organization";
import type { Page } from "@/types/pagination";

/**
 * Every mutation here calls a SECURITY DEFINER Postgres function (see migration
 * 202608260001) instead of writing to a table directly. Authorization is decided
 * twice, independently: this module's callers check role capability first for a fast,
 * clear UI error (see services/authorization.ts); the database function re-checks
 * auth.uid()'s current membership before writing anything, and that check is the one
 * that actually matters, since a client-supplied role or user id is never trusted.
 */

export { OrganizationServiceError };

type MemberRow = {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: OrganizationMemberRecord["status"];
  invited_by: string | null;
  joined_at: string;
  suspended_at: string | null;
  removed_at: string | null;
  updated_at: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
};

function mapMemberRow(row: MemberRow): OrganizationMemberRecord {
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by,
    joinedAt: row.joined_at,
    suspendedAt: row.suspended_at,
    removedAt: row.removed_at,
    updatedAt: row.updated_at,
    username: row.username ?? "unknown",
    displayName: row.display_name ?? "Unknown member",
    email: row.email ?? null,
  };
}

/** RPC results have no profile embed at all -- mapped identically to mapMemberRow but
 * with every profile column explicitly null, matching the original's `{ ...data, profile:
 * null }` spread. */
type MemberRpcRow = Omit<MemberRow, "username" | "display_name" | "email">;
function mapMemberRpcRow(row: MemberRpcRow): OrganizationMemberRecord {
  return mapMemberRow({ ...row, username: null, display_name: null, email: null });
}

const INVITATION_SELECT = "id, organization_id, email, role, invited_by, message, expires_at, accepted_at, revoked_at, created_at";

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  invited_by: string;
  message: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function mapInvitationRow(row: InvitationRow): OrganizationInvitationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    message: row.message,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

type AuditRow = { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string; metadata: Record<string, unknown> | null; created_at: string };

function mapAuditRow(row: AuditRow): OrganizationAuditEventRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

// --- Reads (RLS-scoped; the "members read organization roster" / "audit logs read by
// org admins" policies decide what each caller actually sees) -------------------------

export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<MemberRow>(
          `select m.organization_id, m.user_id, m.role, m.status, m.invited_by, m.joined_at, m.suspended_at, m.removed_at, m.updated_at, u.username, u.display_name, public.visible_email(m.user_id) as email
           from public.organization_members m left join public.users u on u.id = m.user_id
           where m.organization_id = $1 and (u.id is not null or m.status <> 'active') order by m.joined_at asc`,
          [organizationId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapMemberRow);
}

export async function getActorMembership(userId: string, organizationId: string): Promise<OrganizationMemberRecord | null> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<MemberRow>(
          `select m.organization_id, m.user_id, m.role, m.status, m.invited_by, m.joined_at, m.suspended_at, m.removed_at, m.updated_at, u.username, u.display_name, public.visible_email(m.user_id) as email
           from public.organization_members m left join public.users u on u.id = m.user_id
           where m.organization_id = $1 and m.user_id = $2`,
          [organizationId, userId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapMemberRow(rows[0]) : null;
}

export async function listPendingInvitations(organizationId: string): Promise<OrganizationInvitationRecord[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<InvitationRow>(
          `select ${INVITATION_SELECT} from public.organization_invitations
           where organization_id = $1 and accepted_at is null and revoked_at is null
           order by created_at desc`,
          [organizationId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapInvitationRow);
}

/** Keyset-paginated on `created_at` (audit_logs_organization_created_idx already
 * supports this predicate/ordering). A single-column cursor -- see
 * services/reports.ts's listReportsForProgram for the identical same-instant-tie
 * tradeoff reasoning; audit rows are written serially by RPCs already holding a
 * transaction, making an exact-timestamp collision even less likely than for reports. */
export async function getOrganizationAuditActivity(organizationId: string, cursor?: string, limit?: number): Promise<Page<OrganizationAuditEventRecord>> {
  const actor = await getCurrentUser();
  const pageSize = clampPageSize(limit ?? 20);
  const decoded = cursor ? decodeCursor(cursor) : null;

  let rows: AuditRow[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<AuditRow>(
          decoded
            ? "select id, actor_id, action, entity_type, entity_id, metadata, created_at from public.audit_logs where organization_id = $1 and created_at < $2 order by created_at desc limit $3"
            : "select id, actor_id, action, entity_type, entity_id, metadata, created_at from public.audit_logs where organization_id = $1 order by created_at desc limit $2",
          decoded ? [organizationId, decoded.sortValue, pageSize] : [organizationId, pageSize],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapAuditRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

// --- Mutations (each one a single RPC call into a SECURITY DEFINER function) ---------

export async function inviteMember(params: { organizationId: string; email: string; role: OrganizationRole; message?: string }): Promise<{ invitation: OrganizationInvitationRecord; token: string }> {
  const actor = await getCurrentUser();
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<InvitationRow>(client, "public.invite_organization_member", [params.organizationId, params.email, params.role, params.message ?? "", tokenHash]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { invitation: mapInvitationRow(rows[0]), token };
}

export async function acceptInvitation(token: string): Promise<OrganizationMemberRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<MemberRpcRow>(client, "public.accept_organization_invitation", [hashInvitationToken(token)]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapMemberRpcRow(rows[0]);
}

/**
 * Accepts a known invitation (surfaced via services/organizations.ts's
 * listMyPendingInvitations) without the raw token -- gated by the same
 * accepting-account-email-must-match-invitation-email check the token-based path uses,
 * so this is not a weaker authorization boundary, just a different discovery mechanism.
 */
export async function acceptInvitationById(invitationId: string): Promise<OrganizationMemberRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<MemberRpcRow>(client, "public.accept_organization_invitation_by_id", [invitationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapMemberRpcRow(rows[0]);
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.cancel_organization_invitation", [invitationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function changeMemberRole(params: { organizationId: string; targetUserId: string; newRole: OrganizationRole }): Promise<OrganizationMemberRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<MemberRpcRow>(client, "public.change_member_role", [params.organizationId, params.targetUserId, params.newRole]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapMemberRpcRow(rows[0]);
}

export async function suspendMember(params: { organizationId: string; targetUserId: string }): Promise<OrganizationMemberRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<MemberRpcRow>(client, "public.suspend_member", [params.organizationId, params.targetUserId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapMemberRpcRow(rows[0]);
}

export async function reactivateMember(params: { organizationId: string; targetUserId: string }): Promise<OrganizationMemberRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<MemberRpcRow>(client, "public.reactivate_member", [params.organizationId, params.targetUserId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapMemberRpcRow(rows[0]);
}

export async function removeMember(params: { organizationId: string; targetUserId: string }): Promise<OrganizationMemberRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<MemberRpcRow>(client, "public.remove_member", [params.organizationId, params.targetUserId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapMemberRpcRow(rows[0]);
}

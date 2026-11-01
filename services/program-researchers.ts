import "server-only";
import { getAliasMailConfig } from "@/lib/alias-mail";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { generateInvitationToken, hashInvitationToken } from "@/services/invitations";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type { PendingProgramInvitationForResearcher, ProgramInvitationRecord, ProgramParticipation, ProgramResearcherRecord } from "@/types/researcher";

/**
 * Every mutation here calls a SECURITY DEFINER Postgres function (202608260006),
 * mirroring services/organization-members.ts exactly: authorization is decided twice,
 * independently -- this module's callers check capability client-side for a fast, clear
 * UI error, the database re-checks the caller's current, real relationship to the
 * program before writing anything, and that check is the one that actually matters.
 */

export { OrganizationServiceError };

type ResearcherRow = {
  program_id: string;
  organization_id: string;
  user_id: string;
  status: ProgramResearcherRecord["status"];
  source: ProgramResearcherRecord["source"];
  invited_by: string | null;
  joined_at: string;
  suspended_at: string | null;
  revoked_at: string | null;
  updated_at: string;
  username: string | null;
  display_name: string | null;
  alias_local_part: string | null;
};

/** Org staff see the alias, never the real email (202610130001). No alias yet, or the alias
 * domain isn't configured: nothing, and the UI falls back to @username. */
function aliasAddress(localPart: string | null): string | null {
  const config = getAliasMailConfig();
  return localPart && config ? `${localPart}@${config.domain}` : null;
}

function mapResearcherRow(row: ResearcherRow): ProgramResearcherRecord {
  return {
    programId: row.program_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    status: row.status,
    source: row.source,
    invitedBy: row.invited_by,
    joinedAt: row.joined_at,
    suspendedAt: row.suspended_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at,
    username: row.username ?? "unknown",
    displayName: row.display_name ?? "Unknown researcher",
    aliasEmail: aliasAddress(row.alias_local_part),
  };
}

type ResearcherRpcRow = Omit<ResearcherRow, "username" | "display_name" | "alias_local_part">;
function mapResearcherRpcRow(row: ResearcherRpcRow): ProgramResearcherRecord {
  return mapResearcherRow({ ...row, username: null, display_name: null, alias_local_part: null });
}

type InvitationRow = {
  id: string;
  program_id: string;
  organization_id: string;
  email: string;
  invited_username?: string | null;
  invited_by: string;
  message: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function mapInvitationRow(row: InvitationRow): ProgramInvitationRecord {
  return {
    id: row.id,
    programId: row.program_id,
    organizationId: row.organization_id,
    // A username invitation never exposes the email it was sent to (202610230006).
    email: row.invited_username ? "" : row.email,
    invitedUsername: row.invited_username ?? null,
    invitedBy: row.invited_by,
    message: row.message,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

// --- Manager-facing reads (RLS-scoped) ------------------------------------------------

export async function listProgramResearchers(programId: string): Promise<ProgramResearcherRecord[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ResearcherRow>(
          `select r.program_id, r.organization_id, r.user_id, r.status, r.source, r.invited_by, r.joined_at, r.suspended_at, r.revoked_at, r.updated_at, u.username, u.display_name, public.researcher_alias_local_part(r.user_id) as alias_local_part
           from public.program_researchers r left join public.users u on u.id = r.user_id
           where r.program_id = $1 and u.id is not null order by r.joined_at asc`,
          [programId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapResearcherRow);
}

/** The signed-in user's own participation row for a program, or null -- also used by
 * researcher-facing pages to answer "am I active here" without a manager-only read. */
export async function getMyParticipation(userId: string, programId: string): Promise<ProgramResearcherRecord | null> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<ResearcherRow>(
          `select r.program_id, r.organization_id, r.user_id, r.status, r.source, r.invited_by, r.joined_at, r.suspended_at, r.revoked_at, r.updated_at, u.username, u.display_name, public.researcher_alias_local_part(r.user_id) as alias_local_part
           from public.program_researchers r left join public.users u on u.id = r.user_id
           where r.program_id = $1 and r.user_id = $2`,
          [programId, userId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapResearcherRow(rows[0]) : null;
}

export async function listPendingProgramInvitations(programId: string): Promise<ProgramInvitationRecord[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<InvitationRow>(
          `select id, program_id, organization_id, email, invited_username, invited_by, message, expires_at, accepted_at, revoked_at, created_at
           from public.program_invitations
           where program_id = $1 and accepted_at is null and revoked_at is null
           order by created_at desc`,
          [programId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapInvitationRow);
}

// --- Manager-facing mutations (each one a single RPC call) ----------------------------

export async function inviteResearcher(params: { programId: string; email: string; message?: string }): Promise<{ invitation: ProgramInvitationRecord; token: string }> {
  const actor = await getCurrentUser();
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<InvitationRow>(client, "public.invite_researcher_to_program", [params.programId, params.email, params.message ?? "", tokenHash]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { invitation: mapInvitationRow(rows[0]), token };
}

/** Invite by @username (202610230006). Returns the email for the server to send the invitation
 * to -- callers must never pass it on to the browser. */
export async function inviteResearcherByUsername(params: { programId: string; username: string; message?: string }): Promise<{ invitation: ProgramInvitationRecord; recipientEmail: string; token: string }> {
  const actor = await getCurrentUser();
  const token = generateInvitationToken();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<InvitationRow>(client, "public.invite_researcher_by_username", [params.programId, params.username, params.message ?? "", hashInvitationToken(token)]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { invitation: mapInvitationRow(rows[0]), recipientEmail: rows[0].email, token };
}

export type SuggestedResearcher = { researcherId: string; displayName: string; username: string; score: number; resolvedCount: number; bountiesCount: number };

/** Public-profile researchers to invite to a pilot, best reputation first, minus anyone already in. */
export async function suggestProgramResearchers(programId: string, limit = 8): Promise<SuggestedResearcher[]> {
  const actor = await getCurrentUser();
  type Row = { researcher_id: string; display_name: string; public_username: string; score: string; resolved_count: string; bounty_finalized_count: string };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.suggest_program_researchers", [programId, limit]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({ researcherId: r.researcher_id, displayName: r.display_name, username: r.public_username, score: Number(r.score), resolvedCount: Number(r.resolved_count), bountiesCount: Number(r.bounty_finalized_count) }));
}

export async function cancelProgramInvitation(invitationId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.cancel_program_invitation", [invitationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function suspendResearcher(params: { programId: string; targetUserId: string }): Promise<ProgramResearcherRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResearcherRpcRow>(client, "public.suspend_program_researcher", [params.programId, params.targetUserId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapResearcherRpcRow(rows[0]);
}

export async function reinstateResearcher(params: { programId: string; targetUserId: string }): Promise<ProgramResearcherRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResearcherRpcRow>(client, "public.reinstate_program_researcher", [params.programId, params.targetUserId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapResearcherRpcRow(rows[0]);
}

export async function revokeResearcher(params: { programId: string; targetUserId: string }): Promise<ProgramResearcherRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResearcherRpcRow>(client, "public.revoke_program_researcher", [params.programId, params.targetUserId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapResearcherRpcRow(rows[0]);
}

// --- Researcher-facing self-service (RPC only -- these tables have no direct-select
// path for a not-yet-participating researcher; see docs/decisions/0007) --------------

type PendingProgramInvitationRow = {
  id: string;
  program_id: string;
  program_name: string;
  organization_name: string;
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
};

function mapPendingProgramInvitationRow(row: PendingProgramInvitationRow): PendingProgramInvitationForResearcher {
  return {
    id: row.id,
    programId: row.program_id,
    programName: row.program_name,
    organizationName: row.organization_name,
    invitedByName: row.invited_by_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// No userId parameter -- list_my_pending_program_invitations matches by the caller's own
// auth.uid() email inside the RPC itself, with no id-based filter to thread through.
export async function listMyPendingProgramInvitations(): Promise<PendingProgramInvitationForResearcher[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PendingProgramInvitationRow>(client, "public.list_my_pending_program_invitations"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapPendingProgramInvitationRow);
}

type ProgramParticipationRow = {
  program_id: string;
  organization_id: string;
  program_name: string;
  program_status: ProgramParticipation["programStatus"];
  organization_name: string;
  status: ProgramParticipation["status"];
  joined_at: string;
};

function mapParticipationRow(row: ProgramParticipationRow): ProgramParticipation {
  return {
    programId: row.program_id,
    organizationId: row.organization_id,
    programName: row.program_name,
    programStatus: row.program_status,
    organizationName: row.organization_name,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

// list_my_program_participations derives the actor from auth.uid() itself -- the
// optional actorId override exists only for a caller that already knows the real actor
// id but cannot yet resolve it via getCurrentUser()'s cookie read (signInAction calls
// determineDefaultDestination() -- and therefore this -- in the same Server Action
// invocation that just set the session cookie; cookies().get() inside that same
// invocation still reflects the incoming request, not the cookie this response is about
// to set, so getCurrentUser() would incorrectly resolve to "signed out" here). Every
// other caller omits it and gets the existing getCurrentUser()-derived behavior
// unchanged.
export async function listMyProgramParticipations(actorId?: string): Promise<ProgramParticipation[]> {
  const resolvedActorId = actorId ?? (await getCurrentUser())?.id ?? null;
  let rows;
  try {
    rows = await withActorTransaction(resolvedActorId, (client) => callRpc<ProgramParticipationRow>(client, "public.list_my_program_participations"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapParticipationRow);
}

/** Invitations are also cancelled automatically when a program goes public (202610210004);
 * the database message can't tell which, so the revoked case points at both ways forward. */
function mapAcceptError(error: { message: string }): never {
  if (error.message.startsWith("INVITATION_REVOKED")) {
    throw new OrganizationServiceError("This invitation was cancelled. If the program is now public, you can join it from its page; otherwise ask the organization for a new invitation.", "INVITATION_REVOKED");
  }
  mapError(error);
}

export async function acceptProgramInvitation(token: string): Promise<ProgramResearcherRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResearcherRpcRow>(client, "public.accept_program_invitation", [hashInvitationToken(token)]));
  } catch (error) {
    mapAcceptError(error as { message: string });
  }
  return mapResearcherRpcRow(rows[0]);
}

export async function acceptProgramInvitationById(invitationId: string): Promise<ProgramResearcherRecord> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResearcherRpcRow>(client, "public.accept_program_invitation_by_id", [invitationId]));
  } catch (error) {
    mapAcceptError(error as { message: string });
  }
  return mapResearcherRpcRow(rows[0]);
}

import "server-only";
import { withActorTransaction, withPublicTransaction, callRpc } from "@/lib/db/pool";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import type { EngagementType, ProgramMemberRecord, ProgramSummary, ProgramType, PublicProgramScopeEntry, PublicProgramSummary, TopBountyProgram } from "@/types/program";
import { getOrganizationLogoVersions } from "@/services/organization-logos";
import type { ResearcherFocusArea } from "@/types/researcher-identity";
import type { Page } from "@/types/pagination";

export { programStatusLabel } from "@/lib/program-status";

// access_instructions is deliberately NOT part of this shared select -- see
// db/migrations/202609240004_program_access_invitation_only.sql. It is invitation-only
// (never visible to a self-enrolled public-program researcher), so it is read through its
// own dedicated, separately-authorized RPC (getProgramAccessInstructions below), never
// riding along on a generic programs-row fetch every caller of getProgram/
// listProgramsForOrganization shares.
const PROGRAM_SELECT = `p.id, p.organization_id, p.name, p.status, p.visibility, p.program_type, p.engagement_type, p.description, p.requires_kyc, p.min_signal, p.min_valid_reports, p.join_mode, p.bounty_tier2_percent, p.bounty_tier3_percent, p.created_by, p.created_at, p.updated_at, u.display_name as creator_display_name`;

type ProgramRow = {
  id: string;
  organization_id: string;
  name: string;
  status: ProgramSummary["status"];
  visibility: ProgramSummary["visibility"];
  program_type: ProgramType;
  engagement_type: EngagementType;
  description: string | null;
  requires_kyc: boolean;
  min_signal?: string | number | null;
  min_valid_reports?: number | null;
  join_mode?: "open" | "request";
  bounty_tier2_percent?: number;
  bounty_tier3_percent?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_display_name: string | null;
};

function mapProgramRow(row: ProgramRow): ProgramSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: row.status,
    visibility: row.visibility,
    programType: row.program_type,
    engagementType: row.engagement_type,
    description: row.description,
    requiresKyc: row.requires_kyc,
    minSignal: row.min_signal == null ? null : Number(row.min_signal),
    minValidReports: row.min_valid_reports ?? null,
    joinMode: row.join_mode ?? "open",
    bountyTier2Percent: row.bounty_tier2_percent ?? 100,
    bountyTier3Percent: row.bounty_tier3_percent ?? 100,
    createdBy: row.created_by,
    createdByName: row.creator_display_name ?? "Unknown member",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Programs visible to the signed-in user in this organization -- RLS decides that: every
 * program if they are an org owner/security admin, otherwise only ones they are a
 * program_members of (see docs/decisions/0004-program-authorization.md). Never a query
 * parameterized by a client-supplied user id or role. */
export async function listProgramsForOrganization(organizationId: string): Promise<ProgramSummary[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ProgramRow>(
          `select ${PROGRAM_SELECT} from public.programs p left join public.users u on u.id = p.created_by where p.organization_id = $1 order by p.created_at desc`,
          [organizationId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapProgramRow);
}

export async function getProgram(programId: string): Promise<ProgramSummary | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ProgramRow>(`select ${PROGRAM_SELECT} from public.programs p left join public.users u on u.id = p.created_by where p.id = $1`, [programId])
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapProgramRow(rows[0]) : null;
}

type ProgramMemberRow = {
  program_id: string;
  organization_id: string;
  user_id: string;
  role: ProgramMemberRecord["role"];
  added_by: string | null;
  created_at: string;
  display_name: string | null;
};

function mapProgramMemberRow(row: ProgramMemberRow): ProgramMemberRecord {
  return {
    programId: row.program_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    addedBy: row.added_by,
    createdAt: row.created_at,
    displayName: row.display_name ?? "Unknown member",
  };
}

export async function listProgramMembers(programId: string): Promise<ProgramMemberRecord[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ProgramMemberRow>(
          `select m.program_id, m.organization_id, m.user_id, m.role, m.added_by, m.created_at, u.display_name
           from public.program_members m left join public.users u on u.id = m.user_id
           where m.program_id = $1 order by m.created_at asc`,
          [programId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapProgramMemberRow);
}

/**
 * `idempotencyKey` should be generated once per dialog session (not per submit), the same
 * pattern createOrganization uses (202608260003) and for the same reason: a double-click
 * or a network-retry-after-timeout replays the same key and returns the program already
 * created, rather than creating a second one -- enforced by a real per-(organization,
 * creator) unique constraint in the database, not just a disabled button.
 */
export async function createProgram(organizationId: string, name: string, idempotencyKey?: string, programType?: ProgramType, engagementType?: EngagementType): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{
        id: string;
        organization_id: string;
        name: string;
        status: ProgramSummary["status"];
        visibility: ProgramSummary["visibility"];
        program_type: ProgramType;
        engagement_type: EngagementType;
        description: string | null;
        access_instructions: string | null;
        requires_kyc: boolean;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>(client, "public.create_program", [organizationId, name, idempotencyKey ?? null, programType ?? null, engagementType ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  // The RPC returns the bare programs row (no embed) -- the actor is always the creator
  // on success, so their own profile (already loaded for the page) supplies the name
  // without a second round trip.
  const row = rows[0];
  return mapProgramRow({ ...row, creator_display_name: actor?.displayName ?? null });
}

/** Every lifecycle transition RPC returns the bare `programs` row (no creator embed) --
 * the same shape services/reports.ts's mapReportRpcResult accepts for triage RPCs, since
 * the mutating actor is not necessarily the original creator here. `creator: null` maps
 * to "Unknown member" only transiently; the caller's revalidatePath re-fetches the real,
 * embedded creator name on next render. See docs/decisions/0021-program-lifecycle-transitions.md. */
function mapProgramRpcResult(row: Omit<ProgramRow, "creator_display_name">): ProgramSummary {
  return mapProgramRow({ ...row, creator_display_name: null });
}

async function callProgramLifecycleRpc(functionName: string, programId: string): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Omit<ProgramRow, "creator_display_name">>(client, functionName, [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapProgramRpcResult(rows[0]);
}

/** See DOMAIN.md's Program lifecycle and docs/decisions/0021-program-lifecycle-transitions.md
 * for the full transition matrix, authorization, and concurrency model. Each function
 * below wraps exactly one purpose-built RPC -- there is no generic "set program status"
 * call anywhere in this file, matching services/reports.ts's own triage functions. */
export async function submitProgramForReview(programId: string): Promise<ProgramSummary> {
  return callProgramLifecycleRpc("public.submit_program_for_review", programId);
}

export async function activateProgram(programId: string): Promise<ProgramSummary> {
  return callProgramLifecycleRpc("public.activate_program", programId);
}

export async function pauseProgram(programId: string): Promise<ProgramSummary> {
  return callProgramLifecycleRpc("public.pause_program", programId);
}

export async function resumeProgram(programId: string): Promise<ProgramSummary> {
  return callProgramLifecycleRpc("public.resume_program", programId);
}

export async function closeProgram(programId: string): Promise<ProgramSummary> {
  return callProgramLifecycleRpc("public.close_program", programId);
}

/** Hard delete, draft-only -- see db/migrations/202609090008_delete_draft_program.sql for
 * why this is safe as a real delete (never a soft-delete flag) specifically for a program
 * that has never left draft. Returns void, not a ProgramSummary, since the row genuinely
 * no longer exists after this call -- there is nothing to map. */
export async function deleteDraftProgram(programId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc<never>(client, "public.delete_draft_program", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Independent of lifecycle status (see docs/decisions/0041) -- can be set at any
 * program stage; only takes visible effect once the program reaches active/paused. */
export async function setProgramVisibility(programId: string, visibility: "private" | "public"): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<Omit<ProgramRow, "creator_display_name">>(client, "public.set_program_visibility", [programId, visibility]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapProgramRpcResult(rows[0]);
}

/** Independent of lifecycle status, mirroring setProgramVisibility -- an organization can
 * require identity verification before a researcher can join or submit to a specific
 * program. See db/migrations/202609050012_program_kyc_requirement.sql. */
/** Track record a researcher needs to join this program publicly (202610220001). */
export async function setProgramTrackRecordRequirement(programId: string, minSignal: number | null, minValidReports: number | null): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<Omit<ProgramRow, "creator_display_name">>(client, "public.set_program_track_record_requirement", [programId, minSignal, minValidReports]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapProgramRpcResult(rows[0]);
}

export async function setProgramKycRequirement(programId: string, requiresKyc: boolean): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<Omit<ProgramRow, "creator_display_name">>(client, "public.set_program_kyc_requirement", [programId, requiresKyc]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapProgramRpcResult(rows[0]);
}

export async function updateProgramDescription(programId: string, description: string): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<Omit<ProgramRow, "creator_display_name">>(client, "public.update_program_description", [programId, description]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapProgramRpcResult(rows[0]);
}

/** How an already-authorized researcher reaches this program's targets -- VPN
 * credentials, a required contact, whatever this program needs. See
 * db/migrations/202609240001_program_access_instructions.sql for why this is a separate
 * column/RPC from updateProgramDescription, never merged into it. Writing stays
 * manager-only regardless of visibility; only reading it as a researcher is restricted
 * (see getProgramAccessInstructions below and 202609240004) -- this returns the saved
 * text directly, not a ProgramSummary, since access_instructions is no longer part of
 * that shared shape. */
export async function updateProgramAccessInstructions(programId: string, accessInstructions: string): Promise<string | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ access_instructions: string | null }>(client, "public.update_program_access_instructions", [programId, accessInstructions]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.access_instructions ?? null;
}

/** Invitation-only read: a self-enrolled public-program researcher gets null here even
 * though the program itself is real -- see 202609240004 for why this can never be part
 * of getProgram's generic select. Null is deliberately indistinguishable between "not
 * authorized to read it" and "authorized, but nothing written yet," the same
 * confidentiality-safe shape getEvidenceDownloadUrl already uses. */
export async function getProgramAccessInstructions(programId: string): Promise<string | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ get_program_access_instructions: string | null }>(client, "public.get_program_access_instructions", [programId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.get_program_access_instructions ?? null;
}

/** Tags a program with the focus areas it's actually meant for -- the one piece of data
 * list_recommended_programs() matches against a researcher's own declared interests (see
 * docs/decisions/0051). A program with no focus_areas set (the default for every existing
 * program) simply never appears in anyone's recommendations -- an honest default, not an
 * error. */
export async function setProgramFocusAreas(programId: string, focusAreas: ResearcherFocusArea[]): Promise<ProgramSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<Omit<ProgramRow, "creator_display_name">>(client, "public.set_program_focus_areas", [programId, focusAreas]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapProgramRpcResult(rows[0]);
}

export async function getProgramFocusAreas(programId: string): Promise<ResearcherFocusArea[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<{ focus_areas: ResearcherFocusArea[] | null }>("select focus_areas from public.programs where id = $1", [programId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.focus_areas ?? [];
}

// --- Public, anonymous-safe discovery (docs/decisions/0041) ---------------------------
// Each function below is a thin wrapper over a SECURITY DEFINER RPC reachable by `anon`;
// none of them touch `programs`/`program_scope_entries` via a direct table select, since
// `anon` has no grant on either table at all (see 202608260002/202608310002).

type PublicProgramRow = {
  id: string;
  organization_id: string;
  name: string;
  organization_name: string;
  status: ProgramSummary["status"];
  program_type: ProgramType;
  description: string | null;
  updated_at: string;
  requires_kyc?: boolean;
  bounty_min_minor_units?: number | null;
  bounty_max_minor_units?: number | null;
  bounty_currency?: string | null;
};

/** get_public_program (the program detail page's own fetch) returns the bounty range and KYC
 * requirement (202610060014) but not the counts below -- 0/empty here means "not computed by
 * this call," never a fabricated zero. list_public_programs aggregates those. */
function mapPublicProgramRow(row: PublicProgramRow): PublicProgramSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    organizationName: row.organization_name,
    status: row.status,
    programType: row.program_type,
    description: row.description,
    focusAreas: [],
    assetTypes: [],
    bountyMinMinorUnits: row.bounty_min_minor_units ?? null,
    bountyMaxMinorUnits: row.bounty_max_minor_units ?? null,
    bountyCurrency: row.bounty_currency ?? null,
    activeResearcherCount: 0,
    resolvedReportCount: 0,
    updatedAt: row.updated_at,
    requiresKyc: row.requires_kyc ?? false,
  };
}

type PublicProgramListRow = PublicProgramRow & {
  joined: boolean;
  sort_value: string;
  focus_areas: ResearcherFocusArea[];
  asset_types: PublicProgramSummary["assetTypes"];
  active_researcher_count: number;
  resolved_report_count: number;
};

function mapPublicProgramListRow(row: PublicProgramListRow): PublicProgramSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    organizationName: row.organization_name,
    status: row.status,
    programType: row.program_type,
    description: row.description,
    focusAreas: row.focus_areas ?? [],
    assetTypes: row.asset_types ?? [],
    bountyMinMinorUnits: row.bounty_min_minor_units ?? null,
    bountyMaxMinorUnits: row.bounty_max_minor_units ?? null,
    bountyCurrency: row.bounty_currency ?? null,
    activeResearcherCount: row.active_researcher_count,
    resolvedReportCount: row.resolved_report_count,
    updatedAt: row.updated_at,
    requiresKyc: row.requires_kyc ?? false,
    joined: row.joined,
  };
}

export type { PublicProgramFilters } from "@/lib/program-filters";
import type { PublicProgramFilters } from "@/lib/program-filters";

/**
 * Search/status/focus-area filters are applied server-side inside `list_public_programs`
 * itself (docs/decisions/0042, extended in 0054) -- never fetched-then-filtered in React.
 * Keyset-paginated on `(updated_at, id)` using the exact same `encodeCursor`/
 * `decodeCursor` convention every other paginated list in this codebase already uses.
 * Reachable by a signed-out visitor -- withPublicTransaction runs as `anon` for that
 * case, or `authenticated` for a signed-in visitor browsing the same page.
 */
export async function listPublicPrograms(filters?: PublicProgramFilters, cursor?: string, limit?: number): Promise<Page<PublicProgramSummary>> {
  const actor = await getCurrentUser();
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) =>
      callRpc<PublicProgramListRow>(client, "public.list_public_programs", [
        filters?.search ?? null,
        filters?.status ?? null,
        filters?.focusArea ?? null,
        filters?.assetType ?? null,
        filters?.programType ?? null,
        filters?.minBountyMinorUnits ?? null,
        filters?.requiresKyc ?? null,
        filters?.sort ?? "recent",
        decoded?.sortValue ?? null,
        decoded?.id ?? null,
        pageSize,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const logos = await getOrganizationLogoVersions(rows.map((r) => r.organization_id));
  const items = rows.map((r) => ({ ...mapPublicProgramListRow(r), logoVersion: logos[r.organization_id] }));
  // The cursor carries the row's own sort key (created_at, bounty or name -- never a
  // value an edit changes), so paging is stable under every sort.
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].sort_value, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

export async function getPublicProgram(programId: string): Promise<PublicProgramSummary | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicProgramRow>(client, "public.get_public_program", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return null;
  const logos = await getOrganizationLogoVersions([row.organization_id]);
  return { ...mapPublicProgramRow(row), logoVersion: logos[row.organization_id] };
}

type TopBountyProgramRow = { id: string; organization_id: string; name: string; organization_name: string; status: ProgramSummary["status"]; bounty_min_minor_units: number; bounty_max_minor_units: number; bounty_currency: string };

/** The curated "highest-paying" section -- only ever includes a program with a real,
 * currently-active bounty policy. See docs/decisions/0054. */
export async function listTopBountyPrograms(limit?: number): Promise<TopBountyProgram[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<TopBountyProgramRow>(client, "public.list_top_bounty_programs", [limit ?? 6]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    organizationName: row.organization_name,
    status: row.status,
    bountyMinMinorUnits: row.bounty_min_minor_units,
    bountyMaxMinorUnits: row.bounty_max_minor_units,
    bountyCurrency: row.bounty_currency,
  }));
}

type PublicScopeRow = { id: string; asset_type: PublicProgramScopeEntry["assetType"]; display_target: string; scope_state: PublicProgramScopeEntry["scopeState"]; description: string | null };

export async function listPublicProgramScope(programId: string): Promise<PublicProgramScopeEntry[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicScopeRow>(client, "public.list_public_program_scope", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, assetType: row.asset_type, displayTarget: row.display_target, scopeState: row.scope_state, description: row.description }));
}

/** The one researcher-facing mutation: creates the program_researchers row that every
 * existing authorization check (submit_report included) already relies on -- see
 * docs/decisions/0041. Never a new submission path. */
export async function joinPublicProgram(programId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.join_public_program", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Owners and security admins put a Program Manager or Triager on a program; the program
 * role follows the org role (assign_program_member, 202609250012). */
export async function assignProgramMember(programId: string, userId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.assign_program_member", [programId, userId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function unassignProgramMember(programId: string, userId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.unassign_program_member", [programId, userId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

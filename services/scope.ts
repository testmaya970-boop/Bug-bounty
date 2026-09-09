import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import type { ProgramAssetType, ScopeEntry, ScopeEvaluationResult, ScopeState } from "@/types/scope";
import type { Page } from "@/types/pagination";

type ScopeEntryRow = {
  id: string;
  program_id: string;
  organization_id: string;
  asset_type: ProgramAssetType;
  target: string;
  display_target: string;
  scope_state: ScopeState;
  description: string | null;
  status: ScopeEntry["status"];
  created_by: string;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
  creator_display_name: string | null;
};

function mapScopeEntryRow(row: ScopeEntryRow): ScopeEntry {
  return {
    id: row.id,
    programId: row.program_id,
    organizationId: row.organization_id,
    assetType: row.asset_type,
    target: row.target,
    displayTarget: row.display_target,
    scopeState: row.scope_state,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.creator_display_name ?? "Unknown member",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    removedAt: row.removed_at,
  };
}

type ScopeEntryRpcRow = Omit<ScopeEntryRow, "creator_display_name">;
function mapScopeEntryRpcRow(row: ScopeEntryRpcRow): ScopeEntry {
  return mapScopeEntryRow({ ...row, creator_display_name: null });
}

/** Active scope entries for a program -- RLS decides visibility (org owner/security admin,
 * or a program_members row); an unauthorized caller gets an empty array, the same
 * not-found-vs-not-authorized-look-identical property every other read in this codebase has. */
export async function listActiveScopeEntries(programId: string): Promise<ScopeEntry[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ScopeEntryRow>(
          `select e.id, e.program_id, e.organization_id, e.asset_type, e.target, e.display_target, e.scope_state, e.description, e.status, e.created_by, e.created_at, e.updated_at, e.removed_at, u.display_name as creator_display_name
           from public.program_scope_entries e left join public.users u on u.id = e.created_by
           where e.program_id = $1 and e.status = 'active' order by e.created_at asc`,
          [programId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapScopeEntryRow);
}

export type ScopeEntryFilters = { programId?: string; assetType?: ProgramAssetType };

/** Cross-program asset inventory for one organization -- the org-wide counterpart to
 * listActiveScopeEntries above (identical row shape/RLS, only the scoping predicate
 * differs: organization_id instead of program_id, plus optional program/type filters).
 * RLS narrows the same way every other org-wide read in this codebase already documents:
 * an org owner/security_admin sees every entry across every program, a plain member who
 * manages no program sees none -- never a second, page-level permission check
 * duplicating what RLS already decides. Keyset-paginated on created_at, matching
 * services/reports.ts's listReportsForOrganization cursor shape exactly. */
export async function listActiveScopeEntriesForOrganization(
  organizationId: string,
  cursor?: string,
  limit?: number,
  filters?: ScopeEntryFilters,
): Promise<Page<ScopeEntry>> {
  const actor = await getCurrentUser();
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;

  const conditions = ["e.organization_id = $1", "e.status = 'active'"];
  const params: unknown[] = [organizationId];
  if (filters?.programId) {
    params.push(filters.programId);
    conditions.push(`e.program_id = $${params.length}`);
  }
  if (filters?.assetType) {
    params.push(filters.assetType);
    conditions.push(`e.asset_type = $${params.length}`);
  }
  if (decoded) {
    params.push(decoded.sortValue);
    conditions.push(`e.created_at > $${params.length}`);
  }
  params.push(pageSize);

  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ScopeEntryRow>(
          `select e.id, e.program_id, e.organization_id, e.asset_type, e.target, e.display_target, e.scope_state, e.description, e.status, e.created_by, e.created_at, e.updated_at, e.removed_at, u.display_name as creator_display_name
           from public.program_scope_entries e left join public.users u on u.id = e.created_by
           where ${conditions.join(" and ")} order by e.created_at asc limit $${params.length}`,
          params,
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapScopeEntryRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

/**
 * `targetInput` is sent to the database exactly as the user typed it -- canonicalization
 * and validation happen in exactly one place, private.canonicalize_scope_target
 * (202608260005), never duplicated here. See docs/decisions/0006-scope-asset-model.md.
 */
export async function addScopeEntry(programId: string, assetType: ProgramAssetType, targetInput: string, scopeState: ScopeState, description?: string): Promise<ScopeEntry> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<ScopeEntryRpcRow>(client, "public.add_scope_entry", [programId, assetType, targetInput, scopeState, description ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapScopeEntryRpcRow(rows[0]);
}

export async function updateScopeEntry(entryId: string, scopeState: ScopeState, description?: string): Promise<ScopeEntry> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ScopeEntryRpcRow>(client, "public.update_scope_entry", [entryId, scopeState, description ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapScopeEntryRpcRow(rows[0]);
}

export async function removeScopeEntry(entryId: string): Promise<ScopeEntry> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ScopeEntryRpcRow>(client, "public.remove_scope_entry", [entryId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapScopeEntryRpcRow(rows[0]);
}

type EvaluateRow = { is_in_scope: boolean; matched_scope_state: ScopeState | null; matched_entry_id: string | null; matched_target: string | null };

/**
 * Internal scope-decision boundary -- authorized identically to every other scope
 * operation (org owner/security admin, or a program_members row), never a
 * researcher-facing capability. See docs/decisions/0006-scope-asset-model.md.
 */
export async function evaluateProgramScope(programId: string, assetType: ProgramAssetType, targetInput: string): Promise<ScopeEvaluationResult> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<EvaluateRow>(client, "public.evaluate_program_scope", [programId, assetType, targetInput]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return { isInScope: row.is_in_scope, matchedScopeState: row.matched_scope_state, matchedEntryId: row.matched_entry_id, matchedTarget: row.matched_target };
}

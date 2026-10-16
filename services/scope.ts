import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import type { AssetInventoryItem, ProgramAssetType, ScopeEntry, ScopeEvaluationResult, ScopeState } from "@/types/scope";
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

/** The organization's asset inventory (202610160009): one row per asset with the programs it
 * is in scope for, its open and total findings, and the last report filed against it. Owners and
 * security admins see every asset; program staff see the assets of the programs they work on
 * (list_organization_assets decides). Keyset-paginated on the asset's display identifier. */
export async function listOrganizationAssets(organizationId: string, cursor?: string, filters: ScopeEntryFilters & { includeRetired?: boolean } = {}): Promise<Page<AssetInventoryItem>> {
  const actor = await getCurrentUser();
  const decoded = cursor ? decodeCursor(cursor) : null;
  const pageSize = clampPageSize(50);
  type Row = { asset_id: string; asset_type: ProgramAssetType; display_identifier: string; programs: AssetInventoryItem["programs"]; open_reports: string; total_reports: string; last_report_at: string | null };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<Row>(client, "public.list_organization_assets", [organizationId, filters.assetType ?? null, filters.programId ?? null, decoded?.sortValue ?? null, decoded?.id ?? null, pageSize, filters.includeRetired ?? false]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map((r) => ({
    id: r.asset_id,
    assetType: r.asset_type,
    displayIdentifier: r.display_identifier,
    programs: r.programs,
    openReports: Number(r.open_reports),
    totalReports: Number(r.total_reports),
    lastReportAt: r.last_report_at ? new Date(r.last_report_at).toISOString() : null,
  }));
  const last = rows[rows.length - 1];
  return { items, nextCursor: rows.length === pageSize && last ? encodeCursor(last.display_identifier, last.asset_id) : null };
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

/** `assetType`/`targetInput` are optional -- omitting both leaves the entry's target
 * completely untouched (the original state/description-only edit path). Passing
 * `targetInput` re-canonicalizes it exactly like addScopeEntry does (never duplicated
 * validation logic here) -- see db/migrations/202609090009_editable_scope_target.sql for
 * why this overrides 0006's original "target is immutable" decision, and what audit-
 * history trade-off that carries. */
export async function updateScopeEntry(entryId: string, scopeState: ScopeState, description?: string, assetType?: ProgramAssetType, targetInput?: string): Promise<ScopeEntry> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<ScopeEntryRpcRow>(client, "public.update_scope_entry", [entryId, scopeState, description ?? null, assetType ?? null, targetInput ?? null]),
    );
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

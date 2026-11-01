-- Assets & Scope (Phase 7, Turn 2) -- inspected first: a real scope/asset system already
-- exists (public.program_scope_entries, 202608260005_program_scope_foundation.sql --
-- canonicalized targets, full RLS, audit logging, already linked from
-- reports.matched_scope_entry_id). docs/decisions/0006-scope-asset-model.md explicitly
-- rejects a second, global `assets` table -- this migration extends the existing model
-- rather than forking it. The only real schema gap: no index supports the new
-- cross-program asset inventory page's own query
-- (services/scope.ts's listActiveScopeEntriesForOrganization), which filters by
-- organization_id alone (no program_id predicate) -- the existing
-- program_scope_entries_program_id_idx (program_id, status) does not help that shape.
-- Everything else the turn asked for (an "instructions" field, reports->assets linkage)
-- already exists: description already serves as per-asset testing instructions, and
-- reports.matched_scope_entry_id/matched_scope_state/matched_target already link every
-- report to its scope entry at submission time -- no new FK, no backfill needed.

create index program_scope_entries_organization_id_idx on public.program_scope_entries(organization_id, status);

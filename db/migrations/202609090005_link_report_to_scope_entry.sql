-- Assets & Scope (Phase 7, Turn 2) -- the inbox's "link picker" for a report whose
-- matched_scope_entry_id is null (see reports_foundation's own comment: this happens via
-- FK's `on delete set null`, or for a report submitted before scope tracking existed).
-- Manager-only, same authorization boundary every other triage-adjacent mutation uses
-- (private.lock_and_authorize_report_for_triage). The chosen scope entry must belong to
-- the SAME program as the report -- never a cross-program link, which would misrepresent
-- what was actually tested against what was actually authorized.

create or replace function public.link_report_to_scope_entry(target_report_id uuid, target_scope_entry_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  entry public.program_scope_entries;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  select * into entry from public.program_scope_entries where id = target_scope_entry_id;
  if entry.id is null then
    raise exception 'SCOPE_ENTRY_NOT_FOUND: scope entry not found' using errcode = 'P0002';
  end if;
  if entry.program_id <> report.program_id then
    raise exception 'SCOPE_ENTRY_WRONG_PROGRAM: that asset belongs to a different program' using errcode = '23514';
  end if;

  update public.reports
    set matched_scope_entry_id = entry.id, matched_scope_state = entry.scope_state, matched_target = entry.display_target, updated_at = now()
    where id = target_report_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.asset_linked', 'report', target_report_id,
    jsonb_build_object('scope_entry_id', entry.id, 'target', entry.display_target, 'scope_state', entry.scope_state));

  return updated;
end;
$$;

revoke all on function public.link_report_to_scope_entry(uuid, uuid) from public;
grant execute on function public.link_report_to_scope_entry(uuid, uuid) to authenticated;

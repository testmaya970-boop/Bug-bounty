-- Findings from the 2026-10-06 report-lifecycle / evidence audit (nothing Critical or High).
--
-- (1) Medium, live-verified: report collaborators can see researcher-visible file evidence
--     (report_evidence RLS) but record_evidence_download refused them, so their Download
--     button was dead. The function now allows exactly what the read policy allows.
-- (2) Report status rules lived only inside the 8 RPCs that write reports.status. A
--     BEFORE UPDATE trigger now enforces private.is_valid_report_transition for any writer.
-- (3) mark_duplicate didn't check which report came first, so an older report could be
--     marked a duplicate of a newer one (affects reputation and bounties). Enforced by
--     trigger: the original must be in the same program and submitted no later.
-- (4) set_report_severity kept the default PUBLIC execute grant (anon could call it; it
--     still required a user internally). Now authenticated only.
-- (5) report_evidence.object_key gets a unique index (keys are server-generated, so this
--     is defense in depth).

create or replace function public.record_evidence_download(target_evidence_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  evidence public.report_evidence;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into evidence from public.report_evidence
    where id = target_evidence_id
      and (
        (visibility = 'researcher_visible' and (researcher_id = actor or private.is_report_collaborator(report_id)))
        or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
        or private.is_program_triager(program_id)
      );
  if evidence.id is null then raise exception 'EVIDENCE_NOT_FOUND: evidence not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, evidence.organization_id, 'report.evidence_downloaded', 'report', evidence.report_id, jsonb_build_object('evidence_id', evidence.id));
end;
$$;

create or replace function private.enforce_report_rules()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.reports;
begin
  if new.status is distinct from old.status and not private.is_valid_report_transition(old.status, new.status) then
    raise exception 'INVALID_TRANSITION: a report cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;

  if new.duplicate_of_report_id is not null and new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then
    select * into original from public.reports where id = new.duplicate_of_report_id;
    if original.id is null or original.program_id <> new.program_id then
      raise exception 'INVALID_DUPLICATE: the original report must be in the same program' using errcode = '22023';
    end if;
    if original.submitted_at > new.submitted_at then
      raise exception 'INVALID_DUPLICATE: a report can only duplicate one submitted before it' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_report_rules() from public;

drop trigger if exists reports_enforce_rules on public.reports;
create trigger reports_enforce_rules
  before update of status, duplicate_of_report_id on public.reports
  for each row execute function private.enforce_report_rules();

revoke all on function public.set_report_severity(uuid, public.report_severity, public.cvss_attack_vector, public.cvss_attack_complexity, public.cvss_privileges_required, public.cvss_user_interaction, public.cvss_scope, public.cvss_impact, public.cvss_impact, public.cvss_impact) from public;
grant execute on function public.set_report_severity(uuid, public.report_severity, public.cvss_attack_vector, public.cvss_attack_complexity, public.cvss_privileges_required, public.cvss_user_interaction, public.cvss_scope, public.cvss_impact, public.cvss_impact, public.cvss_impact) to authenticated;

create unique index if not exists report_evidence_object_key_unique on public.report_evidence (object_key) where object_key is not null;

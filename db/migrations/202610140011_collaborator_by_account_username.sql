-- Collaborators were found by public_username only, which researchers can no longer set
-- (removed from profile settings in fe8388a), so almost nobody could be added. They are
-- now found by their account username (the @handle shown in the app) or a public username.

CREATE OR REPLACE FUNCTION public.add_report_collaborator(target_report_id uuid, p_collaborator_username text, p_bounty_split_percent numeric)
 RETURNS report_collaborators
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  report public.reports;
  collaborator_id uuid;
  existing_count integer;
  existing_split_sum numeric(6,2);
  new_row public.report_collaborators;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can add collaborators' using errcode = '42501';
  end if;
  if report.status not in ('new', 'triaging') then
    raise exception 'REPORT_LOCKED_FOR_COLLABORATION: collaborators can only be added while the report is new or in triage' using errcode = '23514';
  end if;

  if p_bounty_split_percent is null or p_bounty_split_percent <= 0 or p_bounty_split_percent > 100 then
    raise exception 'INVALID_SPLIT: bounty split percent must be greater than 0 and at most 100' using errcode = '22023';
  end if;

  select u.id into collaborator_id from public.users u where u.deactivated_at is null
    and (lower(u.username) = lower(trim(coalesce(p_collaborator_username, ''))) or lower(u.public_username) = lower(trim(coalesce(p_collaborator_username, ''))))
  limit 1;
  if collaborator_id is null then
    raise exception 'COLLABORATOR_NOT_FOUND: no researcher exists with that username' using errcode = 'P0002';
  end if;
  if collaborator_id = actor then
    raise exception 'INVALID_COLLABORATOR: you cannot add yourself as a collaborator' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.program_researchers
    where program_id = report.program_id and user_id = collaborator_id and status = 'active'
  ) then
    raise exception 'COLLABORATOR_NOT_AUTHORIZED: that researcher is not an active participant of this program' using errcode = '42501';
  end if;

  select count(*), coalesce(sum(bounty_split_percent), 0) into existing_count, existing_split_sum
    from public.report_collaborators where report_id = target_report_id;

  if existing_count >= 10 then
    raise exception 'COLLABORATOR_LIMIT_REACHED: a report can have at most 10 collaborators' using errcode = '23514';
  end if;
  if existing_split_sum + p_bounty_split_percent >= 100 then
    raise exception 'SPLIT_EXCEEDS_TOTAL: collaborator splits must leave the submitter at least 0.01%% of the bounty' using errcode = '23514';
  end if;

  insert into public.report_collaborators (report_id, researcher_id, bounty_split_percent, added_by)
  values (target_report_id, collaborator_id, p_bounty_split_percent, actor)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.collaborator_added', 'report', target_report_id,
    jsonb_build_object('collaborator_id', collaborator_id, 'bounty_split_percent', p_bounty_split_percent));

  return new_row;
end;
$function$
;

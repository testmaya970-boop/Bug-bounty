-- Two platform-admin asks: (1) delete any researcher, (2) view the audit log.
--
-- Delete: hard-deleting public.users is not possible -- reports/payment_obligations/
-- reputation_ledger_entries/report_collaborators all reference researcher_id with
-- `on delete restrict` (202608270001, 202608290001, 202608290003, 202609050003), so any
-- researcher with so much as one report would throw a FK violation. This reuses the
-- self-service deactivation this schema already has (users.deactivated_at, added
-- 202609020003, already checked at sign-in in services/auth.ts) rather than inventing a
-- second "deleted" state: an admin-forced deactivation blocks sign-in exactly like a
-- self-service one, and additionally scrubs display name/bio/avatar so the account no
-- longer shows real PII in any UI that still reads it (reports, leaderboards, etc. all
-- keep pointing at the same user row -- FK integrity is why this can't be a real row
-- delete). Same disclosed-limitation shape as suspend_researcher_platform_wide
-- (202609050014): single-admin action, no dual control.
--
-- Audit log: public.audit_logs has existed since 202608250001 and every admin/org/report
-- action already writes to it -- this adds the one missing read path for a platform admin
-- to actually see it, not a new logging system.

create or replace function public.delete_researcher_platform_wide(target_user_id uuid, p_reason text)
returns public.users
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  target public.users;
  updated public.users;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required to delete a researcher' using errcode = '42501';
  end if;

  select * into target from public.users where id = target_user_id for update;
  if target.id is null then raise exception 'USER_NOT_FOUND: user not found' using errcode = 'P0002'; end if;
  if target.account_type <> 'researcher' then
    raise exception 'NOT_A_RESEARCHER: only a researcher account can be deleted this way' using errcode = '42501';
  end if;
  if target.deactivated_at is not null then
    raise exception 'ALREADY_DEACTIVATED: this account is already deactivated' using errcode = '23514';
  end if;

  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_DELETION: explain why this account is being deleted' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_DELETION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  update public.users
  set deactivated_at = now(), is_suspended = true, display_name = 'Deleted user', updated_at = now()
  where id = target_user_id
  returning * into updated;

  update public.researcher_profiles set biography = null, avatar_path = null, updated_at = now() where user_id = target_user_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.researcher_deleted', 'user', target_user_id, jsonb_build_object('reason', trimmed_reason));

  return updated;
end;
$$;

revoke all on function public.delete_researcher_platform_wide(uuid, text) from public;
grant execute on function public.delete_researcher_platform_wide(uuid, text) to authenticated;

create or replace function public.list_audit_logs_for_admin(p_limit int default 100, p_before timestamptz default null)
returns table (
  id uuid,
  actor_id uuid,
  actor_display_name text,
  organization_id uuid,
  organization_name text,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception 'INVALID_LIMIT: limit must be between 1 and 200' using errcode = '22023';
  end if;

  return query
  select l.id, l.actor_id, u.display_name, l.organization_id, o.name, l.action, l.entity_type, l.entity_id, l.metadata, l.created_at
  from public.audit_logs l
  left join public.users u on u.id = l.actor_id
  left join public.organizations o on o.id = l.organization_id
  where p_before is null or l.created_at < p_before
  order by l.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.list_audit_logs_for_admin(int, timestamptz) from public;
grant execute on function public.list_audit_logs_for_admin(int, timestamptz) to authenticated;

-- Reactivating a deactivated account. The deactivation page tells users "There is no
-- self-serve reactivation. Contact support if you change your mind." -- but nothing could
-- actually undo deactivate_my_account (202609280003), so support had no way to help.
--
-- reactivate_account_platform_wide(email, reason): platform admins only. Clears
-- users.deactivated_at so the person can sign in again (and reset their password, which
-- is refused while deactivated). Refused for an account a platform admin DELETED
-- (delete_researcher_platform_wide, 202610050005): that one reuses deactivated_at but also
-- scrubbed the account's personal data, and is irreversible by design. A platform
-- suspension (is_suspended) is untouched -- that has its own reinstate action.
-- Looked up by email, the identity a person contacting support gives; done inside this
-- function under the admin check, so no service-role lookup is needed.

create or replace function public.reactivate_account_platform_wide(p_email text, p_reason text)
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
    raise exception 'FORBIDDEN: platform admin authority required to reactivate an account' using errcode = '42501';
  end if;
  if char_length(trimmed_reason) = 0 then
    raise exception 'INVALID_REACTIVATION: explain why this account is being reactivated' using errcode = '22023';
  end if;
  if char_length(trimmed_reason) > 2000 then
    raise exception 'INVALID_REACTIVATION: reason must be 2000 characters or fewer' using errcode = '22023';
  end if;

  select * into target from public.users where email = lower(trim(coalesce(p_email, ''))) for update;
  if target.id is null then raise exception 'USER_NOT_FOUND: no account with that email was found' using errcode = 'P0002'; end if;
  if target.deactivated_at is null then
    raise exception 'NOT_DEACTIVATED: this account is already active' using errcode = '23514';
  end if;
  if exists (select 1 from public.audit_logs a where a.action = 'platform.researcher_deleted' and a.entity_id = target.id) then
    raise exception 'ACCOUNT_DELETED: this account was deleted by a platform admin and cannot be reactivated' using errcode = '42501';
  end if;

  update public.users set deactivated_at = null, updated_at = now() where id = target.id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.account_reactivated', 'user', target.id,
    jsonb_build_object('reason', trimmed_reason, 'deactivated_at', target.deactivated_at));

  return updated;
end;
$$;

revoke all on function public.reactivate_account_platform_wide(text, text) from public;
grant execute on function public.reactivate_account_platform_wide(text, text) to authenticated;

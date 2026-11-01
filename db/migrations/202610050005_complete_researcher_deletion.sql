-- Audit ADM-2 (P1). delete_researcher_platform_wide (202610010001) set deactivated_at and
-- scrubbed the display name/bio/avatar, but left the account usable and its data public:
--   * personal access tokens kept working -- verify_api_token never looked at the user, and
--     bearer requests do not pass through the cookie middleware's deactivation gate
--     (confirmed live: an unrevoked token already belonged to a deactivated account);
--   * existing sessions stayed in place (deactivate_my_account deletes them);
--   * public_username stayed set, so /researchers/<username> stayed published;
--   * payout (bank account) and personal details stayed stored.
--
-- verify_api_token now refuses deactivated accounts -- the same rule the cookie gate
-- applies. Suspended accounts keep read access, matching the read-vs-act rule everywhere
-- else (a suspended researcher's own reports stay readable).
--
-- researcher_kyc is deliberately kept: those are identity-verification records that may be
-- needed to account for payouts already made. Deleting them is a retention-policy decision,
-- not a default.

create or replace function public.verify_api_token(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  update public.personal_access_tokens t set last_used_at = now()
    from public.users u
    where t.token_hash = p_token_hash and t.revoked_at is null
      and u.id = t.user_id and u.deactivated_at is null
    returning t.user_id into owner;
  return owner;
end;
$$;

revoke all on function public.verify_api_token(text) from public;
grant execute on function public.verify_api_token(text) to anon, authenticated;

create or replace function public.delete_researcher_platform_wide(target_user_id uuid, p_reason text)
returns public.users
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_reason text := trim(coalesce(p_reason, ''));
  target public.users;
  updated public.users;
  revoked_tokens integer;
  ended_sessions integer;
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
  set deactivated_at = now(), is_suspended = true, display_name = 'Deleted user', public_username = null, updated_at = now()
  where id = target_user_id
  returning * into updated;

  update public.researcher_profiles set biography = null, avatar_path = null, updated_at = now() where user_id = target_user_id;
  delete from public.researcher_payout_details where user_id = target_user_id;
  delete from public.researcher_personal_details where user_id = target_user_id;

  update public.personal_access_tokens set revoked_at = now() where user_id = target_user_id and revoked_at is null;
  get diagnostics revoked_tokens = row_count;
  delete from public.sessions where user_id = target_user_id;
  get diagnostics ended_sessions = row_count;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.researcher_deleted', 'user', target_user_id,
    jsonb_build_object('reason', trimmed_reason, 'revoked_tokens', revoked_tokens, 'ended_sessions', ended_sessions));

  return updated;
end;
$$;

revoke all on function public.delete_researcher_platform_wide(uuid, text) from public;
grant execute on function public.delete_researcher_platform_wide(uuid, text) to authenticated;

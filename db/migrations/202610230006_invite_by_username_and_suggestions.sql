-- Invite a researcher by @username, and suggest researchers for a private pilot (2026-10-23).
-- The researcher's email never reaches the organization: the database looks it up, the
-- invitation row keeps it (the accept flow matches on it) and our server uses it only to send
-- the invitation email. The organization's audit log and invitation list show the @username.

alter table public.program_invitations add column invited_username text;
comment on column public.program_invitations.invited_username is
  'Set when the invitation was made by @username: show this, never the email, to the organization.';

-- Same authority, suspension and rate-limit checks as invite_researcher_to_program; written
-- out here (not called) so the audit row records the username instead of the email.
create or replace function public.invite_researcher_by_username(target_program_id uuid, researcher_username text, invite_message text, token_hash_input text)
returns public.program_invitations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  researcher public.users;
  handle text := lower(regexp_replace(trim(coalesce(researcher_username, '')), '^@', ''));
  new_invitation public.program_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot invite researchers to this program' using errcode = '42501';
  end if;
  if not private.organization_is_operable(program.organization_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot invite researchers' using errcode = '42501';
  end if;
  if not private.check_and_consume_rate_limit('program_invite:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many invitations sent recently, try again later' using errcode = '53400';
  end if;

  select * into researcher from public.users u
  where lower(u.public_username) = handle and u.account_type = 'researcher' and not u.is_suspended and u.deactivated_at is null and u.email_verified_at is not null;
  if researcher.id is null then raise exception 'RESEARCHER_NOT_FOUND: no researcher has that username' using errcode = 'P0002'; end if;
  if exists (select 1 from public.program_researchers pr where pr.program_id = program.id and pr.user_id = researcher.id) then
    raise exception 'ALREADY_PARTICIPATING: this researcher already has access to the program' using errcode = '23505';
  end if;

  begin
    insert into public.program_invitations (program_id, organization_id, email, invited_by, token_hash, message, expires_at, invited_username)
    values (program.id, program.organization_id, lower(researcher.email), actor, token_hash_input, nullif(invite_message, ''), now() + interval '168 hours', researcher.public_username)
    returning * into new_invitation;
  exception when unique_violation then
    raise exception 'INVITATION_PENDING: this researcher already has a pending invitation' using errcode = '23505';
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.invited', 'program_invitation', new_invitation.id,
    jsonb_build_object('program_id', program.id, 'username', '@' || researcher.public_username));
  return new_invitation;
end;
$$;
revoke all on function public.invite_researcher_by_username(uuid, text, text, text) from public, anon;
grant execute on function public.invite_researcher_by_username(uuid, text, text, text) to authenticated;

-- Researchers to invite to a pilot: only those who chose a public profile (the public
-- leaderboard), ranked by reputation, minus anyone already in or invited to the program.
create or replace function public.suggest_program_researchers(target_program_id uuid, p_limit integer default 8)
returns table (researcher_id uuid, display_name text, public_username text, score bigint, resolved_count bigint, bounty_finalized_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  select * into program from public.programs where id = target_program_id;
  if program.id is null or not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot invite researchers to this program' using errcode = '42501';
  end if;
  return query
  select l.researcher_id, l.display_name, l.public_username, l.score, l.resolved_count, l.bounty_finalized_count
  from public.get_public_leaderboard(200) l
  where l.public_username is not null and l.researcher_id is not null
    and not exists (select 1 from public.program_researchers pr where pr.program_id = program.id and pr.user_id = l.researcher_id)
    and not exists (
      select 1 from public.program_invitations i
      where i.program_id = program.id and i.accepted_at is null and i.revoked_at is null and lower(i.invited_username) = lower(l.public_username))
  order by l.score desc, l.resolved_count desc
  limit least(greatest(coalesce(p_limit, 8), 1), 25);
end;
$$;
revoke all on function public.suggest_program_researchers(uuid, integer) from public, anon;
grant execute on function public.suggest_program_researchers(uuid, integer) to authenticated;

-- Invitation audit (21 Oct): an invitation to an email that belongs to the wrong kind of account
-- was accepted silently, then failed only when the invitee tried to accept it -- and the
-- inviter was never told. Researcher and organization accounts are strictly separate, so:
--   * an organization invitation to an existing researcher account is refused at invite time;
--   * a program invitation to an existing organization account, or to a member of the
--     program's own organization, is refused at invite time.
-- An email with no account yet is fine either way: the invitee signs up as the right kind.
-- Triggers on the tables (not copies of the invite functions), so every insert path is covered.

create or replace function private.organization_invitations_check_account_type()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.users u where lower(u.email) = lower(new.email) and u.account_type = 'researcher') then
    raise exception 'RESEARCHER_ACCOUNT: that email belongs to a researcher account -- researcher and organization accounts are kept separate, so invite their work email instead' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.organization_invitations_check_account_type() from public, anon;
grant execute on function private.organization_invitations_check_account_type() to service_role;
create trigger organization_invitations_check_account_type before insert on public.organization_invitations
  for each row execute function private.organization_invitations_check_account_type();

create or replace function private.program_invitations_check_account_type()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  invitee public.users;
begin
  select * into invitee from public.users u where lower(u.email) = lower(new.email);
  if invitee.id is null then return new; end if;
  if invitee.account_type = 'organization' then
    raise exception 'ORGANIZATION_ACCOUNT: that email belongs to an organization account -- only researcher accounts can take part in programs' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_members m where m.organization_id = new.organization_id and m.user_id = invitee.id and m.status = 'active') then
    raise exception 'OWN_STAFF: that person is a member of this organization, and members can''t research its own programs' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.program_invitations_check_account_type() from public, anon;
grant execute on function private.program_invitations_check_account_type() to service_role;
create trigger program_invitations_check_account_type before insert on public.program_invitations
  for each row execute function private.program_invitations_check_account_type();

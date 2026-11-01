-- Deactivating your account can no longer leave an organization without an owner
-- (2026-09-28).
--
-- change_member_role (202609050017) already refuses to demote an organization's last
-- owner, but deactivate_my_account had no such check: the only owner of an organization
-- could deactivate themselves, and nobody would be left who can manage members, roles or
-- settings. Same rule here. Another owner only counts if their own account is not
-- deactivated -- a deactivated owner cannot act either.

create or replace function public.deactivate_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sole_owner_of text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select o.name into sole_owner_of
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = actor and m.role = 'owner' and m.status = 'active'
    and not exists (
      select 1 from public.organization_members other
      join public.users u on u.id = other.user_id
      where other.organization_id = m.organization_id and other.role = 'owner' and other.status = 'active'
        and other.user_id <> actor and u.deactivated_at is null
    )
  order by o.name
  limit 1;
  if sole_owner_of is not null then
    raise exception 'LAST_OWNER: You are the only owner of %. Make another member an owner before you deactivate your account.', sole_owner_of using errcode = '42501';
  end if;

  update public.users set deactivated_at = now(), updated_at = now() where id = actor;
  delete from public.sessions where user_id = actor;
end;
$$;

revoke all on function public.deactivate_my_account() from public;
grant execute on function public.deactivate_my_account() to authenticated;

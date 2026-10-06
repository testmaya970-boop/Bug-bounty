-- Audit ORG-2 + ORG-4 (P1).
--
-- ORG-2: suspend_member and remove_member authorize `role in ('owner', 'security_admin')`
-- against ANY target, owners included. The role matrix (202609250012) and the UI copy
-- (services/authorization.ts: "Invite, suspend, and remove members (except owners)") both
-- say a Security Admin cannot act on an owner. Now enforced: only an owner can suspend or
-- remove another owner. An owner may still leave themselves, and a non-member actor
-- (platform admin / service tooling) is unaffected.
--
-- ORG-4: the LAST_OWNER checks in change_member_role / suspend_member / remove_member count
-- owners whose user account is deactivated, so the last real owner could demote or remove
-- themselves while a deactivated "owner" kept the org nominally owned. Now: an owner may
-- leave the active-owner set only if another active, non-deactivated owner remains.
--
-- Enforced as one trigger so every path (including future ones) is covered.

create or replace function private.protect_owner_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  leaving boolean := old.role = 'owner' and old.status = 'active'
    and (new.status <> 'active' or new.role <> 'owner');
begin
  if not leaving then return new; end if;

  if actor is not null and actor <> old.user_id and exists (
    select 1 from public.organization_members m
    where m.organization_id = old.organization_id and m.user_id = actor and m.status = 'active' and m.role <> 'owner'
  ) then
    raise exception 'FORBIDDEN: only an owner can suspend, remove, or change the role of another owner' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_members m
    join public.users u on u.id = m.user_id
    where m.organization_id = old.organization_id and m.role = 'owner' and m.status = 'active'
      and m.user_id <> old.user_id and u.deactivated_at is null
  ) then
    raise exception 'LAST_OWNER: An organization must always have at least one active owner.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_owner_membership() from public;

drop trigger if exists organization_members_protect_owner on public.organization_members;
create trigger organization_members_protect_owner
  before update of role, status on public.organization_members
  for each row execute function private.protect_owner_membership();

-- Audit P1-1 (Oct 15 system design audit): suspended and deactivated accounts kept their
-- database powers. The role helpers only checked an active membership row, never the account
-- itself, so:
--   * a platform-suspended organization user kept every org power (suspension only blocked
--     activating a NEW membership), and
--   * deactivation held only because the app deletes sessions; any path without that proxy
--     (the worker, a future API, a session created before the delete) still passed.
-- Every org, program and platform power now also requires the acting account to be live.
-- The check lives in these six helpers because every RLS policy and RPC role check goes
-- through them (verified against the live catalog), instead of being repeated at 100+ call sites.

create or replace function private.actor_is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.deactivated_at is null and not u.is_suspended);
$$;
revoke all on function private.actor_is_active() from public;

create or replace function private.has_org_role(target_org_id uuid, allowed_roles public.organization_member_role[])
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid() and status = 'active' and role = any(allowed_roles)
  ) and private.actor_is_active();
end;
$$;

create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid() and status = 'active'
  ) and private.actor_is_active();
end;
$$;

create or replace function private.is_program_member(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
    where pm.program_id = target_program_id and pm.user_id = auth.uid() and pm.role = 'manager'
  ) and private.actor_is_active();
end;
$$;

create or replace function private.is_program_triager(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
    where pm.program_id = target_program_id and pm.user_id = auth.uid() and pm.role in ('manager', 'triager')
  ) and private.actor_is_active();
end;
$$;

create or replace function private.authorize_organization_read(target_organization_id uuid, allowed_roles public.organization_member_role[])
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = actor and status = 'active' and role = any (allowed_roles)
  ) or not private.actor_is_active() then
    raise exception 'FORBIDDEN: your role in this organization cannot view this' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
    and private.actor_is_active()
    and exists (
      select 1 from public.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = auth.uid()
        and s.created_at > now() - interval '30 days'
        and (s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = s.user_id))
    );
$$;

-- Real-database verification surfaced a genuine gap: neither Phase 1 nor Phase 2 ever
-- explicitly GRANTed table-level SELECT/INSERT/UPDATE/DELETE to `authenticated`/`anon`/
-- `service_role` on any Sentinel table. This worked unnoticed only because older Supabase
-- CLI/project defaults auto-granted Data API roles access to new `public` tables created
-- by `postgres` without an explicit GRANT. That auto-expose behavior is now OFF by default
-- ("matching the new cloud default" -- see supabase/config.toml's own comment on
-- `auto_expose_new_tables`), which applies to hosted projects created under the same
-- default, not just local dev -- so this was a real, production-relevant bug, confirmed
-- live: every table read returned 403 (permission denied at the GRANT layer) regardless of
-- whether RLS would have allowed the row, including for a user reading their own
-- organization. RLS was configured correctly; it was simply never reached.
--
-- Scope of grants, matched to how the application actually uses each table:
-- - `authenticated` gets SELECT only on every table below. All writes to
--   organization_members/organization_invitations/audit_logs go through the SECURITY
--   DEFINER RPC functions in the prior migration, which execute with the function owner's
--   privileges (not the caller's) -- authenticated never needs INSERT/UPDATE/DELETE grants
--   for those tables to make the application work, and not granting them keeps the
--   client-reachable surface as narrow as the app actually requires.
-- - `anon` gets nothing here (deliberately): every table has RLS policies scoped to
--   `authenticated` only, and an anonymous visitor has no legitimate reason to read any of
--   this data.
-- - `service_role` gets full CRUD, matching Supabase's own convention for that role (it
--   already has BYPASSRLS; GRANT and RLS are separate privilege layers, and BYPASSRLS does
--   not substitute for a table-level GRANT). No current application code uses the
--   service-role key for these tables -- this is for completeness/correctness, not because
--   anything depends on it today.

grant select on public.organizations, public.organization_members, public.organization_invitations, public.audit_logs, public.users to authenticated;

grant select, insert, update, delete on public.organizations, public.organization_members, public.organization_invitations, public.audit_logs, public.users, public.researcher_profiles to service_role;

-- Second real bug found in the same verification pass: remove_member set status='removed'
-- without clearing suspended_at, so removing a currently-suspended member violated
-- organization_members_suspended_at_check ("status = 'suspended' OR suspended_at IS NULL").
-- reactivate_member already clears suspended_at correctly on its own transition;
-- remove_member needs the same treatment. Redefining the full function since
-- CREATE OR REPLACE requires the complete body -- only the UPDATE statement's SET list
-- changed (added `suspended_at = null`) versus the original in 202608260001.
create or replace function public.remove_member(target_org_id uuid, target_user_id uuid)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_membership public.organization_members;
  target_membership public.organization_members;
  remaining_owners integer;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into actor_membership from public.organization_members
    where organization_id = target_org_id and user_id = actor and status = 'active';
  if actor_membership.user_id is null or actor_membership.role not in ('owner', 'security_admin') then
    raise exception 'FORBIDDEN: actor cannot remove members from this organization' using errcode = '42501';
  end if;

  perform 1 from public.organization_members
    where organization_id = target_org_id and role = 'owner' and status = 'active' for update;

  select * into target_membership from public.organization_members
    where organization_id = target_org_id and user_id = target_user_id for update;
  if target_membership.user_id is null or target_membership.status = 'removed' then
    raise exception 'MEMBER_NOT_FOUND: active membership not found' using errcode = 'P0002';
  end if;

  if target_membership.role = 'owner' then
    select count(*) into remaining_owners from public.organization_members
      where organization_id = target_org_id and role = 'owner' and status = 'active' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'LAST_OWNER: An organization must always have at least one active owner.' using errcode = '23514';
    end if;
  end if;

  update public.organization_members set status = 'removed', removed_at = now(), suspended_at = null, updated_at = now()
    where organization_id = target_org_id and user_id = target_user_id
    returning * into membership;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.removed', 'organization_member', target_user_id, jsonb_build_object('previous_role', target_membership.role));

  return membership;
end;
$$;

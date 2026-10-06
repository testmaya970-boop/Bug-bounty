-- Audit TEN-2 (P1, live-verified: a billing admin assigned to no program read org-wide
-- severity, spend and researcher data). The seven org-wide analytics functions only checked
-- "active member". The app's own nav already scopes these screens (components/app-shell-
-- client.tsx): Analytics = owner/security_admin, Researchers = + program_manager,
-- Payments/spend = + billing_admin. The database now enforces the same rule, so a direct
-- call can't read what the UI never offers.
--   severity/status breakdown, weekly volume, resolution performance -> owner, security_admin
--   bounty spend summary / weekly / per program                    -> + billing_admin
--   list_researchers_for_organization                               -> + program_manager
-- Each function keeps its query; only its authorization call is replaced.

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
  ) then
    raise exception 'FORBIDDEN: your role in this organization cannot view this' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.authorize_organization_read(uuid, public.organization_member_role[]) from public;

do $$
declare
  spec record;
  definition text;
  rewritten text;
begin
  for spec in
    select * from (values
      ('get_organization_severity_status_breakdown', 'array[''owner'', ''security_admin'']'),
      ('get_organization_weekly_report_volume', 'array[''owner'', ''security_admin'']'),
      ('get_organization_resolution_performance', 'array[''owner'', ''security_admin'']'),
      ('get_organization_bounty_spend_summary', 'array[''owner'', ''security_admin'', ''billing_admin'']'),
      ('get_organization_weekly_bounty_spend', 'array[''owner'', ''security_admin'', ''billing_admin'']'),
      ('get_organization_program_bounty_spend', 'array[''owner'', ''security_admin'', ''billing_admin'']'),
      ('list_researchers_for_organization', 'array[''owner'', ''security_admin'', ''program_manager'']')
    ) as t(fn, roles)
  loop
    select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = spec.fn;

    rewritten := replace(definition,
      'private.authorize_organization_analytics_read(target_organization_id)',
      format('private.authorize_organization_read(target_organization_id, %s::public.organization_member_role[])', spec.roles));
    if rewritten = definition then
      raise exception '% does not call authorize_organization_analytics_read(target_organization_id) as expected', spec.fn;
    end if;
    execute rewritten;
  end loop;
end;
$$;

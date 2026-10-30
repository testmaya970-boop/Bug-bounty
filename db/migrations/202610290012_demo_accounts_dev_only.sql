-- Demo accounts for development (product decision, 2026-10-29). In a development database only,
-- accounts and organizations marked as demo skip two real-world proofs that block testing:
--   * a demo researcher counts as identity-verified (may join KYC programs and submit reports);
--   * a demo organization's in-scope domains and URLs need no ownership proof.
-- Nobody else is affected, and nothing changes anywhere the switch is off.
--
-- Two locks, both required:
--   1. The database switch `app.settings.demo_accounts = 'on'`, set per environment like the
--      KYC key (db/init/01-app-role.sql sets it for local dev). Production never sets it, and
--      lib/startup-check.ts refuses to start a production server whose database has it on.
--   2. The `is_demo` flag on the account or organization, which only server-side tooling
--      (the seed, scripts/mark-demo.mjs) can set. No RPC sets it, and signed-in users can't.

alter table public.users add column if not exists is_demo boolean not null default false;
alter table public.organizations add column if not exists is_demo boolean not null default false;

create or replace function private.guard_demo_flag()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.is_demo is distinct from (case when tg_op = 'INSERT' then false else old.is_demo end)
     and current_user not in ('service_role', 'sentinel_app', 'postgres') then
    raise exception 'FORBIDDEN: the demo flag is set by server tooling only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_demo_flag() from public, anon, authenticated;
create trigger users_guard_demo_flag before insert or update of is_demo on public.users
  for each row execute function private.guard_demo_flag();
create trigger organizations_guard_demo_flag before insert or update of is_demo on public.organizations
  for each row execute function private.guard_demo_flag();

create or replace function private.demo_accounts_enabled()
returns boolean
language sql stable set search_path = ''
as $$ select coalesce(current_setting('app.settings.demo_accounts', true), '') = 'on'; $$;
revoke all on function private.demo_accounts_enabled() from public, anon;
grant execute on function private.demo_accounts_enabled() to authenticated, service_role;

-- Same as before, plus: a demo researcher in a demo-enabled database.
create or replace function private.researcher_has_verified_kyc(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.researcher_kyc
    where user_id = target_user_id
      and (aadhaar_status = 'verified' or pan_status = 'verified' or passport_status = 'verified')
  ) or exists (
    select 1 from public.identity_verifications v
    where v.user_id = target_user_id and v.status = 'approved' and v.completed_at > now() - interval '12 months'
  ) or (
    private.demo_accounts_enabled() and exists (select 1 from public.users u where u.id = target_user_id and u.is_demo)
  );
$$;

-- Same as before, plus: a demo organization's in-scope entries need no proof in a demo-enabled database.
create or replace function private.compute_scope_clearance(e public.program_scope_entries, previous public.program_scope_entries)
returns public.scope_clearance
language plpgsql stable security definer set search_path = ''
as $$
declare
  host text;
begin
  if e.scope_state = 'out_of_scope' then return 'not_required'; end if;
  if private.demo_accounts_enabled() and exists (select 1 from public.organizations o where o.id = e.organization_id and o.is_demo) then
    return 'not_required';
  end if;
  if e.asset_type in ('domain', 'url') then
    host := private.scope_entry_host(e.asset_type, e.target, e.url_origin);
    if host is null then return 'pending_verification'; end if;
    if private.is_reserved_test_host(host) then return 'not_required'; end if;
    if exists (
      select 1 from public.organization_domains d
      where d.organization_id = e.organization_id and d.status = 'verified' and (host = d.domain or host like '%.' || d.domain)
    ) then return 'verified'; end if;
    return 'pending_verification';
  end if;
  -- RFC 5737 / RFC 3849 documentation ranges belong to nobody, like the reserved names.
  if e.asset_type = 'ip_cidr' and e.target_cidr is not null
     and (e.target_cidr <<= '192.0.2.0/24'::cidr or e.target_cidr <<= '198.51.100.0/24'::cidr
          or e.target_cidr <<= '203.0.113.0/24'::cidr or e.target_cidr <<= '2001:db8::/32'::cidr) then
    return 'not_required';
  end if;
  -- A platform decision survives edits that don't change what is authorized.
  if previous.id is not null and previous.clearance in ('approved', 'rejected')
     and previous.target = e.target and previous.asset_type = e.asset_type and previous.scope_state = e.scope_state then
    return previous.clearance;
  end if;
  return 'pending_review';
end;
$$;

-- Server tooling marks accounts and organizations and refreshes their scope entries.
create or replace function public.set_demo_flags(p_user_emails text[], p_organization_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.demo_accounts_enabled() then
    raise exception 'DEMO_DISABLED: demo accounts are switched off in this database' using errcode = '42501';
  end if;
  update public.users set is_demo = true where lower(email) = any (select lower(x) from unnest(coalesce(p_user_emails, '{}')) x);
  update public.organizations set is_demo = true where id = any (coalesce(p_organization_ids, '{}'));
  update public.program_scope_entries e set clearance = private.compute_scope_clearance(e, null)
  where e.organization_id = any (coalesce(p_organization_ids, '{}'));
end;
$$;
revoke all on function public.set_demo_flags(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.set_demo_flags(text[], uuid[]) to service_role;

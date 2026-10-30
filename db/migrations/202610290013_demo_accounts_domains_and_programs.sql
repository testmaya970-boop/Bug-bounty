-- Demo accounts, part 2 (follows 202610290012; development databases only, same two locks:
-- the app.settings.demo_accounts switch and the server-set is_demo flag).
--
-- 1. A domain a demo organization adds is verified at once (no DNS record), so SSO, scope and
--    everything else that needs a verified domain works in demos.
-- 2. Demo researchers take part in every active program of every demo organization, public or
--    private, without an invitation: enrolled when marked, and when such a program goes live.
--    Public programs of other organizations were already open to everyone; private programs of
--    non-demo organizations still need an invitation.

create or replace function private.verify_demo_domain()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.demo_accounts_enabled() and exists (select 1 from public.organizations o where o.id = new.organization_id and o.is_demo) then
    new.status := 'verified';
    new.verified_at := coalesce(new.verified_at, now());
    new.last_check_error := null;
  end if;
  return new;
end;
$$;
revoke all on function private.verify_demo_domain() from public, anon, authenticated;
-- "a_" so it runs before the existing domain triggers, which then see a verified row.
create trigger organization_domains_a_verify_demo before insert on public.organization_domains
  for each row execute function private.verify_demo_domain();

-- Enrols demo researchers in a demo organization's active programs. Rows that a standing rule
-- refuses (e.g. a demo account that is also staff of that organization) are skipped.
create or replace function private.enroll_demo_researchers(p_program_id uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  pr record;
  n integer := 0;
begin
  if not private.demo_accounts_enabled() then return 0; end if;
  for pr in
    select p.id as program_id, p.organization_id, u.id as user_id
    from public.programs p
    join public.organizations o on o.id = p.organization_id and o.is_demo
    cross join public.users u
    where u.is_demo and u.account_type = 'researcher' and u.deactivated_at is null and not u.is_suspended
      and p.status = 'active' and (p_program_id is null or p.id = p_program_id)
      and not exists (select 1 from public.program_researchers r where r.program_id = p.id and r.user_id = u.id)
  loop
    begin
      insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by)
      values (pr.program_id, pr.organization_id, pr.user_id, 'active', 'invitation', null);
      n := n + 1;
    exception when others then
      null; -- a rule refused this pair; leave it alone
    end;
  end loop;
  return n;
end;
$$;
revoke all on function private.enroll_demo_researchers(uuid) from public, anon, authenticated;

create or replace function private.enroll_demo_researchers_on_launch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    perform private.enroll_demo_researchers(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.enroll_demo_researchers_on_launch() from public, anon, authenticated;
create trigger programs_enroll_demo_researchers after update of status on public.programs
  for each row execute function private.enroll_demo_researchers_on_launch();

-- set_demo_flags also verifies the demo organizations' pending domains and enrols researchers.
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
  update public.organization_domains set status = 'verified', verified_at = coalesce(verified_at, now()), last_check_error = null
  where organization_id = any (coalesce(p_organization_ids, '{}')) and status <> 'verified';
  update public.program_scope_entries e set clearance = private.compute_scope_clearance(e, null)
  where e.organization_id = any (coalesce(p_organization_ids, '{}'));
  perform private.enroll_demo_researchers(null);
end;
$$;
revoke all on function public.set_demo_flags(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.set_demo_flags(text[], uuid[]) to service_role;

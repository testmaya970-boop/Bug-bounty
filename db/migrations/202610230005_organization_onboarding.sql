-- Organization onboarding (2026-10-23): every step an organization takes from sign-up to a
-- public program, read from what it has actually done -- never a separate "completed" flag
-- that can drift. One query for the Home checklist; one for Unpatched's launch review.

-- What an organization has done so far. Owner / security admin (they run onboarding).
create or replace function public.get_organization_onboarding(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  org public.organizations;
  pilot record;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can see onboarding' using errcode = '42501';
  end if;
  select * into org from public.organizations where id = p_organization_id;
  -- The private pilot: the organization's oldest active private program and how it is going.
  select p.id, p.name,
    (select count(*) from public.program_researchers pr where pr.program_id = p.id) as researchers,
    (select count(*) from public.reports r where r.program_id = p.id and r.status in ('accepted', 'resolved')) as valid_reports,
    (select min(l.created_at) from public.audit_logs l where l.organization_id = p_organization_id and l.entity_id = p.id and l.action in ('platform.program_launch_approved', 'program.activated')) as launched_at
    into pilot
  from public.programs p where p.organization_id = p_organization_id and p.status = 'active' and p.visibility = 'private'
  order by p.created_at limit 1;

  return jsonb_build_object(
    'organization_name', org.name,
    'billing_profile', exists (select 1 from public.organization_billing_profiles b where b.organization_id = p_organization_id),
    'team_invited', (select count(*) from public.organization_members m where m.organization_id = p_organization_id and m.status = 'active') > 1
      or exists (select 1 from public.organization_invitations i where i.organization_id = p_organization_id and i.revoked_at is null),
    'admins_mfa', not exists (
      select 1 from public.organization_members m where m.organization_id = p_organization_id and m.status = 'active' and m.role in ('owner', 'security_admin')
        and not exists (select 1 from public.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')),
    'jira_connected', exists (select 1 from public.jira_connections j where j.organization_id = p_organization_id),
    'program_created', exists (select 1 from public.programs p where p.organization_id = p_organization_id),
    'scope_added', exists (select 1 from public.program_scope_entries s where s.organization_id = p_organization_id and s.removed_at is null),
    'policy_published', exists (select 1 from public.program_policy_versions v where v.organization_id = p_organization_id),
    'bounty_table', exists (select 1 from public.program_bounty_policy_versions b join public.programs p on p.id = b.program_id where p.organization_id = p_organization_id)
      or not exists (select 1 from public.programs p where p.organization_id = p_organization_id and p.program_type = 'bounty'),
    'funded', exists (select 1 from public.organization_deposits d where d.organization_id = p_organization_id and d.status = 'confirmed'),
    'submitted', exists (select 1 from public.programs p where p.organization_id = p_organization_id and p.status <> 'draft'),
    'in_review', exists (select 1 from public.programs p where p.organization_id = p_organization_id and p.status = 'review'),
    'launched', exists (select 1 from public.programs p where p.organization_id = p_organization_id and p.status in ('active', 'paused', 'closed')),
    'researchers_joined', exists (select 1 from public.program_researchers pr join public.programs p on p.id = pr.program_id where p.organization_id = p_organization_id),
    'public', exists (select 1 from public.programs p where p.organization_id = p_organization_id and p.status = 'active' and p.visibility = 'public'),
    'pilot_program_id', pilot.id,
    'pilot_program_name', pilot.name,
    'pilot_researchers', coalesce(pilot.researchers, 0),
    'pilot_valid_reports', coalesce(pilot.valid_reports, 0),
    'pilot_days', coalesce(extract(day from now() - pilot.launched_at)::integer, 0),
    'first_program_id', (select p.id from public.programs p where p.organization_id = p_organization_id order by p.created_at limit 1)
  );
end;
$$;
revoke all on function public.get_organization_onboarding(uuid) from public, anon;
grant execute on function public.get_organization_onboarding(uuid) to authenticated;

-- Launch review (platform admins): every program waiting for review with the checks Unpatched
-- makes before approving, and how long it has waited against the 2-business-day target.
create or replace function public.list_program_launch_readiness()
returns table (program_id uuid, program_name text, organization_id uuid, organization_name text, program_type text, submitted_at timestamptz,
  business_days_waiting integer, scope_entries integer, policy_published boolean, response_targets boolean, bounty_table boolean, funded boolean,
  billing_profile boolean, admins_mfa boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select p.id, p.name, o.id, o.name, p.program_type::text, s.at,
    (select count(*)::integer from generate_series(s.at::date + 1, current_date, interval '1 day') d where extract(isodow from d) < 6),
    (select count(*)::integer from public.program_scope_entries e where e.program_id = p.id and e.removed_at is null and e.scope_state = 'in_scope'),
    exists (select 1 from public.program_policy_versions v where v.program_id = p.id and v.superseded_at is null),
    exists (select 1 from public.program_policy_versions v where v.program_id = p.id and v.superseded_at is null and v.first_response_target_hours is not null and v.triage_target_hours is not null),
    p.program_type::text = 'vdp' or exists (select 1 from public.program_bounty_policy_versions b where b.program_id = p.id),
    p.program_type::text = 'vdp' or exists (select 1 from private.organization_balance(o.id) b where b.available > 0),
    exists (select 1 from public.organization_billing_profiles b where b.organization_id = o.id),
    not exists (
      select 1 from public.organization_members m where m.organization_id = o.id and m.status = 'active' and m.role in ('owner', 'security_admin')
        and not exists (select 1 from public.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'))
  from public.programs p
  join public.organizations o on o.id = p.organization_id
  left join lateral (select max(l.created_at) as at from public.audit_logs l where l.entity_id = p.id and l.action = 'program.submitted_for_review') s on true
  where p.status = 'review'
  order by s.at nulls last;
end;
$$;
revoke all on function public.list_program_launch_readiness() from public, anon;
grant execute on function public.list_program_launch_readiness() to authenticated;

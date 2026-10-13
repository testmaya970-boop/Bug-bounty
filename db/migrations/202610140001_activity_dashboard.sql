-- Organization Activity as an audit dashboard (2026-10-14): Notifications is a person's
-- inbox; Activity is the organization's audit trail, so it now leads with analytics --
-- volume, who acts, what kind of actions, and how many were sensitive -- above the log.
-- Same readers as the audit log itself (owner / security_admin).

create or replace function private.activity_category(p_action text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_action like 'report.%' or p_action like 'report_disclosure.%' then 'reports'
    when p_action like 'program.%' or p_action like 'scope.%' then 'programs'
    when p_action like 'member.%' or p_action like 'organization.%' or p_action like 'researcher.%' then 'team'
    when p_action like 'bounty.%' or p_action like 'payment.%' or p_action like 'payout.%' then 'money'
    else 'other'
  end;
$$;

-- Actions an auditor looks at first: access, money, and what researchers may test.
create or replace function private.activity_is_sensitive(p_action text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_action in (
    'member.role_changed', 'member.removed', 'member.suspended', 'member.invited',
    'bounty.finalized', 'bounty.adjusted', 'payment.initiated', 'payment.succeeded', 'payment.cancelled',
    'program.visibility_changed', 'program.closed', 'program.paused', 'program.access_instructions_updated',
    'program.kyc_requirement_set', 'program.bounty_policy_created'
  ) or p_action like 'scope.%' or p_action like 'jira.%';
$$;

create or replace function public.get_organization_activity_dashboard(target_organization_id uuid, p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  since timestamptz := private.dashboard_since(p_days);
  span interval := now() - private.dashboard_since(p_days);
  result jsonb;
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[]);

  with events as (
    select a.* from public.audit_logs a
    where a.organization_id = target_organization_id and a.created_at >= since - span
  ),
  kpi as (
    select w.label,
      count(*) filter (where e.created_at >= w.lo and e.created_at < w.hi) as actions,
      count(distinct e.actor_id) filter (where e.created_at >= w.lo and e.created_at < w.hi) as people,
      count(*) filter (where e.created_at >= w.lo and e.created_at < w.hi and private.activity_is_sensitive(e.action)) as sensitive
    from (values ('current', since, now() + interval '1 second'), ('previous', since - span, since)) as w(label, lo, hi)
    cross join events e
    group by w.label
  ),
  weeks as (
    select generate_series(date_trunc('week', since), date_trunc('week', now()), interval '1 week') as week
  ),
  weekly as (
    select wk.week,
      count(e.id) filter (where private.activity_category(e.action) = 'reports') as reports,
      count(e.id) filter (where private.activity_category(e.action) = 'programs') as programs,
      count(e.id) filter (where private.activity_category(e.action) = 'team') as team,
      count(e.id) filter (where private.activity_category(e.action) = 'money') as money,
      count(e.id) filter (where private.activity_category(e.action) = 'other') as other
    from weeks wk
    left join events e on e.created_at >= since and date_trunc('week', e.created_at) = wk.week
    group by wk.week
  ),
  top_actions as (
    select e.action, count(*) as n, bool_or(private.activity_is_sensitive(e.action)) as sensitive
    from events e where e.created_at >= since
    group by e.action order by n desc limit 8
  ),
  top_people as (
    select e.actor_id,
      case when u.id is null then 'System' when u.deactivated_at is not null then 'Deactivated account' else u.display_name end as name,
      exists (select 1 from public.organization_members m where m.organization_id = target_organization_id and m.user_id = e.actor_id) as is_member,
      count(*) as n
    from events e left join public.users u on u.id = e.actor_id
    where e.created_at >= since
    group by e.actor_id, u.id, u.display_name, u.deactivated_at
    order by n desc limit 8
  )
  select jsonb_build_object(
    'since', since,
    'kpis', (select jsonb_object_agg(k.label, jsonb_build_object('actions', k.actions, 'people', k.people, 'sensitive', k.sensitive)) from kpi k),
    'weekly', (select jsonb_agg(jsonb_build_object('week', w.week, 'reports', w.reports, 'programs', w.programs, 'team', w.team, 'money', w.money, 'other', w.other) order by w.week) from weekly w),
    'top_actions', coalesce((select jsonb_agg(jsonb_build_object('action', t.action, 'count', t.n, 'sensitive', t.sensitive)) from top_actions t), '[]'::jsonb),
    'top_people', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'is_member', p.is_member, 'count', p.n)) from top_people p), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_organization_activity_dashboard(uuid, integer) from public;
grant execute on function public.get_organization_activity_dashboard(uuid, integer) to authenticated;

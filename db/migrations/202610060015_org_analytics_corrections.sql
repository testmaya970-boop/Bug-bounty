-- Organization analytics corrections, competitive-parity group 8.
--
-- 1. Authorization regression fix. 202610060008 recreated get_organization_bounty_spend_summary
--    with the old "any active member" check, silently undoing 202610060004's role scoping;
--    202610060009's get_organization_sla_summary used the same check. Both now use
--    private.authorize_organization_read like the other org analytics:
--      spend summary -> owner, security_admin, billing_admin
--      SLA summary   -> owner, security_admin
-- 2. Spend summary joins awarded and paid amounts per currency in both directions, so a
--    currency with payments but no finalized award in the period is no longer dropped.
-- 3. get_organization_top_researchers: the organization's researcher performance -- valid
--    (resolved) reports, high/critical among them, invalid outcomes, signal share and the
--    amount awarded and actually paid -- owner and security_admin only.

create or replace function public.get_organization_bounty_spend_summary(target_organization_id uuid)
returns table (
  currency text,
  total_awarded_minor_units numeric,
  total_paid_minor_units numeric,
  total_outstanding_minor_units numeric,
  award_count bigint,
  paid_critical_count bigint,
  paid_high_count bigint,
  paid_medium_count bigint,
  paid_low_count bigint,
  paid_none_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]);

  -- paid_<severity>_count keeps its historical meaning (finalized awards by severity).
  return query
  with obligations as (
    select o.currency,
      sum(o.amount_minor_units) filter (where o.status = 'succeeded') as paid,
      sum(o.amount_minor_units) filter (where o.status in ('pending', 'processing', 'failed')) as outstanding
    from public.payment_obligations o
    where o.organization_id = target_organization_id
    group by o.currency
  ),
  awards as (
    select d.currency,
      sum(d.final_amount_minor_units) as awarded,
      count(*) as n,
      count(*) filter (where d.severity_at_calculation = 'critical') as critical,
      count(*) filter (where d.severity_at_calculation = 'high') as high,
      count(*) filter (where d.severity_at_calculation = 'medium') as medium,
      count(*) filter (where d.severity_at_calculation = 'low') as low,
      count(*) filter (where d.severity_at_calculation = 'none') as none
    from public.report_bounty_decisions d
    where d.organization_id = target_organization_id and d.state = 'finalized'
    group by d.currency
  )
  select coalesce(a.currency, o.currency), coalesce(a.awarded, 0), coalesce(o.paid, 0), coalesce(o.outstanding, 0),
    coalesce(a.n, 0), coalesce(a.critical, 0), coalesce(a.high, 0), coalesce(a.medium, 0), coalesce(a.low, 0), coalesce(a.none, 0)
  from awards a
  full outer join obligations o on o.currency = a.currency
  order by coalesce(a.awarded, 0) desc, coalesce(a.currency, o.currency);
end;
$$;

-- Same body as 202610060009, role-scoped.
create or replace function public.get_organization_sla_summary(target_organization_id uuid)
returns table (
  program_id uuid,
  report_count bigint,
  first_response_tracked bigint,
  first_response_breached bigint,
  triage_tracked bigint,
  triage_breached bigint,
  resolution_tracked bigint,
  resolution_breached bigint,
  median_first_response_hours numeric
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[]);

  return query
  select rp.program_id,
    count(*),
    count(s.first_response_breached),
    count(*) filter (where s.first_response_breached),
    count(s.triage_breached),
    count(*) filter (where s.triage_breached),
    count(s.resolution_breached),
    count(*) filter (where s.resolution_breached),
    round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_responded_at - s.submitted_at)) / 3600))::numeric, 1)
  from public.reports rp
  cross join lateral private.report_sla(rp.id) s
  where rp.organization_id = target_organization_id
  group by rp.program_id;
end;
$$;

create or replace function public.get_organization_top_researchers(target_organization_id uuid, p_limit integer default 10)
returns table (
  researcher_id uuid,
  display_name text,
  resolved_count bigint,
  high_or_critical_count bigint,
  invalid_count bigint,
  signal_percent integer,
  currency text,
  awarded_minor_units numeric,
  paid_minor_units numeric,
  last_submitted_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_read(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[]);

  return query
  with per_researcher as (
    select r.researcher_id,
      count(*) filter (where r.status = 'resolved') as resolved,
      count(*) filter (where r.status = 'resolved' and r.confirmed_severity in ('high', 'critical')) as severe,
      count(*) filter (where r.status in ('rejected', 'not_applicable')) as invalid,
      max(r.submitted_at) as last_submitted
    from public.reports r
    where r.organization_id = target_organization_id
    group by r.researcher_id
  ),
  money as (
    select o.researcher_id, o.currency,
      sum(o.amount_minor_units) filter (where o.status <> 'cancelled') as awarded,
      sum(o.amount_minor_units) filter (where o.status = 'succeeded') as paid
    from public.payment_obligations o
    where o.organization_id = target_organization_id
    group by o.researcher_id, o.currency
  )
  select p.researcher_id, u.display_name, p.resolved, p.severe, p.invalid,
    case when p.resolved + p.invalid > 0 then ((100 * p.resolved) / (p.resolved + p.invalid))::integer end,
    m.currency, coalesce(m.awarded, 0), coalesce(m.paid, 0), p.last_submitted
  from per_researcher p
  join public.users u on u.id = p.researcher_id
  left join lateral (select * from money where money.researcher_id = p.researcher_id order by money.awarded desc nulls last limit 1) m on true
  where p.resolved > 0
  order by p.resolved desc, p.severe desc, p.last_submitted desc, p.researcher_id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

revoke all on function public.get_organization_top_researchers(uuid, integer) from public, anon;
grant execute on function public.get_organization_top_researchers(uuid, integer) to authenticated;

-- Organization bounty spend analytics -- closes the one real gap left in the org
-- Analytics page after 202609050004 (report volume/severity/resolution-performance) and
-- 202609050015 (per-program health): an organization currently has no aggregate view of
-- what it has actually PAID researchers. report_bounty_decisions already carries every
-- real finalized payout (final_amount_minor_units, currency, finalized_at) -- this adds
-- three focused, real-from-day-one RPCs over that existing table, matching
-- 202609050004's own "one RPC per real question" pattern, never a single denormalized
-- mega-query.
--
-- Every RPC here groups by currency and NEVER sums across currencies -- program_bounty_
-- policy_versions.currency is a free-text ^[A-Z]{3}$ code, not drawn from a fixed list
-- (202608280002), so two programs in the same organization can genuinely use different
-- currencies. Summing $50,000 and €50,000 into one number would silently fabricate a
-- meaningless total; every row here is scoped to one currency, and the UI renders one
-- block per currency rather than a single blended figure.
--
-- Only `state = 'finalized'` rows count as real spend -- 'calculated' is a recommendation
-- range, not money owed or paid, and 'ineligible' has no amount at all (see the table's
-- own shape_check constraint in 202608280002).

-- ---------------------------------------------------------------------------
-- get_organization_bounty_spend_summary: total finalized spend + payout count + severity
-- breakdown, one row per currency actually used. Reuses authorize_organization_analytics_
-- read (202609050004) verbatim -- same read gate as every other analytics RPC, any active
-- organization member.
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_bounty_spend_summary(target_organization_id uuid)
returns table (
  currency text,
  total_paid_minor_units numeric,
  payout_count bigint,
  paid_critical_count bigint,
  paid_high_count bigint,
  paid_medium_count bigint,
  paid_low_count bigint,
  paid_none_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  select
    d.currency,
    sum(d.final_amount_minor_units),
    count(*),
    count(*) filter (where d.severity_at_calculation = 'critical'),
    count(*) filter (where d.severity_at_calculation = 'high'),
    count(*) filter (where d.severity_at_calculation = 'medium'),
    count(*) filter (where d.severity_at_calculation = 'low'),
    count(*) filter (where d.severity_at_calculation = 'none')
  from public.report_bounty_decisions d
  where d.organization_id = target_organization_id and d.state = 'finalized'
  group by d.currency
  order by sum(d.final_amount_minor_units) desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_organization_weekly_bounty_spend: trailing 12 weeks, one row per (week, currency)
-- pair with real activity -- mirrors get_organization_weekly_report_volume's own "always
-- the trailing 12 weeks" shape, but only emits a zero-row week for a currency that has
-- paid out at least once in the window (a currency with zero payouts across all 12 weeks
-- has nothing to chart and would just be an empty series). Keyed by finalized_at (when the
-- payout actually happened), never created_at/calculated_at.
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_weekly_bounty_spend(target_organization_id uuid)
returns table (week_start date, currency text, paid_minor_units numeric, payout_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  with active_currencies as (
    select distinct d.currency
    from public.report_bounty_decisions d
    where d.organization_id = target_organization_id and d.state = 'finalized' and d.finalized_at >= now() - interval '12 weeks'
  ),
  weeks as (
    select (date_trunc('week', now()) - (n * interval '7 days'))::date as week_start
    from generate_series(0, 11) as n
  ),
  grid as (
    select w.week_start, c.currency from weeks w cross join active_currencies c
  ),
  paid as (
    select date_trunc('week', d.finalized_at)::date as week_start, d.currency, sum(d.final_amount_minor_units) as amount, count(*) as cnt
    from public.report_bounty_decisions d
    where d.organization_id = target_organization_id and d.state = 'finalized' and d.finalized_at >= now() - interval '12 weeks'
    group by 1, 2
  )
  select g.week_start, g.currency, coalesce(p.amount, 0), coalesce(p.cnt, 0)
  from grid g
  left join paid p on p.week_start = g.week_start and p.currency = g.currency
  order by g.currency, g.week_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_organization_program_bounty_spend: per-program totals, for the Analytics page's
-- existing "which program needs attention" comparison table. One row per (program,
-- currency) that has at least one finalized payout -- a program with zero finalized
-- payouts is simply absent, never a fabricated zero row (matches every other analytics
-- RPC's "absence is null/missing, never a fabricated placeholder" convention).
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_program_bounty_spend(target_organization_id uuid)
returns table (program_id uuid, currency text, total_paid_minor_units numeric, payout_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  return query
  select d.program_id, d.currency, sum(d.final_amount_minor_units), count(*)
  from public.report_bounty_decisions d
  where d.organization_id = target_organization_id and d.state = 'finalized'
  group by d.program_id, d.currency;
end;
$$;

revoke all on function public.get_organization_bounty_spend_summary(uuid) from public;
revoke all on function public.get_organization_weekly_bounty_spend(uuid) from public;
revoke all on function public.get_organization_program_bounty_spend(uuid) from public;

grant execute on function public.get_organization_bounty_spend_summary(uuid) to authenticated;
grant execute on function public.get_organization_weekly_bounty_spend(uuid) to authenticated;
grant execute on function public.get_organization_program_bounty_spend(uuid) to authenticated;

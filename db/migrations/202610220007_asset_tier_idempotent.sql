-- 202610220006 scaled the incoming range by the tier percentage. calculate_bounty_recommendation
-- writes with INSERT ... ON CONFLICT DO UPDATE, so the BEFORE INSERT trigger scaled the proposed
-- row and the BEFORE UPDATE trigger then scaled those already-scaled values again (50% became
-- 25%). The range is now recomputed from the policy's own severity range every time: idempotent
-- however many triggers fire.
create or replace function private.report_bounty_decisions_apply_asset_tier()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t smallint;
  pct smallint;
  base public.program_bounty_policy_severity_ranges;
begin
  if new.state <> 'calculated' or new.policy_version_id is null or new.severity_at_calculation is null then
    if new.state <> 'finalized' then new.asset_tier := null; new.tier_percent := null; end if;
    return new;
  end if;
  select coalesce(a.tier, 1),
         case coalesce(a.tier, 1) when 2 then p.bounty_tier2_percent when 3 then p.bounty_tier3_percent else 100 end
    into t, pct
  from public.reports r
  join public.programs p on p.id = r.program_id
  left join public.assets a on a.id = r.asset_id
  where r.id = new.report_id;
  select * into base from public.program_bounty_policy_severity_ranges
  where policy_version_id = new.policy_version_id and severity = new.severity_at_calculation;
  new.asset_tier := coalesce(t, 1);
  new.tier_percent := coalesce(pct, 100);
  if base.policy_version_id is not null then
    new.calculated_min_amount_minor_units := round(base.min_amount_minor_units * new.tier_percent / 100.0);
    new.calculated_max_amount_minor_units := round(base.max_amount_minor_units * new.tier_percent / 100.0);
  end if;
  return new;
end;
$$;

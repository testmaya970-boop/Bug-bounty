-- Severity and bounty (Big Four axis "Severity & bounty calc"):
--
-- 1. CVSS 4.0 alongside 3.1. The vector is validated here; the score is computed on the server
--    with ae-cvss-calculator (FIRST's v4.0 lookup tables are too large to hand-port reliably)
--    and stored with it. Locked with the rest of the severity once the bounty is finalized.
-- 2. Asset tiers. Each asset is tier 1 (most critical), 2 or 3; a program pays tier-2 and
--    tier-3 assets a percentage of its bounty table. Applied by a trigger when a bounty is
--    calculated (no copy of calculate_bounty_recommendation), recorded on the decision.
--    Defaults (tier 1, 100%) keep every existing program's behaviour unchanged.

-- 1. CVSS 4.0 ---------------------------------------------------------------------------------
alter table public.reports
  add column if not exists cvss4_vector text check (cvss4_vector is null or cvss4_vector ~ '^CVSS:4\.0/AV:[NALP]/AC:[LH]/AT:[NP]/PR:[NLH]/UI:[NPA]/VC:[HLN]/VI:[HLN]/VA:[HLN]/SC:[HLN]/SI:[HLN]/SA:[HLN]$'),
  add column if not exists cvss4_score numeric(3, 1) check (cvss4_score is null or cvss4_score between 0 and 10),
  add constraint reports_cvss4_pair check ((cvss4_vector is null) = (cvss4_score is null));

create or replace function public.set_report_cvss4(target_report_id uuid, p_vector text, p_score numeric)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);
  if not exists (select 1 from private.report_status_transitions t where t.from_status = report.status) then
    raise exception 'SEVERITY_LOCKED: this report has reached a final decision and its severity can no longer be changed' using errcode = '23514';
  end if;
  update public.reports set cvss4_vector = p_vector, cvss4_score = p_score, updated_at = now()
  where id = report.id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.cvss4_set', 'report', report.id, jsonb_build_object('vector', p_vector, 'score', p_score));
  return updated;
end;
$$;
revoke all on function public.set_report_cvss4(uuid, text, numeric) from public, anon;
grant execute on function public.set_report_cvss4(uuid, text, numeric) to authenticated;

-- The 202610210003 lock, now covering the CVSS 4.0 columns too.
create or replace function private.reports_lock_severity_after_bounty()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.confirmed_severity, new.cvss_attack_vector, new.cvss_attack_complexity, new.cvss_privileges_required, new.cvss_user_interaction,
      new.cvss_scope, new.cvss_confidentiality_impact, new.cvss_integrity_impact, new.cvss_availability_impact, new.cvss4_vector)
     is distinct from
     (old.confirmed_severity, old.cvss_attack_vector, old.cvss_attack_complexity, old.cvss_privileges_required, old.cvss_user_interaction,
      old.cvss_scope, old.cvss_confidentiality_impact, old.cvss_integrity_impact, old.cvss_availability_impact, old.cvss4_vector)
     and exists (select 1 from public.report_bounty_decisions d where d.report_id = new.id and d.state = 'finalized') then
    raise exception 'SEVERITY_LOCKED: the bounty for this report is finalized, so its severity can no longer be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists reports_lock_severity_after_bounty on public.reports;
create trigger reports_lock_severity_after_bounty before update of confirmed_severity, cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required,
  cvss_user_interaction, cvss_scope, cvss_confidentiality_impact, cvss_integrity_impact, cvss_availability_impact, cvss4_vector on public.reports
  for each row execute function private.reports_lock_severity_after_bounty();

-- 2. Asset tiers ------------------------------------------------------------------------------
alter table public.assets add column if not exists tier smallint not null default 1 check (tier between 1 and 3);
alter table public.programs
  add column if not exists bounty_tier2_percent smallint not null default 100 check (bounty_tier2_percent between 1 and 100),
  add column if not exists bounty_tier3_percent smallint not null default 100 check (bounty_tier3_percent between 1 and 100);
alter table public.report_bounty_decisions
  add column if not exists asset_tier smallint check (asset_tier between 1 and 3),
  add column if not exists tier_percent smallint check (tier_percent between 1 and 100);

create or replace function private.report_bounty_decisions_apply_asset_tier()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t smallint;
  pct smallint;
begin
  if new.state <> 'calculated' or new.calculated_min_amount_minor_units is null then
    if new.state <> 'finalized' then new.asset_tier := null; new.tier_percent := null; end if;
    return new;
  end if;
  -- Only when the range was (re)calculated, so finalizing keeps the recorded tier.
  if tg_op = 'UPDATE' and old.state = 'calculated'
     and (new.calculated_min_amount_minor_units, new.calculated_max_amount_minor_units) is not distinct from (old.calculated_min_amount_minor_units, old.calculated_max_amount_minor_units) then
    return new;
  end if;
  select coalesce(a.tier, 1),
         case coalesce(a.tier, 1) when 2 then p.bounty_tier2_percent when 3 then p.bounty_tier3_percent else 100 end
    into t, pct
  from public.reports r
  join public.programs p on p.id = r.program_id
  left join public.assets a on a.id = r.asset_id
  where r.id = new.report_id;
  new.asset_tier := coalesce(t, 1);
  new.tier_percent := coalesce(pct, 100);
  if new.tier_percent < 100 then
    new.calculated_min_amount_minor_units := round(new.calculated_min_amount_minor_units * new.tier_percent / 100.0);
    new.calculated_max_amount_minor_units := round(new.calculated_max_amount_minor_units * new.tier_percent / 100.0);
  end if;
  return new;
end;
$$;
revoke all on function private.report_bounty_decisions_apply_asset_tier() from public, anon;
grant execute on function private.report_bounty_decisions_apply_asset_tier() to service_role;
create trigger report_bounty_decisions_apply_asset_tier before insert or update on public.report_bounty_decisions
  for each row execute function private.report_bounty_decisions_apply_asset_tier();

create or replace function public.set_asset_tier(target_asset_id uuid, p_tier smallint)
returns public.assets
language plpgsql security definer set search_path = ''
as $$
declare
  asset public.assets;
  updated public.assets;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into asset from public.assets where id = target_asset_id for update;
  if asset.id is null then raise exception 'NOT_FOUND: asset not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(asset.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can set asset tiers' using errcode = '42501';
  end if;
  if p_tier not between 1 and 3 then raise exception 'INVALID_TIER: choose tier 1, 2 or 3' using errcode = '22023'; end if;
  update public.assets set tier = p_tier where id = asset.id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), asset.organization_id, 'asset.tier_set', 'asset', asset.id, jsonb_build_object('tier', p_tier, 'previous', asset.tier));
  return updated;
end;
$$;
revoke all on function public.set_asset_tier(uuid, smallint) from public, anon;
grant execute on function public.set_asset_tier(uuid, smallint) to authenticated;

create or replace function public.set_program_bounty_tiers(target_program_id uuid, p_tier2_percent smallint, p_tier3_percent smallint)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  program public.programs;
  updated public.programs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into program from public.programs where id = target_program_id for update;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  if not (private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(target_program_id)) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;
  if p_tier2_percent not between 1 and 100 or p_tier3_percent not between 1 and 100 then
    raise exception 'INVALID_PERCENT: choose between 1 and 100 percent' using errcode = '22023';
  end if;
  if p_tier3_percent > p_tier2_percent then
    raise exception 'INVALID_PERCENT: tier 3 assets can''t pay more than tier 2 assets' using errcode = '22023';
  end if;
  update public.programs set bounty_tier2_percent = p_tier2_percent, bounty_tier3_percent = p_tier3_percent, updated_at = now()
  where id = program.id returning * into updated;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), program.organization_id, 'program.bounty_tiers_set', 'program', program.id, jsonb_build_object('tier2', p_tier2_percent, 'tier3', p_tier3_percent));
  return updated;
end;
$$;
revoke all on function public.set_program_bounty_tiers(uuid, smallint, smallint) from public, anon;
grant execute on function public.set_program_bounty_tiers(uuid, smallint, smallint) to authenticated;

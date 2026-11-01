-- Reward groups (docs/decisions/0092) replace asset tiers (202610220006-0008).
--
-- Tiers were three fixed numbers with no business meaning, and a lower tier only paid a
-- percentage of each program's table. A reward group is a named, organization-level category
-- of assets ("Core Platform", "Payments", "Public Website"), as many as the organization wants,
-- each with its OWN full bounty table (no multipliers). Every asset belongs to exactly one group.
--
-- Calculating a bounty is unchanged except for where the range comes from: when the report's
-- asset is in a group whose table has the severity, that range and currency are used; otherwise
-- the program's own bounty table applies, as before. The decision records which group set it.
--
-- Migration: Tier 1 -> "Core Platform" (the default group), Tier 2 -> "High Value Systems",
-- Tier 3 -> "Standard Assets". Their tables are built from the organization's current program
-- bounty table and that program's tier percentages, so no amount is lost. Then every tier column
-- and function is removed.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.reward_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  color text not null default 'slate' check (color in ('slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink')),
  icon text not null default 'shield' check (icon in ('shield', 'server', 'key', 'globe', 'device-mobile', 'credit-card', 'bank', 'cpu', 'code', 'archive', 'heartbeat', 'buildings', 'storefront', 'robot', 'lock', 'database')),
  currency text not null default 'USD' check (currency in ('INR', 'USD')),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_default and archived_at is not null))
);
create unique index reward_groups_name_per_org on public.reward_groups (organization_id, lower(trim(name))) where archived_at is null;
create unique index reward_groups_one_default on public.reward_groups (organization_id) where is_default;
create index reward_groups_org_order on public.reward_groups (organization_id, sort_order);

create table public.reward_group_bounties (
  reward_group_id uuid not null references public.reward_groups (id) on delete cascade,
  severity public.report_severity not null,
  min_amount_minor_units bigint not null check (min_amount_minor_units >= 0),
  max_amount_minor_units bigint not null check (max_amount_minor_units <= 1000000000),
  primary key (reward_group_id, severity),
  check (max_amount_minor_units >= min_amount_minor_units)
);

alter table public.assets add column reward_group_id uuid references public.reward_groups (id) on delete set null;
create index assets_reward_group_idx on public.assets (reward_group_id);
alter table public.report_bounty_decisions
  add column reward_group_id uuid references public.reward_groups (id) on delete set null,
  add column reward_group_name text;

alter table public.reward_groups enable row level security;
alter table public.reward_group_bounties enable row level security;
-- Every active member except billing admins reads them (they set what reports pay).
create policy "reward groups readable by organization staff" on public.reward_groups for select to authenticated
  using (exists (select 1 from public.organization_members m where m.organization_id = reward_groups.organization_id and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'billing_admin'));
create policy "reward group bounties readable by organization staff" on public.reward_group_bounties for select to authenticated
  using (exists (select 1 from public.reward_groups g join public.organization_members m on m.organization_id = g.organization_id
                 where g.id = reward_group_bounties.reward_group_id and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'billing_admin'));
revoke all on public.reward_groups, public.reward_group_bounties from public, anon, authenticated;
grant select on public.reward_groups, public.reward_group_bounties to authenticated;
grant select, insert, update, delete on public.reward_groups, public.reward_group_bounties to service_role;

-- ---------------------------------------------------------------------------
-- 2. Migrate tiers
-- ---------------------------------------------------------------------------

do $$
declare
  org record;
  pol public.program_bounty_policy_versions;
  pct2 smallint;
  pct3 smallint;
  g1 uuid; g2 uuid; g3 uuid;
begin
  for org in select distinct a.organization_id from public.assets a loop
    -- The organization's primary bounty table: the newest current policy, active programs first.
    select v.* into pol from public.program_bounty_policy_versions v join public.programs p on p.id = v.program_id
    where v.organization_id = org.organization_id and v.superseded_at is null
    order by (p.status = 'active') desc, v.created_at desc limit 1;
    select p.bounty_tier2_percent, p.bounty_tier3_percent into pct2, pct3 from public.programs p where p.id = pol.program_id;

    insert into public.reward_groups (organization_id, name, description, color, icon, currency, sort_order, is_default)
    values (org.organization_id, 'Core Platform', 'Your most critical, customer-facing systems.', 'red', 'server', coalesce(nullif(pol.currency, ''), 'USD'), 0, true)
    returning id into g1;
    insert into public.reward_groups (organization_id, name, description, color, icon, currency, sort_order)
    values (org.organization_id, 'High Value Systems', 'Important systems that are not the core platform.', 'amber', 'shield', coalesce(nullif(pol.currency, ''), 'USD'), 1)
    returning id into g2;
    insert into public.reward_groups (organization_id, name, description, color, icon, currency, sort_order)
    values (org.organization_id, 'Standard Assets', 'Everything else in scope.', 'slate', 'globe', coalesce(nullif(pol.currency, ''), 'USD'), 2)
    returning id into g3;

    if pol.id is not null and pol.currency in ('INR', 'USD') then
      insert into public.reward_group_bounties (reward_group_id, severity, min_amount_minor_units, max_amount_minor_units)
      select x.gid, r.severity, round(r.min_amount_minor_units * x.pct / 100.0), round(r.max_amount_minor_units * x.pct / 100.0)
      from public.program_bounty_policy_severity_ranges r
      cross join (values (g1, 100), (g2, coalesce(pct2, 100)), (g3, coalesce(pct3, 100))) as x(gid, pct)
      where r.policy_version_id = pol.id;
    end if;

    update public.assets set reward_group_id = case tier when 2 then g2 when 3 then g3 else g1 end
    where organization_id = org.organization_id;
  end loop;
end $$;

-- Decisions keep the group's name for the record; tier columns go.
update public.report_bounty_decisions d set reward_group_name = case d.asset_tier when 2 then 'High Value Systems' when 3 then 'Standard Assets' else null end
where d.asset_tier in (2, 3);

drop trigger report_bounty_decisions_apply_asset_tier on public.report_bounty_decisions;
drop function private.report_bounty_decisions_apply_asset_tier();
drop function public.set_asset_tier(uuid, smallint);
drop function public.set_program_bounty_tiers(uuid, smallint, smallint);
drop function public.list_asset_tiers(uuid);
alter table public.report_bounty_decisions drop column asset_tier, drop column tier_percent;
alter table public.assets drop column tier;
alter table public.programs drop column bounty_tier2_percent, drop column bounty_tier3_percent;

-- ---------------------------------------------------------------------------
-- 3. Every asset has a group: new assets join the default group
-- ---------------------------------------------------------------------------

create or replace function private.assets_reward_group()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.reward_group_id is null then
    select g.id into new.reward_group_id from public.reward_groups g where g.organization_id = new.organization_id and g.is_default;
  elsif not exists (select 1 from public.reward_groups g where g.id = new.reward_group_id and g.organization_id = new.organization_id and g.archived_at is null) then
    raise exception 'INVALID_REWARD_GROUP: choose an active reward group of this organization' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.assets_reward_group() from public, anon, authenticated;
create trigger assets_reward_group before insert or update of reward_group_id on public.assets
  for each row execute function private.assets_reward_group();

-- ---------------------------------------------------------------------------
-- 4. Bounty calculation reads the asset's group
-- ---------------------------------------------------------------------------

create or replace function private.report_bounty_decisions_apply_reward_group()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  grp public.reward_groups;
  rng public.reward_group_bounties;
begin
  if new.state <> 'calculated' or new.policy_version_id is null or new.severity_at_calculation is null then
    if new.state <> 'finalized' then new.reward_group_id := null; new.reward_group_name := null; end if;
    return new;
  end if;
  select g.* into grp from public.reports r join public.assets a on a.id = r.asset_id join public.reward_groups g on g.id = a.reward_group_id
  where r.id = new.report_id;
  new.reward_group_id := null;
  new.reward_group_name := null;
  if grp.id is null then return new; end if;
  select * into rng from public.reward_group_bounties b where b.reward_group_id = grp.id and b.severity = new.severity_at_calculation;
  if rng.reward_group_id is null then return new; end if; -- no row for this severity: the program's table applies
  new.reward_group_id := grp.id;
  new.reward_group_name := grp.name;
  new.currency := grp.currency;
  new.calculated_min_amount_minor_units := rng.min_amount_minor_units;
  new.calculated_max_amount_minor_units := rng.max_amount_minor_units;
  return new;
end;
$$;
revoke all on function private.report_bounty_decisions_apply_reward_group() from public, anon, authenticated;
create trigger report_bounty_decisions_apply_reward_group before insert or update on public.report_bounty_decisions
  for each row execute function private.report_bounty_decisions_apply_reward_group();

-- ---------------------------------------------------------------------------
-- 5. Templates
-- ---------------------------------------------------------------------------

-- Per group: name, description, color, icon and a weight on the template's base table (only used
-- to fill in starting numbers; the tables are independent afterwards).
create or replace function private.reward_group_template(p_template text)
returns table (name text, description text, color text, icon text, weight numeric)
language sql immutable set search_path = ''
as $$
  select t.name, t.description, t.color, t.icon, t.weight from (values
    ('saas', 'Core Platform', 'Production customer-facing systems.', 'red', 'server', 1.0),
    ('saas', 'Authentication', 'Sign-in, sessions, SSO and account recovery.', 'violet', 'key', 1.4),
    ('saas', 'Mobile Apps', 'iOS and Android apps.', 'blue', 'device-mobile', 0.6),
    ('saas', 'Public Website', 'Marketing site, docs and blog.', 'teal', 'globe', 0.2),
    ('saas', 'Legacy', 'Older systems kept running.', 'slate', 'archive', 0.3),
    ('banking', 'Internet Banking', 'Retail online and mobile banking.', 'blue', 'bank', 1.0),
    ('banking', 'Payments', 'Transfers, UPI, NEFT, RTGS and wires.', 'green', 'credit-card', 1.2),
    ('banking', 'Cards', 'Card issuing, authorization and controls.', 'amber', 'credit-card', 1.0),
    ('banking', 'ATM', 'ATM network and switch.', 'slate', 'lock', 0.8),
    ('banking', 'Corporate Banking', 'Business accounts, cash management and trade.', 'violet', 'buildings', 1.0),
    ('ai', 'AI APIs', 'Public model APIs and SDKs.', 'violet', 'code', 1.0),
    ('ai', 'Inference', 'Serving infrastructure and model hosting.', 'blue', 'cpu', 1.0),
    ('ai', 'Models', 'Model weights, training data and safety controls.', 'red', 'robot', 1.4),
    ('ai', 'Playground', 'Web playground and demos.', 'teal', 'globe', 0.3),
    ('ai', 'Developer Platform', 'Console, keys, billing and usage.', 'amber', 'database', 0.6),
    ('ecommerce', 'Checkout & Payments', 'Cart, checkout, payment and refunds.', 'green', 'credit-card', 1.4),
    ('ecommerce', 'Customer Accounts', 'Sign-in, profiles, addresses and orders.', 'violet', 'key', 1.0),
    ('ecommerce', 'Storefront', 'Catalog, search and product pages.', 'teal', 'storefront', 0.6),
    ('ecommerce', 'Seller Platform', 'Seller onboarding, listings and payouts.', 'amber', 'buildings', 0.8),
    ('ecommerce', 'Mobile Apps', 'iOS and Android shopping apps.', 'blue', 'device-mobile', 0.6),
    ('healthcare', 'Health Records', 'Electronic health records and patient data.', 'red', 'database', 1.4),
    ('healthcare', 'Patient Portal', 'Appointments, results and messaging for patients.', 'violet', 'heartbeat', 1.2),
    ('healthcare', 'Clinical Systems', 'Systems used by clinicians and labs.', 'blue', 'heartbeat', 1.2),
    ('healthcare', 'Telehealth', 'Video consultations and remote care.', 'teal', 'device-mobile', 0.8),
    ('healthcare', 'Public Website', 'Information and marketing site.', 'slate', 'globe', 0.2),
    ('government', 'Identity & Authentication', 'Citizen identity, sign-in and e-signatures.', 'violet', 'key', 1.4),
    ('government', 'Citizen Services', 'Applications, certificates and benefits.', 'blue', 'buildings', 1.0),
    ('government', 'Payments & Taxes', 'Fees, taxes and disbursements.', 'green', 'credit-card', 1.2),
    ('government', 'Internal Systems', 'Staff-facing case management and records.', 'amber', 'database', 0.8),
    ('government', 'Public Information', 'Public websites and open data.', 'slate', 'globe', 0.2)
  ) as t(template, name, description, color, icon, weight)
  where t.template = p_template;
$$;

-- Starting amounts for a weight: rounded to a sensible step, "from" at 60% of "up to".
create or replace function private.reward_template_amounts(p_currency text, p_weight numeric)
returns table (severity public.report_severity, min_amount_minor_units bigint, max_amount_minor_units bigint)
language sql immutable set search_path = ''
as $$
  with base(severity, inr, usd) as (values ('critical'::public.report_severity, 500000, 6000), ('high', 200000, 2500), ('medium', 75000, 900), ('low', 20000, 250), ('none', 0, 0)),
  rounded as (
    select severity,
      case when p_currency = 'INR' then round(inr * p_weight / 1000.0) * 1000 else round(usd * p_weight / 50.0) * 50 end as max_units,
      case when p_currency = 'INR' then 1000 else 50 end as step
    from base
  )
  select severity, (round(max_units * 0.6 / step) * step * 100)::bigint, (max_units * 100)::bigint from rounded;
$$;

-- ---------------------------------------------------------------------------
-- 6. Managing groups (owner or security admin)
-- ---------------------------------------------------------------------------

create or replace function private.authorize_reward_groups(p_organization_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can manage reward groups' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.authorize_reward_groups(uuid) from public, anon;
grant execute on function private.authorize_reward_groups(uuid) to authenticated, service_role;

-- [{"severity":"critical","min":50000000,"max":60000000}, ...] in minor units. Replaces the table.
create or replace function private.write_reward_group_bounties(p_group_id uuid, p_bounties jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb;
begin
  if p_bounties is null then return; end if;
  if jsonb_typeof(p_bounties) <> 'array' then raise exception 'INVALID_BOUNTIES: invalid bounty table' using errcode = '22023'; end if;
  delete from public.reward_group_bounties where reward_group_id = p_group_id;
  for item in select * from jsonb_array_elements(p_bounties) loop
    if (item ->> 'max') is null then continue; end if;
    if (item ->> 'min')::bigint < 0 or (item ->> 'max')::bigint < (item ->> 'min')::bigint or (item ->> 'max')::bigint > 1000000000 then
      raise exception 'INVALID_BOUNTIES: for %, "from" must be 0 or more and no more than "up to" (at most 10,000,000)', item ->> 'severity' using errcode = '22023';
    end if;
    insert into public.reward_group_bounties (reward_group_id, severity, min_amount_minor_units, max_amount_minor_units)
    values (p_group_id, (item ->> 'severity')::public.report_severity, coalesce((item ->> 'min')::bigint, 0), (item ->> 'max')::bigint);
  end loop;
end;
$$;
revoke all on function private.write_reward_group_bounties(uuid, jsonb) from public, anon, authenticated;

create or replace function public.create_reward_group(p_organization_id uuid, p_name text, p_description text, p_color text, p_icon text, p_currency text, p_bounties jsonb)
returns public.reward_groups
language plpgsql security definer set search_path = ''
as $$
declare
  result public.reward_groups;
begin
  perform private.authorize_reward_groups(p_organization_id);
  insert into public.reward_groups (organization_id, name, description, color, icon, currency, sort_order, is_default, created_by)
  values (p_organization_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_color, 'slate'), coalesce(p_icon, 'shield'), coalesce(p_currency, 'USD'),
    coalesce((select max(sort_order) + 1 from public.reward_groups where organization_id = p_organization_id), 0),
    not exists (select 1 from public.reward_groups where organization_id = p_organization_id and is_default), auth.uid())
  returning * into result;
  perform private.write_reward_group_bounties(result.id, p_bounties);
  -- The first group becomes the default, so every asset that had none joins it.
  if result.is_default then update public.assets set reward_group_id = result.id where organization_id = p_organization_id and reward_group_id is null; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'reward_group.created', 'reward_group', result.id, jsonb_build_object('name', result.name, 'bounties', p_bounties));
  return result;
exception when unique_violation then
  raise exception 'NAME_TAKEN: another reward group already has that name' using errcode = '23505';
end;
$$;

create or replace function public.update_reward_group(p_group_id uuid, p_name text, p_description text, p_color text, p_icon text, p_currency text, p_bounties jsonb)
returns public.reward_groups
language plpgsql security definer set search_path = ''
as $$
declare
  g public.reward_groups;
  before_bounties jsonb;
begin
  select * into g from public.reward_groups where id = p_group_id for update;
  if g.id is null then raise exception 'NOT_FOUND: reward group not found' using errcode = 'P0002'; end if;
  perform private.authorize_reward_groups(g.organization_id);
  select jsonb_agg(jsonb_build_object('severity', severity, 'min', min_amount_minor_units, 'max', max_amount_minor_units)) into before_bounties
  from public.reward_group_bounties where reward_group_id = g.id;
  update public.reward_groups set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''), color = coalesce(p_color, color),
    icon = coalesce(p_icon, icon), currency = coalesce(p_currency, currency), updated_at = now()
  where id = g.id returning * into g;
  perform private.write_reward_group_bounties(g.id, p_bounties);
  -- The previous table stays in the audit log: the group's version history.
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), g.organization_id, 'reward_group.updated', 'reward_group', g.id,
    jsonb_build_object('name', g.name, 'bounties', p_bounties, 'previous_bounties', before_bounties));
  return g;
exception when unique_violation then
  raise exception 'NAME_TAKEN: another reward group already has that name' using errcode = '23505';
end;
$$;

create or replace function public.duplicate_reward_group(p_group_id uuid)
returns public.reward_groups
language plpgsql security definer set search_path = ''
as $$
declare
  g public.reward_groups;
  copy_name text;
  n integer := 1;
  result public.reward_groups;
begin
  select * into g from public.reward_groups where id = p_group_id;
  if g.id is null then raise exception 'NOT_FOUND: reward group not found' using errcode = 'P0002'; end if;
  perform private.authorize_reward_groups(g.organization_id);
  copy_name := left(g.name, 70) || ' (copy)';
  while exists (select 1 from public.reward_groups x where x.organization_id = g.organization_id and x.archived_at is null and lower(x.name) = lower(copy_name)) loop
    n := n + 1;
    copy_name := left(g.name, 66) || ' (copy ' || n || ')';
  end loop;
  insert into public.reward_groups (organization_id, name, description, color, icon, currency, sort_order, created_by)
  values (g.organization_id, copy_name, g.description, g.color, g.icon, g.currency, g.sort_order, auth.uid())
  returning * into result;
  insert into public.reward_group_bounties (reward_group_id, severity, min_amount_minor_units, max_amount_minor_units)
  select result.id, severity, min_amount_minor_units, max_amount_minor_units from public.reward_group_bounties where reward_group_id = g.id;
  update public.reward_groups set sort_order = sort_order + 1 where organization_id = g.organization_id and sort_order > g.sort_order and id <> result.id;
  update public.reward_groups set sort_order = g.sort_order + 1 where id = result.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), g.organization_id, 'reward_group.duplicated', 'reward_group', result.id, jsonb_build_object('name', result.name, 'from', g.name));
  return result;
end;
$$;

create or replace function public.reorder_reward_groups(p_organization_id uuid, p_group_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.authorize_reward_groups(p_organization_id);
  update public.reward_groups g set sort_order = x.ord - 1, updated_at = now()
  from unnest(p_group_ids) with ordinality as x(id, ord)
  where g.id = x.id and g.organization_id = p_organization_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'reward_group.reordered', 'organization', p_organization_id, '{}'::jsonb);
end;
$$;

create or replace function public.set_default_reward_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.reward_groups;
begin
  select * into g from public.reward_groups where id = p_group_id for update;
  if g.id is null or g.archived_at is not null then raise exception 'NOT_FOUND: active reward group not found' using errcode = 'P0002'; end if;
  perform private.authorize_reward_groups(g.organization_id);
  update public.reward_groups set is_default = false where organization_id = g.organization_id and is_default and id <> g.id;
  update public.reward_groups set is_default = true, updated_at = now() where id = g.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), g.organization_id, 'reward_group.made_default', 'reward_group', g.id, jsonb_build_object('name', g.name));
end;
$$;

-- Archiving or deleting moves the group's assets to the default group; the default can't go.
create or replace function private.release_reward_group(g public.reward_groups)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  fallback uuid;
begin
  if g.is_default then
    raise exception 'DEFAULT_GROUP: make another group the default first; new and moved assets join the default group' using errcode = '23514';
  end if;
  select id into fallback from public.reward_groups where organization_id = g.organization_id and is_default;
  update public.assets set reward_group_id = fallback where reward_group_id = g.id;
end;
$$;
revoke all on function private.release_reward_group(public.reward_groups) from public, anon, authenticated;

create or replace function public.archive_reward_group(p_group_id uuid, p_archive boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.reward_groups;
begin
  select * into g from public.reward_groups where id = p_group_id for update;
  if g.id is null then raise exception 'NOT_FOUND: reward group not found' using errcode = 'P0002'; end if;
  perform private.authorize_reward_groups(g.organization_id);
  if p_archive then
    perform private.release_reward_group(g);
    update public.reward_groups set archived_at = now(), updated_at = now() where id = g.id;
  else
    begin
      update public.reward_groups set archived_at = null, updated_at = now() where id = g.id;
    exception when unique_violation then
      raise exception 'NAME_TAKEN: an active reward group already has this name; rename one first' using errcode = '23505';
    end;
  end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), g.organization_id, case when p_archive then 'reward_group.archived' else 'reward_group.restored' end, 'reward_group', g.id, jsonb_build_object('name', g.name));
end;
$$;

create or replace function public.delete_reward_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.reward_groups;
begin
  select * into g from public.reward_groups where id = p_group_id for update;
  if g.id is null then raise exception 'NOT_FOUND: reward group not found' using errcode = 'P0002'; end if;
  perform private.authorize_reward_groups(g.organization_id);
  perform private.release_reward_group(g);
  delete from public.reward_groups where id = g.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), g.organization_id, 'reward_group.deleted', 'organization', g.organization_id, jsonb_build_object('name', g.name));
end;
$$;

create or replace function public.apply_reward_group_template(p_organization_id uuid, p_template text, p_currency text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  created public.reward_groups;
  n integer := 0;
begin
  perform private.authorize_reward_groups(p_organization_id);
  if p_template not in ('saas', 'banking', 'ai', 'ecommerce', 'healthcare', 'government') then
    raise exception 'INVALID_TEMPLATE: choose a template' using errcode = '22023';
  end if;
  if p_currency not in ('INR', 'USD') then raise exception 'INVALID_CURRENCY: choose INR or USD' using errcode = '22023'; end if;
  for t in select * from private.reward_group_template(p_template) loop
    continue when exists (select 1 from public.reward_groups g where g.organization_id = p_organization_id and g.archived_at is null and lower(g.name) = lower(t.name));
    insert into public.reward_groups (organization_id, name, description, color, icon, currency, sort_order, is_default, created_by)
    values (p_organization_id, t.name, t.description, t.color, t.icon, p_currency,
      coalesce((select max(sort_order) + 1 from public.reward_groups where organization_id = p_organization_id), 0),
      not exists (select 1 from public.reward_groups where organization_id = p_organization_id and is_default), auth.uid())
    returning * into created;
    insert into public.reward_group_bounties (reward_group_id, severity, min_amount_minor_units, max_amount_minor_units)
    select created.id, a.severity, a.min_amount_minor_units, a.max_amount_minor_units from private.reward_template_amounts(p_currency, t.weight) a;
    if created.is_default then update public.assets set reward_group_id = created.id where organization_id = p_organization_id and reward_group_id is null; end if;
    n := n + 1;
  end loop;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'reward_group.template_applied', 'organization', p_organization_id, jsonb_build_object('template', p_template, 'currency', p_currency, 'groups_created', n));
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reading: groups with counts, asset assignment, and a report's suggested reward
-- ---------------------------------------------------------------------------

create or replace function public.list_reward_groups(p_organization_id uuid)
returns table (id uuid, name text, description text, color text, icon text, currency text, sort_order integer, is_default boolean, archived_at timestamptz,
  asset_count bigint, bounties jsonb, can_manage boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'billing_admin'
  ) or not private.actor_is_active() then
    raise exception 'FORBIDDEN: not a member of this organization' using errcode = '42501';
  end if;
  return query
  select g.id, g.name, g.description, g.color, g.icon, g.currency, g.sort_order, g.is_default, g.archived_at,
    (select count(*) from public.assets a where a.reward_group_id = g.id),
    coalesce((select jsonb_object_agg(b.severity::text, jsonb_build_object('min', b.min_amount_minor_units, 'max', b.max_amount_minor_units))
              from public.reward_group_bounties b where b.reward_group_id = g.id), '{}'::jsonb),
    private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[])
  from public.reward_groups g
  where g.organization_id = p_organization_id
  order by g.archived_at nulls first, g.sort_order, g.created_at;
end;
$$;

-- The inventory page's group per asset (replaces list_asset_tiers).
create or replace function public.list_asset_reward_groups(target_org_id uuid)
returns table (asset_id uuid, reward_group_id uuid, can_edit boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  can_edit boolean;
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m where m.organization_id = target_org_id and m.user_id = auth.uid() and m.status = 'active' and m.role <> 'billing_admin'
  ) or not private.actor_is_active() then
    raise exception 'FORBIDDEN: not a member of this organization' using errcode = '42501';
  end if;
  can_edit := private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]);
  return query select a.id, a.reward_group_id, can_edit from public.assets a where a.organization_id = target_org_id;
end;
$$;

create or replace function public.set_asset_reward_group(target_asset_id uuid, p_group_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  asset public.assets;
  previous_name text;
  next_name text;
begin
  select * into asset from public.assets where id = target_asset_id for update;
  if asset.id is null then raise exception 'NOT_FOUND: asset not found' using errcode = 'P0002'; end if;
  perform private.authorize_reward_groups(asset.organization_id);
  select name into previous_name from public.reward_groups where id = asset.reward_group_id;
  update public.assets set reward_group_id = p_group_id where id = asset.id;
  select name into next_name from public.reward_groups where id = p_group_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), asset.organization_id, 'asset.reward_group_set', 'asset', asset.id,
    jsonb_build_object('reward_group', next_name, 'previous', previous_name, 'asset', asset.display_identifier));
end;
$$;

-- What a report would pay: asset -> group -> severity -> range. For the triage team, before and
-- after acceptance; the real calculation uses the same rule.
create or replace function public.get_report_reward_suggestion(target_report_id uuid)
returns table (asset_label text, reward_group_id uuid, reward_group_name text, reward_group_color text, severity text, source text,
  currency text, min_amount_minor_units bigint, max_amount_minor_units bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.reports;
  sev public.report_severity;
  grp public.reward_groups;
  rng public.reward_group_bounties;
  pol public.program_bounty_policy_versions;
  prng public.program_bounty_policy_severity_ranges;
  label text;
begin
  select * into r from public.reports where id = target_report_id;
  if r.id is null or not (
    private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(r.program_id)
  ) then
    raise exception 'NOT_FOUND: report not found' using errcode = 'P0002';
  end if;
  sev := r.confirmed_severity;
  select a.display_identifier into label from public.assets a where a.id = r.asset_id;
  select g.* into grp from public.assets a join public.reward_groups g on g.id = a.reward_group_id where a.id = r.asset_id;
  if sev is not null and grp.id is not null then
    select * into rng from public.reward_group_bounties b where b.reward_group_id = grp.id and b.severity = sev;
    if rng.reward_group_id is not null then
      return query select coalesce(label, r.display_target), grp.id, grp.name, grp.color, sev::text, 'reward_group'::text, grp.currency, rng.min_amount_minor_units, rng.max_amount_minor_units;
      return;
    end if;
  end if;
  pol := private.effective_bounty_policy_version(r.program_id);
  if sev is not null and pol.id is not null then
    select * into prng from public.program_bounty_policy_severity_ranges x where x.policy_version_id = pol.id and x.severity = sev;
  end if;
  return query select coalesce(label, r.display_target), grp.id, grp.name, grp.color, sev::text,
    case when prng.policy_version_id is not null then 'program' else 'none' end, pol.currency, prng.min_amount_minor_units, prng.max_amount_minor_units;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_reward_group(uuid, text, text, text, text, text, jsonb)', 'public.update_reward_group(uuid, text, text, text, text, text, jsonb)',
    'public.duplicate_reward_group(uuid)', 'public.reorder_reward_groups(uuid, uuid[])', 'public.set_default_reward_group(uuid)',
    'public.archive_reward_group(uuid, boolean)', 'public.delete_reward_group(uuid)', 'public.apply_reward_group_template(uuid, text, text)',
    'public.list_reward_groups(uuid)', 'public.list_asset_reward_groups(uuid)', 'public.set_asset_reward_group(uuid, uuid)',
    'public.get_report_reward_suggestion(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

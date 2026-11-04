-- Organization-wide settings: workspace preferences, regional behaviour, and the defaults a
-- new engagement starts from. One row per organization; a missing row means platform
-- defaults (get_organization_settings returns them), so nothing needs backfilling.
create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- General
  default_language text not null default 'en' check (default_language in ('en', 'hi', 'es', 'fr', 'de', 'ja')),
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  date_format text not null default 'YYYY-MM-DD' check (date_format in ('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY')),
  currency text not null default 'USD' check (currency in ('USD', 'INR')),
  business_hours_start time not null default '09:00',
  business_hours_end time not null default '18:00',
  support_email text check (support_email is null or (char_length(support_email) <= 254 and support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- Regional
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  working_days smallint[] not null default '{1,2,3,4,5}' check (working_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(working_days) between 1 and 7),
  -- Program defaults
  default_visibility public.program_visibility not null default 'private',
  default_first_response_hours integer not null default 24 check (default_first_response_hours between 1 and 720),
  default_triage_hours integer not null default 72 check (default_triage_hours between 1 and 2160),
  default_resolution_days integer not null default 90 check (default_resolution_days between 1 and 365),
  default_reward_currency text not null default 'USD' check (default_reward_currency in ('USD', 'INR')),
  -- Researcher defaults
  default_safe_harbor boolean not null default true,
  default_disclosure_days integer not null default 90 check (default_disclosure_days between 0 and 365),
  default_hall_of_fame boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.organization_settings enable row level security;
-- No direct table access: reads and writes go through the functions below.
revoke all on public.organization_settings from public, anon, authenticated;

-- Any active member can read (the studio and every program page use these defaults). The
-- first read stores the platform defaults, so callers always get a complete row.
create or replace function public.get_organization_settings(target_organization_id uuid)
returns public.organization_settings
language plpgsql security definer set search_path = ''
as $$
declare
  row public.organization_settings;
begin
  if not private.has_org_role(target_organization_id, array['owner', 'security_admin', 'program_manager', 'triager', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: not a member of this organization' using errcode = '42501';
  end if;
  insert into public.organization_settings (organization_id) values (target_organization_id) on conflict do nothing;
  select * into row from public.organization_settings where organization_id = target_organization_id;
  return row;
end;
$$;

-- Owners and security admins only. Unknown keys are ignored; the table's checks validate values.
create or replace function public.update_organization_settings(target_organization_id uuid, settings jsonb)
returns public.organization_settings
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved public.organization_settings;
begin
  if not private.has_org_role(target_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can change organization settings' using errcode = '42501';
  end if;
  insert into public.organization_settings (organization_id) values (target_organization_id) on conflict do nothing;
  update public.organization_settings s set
    default_language = coalesce(settings->>'default_language', s.default_language),
    time_zone = coalesce(settings->>'time_zone', s.time_zone),
    date_format = coalesce(settings->>'date_format', s.date_format),
    currency = coalesce(settings->>'currency', s.currency),
    business_hours_start = coalesce((settings->>'business_hours_start')::time, s.business_hours_start),
    business_hours_end = coalesce((settings->>'business_hours_end')::time, s.business_hours_end),
    support_email = case when settings ? 'support_email' then nullif(lower(trim(settings->>'support_email')), '') else s.support_email end,
    country = case when settings ? 'country' then nullif(upper(trim(settings->>'country')), '') else s.country end,
    working_days = coalesce((select array_agg(d::smallint order by d::smallint) from jsonb_array_elements_text(settings->'working_days') d), s.working_days),
    default_visibility = coalesce((settings->>'default_visibility')::public.program_visibility, s.default_visibility),
    default_first_response_hours = coalesce((settings->>'default_first_response_hours')::integer, s.default_first_response_hours),
    default_triage_hours = coalesce((settings->>'default_triage_hours')::integer, s.default_triage_hours),
    default_resolution_days = coalesce((settings->>'default_resolution_days')::integer, s.default_resolution_days),
    default_reward_currency = coalesce(settings->>'default_reward_currency', s.default_reward_currency),
    default_safe_harbor = coalesce((settings->>'default_safe_harbor')::boolean, s.default_safe_harbor),
    default_disclosure_days = coalesce((settings->>'default_disclosure_days')::integer, s.default_disclosure_days),
    default_hall_of_fame = coalesce((settings->>'default_hall_of_fame')::boolean, s.default_hall_of_fame),
    updated_by = actor,
    updated_at = now()
  where s.organization_id = target_organization_id
  returning * into saved;

  if saved.business_hours_end <= saved.business_hours_start then
    raise exception 'INVALID_SETTINGS: business hours must end after they start' using errcode = '22023';
  end if;
  if saved.default_triage_hours < saved.default_first_response_hours then
    raise exception 'INVALID_SETTINGS: the triage target cannot be shorter than the first-response target' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_organization_id, 'organization.settings_updated', 'organization', target_organization_id,
    jsonb_build_object('keys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(settings) k)));
  return saved;
end;
$$;

revoke all on function public.get_organization_settings(uuid) from public, anon;
revoke all on function public.update_organization_settings(uuid, jsonb) from public, anon;
grant execute on function public.get_organization_settings(uuid) to authenticated;
grant execute on function public.update_organization_settings(uuid, jsonb) to authenticated;

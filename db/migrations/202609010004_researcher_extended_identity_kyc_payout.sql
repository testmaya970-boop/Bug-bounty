-- Extended researcher identity: professional details + self-reported interests (used for
-- a real, honest program recommendation match -- literal tag overlap, never a fabricated
-- "AI model"), KYC fields, and payout details. See docs/decisions/0051.
--
-- Scope decisions, made explicit after a reference screenshot (an unrelated competitor,
-- "Com Olho") asked for a much broader clone:
--
-- 1. KYC (Aadhaar/PAN/passport/phone): real fields, stored encrypted at rest, reviewed
--    manually by a platform admin. Deliberately NOT a fake "Verify via DigiLocker"/
--    "Verify PAN" button -- Sentinel has no real government-ID-verification provider
--    integration, and a button that claims to verify identity with nothing real behind it
--    is exactly the fabricated-security-theater pattern this project has repeatedly
--    rejected (see 0016/0042/0043). A platform admin (private.is_platform_admin(),
--    202608310001) marks a field verified/rejected after an out-of-band review; that
--    decision is real even though the "Verify" button in the reference screenshot is not.
-- 2. Bank/PayPal payout details: real fields, encrypted at rest (account number), even
--    though Sentinel's actual payout path (services/payments.ts's activePaymentProvider)
--    does not read this table yet -- disclosed, not silently faked as "already paying out
--    to this account."
-- 3. Gender/age group: real fields, but NOT on the public-read `researcher_profiles` table
--    (which orgs can already read in full for every researcher -- see 202609010002). A new
--    self-only `researcher_personal_details` table keeps this out of any org's reach,
--    matching researcher_kyc's own privacy tier -- there is no legitimate security-research
--    reason for an organization to see a researcher's gender or age.
-- 4. Hacking interests / tools / security focus: ADDED (reopening 0049's "social profile
--    filler" rejection) because they now have a real, non-vanity consumer -- a program
--    that declares its own `focus_areas` (new column, same enum) can be matched against a
--    researcher's declared interests for a literal, disclosed "Recommended for you" list
--    (list_recommended_programs below). This is deliberately NOT "hacking tools you own"
--    displayed as a credibility flex with no functional use -- it exists to drive that one
--    real feature. Stored on the existing public-read `researcher_profiles` table (same
--    tier as biography): a self-reported interest area is not sensitive the way KYC/
--    payout/demographic data is, and organizations seeing it is a reasonable credibility
--    signal, same reasoning as biography.
-- 5. Qualification / experience level / employment status / LinkedIn / resume link: real
--    fields on `researcher_profiles`, same public-read tier as biography -- professional
--    credibility signals an organization triaging a report already sees a biography for.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.researcher_gender as enum ('male', 'female', 'other', 'prefer_not_to_say');
create type public.researcher_age_group as enum ('under_18', '18_30', '31_50', 'above_50');
create type public.researcher_experience_level as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type public.researcher_employment_status as enum ('student', 'freelancer', 'employed', 'unemployed', 'other');
create type public.researcher_focus_area as enum ('web_applications', 'mobile_applications', 'apis', 'networks', 'databases', 'cloud_infrastructure', 'desktop_applications', 'iot_hardware', 'other');
create type public.researcher_tool_category as enum ('web_vulnerability_scanners', 'network_analysis_tools', 'penetration_testing_frameworks', 'exploit_development_tools', 'wireless_hacking_tools', 'social_engineering_tools', 'other');
create type public.researcher_security_focus as enum ('offensive_security', 'defensive_security', 'secure_coding', 'compliance', 'threat_intelligence', 'application_security', 'other');
create type public.kyc_status as enum ('not_submitted', 'pending', 'verified', 'rejected');
create type public.payout_method as enum ('bank_transfer', 'paypal');

-- ---------------------------------------------------------------------------
-- Encryption helpers. `private` (never in supabase/config.toml's exposed schemas, see
-- 202608260001's own comment on why functions live there) so these are never directly
-- callable over the Data API regardless of role grants.
--
-- The fallback key below is a LOCAL-DEV-ONLY convenience so this works out of the box
-- against `supabase db reset --local`. Any real deployment MUST override it via
-- `alter database <name> set app.settings.kyc_encryption_key = '<a real, securely
-- provisioned secret>'` (e.g. from the hosting platform's secret manager) -- never commit
-- a real key to source control. This is disclosed here, not silently assumed safe.
-- ---------------------------------------------------------------------------

create or replace function private.sensitive_field_encryption_key()
returns text
language sql stable
as $$
  select coalesce(current_setting('app.settings.kyc_encryption_key', true), 'sentinel-local-dev-only-insecure-key-do-not-use-in-production');
$$;

-- pgcrypto (202608250001) installs into the `extensions` schema, Supabase's own default --
-- confirmed live (`select n.nspname from pg_extension e join pg_namespace n on
-- n.oid = e.extnamespace where e.extname = 'pgcrypto'`), not assumed. `set search_path = ''`
-- on every function in this file means `pgp_sym_encrypt`/`pgp_sym_decrypt` must be called
-- schema-qualified as `extensions.pgp_sym_encrypt`/`extensions.pgp_sym_decrypt` -- a bare
-- call fails to resolve at all (caught live: submitting a PAN number returned "The request
-- could not be completed" instead of succeeding, before this fix).
create or replace function private.encrypt_sensitive_field(plain text)
returns bytea
language sql
as $$
  select case when plain is null or plain = '' then null else extensions.pgp_sym_encrypt(plain, private.sensitive_field_encryption_key()) end;
$$;

create or replace function private.decrypt_sensitive_field(cipher bytea)
returns text
language sql
as $$
  select case when cipher is null then null else extensions.pgp_sym_decrypt(cipher, private.sensitive_field_encryption_key()) end;
$$;

-- ---------------------------------------------------------------------------
-- researcher_profiles: professional details + interests (public-read tier, same as bio)
-- ---------------------------------------------------------------------------

alter table public.researcher_profiles
  add column qualification text check (char_length(qualification) <= 200),
  add column experience_level public.researcher_experience_level,
  add column employment_status public.researcher_employment_status,
  add column linkedin_url text check (linkedin_url is null or linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/'),
  add column resume_url text check (resume_url is null or char_length(resume_url) <= 500),
  add column hacking_interests public.researcher_focus_area[] not null default '{}',
  add column hacking_tools public.researcher_tool_category[] not null default '{}',
  add column security_focus public.researcher_security_focus[] not null default '{}';

create or replace function public.update_my_professional_details(
  p_qualification text default null,
  p_experience_level public.researcher_experience_level default null,
  p_employment_status public.researcher_employment_status default null,
  p_linkedin_url text default null,
  p_resume_url text default null,
  p_hacking_interests public.researcher_focus_area[] default '{}',
  p_hacking_tools public.researcher_tool_category[] default '{}',
  p_security_focus public.researcher_security_focus[] default '{}'
)
returns public.researcher_profiles
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_linkedin text := nullif(trim(coalesce(p_linkedin_url, '')), '');
  trimmed_resume text := nullif(trim(coalesce(p_resume_url, '')), '');
  updated public.researcher_profiles;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if trimmed_linkedin is not null and trimmed_linkedin !~ '^https://([a-z]{2,3}\.)?linkedin\.com/' then
    raise exception 'INVALID_LINKEDIN_URL: Enter a real linkedin.com profile URL.' using errcode = '22023';
  end if;
  if trimmed_resume is not null and char_length(trimmed_resume) > 500 then
    raise exception 'INVALID_RESUME_URL: Use 500 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.researcher_profiles (user_id, qualification, experience_level, employment_status, linkedin_url, resume_url, hacking_interests, hacking_tools, security_focus)
  values (actor, nullif(trim(p_qualification), ''), p_experience_level, p_employment_status, trimmed_linkedin, trimmed_resume, coalesce(p_hacking_interests, '{}'), coalesce(p_hacking_tools, '{}'), coalesce(p_security_focus, '{}'))
  on conflict (user_id) do update set
    qualification = excluded.qualification,
    experience_level = excluded.experience_level,
    employment_status = excluded.employment_status,
    linkedin_url = excluded.linkedin_url,
    resume_url = excluded.resume_url,
    hacking_interests = excluded.hacking_interests,
    hacking_tools = excluded.hacking_tools,
    security_focus = excluded.security_focus,
    updated_at = now()
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.update_my_professional_details(text, public.researcher_experience_level, public.researcher_employment_status, text, text, public.researcher_focus_area[], public.researcher_tool_category[], public.researcher_security_focus[]) from public;
grant execute on function public.update_my_professional_details(text, public.researcher_experience_level, public.researcher_employment_status, text, text, public.researcher_focus_area[], public.researcher_tool_category[], public.researcher_security_focus[]) to authenticated;

-- ---------------------------------------------------------------------------
-- researcher_personal_details: gender/age group. Self-only -- no org has a legitimate
-- reason to read this, unlike biography/professional details. Same "absent, not narrow"
-- RLS shape as platform_admins/researcher_kyc below: zero policies at all, every access
-- goes through a SECURITY DEFINER function.
-- ---------------------------------------------------------------------------

create table public.researcher_personal_details (
  user_id uuid primary key references public.users(id) on delete cascade,
  gender public.researcher_gender,
  age_group public.researcher_age_group,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.researcher_personal_details enable row level security;
revoke all on public.researcher_personal_details from anon, authenticated;
grant select, insert, update, delete on public.researcher_personal_details to service_role;

create or replace function public.get_my_personal_details()
returns table (gender public.researcher_gender, age_group public.researcher_age_group)
language sql stable security definer set search_path = ''
as $$
  select gender, age_group from public.researcher_personal_details where user_id = auth.uid();
$$;

revoke all on function public.get_my_personal_details() from public;
grant execute on function public.get_my_personal_details() to authenticated;

create or replace function public.upsert_my_personal_details(p_gender public.researcher_gender default null, p_age_group public.researcher_age_group default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  insert into public.researcher_personal_details (user_id, gender, age_group)
  values (actor, p_gender, p_age_group)
  on conflict (user_id) do update set gender = excluded.gender, age_group = excluded.age_group, updated_at = now();
end;
$$;

revoke all on function public.upsert_my_personal_details(public.researcher_gender, public.researcher_age_group) from public;
grant execute on function public.upsert_my_personal_details(public.researcher_gender, public.researcher_age_group) to authenticated;

-- ---------------------------------------------------------------------------
-- researcher_kyc: Aadhaar/PAN/passport/phone. Values stored encrypted; the base table has
-- zero policies and zero grants to authenticated/anon -- self access is only ever through
-- get_my_kyc_status() (statuses/booleans, never the encrypted value) and upsert_my_kyc()
-- (write-only from the client's perspective). A platform admin can decrypt a specific
-- field for manual review via admin_decrypt_kyc_field(), which writes its own audit_logs
-- row every time, since decrypting a citizen's government ID number is itself a
-- security-relevant action worth a permanent record.
-- ---------------------------------------------------------------------------

create table public.researcher_kyc (
  user_id uuid primary key references public.users(id) on delete cascade,
  phone_country_code text,
  phone_number_encrypted bytea,
  phone_status public.kyc_status not null default 'not_submitted',
  aadhaar_number_encrypted bytea,
  aadhaar_status public.kyc_status not null default 'not_submitted',
  pan_number_encrypted bytea,
  pan_status public.kyc_status not null default 'not_submitted',
  passport_number_encrypted bytea,
  passport_date_of_birth date,
  passport_status public.kyc_status not null default 'not_submitted',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.researcher_kyc enable row level security;
revoke all on public.researcher_kyc from anon, authenticated;
grant select, insert, update, delete on public.researcher_kyc to service_role;

create or replace function public.get_my_kyc_status()
returns table (
  phone_country_code text,
  phone_submitted boolean,
  phone_status public.kyc_status,
  aadhaar_submitted boolean,
  aadhaar_status public.kyc_status,
  pan_submitted boolean,
  pan_status public.kyc_status,
  passport_submitted boolean,
  passport_date_of_birth date,
  passport_status public.kyc_status,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    k.phone_country_code,
    k.phone_number_encrypted is not null,
    k.phone_status,
    k.aadhaar_number_encrypted is not null,
    k.aadhaar_status,
    k.pan_number_encrypted is not null,
    k.pan_status,
    k.passport_number_encrypted is not null,
    k.passport_date_of_birth,
    k.passport_status,
    k.submitted_at,
    k.reviewed_at,
    k.review_note,
    k.updated_at
  from public.researcher_kyc k
  where k.user_id = auth.uid();
$$;

revoke all on function public.get_my_kyc_status() from public;
grant execute on function public.get_my_kyc_status() to authenticated;

create or replace function public.upsert_my_kyc(
  p_phone_country_code text default null,
  p_phone_number text default null,
  p_aadhaar_number text default null,
  p_pan_number text default null,
  p_passport_number text default null,
  p_passport_date_of_birth date default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_phone text := nullif(trim(coalesce(p_phone_number, '')), '');
  trimmed_aadhaar text := nullif(trim(coalesce(p_aadhaar_number, '')), '');
  trimmed_pan text := upper(nullif(trim(coalesce(p_pan_number, '')), ''));
  trimmed_passport text := upper(nullif(trim(coalesce(p_passport_number, '')), ''));
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if trimmed_aadhaar is not null and trimmed_aadhaar !~ '^[0-9]{12}$' then
    raise exception 'INVALID_AADHAAR: Aadhaar number must be exactly 12 digits.' using errcode = '22023';
  end if;
  if trimmed_pan is not null and trimmed_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'INVALID_PAN: Enter a valid 10-character PAN (e.g. ABCDE1234F).' using errcode = '22023';
  end if;

  insert into public.researcher_kyc (user_id) values (actor) on conflict (user_id) do nothing;

  update public.researcher_kyc set
    phone_country_code = coalesce(nullif(trim(p_phone_country_code), ''), phone_country_code),
    phone_number_encrypted = case when trimmed_phone is not null then private.encrypt_sensitive_field(trimmed_phone) else phone_number_encrypted end,
    phone_status = case when trimmed_phone is not null then 'pending'::public.kyc_status else phone_status end,
    aadhaar_number_encrypted = case when trimmed_aadhaar is not null then private.encrypt_sensitive_field(trimmed_aadhaar) else aadhaar_number_encrypted end,
    aadhaar_status = case when trimmed_aadhaar is not null then 'pending'::public.kyc_status else aadhaar_status end,
    pan_number_encrypted = case when trimmed_pan is not null then private.encrypt_sensitive_field(trimmed_pan) else pan_number_encrypted end,
    pan_status = case when trimmed_pan is not null then 'pending'::public.kyc_status else pan_status end,
    passport_number_encrypted = case when trimmed_passport is not null then private.encrypt_sensitive_field(trimmed_passport) else passport_number_encrypted end,
    passport_date_of_birth = coalesce(p_passport_date_of_birth, passport_date_of_birth),
    passport_status = case when trimmed_passport is not null then 'pending'::public.kyc_status else passport_status end,
    submitted_at = now(),
    updated_at = now()
  where user_id = actor;
end;
$$;

revoke all on function public.upsert_my_kyc(text, text, text, text, text, date) from public;
grant execute on function public.upsert_my_kyc(text, text, text, text, text, date) to authenticated;

create or replace function public.admin_decrypt_kyc_field(target_user_id uuid, p_field text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  row_data public.researcher_kyc;
  result text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin required' using errcode = '42501'; end if;
  if p_field not in ('phone', 'aadhaar', 'pan', 'passport') then
    raise exception 'INVALID_FIELD: unknown KYC field' using errcode = '22023';
  end if;

  select * into row_data from public.researcher_kyc where user_id = target_user_id;
  if row_data.user_id is null then raise exception 'NOT_FOUND: no KYC submission for this researcher' using errcode = 'P0002'; end if;

  result := case p_field
    when 'phone' then private.decrypt_sensitive_field(row_data.phone_number_encrypted)
    when 'aadhaar' then private.decrypt_sensitive_field(row_data.aadhaar_number_encrypted)
    when 'pan' then private.decrypt_sensitive_field(row_data.pan_number_encrypted)
    when 'passport' then private.decrypt_sensitive_field(row_data.passport_number_encrypted)
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'kyc.field_decrypted', 'researcher_kyc', target_user_id, jsonb_build_object('field', p_field));

  return result;
end;
$$;

revoke all on function public.admin_decrypt_kyc_field(uuid, text) from public;
grant execute on function public.admin_decrypt_kyc_field(uuid, text) to authenticated;

create or replace function public.review_kyc_field(target_user_id uuid, p_field text, p_decision public.kyc_status, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin required' using errcode = '42501'; end if;
  if p_field not in ('phone', 'aadhaar', 'pan', 'passport') then
    raise exception 'INVALID_FIELD: unknown KYC field' using errcode = '22023';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'INVALID_DECISION: decision must be verified or rejected' using errcode = '22023';
  end if;

  update public.researcher_kyc set
    phone_status = case when p_field = 'phone' then p_decision else phone_status end,
    aadhaar_status = case when p_field = 'aadhaar' then p_decision else aadhaar_status end,
    pan_status = case when p_field = 'pan' then p_decision else pan_status end,
    passport_status = case when p_field = 'passport' then p_decision else passport_status end,
    reviewed_at = now(),
    reviewed_by = actor,
    review_note = coalesce(nullif(trim(p_note), ''), review_note),
    updated_at = now()
  where user_id = target_user_id;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: no KYC submission for this researcher' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'kyc.field_reviewed', 'researcher_kyc', target_user_id, jsonb_build_object('field', p_field, 'decision', p_decision));
end;
$$;

revoke all on function public.review_kyc_field(uuid, text, public.kyc_status, text) from public;
grant execute on function public.review_kyc_field(uuid, text, public.kyc_status, text) to authenticated;

create or replace function public.list_kyc_submissions()
returns table (
  user_id uuid,
  display_name text,
  email text,
  phone_status public.kyc_status,
  aadhaar_status public.kyc_status,
  pan_status public.kyc_status,
  passport_status public.kyc_status,
  submitted_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin required' using errcode = '42501'; end if;

  return query
    select k.user_id, u.display_name, u.email, k.phone_status, k.aadhaar_status, k.pan_status, k.passport_status, k.submitted_at, k.reviewed_at
    from public.researcher_kyc k
    join public.users u on u.id = k.user_id
    where k.phone_status = 'pending' or k.aadhaar_status = 'pending' or k.pan_status = 'pending' or k.passport_status = 'pending'
    order by k.submitted_at asc nulls last;
end;
$$;

revoke all on function public.list_kyc_submissions() from public;
grant execute on function public.list_kyc_submissions() to authenticated;

-- ---------------------------------------------------------------------------
-- researcher_payout_details: bank transfer / PayPal. Same privacy tier as KYC -- self +
-- platform admin only. The account number is encrypted; only the last 4 digits are kept
-- in plaintext (a common, real pattern for showing "on file: ...1234" without ever
-- re-transmitting or re-displaying the full number after the initial submission).
-- ---------------------------------------------------------------------------

create table public.researcher_payout_details (
  user_id uuid primary key references public.users(id) on delete cascade,
  method public.payout_method,
  bank_account_holder_name text check (char_length(bank_account_holder_name) <= 160),
  bank_account_number_encrypted bytea,
  bank_account_last4 text check (bank_account_last4 is null or bank_account_last4 ~ '^[0-9]{4}$'),
  bank_ifsc_or_routing text check (char_length(bank_ifsc_or_routing) <= 34),
  paypal_email text check (paypal_email is null or paypal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.researcher_payout_details enable row level security;
revoke all on public.researcher_payout_details from anon, authenticated;
grant select, insert, update, delete on public.researcher_payout_details to service_role;

create or replace function public.get_my_payout_details()
returns table (
  method public.payout_method,
  bank_account_holder_name text,
  bank_account_last4 text,
  bank_ifsc_or_routing text,
  paypal_email text,
  updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select method, bank_account_holder_name, bank_account_last4, bank_ifsc_or_routing, paypal_email, updated_at
  from public.researcher_payout_details
  where user_id = auth.uid();
$$;

revoke all on function public.get_my_payout_details() from public;
grant execute on function public.get_my_payout_details() to authenticated;

create or replace function public.upsert_my_payout_details(
  p_method public.payout_method,
  p_bank_account_holder_name text default null,
  p_bank_account_number text default null,
  p_bank_ifsc_or_routing text default null,
  p_paypal_email text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_holder text := nullif(trim(coalesce(p_bank_account_holder_name, '')), '');
  trimmed_account text := nullif(trim(coalesce(p_bank_account_number, '')), '');
  trimmed_routing text := nullif(trim(coalesce(p_bank_ifsc_or_routing, '')), '');
  trimmed_paypal text := nullif(trim(coalesce(p_paypal_email, '')), '');
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if p_method = 'bank_transfer' then
    if trimmed_holder is null then raise exception 'INVALID_ACCOUNT_HOLDER: Enter the account holder name.' using errcode = '22023'; end if;
    if trimmed_account is null or trimmed_account !~ '^[0-9]{6,20}$' then
      raise exception 'INVALID_ACCOUNT_NUMBER: Enter a valid account number (6-20 digits).' using errcode = '22023';
    end if;
    if trimmed_routing is null then raise exception 'INVALID_ROUTING: Enter a routing/IFSC code.' using errcode = '22023'; end if;
  elsif p_method = 'paypal' then
    if trimmed_paypal is null or trimmed_paypal !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'INVALID_PAYPAL_EMAIL: Enter a valid PayPal email address.' using errcode = '22023';
    end if;
  else
    raise exception 'INVALID_METHOD: choose a payout method' using errcode = '22023';
  end if;

  insert into public.researcher_payout_details (user_id, method, bank_account_holder_name, bank_account_number_encrypted, bank_account_last4, bank_ifsc_or_routing, paypal_email, updated_at)
  values (
    actor, p_method, trimmed_holder,
    private.encrypt_sensitive_field(trimmed_account),
    case when trimmed_account is not null then right(trimmed_account, 4) else null end,
    trimmed_routing, trimmed_paypal, now()
  )
  on conflict (user_id) do update set
    method = excluded.method,
    bank_account_holder_name = excluded.bank_account_holder_name,
    bank_account_number_encrypted = coalesce(excluded.bank_account_number_encrypted, public.researcher_payout_details.bank_account_number_encrypted),
    bank_account_last4 = coalesce(excluded.bank_account_last4, public.researcher_payout_details.bank_account_last4),
    bank_ifsc_or_routing = excluded.bank_ifsc_or_routing,
    paypal_email = excluded.paypal_email,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_my_payout_details(public.payout_method, text, text, text, text) from public;
grant execute on function public.upsert_my_payout_details(public.payout_method, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- programs.focus_areas + the one recommendation feature this unlocks: a literal overlap
-- match against a researcher's own hacking_interests, never a fabricated "AI model".
-- ---------------------------------------------------------------------------

alter table public.programs add column focus_areas public.researcher_focus_area[] not null default '{}';

create or replace function public.set_program_focus_areas(target_program_id uuid, p_focus_areas public.researcher_focus_area[])
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;

  update public.programs set focus_areas = coalesce(p_focus_areas, '{}'), updated_at = now()
  where id = target_program_id
  returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.focus_areas_updated', 'program', target_program_id, jsonb_build_object('focus_areas', p_focus_areas));

  return updated;
end;
$$;

revoke all on function public.set_program_focus_areas(uuid, public.researcher_focus_area[]) from public;
grant execute on function public.set_program_focus_areas(uuid, public.researcher_focus_area[]) to authenticated;

create or replace function public.list_recommended_programs(p_limit int default 6)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  description text,
  focus_areas public.researcher_focus_area[],
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  effective_limit int := least(greatest(coalesce(p_limit, 6), 1), 20);
  my_interests public.researcher_focus_area[];
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select hacking_interests into my_interests from public.researcher_profiles where user_id = actor;
  if my_interests is null or array_length(my_interests, 1) is null then
    return;
  end if;

  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.description, p.focus_areas, p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.visibility = 'public'
      and p.status in ('active', 'paused')
      and p.focus_areas && my_interests
      and not exists (
        select 1 from public.program_researchers pr where pr.program_id = p.id and pr.user_id = actor and pr.status = 'active'
      )
    order by p.updated_at desc
    limit effective_limit;
end;
$$;

revoke all on function public.list_recommended_programs(int) from public;
grant execute on function public.list_recommended_programs(int) to authenticated;

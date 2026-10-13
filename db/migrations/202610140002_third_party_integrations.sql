-- Third-party integration modules (2026-10-14): identity verification, payouts and phone
-- verification, each behind a provider interface (lib/integrations/*) with an India and a
-- global adapter chosen by configuration, plus a sandbox that works without keys.
--
-- The database keeps provider-neutral state; the app talks to providers. Every result a
-- provider reports arrives through a webhook (or a signed callback) and is applied here by
-- a service-role function -- a browser can never mark itself verified or a payout paid.
-- integration_events keeps a short, PII-free trail for the Platform -> Integrations page.

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('identity', 'payments', 'phone')),
  provider text not null check (char_length(provider) between 1 and 40),
  kind text not null check (kind in ('call', 'webhook')),
  outcome text not null check (outcome in ('ok', 'error', 'rejected')),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index integration_events_recent_idx on public.integration_events (module, created_at desc);
alter table public.integration_events enable row level security;
revoke all on public.integration_events from anon, authenticated;
grant select, insert on public.integration_events to service_role;

-- Identity verification sessions (hosted document + selfie / e-KYC flows).
create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  region text not null check (region in ('IN', 'GLOBAL')),
  provider_reference text not null check (char_length(provider_reference) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired', 'error')),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (provider, provider_reference)
);
create index identity_verifications_user_idx on public.identity_verifications (user_id, created_at desc);
alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from anon, authenticated;
grant select (id, user_id, provider, region, status, failure_reason, created_at, completed_at) on public.identity_verifications to authenticated;
grant select, insert, update on public.identity_verifications to service_role;
create policy "identity verifications read own" on public.identity_verifications for select to authenticated using (user_id = auth.uid());

-- Phone verification (OTP). code_hash is only used by the sandbox provider; real providers
-- (MSG91 / Twilio Verify) hold the code themselves.
create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  country_code text not null check (country_code ~ '^\+[0-9]{1,4}$'),
  phone_encrypted bytea not null,
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{4}$'),
  provider_reference text check (provider_reference is null or char_length(provider_reference) <= 200),
  code_hash text,
  attempts integer not null default 0 check (attempts >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);
alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;
grant select, insert, update on public.phone_verifications to service_role;

-- A verified identity session now counts as verified KYC (programs that require KYC, payout
-- blockers), alongside the existing manually reviewed documents. Valid for 12 months.
create or replace function private.researcher_has_verified_kyc(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.researcher_kyc
    where user_id = target_user_id
      and (aadhaar_status = 'verified' or pan_status = 'verified' or passport_status = 'verified')
  ) or exists (
    select 1 from public.identity_verifications v
    where v.user_id = target_user_id and v.status = 'approved' and v.completed_at > now() - interval '12 months'
  );
$$;

-- Applied from a verified provider webhook (service role only).
create or replace function public.complete_identity_verification(p_provider text, p_reference text, p_status text, p_reason text default null)
returns public.identity_verifications
language plpgsql security definer set search_path = ''
as $$
declare
  row_ public.identity_verifications;
begin
  if p_status not in ('approved', 'declined', 'expired', 'error') then
    raise exception 'INVALID_INPUT: unknown verification status %', p_status using errcode = '22023';
  end if;
  select * into row_ from public.identity_verifications where provider = p_provider and provider_reference = p_reference for update;
  if row_.id is null then raise exception 'NOT_FOUND: no such verification session' using errcode = 'P0002'; end if;
  if row_.status <> 'pending' then return row_; end if; -- webhooks retry; first final result wins
  update public.identity_verifications
    set status = p_status, failure_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 300), completed_at = now()
    where id = row_.id returning * into row_;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (null, null, 'kyc.provider_' || p_status, 'user', row_.user_id, jsonb_build_object('provider', p_provider, 'verification_id', row_.id));
  return row_;
end;
$$;
revoke all on function public.complete_identity_verification(text, text, text, text) from public, authenticated, anon;
grant execute on function public.complete_identity_verification(text, text, text, text) to service_role;

-- Marks the researcher's phone verified after a correct OTP (service role only).
create or replace function public.record_phone_verified(p_verification_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.phone_verifications;
begin
  select * into v from public.phone_verifications where id = p_verification_id for update;
  if v.id is null or v.status <> 'pending' then raise exception 'NOT_FOUND: no pending phone verification' using errcode = 'P0002'; end if;
  update public.phone_verifications set status = 'approved', verified_at = now() where id = v.id;
  insert into public.researcher_kyc (user_id, phone_country_code, phone_number_encrypted, phone_status, submitted_at, updated_at)
  values (v.user_id, v.country_code, v.phone_encrypted, 'verified', now(), now())
  on conflict (user_id) do update
    set phone_country_code = excluded.phone_country_code, phone_number_encrypted = excluded.phone_number_encrypted, phone_status = 'verified', updated_at = now();
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (v.user_id, null, 'kyc.phone_verified', 'user', v.user_id, jsonb_build_object('provider', v.provider, 'last4', v.phone_last4));
end;
$$;
revoke all on function public.record_phone_verified(uuid) from public, authenticated, anon;
grant execute on function public.record_phone_verified(uuid) to service_role;

-- Payouts: an attempt handed to a real provider waits in 'pending_provider' until the
-- provider's webhook reports the result.
alter table public.payment_attempts drop constraint payment_attempts_state_check;
alter table public.payment_attempts add constraint payment_attempts_state_check
  check (state in ('requires_operator_action', 'pending_provider', 'succeeded', 'failed'));
alter table public.payment_attempts drop constraint payment_attempts_shape_check;
alter table public.payment_attempts add constraint payment_attempts_shape_check check (
  (state in ('requires_operator_action', 'pending_provider') and completed_at is null and failure_code is null and failure_message is null)
  or (state = 'succeeded' and completed_at is not null and failure_code is null and failure_message is null)
  or (state = 'failed' and completed_at is not null and failure_code is not null)
);
create unique index if not exists payment_attempts_provider_reference_key on public.payment_attempts (provider, provider_reference_id) where provider_reference_id is not null and provider <> 'manual';

-- After initiate_manual_payment_attempt, the service hands the attempt to the configured
-- provider; this records that hand-off (service role only).
create or replace function public.mark_payment_attempt_submitted(p_attempt_id uuid, p_provider text, p_reference text)
returns public.payment_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  attempt public.payment_attempts;
begin
  select * into attempt from public.payment_attempts where id = p_attempt_id for update;
  if attempt.id is null or attempt.state <> 'requires_operator_action' then
    raise exception 'ATTEMPT_ALREADY_RESOLVED: this attempt is not awaiting submission' using errcode = '23514';
  end if;
  update public.payment_attempts set provider = p_provider, provider_reference_id = p_reference, state = 'pending_provider'
    where id = p_attempt_id returning * into attempt;
  return attempt;
end;
$$;
revoke all on function public.mark_payment_attempt_submitted(uuid, text, text) from public, authenticated, anon;
grant execute on function public.mark_payment_attempt_submitted(uuid, text, text) to service_role;

-- Applies the provider's final word on a payout (webhook, service role only). Same effects
-- as record_manual_payment_result: attempt + obligation status, audit row.
create or replace function public.record_provider_payment_result(p_provider text, p_reference text, p_outcome text, p_failure_code text default null, p_failure_message text default null)
returns public.payment_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  attempt public.payment_attempts;
  obligation public.payment_obligations;
begin
  if p_outcome not in ('succeeded', 'failed') then raise exception 'INVALID_PAYMENT_OUTCOME: outcome must be succeeded or failed' using errcode = '22023'; end if;
  select * into attempt from public.payment_attempts where provider = p_provider and provider_reference_id = p_reference for update;
  if attempt.id is null then raise exception 'ATTEMPT_NOT_FOUND: no attempt for that provider reference' using errcode = 'P0002'; end if;
  if attempt.state <> 'pending_provider' then return attempt; end if; -- webhook retries: first final result wins
  select * into obligation from public.payment_obligations where id = attempt.payment_obligation_id for update;

  update public.payment_attempts set
    state = p_outcome,
    failure_code = case when p_outcome = 'failed' then coalesce(left(nullif(trim(coalesce(p_failure_code, '')), ''), 100), 'provider_failed') end,
    failure_message = case when p_outcome = 'failed' then left(p_failure_message, 500) end,
    completed_at = now()
    where id = attempt.id returning * into attempt;
  update public.payment_obligations set status = p_outcome, updated_at = now() where id = obligation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (null, obligation.organization_id, case when p_outcome = 'succeeded' then 'payment.succeeded' else 'payment.failed' end, 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'provider', p_provider, 'amount_minor_units', obligation.amount_minor_units, 'currency', obligation.currency));
  return attempt;
end;
$$;
revoke all on function public.record_provider_payment_result(text, text, text, text, text) from public, authenticated, anon;
grant execute on function public.record_provider_payment_result(text, text, text, text, text) to service_role;

-- Payout threshold, schedule, and tax-form collection. Closes a real gap: HackerOne and
-- Bugcrowd both require a configurable payout threshold, a payout cadence, and a tax form
-- (W-9/W-8BEN-style) before releasing funds -- researcher_payout_details had none of the
-- three. Same privacy tier and encryption pattern as KYC (202609010004): self + platform
-- admin only, the tax identifier is encrypted at rest via the existing
-- private.encrypt_sensitive_field/decrypt_sensitive_field helpers, only a redacted form is
-- ever read back.
--
-- Deliberately narrow: this is DATA COLLECTION only, same as KYC already is -- there is no
-- automated tax-form validation/e-signature provider (matching KYC's own "no automated
-- verification, a platform admin reviews manually" disclosure), and threshold/schedule are
-- real, stored researcher preferences that the payment ledger does not yet consult (the
-- manual payment provider, per docs/decisions/0063, is unchanged by this migration -- this
-- is the same disclosed "real data model, not yet wired to the actual payout mechanism"
-- gap payout details already carries).

create type public.payout_schedule as enum ('immediate', 'weekly', 'monthly', 'on_threshold');
create type public.tax_form_type as enum ('w9', 'w8ben', 'w8ben_e');

alter table public.researcher_payout_details
  add column payout_threshold_minor_units bigint check (payout_threshold_minor_units is null or payout_threshold_minor_units > 0),
  add column payout_schedule public.payout_schedule not null default 'immediate',
  add column tax_form_type public.tax_form_type,
  add column tax_id_encrypted bytea,
  add column tax_id_last4 text check (tax_id_last4 is null or tax_id_last4 ~ '^[0-9A-Za-z]{4}$'),
  add column tax_form_status public.kyc_status not null default 'not_submitted',
  add column tax_form_submitted_at timestamptz,
  add column tax_form_reviewed_at timestamptz,
  add column tax_form_review_note text check (tax_form_review_note is null or char_length(tax_form_review_note) <= 1000);

-- Return shape is growing too -- same drop-first rule, since create or replace also can't
-- change an existing function's return type for a matching signature.
drop function if exists public.get_my_payout_details();

create or replace function public.get_my_payout_details()
returns table (
  method public.payout_method,
  bank_account_holder_name text,
  bank_account_last4 text,
  bank_ifsc_or_routing text,
  paypal_email text,
  payout_threshold_minor_units bigint,
  payout_schedule public.payout_schedule,
  tax_form_type public.tax_form_type,
  tax_id_last4 text,
  tax_form_status public.kyc_status,
  tax_form_submitted_at timestamptz,
  tax_form_review_note text,
  updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select method, bank_account_holder_name, bank_account_last4, bank_ifsc_or_routing, paypal_email,
    payout_threshold_minor_units, payout_schedule, tax_form_type, tax_id_last4, tax_form_status,
    tax_form_submitted_at, tax_form_review_note, updated_at
  from public.researcher_payout_details
  where user_id = auth.uid();
$$;

revoke all on function public.get_my_payout_details() from public;
grant execute on function public.get_my_payout_details() to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_my_payout_details: redefined (not duplicated), same signature plus the three new
-- optional parameters. Threshold/schedule are plain preference writes -- no encryption,
-- no review status, always overwritten when supplied (unlike the account number's
-- coalesce-preserve-if-omitted behavior, since there is no secrecy reason to withhold a
-- threshold/schedule from being cleared or changed anytime). Bank/PayPal validation is
-- byte-for-byte unchanged from the prior version.
-- ---------------------------------------------------------------------------

-- Parameter list is growing (2 new optional args) -- create or replace cannot change an
-- existing function's parameter list, only its body/return type for an identical
-- signature, so the old 5-arg overload must be dropped first (the same documented
-- PostgREST-overload-disambiguation gotcha this codebase's migrations always follow for a
-- changed signature).
drop function if exists public.upsert_my_payout_details(public.payout_method, text, text, text, text);

create or replace function public.upsert_my_payout_details(
  p_method public.payout_method,
  p_bank_account_holder_name text default null,
  p_bank_account_number text default null,
  p_bank_ifsc_or_routing text default null,
  p_paypal_email text default null,
  p_payout_threshold_minor_units bigint default null,
  p_payout_schedule public.payout_schedule default null
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

  if p_payout_threshold_minor_units is not null and p_payout_threshold_minor_units <= 0 then
    raise exception 'INVALID_THRESHOLD: payout threshold must be a positive amount' using errcode = '22023';
  end if;

  insert into public.researcher_payout_details (user_id, method, bank_account_holder_name, bank_account_number_encrypted, bank_account_last4, bank_ifsc_or_routing, paypal_email, payout_threshold_minor_units, payout_schedule, updated_at)
  values (
    actor, p_method, trimmed_holder,
    private.encrypt_sensitive_field(trimmed_account),
    case when trimmed_account is not null then right(trimmed_account, 4) else null end,
    trimmed_routing, trimmed_paypal,
    p_payout_threshold_minor_units, coalesce(p_payout_schedule, 'immediate'), now()
  )
  on conflict (user_id) do update set
    method = excluded.method,
    bank_account_holder_name = excluded.bank_account_holder_name,
    bank_account_number_encrypted = coalesce(excluded.bank_account_number_encrypted, public.researcher_payout_details.bank_account_number_encrypted),
    bank_account_last4 = coalesce(excluded.bank_account_last4, public.researcher_payout_details.bank_account_last4),
    bank_ifsc_or_routing = excluded.bank_ifsc_or_routing,
    paypal_email = excluded.paypal_email,
    payout_threshold_minor_units = excluded.payout_threshold_minor_units,
    payout_schedule = excluded.payout_schedule,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_my_payout_details(public.payout_method, text, text, text, text, bigint, public.payout_schedule) from public;
grant execute on function public.upsert_my_payout_details(public.payout_method, text, text, text, text, bigint, public.payout_schedule) to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_my_tax_form: its own RPC, separate from payout details -- a tax identifier is a
-- categorically more sensitive field than a bank routing number (encrypted, reviewed,
-- has its own status lifecycle), matching KYC's own "each field is its own small form"
-- convention (components/settings/kyc-settings.tsx) rather than folding it into the
-- payout form's general-purpose upsert.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_my_tax_form(p_tax_form_type public.tax_form_type, p_tax_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_tax_id text := nullif(trim(coalesce(p_tax_id, '')), '');
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if trimmed_tax_id is null or char_length(trimmed_tax_id) < 4 then
    raise exception 'INVALID_TAX_ID: enter a valid tax identifier' using errcode = '22023';
  end if;

  insert into public.researcher_payout_details (user_id, tax_form_type, tax_id_encrypted, tax_id_last4, tax_form_status, tax_form_submitted_at, updated_at)
  values (actor, p_tax_form_type, private.encrypt_sensitive_field(trimmed_tax_id), right(trimmed_tax_id, 4), 'pending', now(), now())
  on conflict (user_id) do update set
    tax_form_type = excluded.tax_form_type,
    tax_id_encrypted = excluded.tax_id_encrypted,
    tax_id_last4 = excluded.tax_id_last4,
    tax_form_status = 'pending',
    tax_form_submitted_at = now(),
    tax_form_reviewed_at = null,
    tax_form_review_note = null,
    updated_at = now();

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'payout.tax_form_submitted', 'researcher_payout_details', actor, jsonb_build_object('tax_form_type', p_tax_form_type));
end;
$$;

revoke all on function public.upsert_my_tax_form(public.tax_form_type, text) from public;
grant execute on function public.upsert_my_tax_form(public.tax_form_type, text) to authenticated;

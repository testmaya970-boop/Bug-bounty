-- Service-role helpers for the integration modules that need the encryption key, which only
-- SECURITY DEFINER functions can use (private.encrypt/decrypt_sensitive_field).

-- Who a payout goes to, decrypted only at the moment of sending (service role only).
create or replace function public.get_payout_recipient(p_attempt_id uuid)
returns table (researcher_id uuid, display_name text, email text, method text, bank_holder text, bank_account_number text, bank_ifsc text, paypal_email text)
language sql stable security definer set search_path = ''
as $$
  select o.researcher_id, u.display_name, u.email, d.method::text, d.bank_account_holder_name,
    case when d.bank_account_number_encrypted is null then null else private.decrypt_sensitive_field(d.bank_account_number_encrypted) end,
    d.bank_ifsc_or_routing, d.paypal_email
  from public.payment_attempts a
  join public.payment_obligations o on o.id = a.payment_obligation_id
  join public.users u on u.id = o.researcher_id
  left join public.researcher_payout_details d on d.user_id = o.researcher_id
  where a.id = p_attempt_id;
$$;
revoke all on function public.get_payout_recipient(uuid) from public, authenticated, anon;
grant execute on function public.get_payout_recipient(uuid) to service_role;

-- Opens a phone verification with the number encrypted at rest (service role only).
-- At most 3 codes per user per hour and 10 per day.
create or replace function public.start_phone_verification(p_user_id uuid, p_country_code text, p_e164 text, p_provider text, p_reference text, p_code_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.check_and_consume_rate_limit('phone_otp_hour:' || p_user_id, 3, 3600) or not private.check_and_consume_rate_limit('phone_otp_day:' || p_user_id, 10, 86400) then
    raise exception 'RATE_LIMITED: too many codes requested -- try again later' using errcode = '42901';
  end if;
  update public.phone_verifications set status = 'expired' where user_id = p_user_id and status = 'pending';
  insert into public.phone_verifications (user_id, provider, country_code, phone_encrypted, phone_last4, provider_reference, code_hash, expires_at)
  values (p_user_id, p_provider, p_country_code, private.encrypt_sensitive_field(p_e164), right(p_e164, 4), p_reference, p_code_hash, now() + interval '10 minutes')
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.start_phone_verification(uuid, text, text, text, text, text) from public, authenticated, anon;
grant execute on function public.start_phone_verification(uuid, text, text, text, text, text) to service_role;

-- The pending verification for a user, with the number decrypted for the provider check.
create or replace function public.get_pending_phone_verification(p_user_id uuid)
returns table (id uuid, provider text, country_code text, e164 text, provider_reference text, code_hash text, attempts integer, expired boolean)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.provider, v.country_code, private.decrypt_sensitive_field(v.phone_encrypted), v.provider_reference, v.code_hash, v.attempts, v.expires_at < now()
  from public.phone_verifications v
  where v.user_id = p_user_id and v.status = 'pending'
  order by v.created_at desc limit 1;
$$;
revoke all on function public.get_pending_phone_verification(uuid) from public, authenticated, anon;
grant execute on function public.get_pending_phone_verification(uuid) to service_role;

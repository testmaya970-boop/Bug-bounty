-- 1. Add funds: the organization picks the gateway (Stripe, PayPal, Razorpay) instead of it being
--    implied by currency. `gateway` records the choice even when the sandbox stands in for it.
alter table public.organization_deposits
  add column if not exists gateway text check (gateway in ('stripe', 'paypal', 'razorpay'));

drop function if exists public.start_card_deposit(uuid, text, bigint, bigint, text, text);

create or replace function public.start_card_deposit(p_organization_id uuid, p_currency text, p_amount_minor_units bigint, p_charged_minor_units bigint, p_provider text, p_reference text, p_gateway text)
returns public.organization_deposits
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  deposit public.organization_deposits;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can add funds' using errcode = '42501';
  end if;
  if p_provider not in ('sandbox', 'razorpay', 'stripe', 'paypal') then raise exception 'INVALID_DEPOSIT: unknown card provider' using errcode = '22023'; end if;
  if p_gateway not in ('stripe', 'paypal', 'razorpay') or (p_provider <> 'sandbox' and p_provider <> p_gateway) then
    raise exception 'INVALID_DEPOSIT: unknown payment gateway' using errcode = '22023';
  end if;
  if (p_gateway = 'razorpay') <> (p_currency = 'INR') then raise exception 'INVALID_DEPOSIT: Razorpay takes rupees; Stripe and PayPal take dollars' using errcode = '22023'; end if;
  if not private.check_and_consume_rate_limit('org_card_deposit:' || p_organization_id, 30, 86400) then
    raise exception 'RATE_LIMITED: too many card payments started today -- try again tomorrow' using errcode = '53400';
  end if;
  insert into public.organization_deposits (organization_id, currency, amount_minor_units, charged_minor_units, method, provider, payer_reference, requested_by, gateway)
  values (p_organization_id, p_currency, p_amount_minor_units, p_charged_minor_units, 'card', p_provider, p_reference, actor, p_gateway)
  returning * into deposit;
  return deposit;
end;
$$;
revoke all on function public.start_card_deposit(uuid, text, bigint, bigint, text, text, text) from public, anon;
grant execute on function public.start_card_deposit(uuid, text, bigint, bigint, text, text, text) to authenticated;

-- 2. Researcher payout accounts connected through the provider's own consent page (PayPal,
--    Stripe). A connection is only "connected" after the callback proved the state and the
--    provider returned an account; only the server (service role) records that.
create table public.researcher_payout_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('paypal', 'stripe')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'failed', 'disconnected')),
  state_hash text not null unique,
  mode text not null check (mode in ('sandbox', 'live')),
  account_reference text check (char_length(account_reference) <= 200),
  account_label text check (char_length(account_label) <= 200),
  failure_reason text check (char_length(failure_reason) <= 300),
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index researcher_payout_connections_one_live on public.researcher_payout_connections(user_id, provider) where status = 'connected';
alter table public.researcher_payout_connections enable row level security;
create policy "own payout connections" on public.researcher_payout_connections for select to authenticated using (user_id = auth.uid() or private.is_platform_admin());
grant select on public.researcher_payout_connections to authenticated;
grant select, insert, update on public.researcher_payout_connections to service_role;

create or replace function public.disconnect_my_payout_connection(p_provider text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.researcher_payout_connections set status = 'disconnected', updated_at = now()
   where user_id = auth.uid() and provider = p_provider and status = 'connected';
  if not found then raise exception 'NOT_FOUND: no connected account for that provider' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.disconnect_my_payout_connection(text) from public, anon;
grant execute on function public.disconnect_my_payout_connection(text) to authenticated;

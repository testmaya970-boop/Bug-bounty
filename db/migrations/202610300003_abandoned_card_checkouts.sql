-- A card / PayPal / Razorpay deposit is recorded as "pending" the moment checkout starts. When
-- the payer walks away, nothing ever closes it, and it sat in "waiting for confirmation" on the
-- Payments page for good. It is not failed: the provider can still confirm it later (a late
-- payment on an open link), and complete_card_deposit keeps the first verdict, so closing it
-- here could lose real money. Instead a card checkout untouched for an hour no longer counts as
-- money on its way; bank transfers awaiting review still do. Same function as
-- 202610290008_managed_triage.sql, only the pending filter changed.

create or replace function private.organization_balance(p_organization_id uuid)
returns table (currency text, deposited bigint, pending_deposits bigint, committed bigint, paid bigint, available bigint)
language sql stable security definer set search_path = ''
as $$
  with d as (
    select d.currency,
      coalesce(sum(d.amount_minor_units) filter (where d.status = 'confirmed'), 0)::bigint as deposited,
      coalesce(sum(d.amount_minor_units) filter (where d.status = 'pending' and (d.method <> 'card' or d.created_at > now() - interval '1 hour')), 0)::bigint as pending_deposits
    from public.organization_deposits d where d.organization_id = p_organization_id group by d.currency
  ), o as (
    select x.currency, sum(x.committed)::bigint as committed, sum(x.paid)::bigint as paid
    from (
      select o.currency,
        coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units) filter (where o.status in ('pending', 'processing', 'failed')), 0) as committed,
        coalesce(sum(o.amount_minor_units + o.platform_fee_minor_units) filter (where o.status = 'succeeded'), 0) as paid
      from public.payment_obligations o where o.organization_id = p_organization_id and o.funded_from_balance group by o.currency
      union all
      select c.currency, 0, sum(c.amount_minor_units)
      from public.organization_service_charges c where c.organization_id = p_organization_id group by c.currency
    ) x group by x.currency
  )
  select coalesce(d.currency, o.currency), coalesce(d.deposited, 0), coalesce(d.pending_deposits, 0), coalesce(o.committed, 0), coalesce(o.paid, 0),
    coalesce(d.deposited, 0) - coalesce(o.committed, 0) - coalesce(o.paid, 0)
  from d full join o on o.currency = d.currency
  order by 1;
$$;
revoke all on function private.organization_balance(uuid) from public, anon, authenticated;

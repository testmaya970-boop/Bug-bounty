-- Invoices for customers in every country (202610150002 follow-up). The GST treatment was decided
-- by currency: an Indian company paying in USD got "export, zero-rated" (no GST), and a foreign
-- company paying in INR was taxed as domestic. Under GST the place of supply for these services
-- is the customer's location, so tax now follows the buyer's billing country (see the comment in
-- the function). GST treatment still needs confirmation from a chartered accountant before real
-- invoices are issued (as noted in 202610150002).
CREATE OR REPLACE FUNCTION public.issue_invoices_for_period(p_period_start date, p_period_end date, p_seller jsonb)
 RETURNS SETOF invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  grp record;
  profile public.organization_billing_profiles;
  org public.organizations;
  fy text := private.financial_year_of(current_date);
  seq integer;
  subtotal bigint;
  cgst bigint;
  sgst bigint;
  igst bigint;
  note text;
  inv public.invoices;
  buyer jsonb;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if p_period_end < p_period_start or p_period_end >= current_date then
    raise exception 'INVALID_PERIOD: invoice a period that has already ended' using errcode = '22023';
  end if;
  if coalesce(p_seller ->> 'name', '') = '' or coalesce(p_seller ->> 'state_code', '') !~ '^[0-3][0-9]$' then
    raise exception 'SELLER_NOT_CONFIGURED: set the invoice seller name, GSTIN and state code in server configuration' using errcode = '22023';
  end if;

  for grp in
    select o.organization_id, o.currency, array_agg(o.id) as obligation_ids, sum(o.platform_fee_minor_units)::bigint as fees
    from public.payment_obligations o
    join lateral (select max(a.completed_at) as paid_at from public.payment_attempts a where a.payment_obligation_id = o.id and a.state = 'succeeded') pa on true
    where o.status = 'succeeded' and o.funded_from_balance and o.platform_fee_minor_units > 0
      and pa.paid_at >= p_period_start and pa.paid_at < p_period_end + 1
      and not exists (select 1 from public.invoice_lines l where l.obligation_id = o.id)
    group by o.organization_id, o.currency
  loop
    continue when exists (select 1 from public.invoices i where i.organization_id = grp.organization_id and i.currency = grp.currency and i.period_start = p_period_start);
    select * into org from public.organizations where id = grp.organization_id;
    select * into profile from public.organization_billing_profiles where organization_id = grp.organization_id;
    buyer := case when profile.organization_id is null
      then jsonb_build_object('name', org.name)
      else jsonb_build_object('name', profile.legal_name, 'gstin', profile.gstin, 'address_line', profile.address_line, 'city', profile.city,
        'postal_code', profile.postal_code, 'country', profile.country, 'state_code', profile.state_code) end;

    subtotal := grp.fees;
    cgst := 0; sgst := 0; igst := 0;
    -- Place of supply follows the customer's location, not the currency (202610200001).
    -- Customer in India (or no profile and paying in INR): 18% GST on the fee -- CGST 9% +
    -- SGST 9% within the seller's state, otherwise IGST 18%. Customer abroad paying in a
    -- foreign currency: export of services, zero-rated under LUT. Customer abroad paying in
    -- INR is not an export of services: IGST 18%. Half-paise round up.
    if upper(coalesce(profile.country, '')) = 'IN' or (profile.organization_id is null and grp.currency = 'INR') then
      if profile.state_code is not null and profile.state_code = p_seller ->> 'state_code' then
        cgst := (subtotal * 9 + 50) / 100;
        sgst := cgst;
        note := 'Intra-state supply: CGST 9% and SGST 9% on the platform fee.';
      else
        igst := (subtotal * 18 + 50) / 100;
        note := 'Inter-state supply: IGST 18% on the platform fee.';
      end if;
    elsif grp.currency <> 'INR' then
      note := 'Export of services' || coalesce(' to ' || upper(profile.country), '') || ': zero-rated, supplied under LUT without payment of IGST.';
    else
      igst := (subtotal * 18 + 50) / 100;
      note := 'Supply to a customer in ' || upper(profile.country) || ' paid in INR is not an export of services: IGST 18% on the platform fee.';
    end if;

    insert into public.invoice_sequences (financial_year, last_number) values (fy, 1)
    on conflict (financial_year) do update set last_number = public.invoice_sequences.last_number + 1
    returning last_number into seq;

    insert into public.invoices (organization_id, number, financial_year, currency, period_start, period_end, issued_by, seller, buyer,
      subtotal_minor_units, cgst_minor_units, sgst_minor_units, igst_minor_units, total_minor_units, tax_note)
    values (grp.organization_id, 'UNP/' || fy || '/' || lpad(seq::text, 5, '0'), fy, grp.currency, p_period_start, p_period_end, actor, p_seller, buyer,
      subtotal, cgst, sgst, igst, subtotal + cgst + sgst + igst, note)
    returning * into inv;

    insert into public.invoice_lines (invoice_id, obligation_id, description, bounty_minor_units, fee_minor_units, paid_at)
    select inv.id, o.id, 'Platform fee: ' || coalesce(p.name, 'Program') || ' / ' || coalesce(r.title, 'Report'), o.amount_minor_units, o.platform_fee_minor_units,
      (select max(a.completed_at) from public.payment_attempts a where a.payment_obligation_id = o.id and a.state = 'succeeded')
    from public.payment_obligations o
    left join public.programs p on p.id = o.program_id
    left join public.reports r on r.id = o.report_id
    where o.id = any (grp.obligation_ids);

    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, grp.organization_id, 'billing.invoice_issued', 'organization', grp.organization_id,
      jsonb_build_object('invoice_id', inv.id, 'number', inv.number, 'currency', inv.currency, 'total_minor_units', inv.total_minor_units,
        'summary', 'Invoice ' || inv.number || ' for ' || inv.currency || ' ' || to_char(inv.total_minor_units / 100.0, 'FM999999999990.00') || ' is ready in Payments.'));
    return next inv;
  end loop;
end;
$function$;

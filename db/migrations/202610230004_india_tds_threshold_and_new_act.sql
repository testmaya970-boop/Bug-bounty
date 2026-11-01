-- Indian TDS, aligned with the law in force (decision 2026-10-23: follow standard platform and
-- statutory practice; no separate advisor sign-off).
--   * Payments from 1 April 2026 fall under the Income-tax Act, 2025: fees for professional
--     services are section 393 (formerly section 194J of the 1961 Act), same 10% rate, 20%
--     without a PAN (formerly 206AA).
--   * No TDS until a researcher's payments in the financial year pass Rs 50,000; on the payout
--     that crosses it, tax is deducted on the year's whole amount (less what was already
--     deducted), as the threshold works for professional fees.
-- The threshold is counted on rupee payouts. ponytail: payouts in another currency apply the rate
-- from the first one (no conversion rate is recorded); convert at the RBI rate if that matters.
-- US (W-9 / backup 24%) and everyone else (no withholding) already match what the major
-- platforms do and are unchanged.

create or replace function private.payout_withholding_rule(p_user_id uuid)
returns table (country text, regime text, rate_bps integer, legal_basis text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.researcher_payout_details;
  has_pan boolean;
begin
  select * into d from public.researcher_payout_details where user_id = p_user_id;
  if d.tax_residence_country = 'IN' then
    select k.pan_number_encrypted is not null and k.pan_status <> 'rejected' into has_pan from public.researcher_kyc k where k.user_id = p_user_id;
    if coalesce(has_pan, false) then
      return query select 'IN'::text, 'in_194j'::text, 1000, 'Income-tax Act 2025, section 393 (fees for professional services, formerly section 194J): 10%'::text;
    else
      return query select 'IN'::text, 'in_206aa'::text, 2000, 'Income-tax Act 2025, section 393 at the no-PAN rate (formerly section 206AA): 20%'::text;
    end if;
  elsif d.tax_residence_country = 'US' then
    if d.tax_form_type = 'w9' and d.tax_id_encrypted is not null and d.tax_form_status <> 'rejected' then
      return query select 'US'::text, 'us_1099'::text, 0, 'W-9 on file: no withholding, reported on Form 1099-NEC'::text;
    else
      return query select 'US'::text, 'us_backup'::text, 2400, 'Internal Revenue Code section 3406: backup withholding, no W-9 TIN on file (24%)'::text;
    end if;
  else
    return query select d.tax_residence_country, 'none'::text, 0, 'No withholding for this tax residence'::text;
  end if;
end;
$$;

create or replace function private.apply_payout_withholding() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ob public.payment_obligations;
  w public.payout_tax_withholdings;
  rule record;
  withheld bigint;
  basis text;
  fee bigint;
  fee_gst bigint := 0;
  fy text := private.financial_year_of(current_date);
  fy_start date := (substr(fy, 1, 4) || '-04-01')::date;
  prior_gross bigint;
  prior_withheld bigint;
  seq integer;
  invoice_number text;
begin
  select * into w from public.payout_tax_withholdings where obligation_id = new.payment_obligation_id;
  if w.obligation_id is null then
    select * into ob from public.payment_obligations where id = new.payment_obligation_id;
    select * into rule from private.payout_withholding_rule(ob.researcher_id);
    basis := coalesce(rule.legal_basis, 'No withholding for this tax residence');
    -- TDS on the full bounty; half a minor unit rounds up, like the GST lines on invoices.
    withheld := (ob.amount_minor_units * coalesce(rule.rate_bps, 0) + 5000) / 10000;
    if rule.regime in ('in_194j', 'in_206aa') and ob.currency = 'INR' then
      select coalesce(sum(x.gross_minor_units), 0), coalesce(sum(x.withheld_minor_units), 0) into prior_gross, prior_withheld
      from public.payout_tax_withholdings x
      where x.researcher_id = ob.researcher_id and x.currency = 'INR' and x.regime in ('in_194j', 'in_206aa') and x.created_at >= fy_start;
      if prior_gross + ob.amount_minor_units <= 5000000 then
        withheld := 0;
        basis := basis || '. Not deducted: payments this financial year are within the Rs 50,000 threshold';
      else
        withheld := greatest(((prior_gross + ob.amount_minor_units) * rule.rate_bps + 5000) / 10000 - prior_withheld, 0);
        if prior_gross > 0 and prior_withheld = 0 then basis := basis || '. Threshold crossed: includes tax on earlier payments this financial year'; end if;
      end if;
    end if;
    fee := ob.researcher_fee_minor_units;
    if fee > 0 then
      if rule.country = 'IN' then fee_gst := (fee * 18 + 50) / 100; end if;
      insert into public.researcher_fee_invoice_sequences (financial_year, last_number) values (fy, 1)
      on conflict (financial_year) do update set last_number = public.researcher_fee_invoice_sequences.last_number + 1
      returning last_number into seq;
      invoice_number := 'UNP-RF/' || fy || '/' || lpad(seq::text, 5, '0');
    end if;
    if ob.amount_minor_units - withheld - fee - fee_gst <= 0 then
      raise exception 'PAYOUT_NOT_POSITIVE: tax and fee would take the whole bounty' using errcode = '23514';
    end if;
    insert into public.payout_tax_withholdings (obligation_id, researcher_id, country, regime, rate_bps, legal_basis, currency, gross_minor_units, withheld_minor_units,
      fee_minor_units, fee_gst_minor_units, fee_invoice_number, net_minor_units)
    values (ob.id, ob.researcher_id, rule.country, coalesce(rule.regime, 'none'), coalesce(rule.rate_bps, 0), basis,
      ob.currency, ob.amount_minor_units, withheld, fee, fee_gst, invoice_number, ob.amount_minor_units - withheld - fee - fee_gst)
    returning * into w;
  end if;
  new.requested_amount_minor_units := w.net_minor_units;
  return new;
end;
$$;

-- Audit P2: a program manager could press "Finalize bounty" but could not see the two things
-- finalize_bounty checks (the organization's balance and the program's budget), so an award
-- was refused with no way to have known. check_award_funding answers, before confirming, with
-- exactly the same arithmetic as finalize_bounty (bounty + the 20% platform fee):
--   * the program budget (cap, used, left) -- program information its manager may see;
--   * whether the organization balance covers this award -- a yes/no only, so the balance
--     figure itself stays visible to finance roles alone.
-- Read only: same authorization as finalizing, but no row or advisory lock is taken.

create or replace function public.check_award_funding(target_report_id uuid, p_amount_minor_units bigint)
returns table (currency text, needed_minor_units bigint, balance_covers boolean, budget_currency text, budget_cap_minor_units bigint, budget_left_minor_units bigint, budget_covers boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  report public.reports;
  decision public.report_bounty_decisions;
  needed bigint;
  available bigint;
  budget public.program_budgets;
  left_amount bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if p_amount_minor_units is null or p_amount_minor_units < 0 then
    raise exception 'INVALID_BOUNTY_AMOUNT: enter a non-negative amount' using errcode = '22023';
  end if;
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot make financial decisions for this report' using errcode = '42501';
  end if;
  select * into decision from public.report_bounty_decisions where report_id = target_report_id;
  if decision.id is null then
    raise exception 'BOUNTY_NOT_READY: calculate a bounty recommendation before finalizing one' using errcode = '23514';
  end if;

  needed := p_amount_minor_units + (p_amount_minor_units * 2000) / 10000; -- same as finalize_bounty
  select b.available into available from private.organization_balance(report.organization_id) b where b.currency = decision.currency;
  select * into budget from public.program_budgets where program_id = report.program_id;
  if budget.program_id is not null then
    left_amount := budget.cap_minor_units - private.program_budget_used(report.program_id, budget.currency);
  end if;

  return query select decision.currency, needed, coalesce(available, 0) >= needed,
    budget.currency, budget.cap_minor_units, left_amount,
    case when budget.program_id is null then true else budget.currency = decision.currency and left_amount >= needed end;
end;
$$;
revoke all on function public.check_award_funding(uuid, bigint) from public, anon;
grant execute on function public.check_award_funding(uuid, bigint) to authenticated;

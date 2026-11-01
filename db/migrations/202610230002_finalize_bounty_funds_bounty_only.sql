-- Since 202610230001 the organization funds the bounty only (the fee comes from the researcher),
-- so finalize_bounty checks the balance and the program budget against the bounty alone.
-- Body regenerated from the live definition with only the fee term removed.
CREATE OR REPLACE FUNCTION public.finalize_bounty(target_report_id uuid, p_amount_minor_units bigint, p_note text)
 RETURNS report_bounty_decisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  trimmed_note text := nullif(trim(coalesce(p_note, '')), '');
  updated public.report_bounty_decisions;
  remaining bigint;
  budget public.program_budgets;
  budget_left bigint;
begin
  report := private.lock_and_authorize_report_for_finance(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id;
  if decision.id is null then
    raise exception 'BOUNTY_NOT_READY: calculate a bounty recommendation before finalizing one' using errcode = '23514';
  end if;
  if decision.state = 'finalized' then
    raise exception 'BOUNTY_ALREADY_FINALIZED: this report''s bounty has already been finalized' using errcode = '23514';
  end if;
  if decision.state = 'ineligible' then
    raise exception 'BOUNTY_NOT_READY: this report is not eligible for a bounty' using errcode = '23514';
  end if;

  perform private.check_bounty_amount(decision, p_amount_minor_units, trimmed_note);
  if trimmed_note is not null and char_length(trimmed_note) > 2000 then
    raise exception 'INVALID_BOUNTY_AMOUNT: Note must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  -- The award must be funded (202610140004): refuse it here, not only later at payment
  -- creation, so a researcher is never told of a bounty the balance can't cover.
  -- ponytail: checked, not reserved -- another award can still spend the money before this
  -- one's payment is created (that insert re-checks under the same lock).
  if p_amount_minor_units > 0 then
    perform pg_advisory_xact_lock(hashtextextended('org_balance:' || report.organization_id || ':' || decision.currency, 0));
    select b.available into remaining from private.organization_balance(report.organization_id) b where b.currency = decision.currency;
    if coalesce(remaining, 0) < p_amount_minor_units then
      raise exception 'INSUFFICIENT_BALANCE: this bounty needs % % but the % balance has % available -- add funds first',
        decision.currency, round((p_amount_minor_units) / 100.0, 2), decision.currency, round(coalesce(remaining, 0) / 100.0, 2)
        using errcode = '23514';
    end if;
  end if;

  if p_amount_minor_units > 0 then
    -- Program budget (202610150002): an award may not take the program past its cap.
    select * into budget from public.program_budgets where program_id = report.program_id;
    if budget.program_id is not null then
      if budget.currency <> decision.currency then
        raise exception 'PROGRAM_BUDGET_CURRENCY: this program''s budget is in %; change the budget or the bounty table to match', budget.currency using errcode = '23514';
      end if;
      budget_left := budget.cap_minor_units - private.program_budget_used(report.program_id, budget.currency);
      if budget_left < (p_amount_minor_units) then
        raise exception 'PROGRAM_BUDGET_EXCEEDED: this award needs % % but the program has % % left in its budget -- raise the budget in Payments',
          budget.currency, round((p_amount_minor_units) / 100.0, 2), budget.currency, round(greatest(budget_left, 0) / 100.0, 2) using errcode = '23514';
      end if;
    end if;
  
  end if;

  update public.report_bounty_decisions set
    state = 'finalized', final_amount_minor_units = p_amount_minor_units, finalized_by = actor, finalized_at = now(),
    finalization_note = trimmed_note, updated_at = now()
    where report_id = target_report_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.finalized', 'report', target_report_id,
    jsonb_build_object('amount_minor_units', p_amount_minor_units, 'currency', decision.currency));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values ('bounty.finalized', 1, 'report', target_report_id, report.organization_id,
    jsonb_build_object('report_id', target_report_id, 'program_id', report.program_id, 'organization_id', report.organization_id, 'researcher_id', report.researcher_id));

  return updated;
end;
$function$
;

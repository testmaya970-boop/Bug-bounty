-- Audit PAY-2 / PAY-3 / PAY-6 (P1). Table-level guards on the money path, so every current
-- and future write path is covered.
--
-- PAY-2: record_manual_payment_result accepted 'succeeded' with no reference, so "paid"
--   meant only "the org says so" (live: 3 of 3 succeeded attempts had no reference).
--   A succeeded attempt now needs a transfer reference. (Requiring a second person to mark
--   it paid is NOT done here -- it would block single-owner organizations; pending a
--   product decision.)
-- PAY-3: adjust_bounty only checked state = 'finalized', so a bounty could be changed after
--   an obligation existed or was paid, leaving the decision and the ledger disagreeing.
--   The amount is now frozen once a non-cancelled obligation exists.
-- PAY-6: if a researcher later joins the organization's staff, nothing stopped them from
--   awarding, paying, accepting or resolving their own report. The report's researcher and
--   its collaborators are now refused on every money table and on accept/resolve.

create or replace function private.forbid_self_dealing(target_report_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then return; end if;
  if exists (select 1 from public.reports r where r.id = target_report_id and r.researcher_id = actor)
     or exists (select 1 from public.report_collaborators c where c.report_id = target_report_id and c.researcher_id = actor) then
    raise exception 'FORBIDDEN: you cannot make decisions or payments on your own report' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.forbid_self_dealing(uuid) from public;

create or replace function private.guard_bounty_decision()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.forbid_self_dealing(new.report_id);
  if tg_op = 'UPDATE'
     and old.final_amount_minor_units is distinct from new.final_amount_minor_units
     and exists (select 1 from public.payment_obligations o where o.bounty_decision_id = old.id and o.status <> 'cancelled') then
    raise exception 'BOUNTY_IN_PAYMENT: this bounty already has a payment in progress or completed and can no longer be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.guard_payment_obligation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.forbid_self_dealing(new.report_id);
  return new;
end;
$$;

create or replace function private.guard_payment_attempt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.forbid_self_dealing((select o.report_id from public.payment_obligations o where o.id = new.payment_obligation_id));
  if new.state = 'succeeded' and nullif(trim(coalesce(new.provider_reference_id, '')), '') is null then
    raise exception 'PAYMENT_REFERENCE_REQUIRED: enter the transfer reference (e.g. a wire confirmation number) to record a successful payment' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.guard_report_outcome()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('accepted', 'resolved') and old.status is distinct from new.status then
    perform private.forbid_self_dealing(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.guard_bounty_decision() from public;
revoke all on function private.guard_payment_obligation() from public;
revoke all on function private.guard_payment_attempt() from public;
revoke all on function private.guard_report_outcome() from public;

drop trigger if exists report_bounty_decisions_guard on public.report_bounty_decisions;
create trigger report_bounty_decisions_guard
  before insert or update on public.report_bounty_decisions
  for each row execute function private.guard_bounty_decision();

drop trigger if exists payment_obligations_guard on public.payment_obligations;
create trigger payment_obligations_guard
  before insert or update on public.payment_obligations
  for each row execute function private.guard_payment_obligation();

drop trigger if exists payment_attempts_guard on public.payment_attempts;
create trigger payment_attempts_guard
  before insert or update on public.payment_attempts
  for each row execute function private.guard_payment_attempt();

drop trigger if exists reports_guard_outcome on public.reports;
create trigger reports_guard_outcome
  before update of status on public.reports
  for each row execute function private.guard_report_outcome();

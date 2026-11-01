-- Post-award bonuses (docs/plans/organization-integrations.md, module 6).
--
-- A bonus is an extra amount on top of a finalized bounty, paid through exactly the existing
-- money path: its own payment_obligations rows (bonus_id set), split across accepted collaborators
-- the same way as the bounty (floored shares, remainder to the submitter), funded from the prepaid
-- balance and the program budget (guard_obligation_balance), with the platform fee taken from the
-- researcher's side (fee_from_researcher) and tax withheld at payout like any obligation.
--
-- Approval: proposed by whoever may finalize bounties (lock_and_authorize_report_for_finance), and
-- approved by a DIFFERENT owner or security admin, or by platform staff. Only approval creates
-- obligations, in the same transaction, so nothing is paid without a second person.
-- Idempotent: a client-supplied key makes a retried proposal return the first one.
-- Bonuses don't change reputation. Limits: each bonus at most the bounty itself, five per report.

create table public.report_bonuses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  bounty_decision_id uuid not null references public.report_bounty_decisions(id),
  amount_minor_units bigint not null check (amount_minor_units > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text not null check (reason in ('exceptional_quality', 'retest', 'campaign', 'other')),
  note text not null check (char_length(note) between 5 and 1000),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'cancelled')),
  idempotency_key uuid not null unique,
  proposed_by uuid not null references public.users(id),
  proposed_at timestamptz not null default now(),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000)
);
create index report_bonuses_report_idx on public.report_bonuses(report_id);
create index report_bonuses_org_pending_idx on public.report_bonuses(organization_id) where status = 'proposed';
alter table public.report_bonuses enable row level security;
-- Organization finance staff, platform staff, and the report's own researchers once approved.
create policy "bonuses read by org finance staff and the report's researchers" on public.report_bonuses for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin', 'program_manager', 'billing_admin']::public.organization_member_role[])
    or (status = 'approved' and (exists (select 1 from public.reports r where r.id = report_id and r.researcher_id = auth.uid()) or private.is_report_collaborator(report_id)))
    or private.is_platform_admin()
  );
revoke all on public.report_bonuses from anon, authenticated;
grant select on public.report_bonuses to authenticated;
grant select, insert, update on public.report_bonuses to service_role;

-- Bonus obligations live beside the bounty's: one live obligation per recipient per bounty AND per bonus.
alter table public.payment_obligations add column if not exists bonus_id uuid references public.report_bonuses(id);
drop index if exists public.payment_obligations_one_live_per_recipient;
create unique index payment_obligations_one_live_per_recipient on public.payment_obligations(bounty_decision_id, researcher_id) where status <> 'cancelled' and bonus_id is null;
create unique index payment_obligations_one_live_per_bonus_recipient on public.payment_obligations(bonus_id, researcher_id) where status <> 'cancelled' and bonus_id is not null;

-- The bounty's own checks ignore bonus obligations: a bonus never counts as "the award".
CREATE OR REPLACE FUNCTION public.create_payment_obligation(target_report_id uuid)
 RETURNS SETOF payment_obligations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  platform_fee_bps constant integer := 2000;
  collaborator record;
  share bigint;
  remainder bigint;
  obligation public.payment_obligations;
begin
  report := private.lock_and_authorize_report_for_payments(target_report_id);

  select * into decision from public.report_bounty_decisions where report_id = target_report_id for update;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'BOUNTY_NOT_FINALIZED: only a finalized bounty decision can create a payment obligation' using errcode = '23514';
  end if;
  if decision.final_amount_minor_units <= 0 then
    raise exception 'NOTHING_TO_PAY: this bounty was finalized at zero, no payment obligation is needed' using errcode = '23514';
  end if;
  if exists (select 1 from public.payment_obligations o where o.bounty_decision_id = decision.id and o.bonus_id is null and o.status <> 'cancelled') then
    raise exception 'OBLIGATION_ALREADY_EXISTS: payment obligations already exist for this bounty -- cancel them first to re-issue' using errcode = '23514';
  end if;
  if private.has_open_bounty_dispute(target_report_id) then
    raise exception 'BOUNTY_DISPUTED: the researcher has an open dispute about this bounty -- settle the mediation first' using errcode = '23514';
  end if;

  remainder := decision.final_amount_minor_units;
  for collaborator in
    select c.researcher_id, c.bounty_split_percent from public.report_collaborators c
    where c.report_id = target_report_id and c.bounty_split_percent > 0
    order by c.added_at, c.researcher_id
  loop
    share := floor(decision.final_amount_minor_units * collaborator.bounty_split_percent / 100);
    continue when share <= 0;
    remainder := remainder - share;
    insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, platform_fee_minor_units, currency, status)
    values (report.organization_id, report.program_id, target_report_id, collaborator.researcher_id, decision.id, share, (share * platform_fee_bps) / 10000, decision.currency, 'pending')
    returning * into obligation;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, report.organization_id, 'payment.obligation_created', 'report', target_report_id,
      jsonb_build_object('obligation_id', obligation.id, 'researcher_id', obligation.researcher_id, 'amount_minor_units', obligation.amount_minor_units,
                         'platform_fee_minor_units', obligation.platform_fee_minor_units, 'currency', obligation.currency, 'split_percent', collaborator.bounty_split_percent));
    return next obligation;
  end loop;

  if remainder > 0 then
    insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, platform_fee_minor_units, currency, status)
    values (report.organization_id, report.program_id, target_report_id, report.researcher_id, decision.id, remainder, (remainder * platform_fee_bps) / 10000, decision.currency, 'pending')
    returning * into obligation;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, report.organization_id, 'payment.obligation_created', 'report', target_report_id,
      jsonb_build_object('obligation_id', obligation.id, 'researcher_id', obligation.researcher_id, 'amount_minor_units', obligation.amount_minor_units,
                         'platform_fee_minor_units', obligation.platform_fee_minor_units, 'currency', obligation.currency));
    return next obligation;
  end if;
end;
$function$;

create or replace function private.guard_bounty_decision()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.forbid_self_dealing(new.report_id);
  if tg_op = 'UPDATE'
     and old.final_amount_minor_units is distinct from new.final_amount_minor_units
     and exists (select 1 from public.payment_obligations o where o.bounty_decision_id = old.id and o.bonus_id is null and o.status <> 'cancelled') then
    raise exception 'BOUNTY_IN_PAYMENT: this bounty already has a payment in progress or completed and can no longer be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.propose_bonus(p_report_id uuid, p_amount_minor_units bigint, p_reason text, p_note text, p_idempotency_key uuid)
returns public.report_bonuses
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  existing public.report_bonuses;
  result public.report_bonuses;
begin
  select * into existing from public.report_bonuses where idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.proposed_by <> actor or existing.report_id <> p_report_id then raise exception 'INVALID_INPUT: that request key is already used' using errcode = '22023'; end if;
    return existing; -- a retried request
  end if;
  report := private.lock_and_authorize_report_for_finance(p_report_id);
  select * into decision from public.report_bounty_decisions where report_id = p_report_id for update;
  if decision.id is null or decision.state <> 'finalized' or decision.final_amount_minor_units <= 0 then
    raise exception 'BONUS_NOT_ELIGIBLE: a bonus can only follow a finalized bounty' using errcode = '23514';
  end if;
  if private.has_open_bounty_dispute(p_report_id) then
    raise exception 'BOUNTY_DISPUTED: settle the open dispute about this bounty first' using errcode = '23514';
  end if;
  if p_reason not in ('exceptional_quality', 'retest', 'campaign', 'other') then raise exception 'INVALID_INPUT: choose a reason' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null or char_length(trim(p_note)) < 5 then raise exception 'NOTE_REQUIRED: tell the researcher what the bonus is for' using errcode = '22023'; end if;
  if p_amount_minor_units is null or p_amount_minor_units <= 0 then raise exception 'INVALID_AMOUNT: enter an amount above zero' using errcode = '22023'; end if;
  if p_amount_minor_units > decision.final_amount_minor_units then
    raise exception 'BONUS_TOO_LARGE: a bonus can be at most the bounty itself (% %)', decision.currency, round(decision.final_amount_minor_units / 100.0, 2) using errcode = '23514';
  end if;
  if (select count(*) from public.report_bonuses where report_id = p_report_id and status in ('proposed', 'approved')) >= 5 then
    raise exception 'LIMIT_REACHED: a report can have at most five bonuses' using errcode = '54000';
  end if;
  insert into public.report_bonuses (report_id, organization_id, program_id, bounty_decision_id, amount_minor_units, currency, reason, note, idempotency_key, proposed_by)
  values (report.id, report.organization_id, report.program_id, decision.id, p_amount_minor_units, decision.currency, p_reason, trim(p_note), p_idempotency_key, actor)
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.bonus_proposed', 'report', report.id, jsonb_build_object('bonus_id', result.id, 'amount_minor_units', p_amount_minor_units, 'currency', result.currency, 'reason', p_reason));
  return result;
end;
$$;

/** Approve (creating the payment obligations, funded from the balance) or reject. Never by the
 * proposer: a second owner / security admin, or platform staff. */
create or replace function public.decide_bonus(p_bonus_id uuid, p_approve boolean, p_note text)
returns public.report_bonuses
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  b public.report_bonuses;
  report public.reports;
  platform_fee_bps constant integer := 2000;
  collaborator record;
  share bigint;
  remainder bigint;
  obligation public.payment_obligations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into b from public.report_bonuses where id = p_bonus_id for update;
  if b.id is null then raise exception 'NOT_FOUND: bonus not found' using errcode = 'P0002'; end if;
  if not (private.has_org_role(b.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_platform_admin()) then
    raise exception 'FORBIDDEN: only an owner, a security admin or platform staff can approve bonuses' using errcode = '42501';
  end if;
  if b.proposed_by = actor then raise exception 'SELF_APPROVAL: someone other than the proposer must approve this bonus' using errcode = '42501'; end if;
  if b.status <> 'proposed' then raise exception 'NOT_PENDING: this bonus was already %', b.status using errcode = '23514'; end if;
  if not p_approve and nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED: say why the bonus is rejected' using errcode = '22023'; end if;

  if not p_approve then
    update public.report_bonuses set status = 'rejected', decided_by = actor, decided_at = now(), decision_note = trim(p_note) where id = b.id returning * into b;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, b.organization_id, 'bounty.bonus_rejected', 'report', b.report_id, jsonb_build_object('bonus_id', b.id));
    return b;
  end if;

  select * into report from public.reports where id = b.report_id for update;
  if private.has_open_bounty_dispute(b.report_id) then raise exception 'BOUNTY_DISPUTED: settle the open dispute about this bounty first' using errcode = '23514'; end if;

  -- Same split as the bounty: accepted collaborators by share (floored), the rest to the submitter.
  remainder := b.amount_minor_units;
  for collaborator in
    select c.researcher_id, c.bounty_split_percent from public.report_collaborators c
    where c.report_id = b.report_id and c.bounty_split_percent > 0 order by c.added_at, c.researcher_id
  loop
    share := floor(b.amount_minor_units * collaborator.bounty_split_percent / 100);
    continue when share <= 0;
    remainder := remainder - share;
    insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, bonus_id, amount_minor_units, platform_fee_minor_units, currency, status)
    values (b.organization_id, b.program_id, b.report_id, collaborator.researcher_id, b.bounty_decision_id, b.id, share, (share * platform_fee_bps) / 10000, b.currency, 'pending')
    returning * into obligation;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, b.organization_id, 'payment.obligation_created', 'report', b.report_id,
      jsonb_build_object('obligation_id', obligation.id, 'researcher_id', obligation.researcher_id, 'amount_minor_units', obligation.amount_minor_units,
        'platform_fee_minor_units', obligation.platform_fee_minor_units, 'currency', obligation.currency, 'split_percent', collaborator.bounty_split_percent, 'bonus_id', b.id));
  end loop;
  if remainder > 0 then
    insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, bonus_id, amount_minor_units, platform_fee_minor_units, currency, status)
    values (b.organization_id, b.program_id, b.report_id, report.researcher_id, b.bounty_decision_id, b.id, remainder, (remainder * platform_fee_bps) / 10000, b.currency, 'pending')
    returning * into obligation;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, b.organization_id, 'payment.obligation_created', 'report', b.report_id,
      jsonb_build_object('obligation_id', obligation.id, 'researcher_id', obligation.researcher_id, 'amount_minor_units', obligation.amount_minor_units,
        'platform_fee_minor_units', obligation.platform_fee_minor_units, 'currency', obligation.currency, 'bonus_id', b.id));
  end if;

  update public.report_bonuses set status = 'approved', decided_by = actor, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = b.id returning * into b;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, b.organization_id, 'bounty.bonus_approved', 'report', b.report_id, jsonb_build_object('bonus_id', b.id, 'amount_minor_units', b.amount_minor_units, 'currency', b.currency));
  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, organization_id, payload)
  values ('bounty.bonus_approved', 'report', b.report_id, b.organization_id, jsonb_build_object('report_id', b.report_id, 'program_id', b.program_id, 'organization_id', b.organization_id, 'bonus_id', b.id));
  return b;
end;
$$;

create or replace function public.cancel_bonus(p_bonus_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b public.report_bonuses;
begin
  select * into b from public.report_bonuses where id = p_bonus_id for update;
  if b.id is null or not (b.proposed_by = auth.uid() or private.has_org_role(b.organization_id, array['owner', 'security_admin']::public.organization_member_role[])) then
    raise exception 'NOT_FOUND: bonus not found' using errcode = 'P0002';
  end if;
  if b.status <> 'proposed' then raise exception 'NOT_PENDING: only a proposed bonus can be withdrawn' using errcode = '23514'; end if;
  update public.report_bonuses set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = b.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), b.organization_id, 'bounty.bonus_cancelled', 'report', b.report_id, jsonb_build_object('bonus_id', b.id));
end;
$$;

revoke all on function public.propose_bonus(uuid, bigint, text, text, uuid) from public, anon;
grant execute on function public.propose_bonus(uuid, bigint, text, text, uuid) to authenticated;
revoke all on function public.decide_bonus(uuid, boolean, text) from public, anon;
grant execute on function public.decide_bonus(uuid, boolean, text) to authenticated;
revoke all on function public.cancel_bonus(uuid) from public, anon;
grant execute on function public.cancel_bonus(uuid) to authenticated;

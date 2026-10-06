-- Bounty/payout lifecycle, competitive-parity group 1. Builds on the existing ledger
-- (report_bounty_decisions -> payment_obligations -> payment_attempts); no new money path.
--
-- 1. Collaborator splits are applied: create_payment_obligation creates one obligation per
--    recipient -- each collaborator's bounty_split_percent (floored) and the remainder to the
--    submitter. The (report_id, researcher_id) FK that pinned every obligation to the
--    submitter is replaced by a trigger accepting the submitter or a collaborator.
-- 2. A cancelled award can be paid again: the one-obligation-per-decision unique becomes
--    one LIVE obligation per (decision, recipient). Once every obligation is cancelled the
--    amount can be adjusted (existing guard) and obligations re-created.
-- 3. Payout gate in the database: a payout attempt cannot start until the recipient has a
--    payout method, a verified tax form, and -- where the program requires it -- verified
--    KYC. Tax forms gain a platform-admin review (nothing could verify one before).
-- 4. Researcher response: the submitter can confirm the award (bounty_acceptances, bound to
--    the exact amount -- an adjustment voids it) or dispute it through the existing
--    mediation (reason disagree_with_bounty). An open/escalated bounty dispute blocks
--    creating obligations and starting payouts.
-- 5. Notifications: payment and bounty-change audit rows enqueue outbox events (same
--    audit_logs-trigger pattern as 202609250007), routed to the obligation's recipient;
--    an opened mediation notifies the organization.
-- 6. Accounting: the org spend summary reports awarded, paid (succeeded obligations) and
--    outstanding separately -- it previously labelled finalized awards as "paid".

-- ---------------------------------------------------------------------------
-- 1 + 2. Obligations per recipient, re-creatable after cancellation
-- ---------------------------------------------------------------------------

alter table public.payment_obligations drop constraint payment_obligations_bounty_decision_id_key;
alter table public.payment_obligations drop constraint payment_obligations_report_id_researcher_id_fkey;
create unique index payment_obligations_one_live_per_recipient
  on public.payment_obligations (bounty_decision_id, researcher_id) where status <> 'cancelled';
create index payment_obligations_researcher_id_idx on public.payment_obligations (researcher_id);

create or replace function private.guard_payment_obligation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.forbid_self_dealing(new.report_id);
  if tg_op = 'INSERT' and not exists (
    select 1 from public.reports r where r.id = new.report_id and r.researcher_id = new.researcher_id
    union all
    select 1 from public.report_collaborators c where c.report_id = new.report_id and c.researcher_id = new.researcher_id
  ) then
    raise exception 'INVALID_RECIPIENT: a payment obligation can only be owed to the report''s researcher or a collaborator' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Collaborators can already read the report (RLS); notification emails must agree.
create or replace function private.can_currently_read_report(target_report_id uuid, candidate_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = target_report_id;
  if r.id is null then
    return false;
  end if;

  return r.researcher_id = candidate_user_id
    or exists (select 1 from public.report_collaborators c where c.report_id = r.id and c.researcher_id = candidate_user_id)
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = r.organization_id and om.user_id = candidate_user_id and om.status = 'active' and om.role in ('owner', 'security_admin')
    )
    or exists (
      select 1 from public.program_members pm where pm.program_id = r.program_id and pm.user_id = candidate_user_id
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Payout readiness
-- ---------------------------------------------------------------------------

create or replace function private.payout_blockers(target_researcher_id uuid, target_program_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select array_remove(array[
    case when not exists (select 1 from public.researcher_payout_details d where d.user_id = target_researcher_id and d.method is not null)
      then 'payout_method_missing' end,
    case when not exists (select 1 from public.researcher_payout_details d where d.user_id = target_researcher_id and d.tax_form_status = 'verified')
      then 'tax_form_not_verified' end,
    case when exists (select 1 from public.programs p where p.id = target_program_id and p.requires_kyc)
          and not private.researcher_has_verified_kyc(target_researcher_id)
      then 'kyc_not_verified' end
  ], null);
$$;

create or replace function private.has_open_bounty_dispute(target_report_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.report_mediations m
    where m.report_id = target_report_id and m.reason = 'disagree_with_bounty' and m.status in ('open', 'escalated')
  );
$$;

-- Who is owed what on a report, and what still blocks paying each of them. Never exposes
-- payout destinations: only which requirement is missing. Finance roles see every
-- recipient; a recipient sees only their own row.
create or replace function public.get_report_payout_readiness(target_report_id uuid)
returns table (researcher_id uuid, display_name text, blockers text[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  is_finance boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  is_finance := private.has_org_role(report.organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]);

  return query
    select u.id, u.display_name, private.payout_blockers(u.id, report.program_id)
    from (
      select report.researcher_id as id
      union
      select c.researcher_id from public.report_collaborators c where c.report_id = report.id
    ) recipients
    join public.users u on u.id = recipients.id
    where is_finance or recipients.id = actor;
end;
$$;

create or replace function public.list_pending_tax_forms()
returns table (user_id uuid, display_name text, email text, tax_form_type public.tax_form_type, tax_id_last4 text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin required' using errcode = '42501'; end if;
  return query
    select d.user_id, u.display_name, u.email, d.tax_form_type, d.tax_id_last4, d.tax_form_submitted_at
    from public.researcher_payout_details d
    join public.users u on u.id = d.user_id
    where d.tax_form_status = 'pending'
    order by d.tax_form_submitted_at asc nulls last;
end;
$$;

create or replace function public.review_tax_form(target_user_id uuid, p_decision public.kyc_status, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin required' using errcode = '42501'; end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'INVALID_DECISION: decision must be verified or rejected' using errcode = '22023';
  end if;
  if actor = target_user_id then
    raise exception 'FORBIDDEN: you cannot review your own tax form' using errcode = '42501';
  end if;

  update public.researcher_payout_details set
    tax_form_status = p_decision,
    tax_form_reviewed_at = now(),
    tax_form_review_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where user_id = target_user_id and tax_form_status = 'pending';
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: no pending tax form for this researcher' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'payout.tax_form_reviewed', 'researcher_payout_details', target_user_id, jsonb_build_object('decision', p_decision));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Researcher confirms an award
-- ---------------------------------------------------------------------------

create table public.bounty_acceptances (
  bounty_decision_id uuid not null references public.report_bounty_decisions(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  researcher_id uuid not null references public.users(id) on delete restrict,
  amount_minor_units bigint not null check (amount_minor_units >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  accepted_at timestamptz not null default now(),
  primary key (bounty_decision_id, amount_minor_units)
);

alter table public.bounty_acceptances enable row level security;
create policy "bounty acceptances read by anyone who can read the report" on public.bounty_acceptances
  for select to authenticated using (private.can_currently_read_report(report_id, auth.uid()));
grant select on public.bounty_acceptances to authenticated;
grant select, insert, update, delete on public.bounty_acceptances to service_role;

create or replace function public.accept_bounty(target_report_id uuid)
returns public.bounty_acceptances
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  decision public.report_bounty_decisions;
  accepted public.bounty_acceptances;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id;
  if report.id is null or report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can confirm this bounty' using errcode = '42501';
  end if;
  select * into decision from public.report_bounty_decisions where report_id = target_report_id for update;
  if decision.id is null or decision.state <> 'finalized' then
    raise exception 'BOUNTY_NOT_FINALIZED: there is no finalized bounty to confirm' using errcode = '23514';
  end if;
  if private.has_open_bounty_dispute(target_report_id) then
    raise exception 'BOUNTY_DISPUTED: withdraw or settle your open bounty dispute first' using errcode = '23514';
  end if;

  insert into public.bounty_acceptances (bounty_decision_id, report_id, researcher_id, amount_minor_units, currency)
  values (decision.id, report.id, actor, decision.final_amount_minor_units, decision.currency)
  on conflict (bounty_decision_id, amount_minor_units) do nothing
  returning * into accepted;
  if accepted.bounty_decision_id is null then
    select * into accepted from public.bounty_acceptances where bounty_decision_id = decision.id and amount_minor_units = decision.final_amount_minor_units;
    return accepted;
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'bounty.accepted', 'report', target_report_id,
    jsonb_build_object('amount_minor_units', decision.final_amount_minor_units, 'currency', decision.currency));
  return accepted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 + 2 + 3 + 4. Creating obligations and starting payouts
-- ---------------------------------------------------------------------------

drop function public.create_payment_obligation(uuid);
create function public.create_payment_obligation(target_report_id uuid)
returns setof public.payment_obligations
language plpgsql security definer set search_path = ''
as $$
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
  if exists (select 1 from public.payment_obligations o where o.bounty_decision_id = decision.id and o.status <> 'cancelled') then
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
$$;

create or replace function public.initiate_manual_payment_attempt(target_obligation_id uuid)
returns public.payment_attempts
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  obligation public.payment_obligations;
  next_attempt_number integer;
  attempt public.payment_attempts;
  blockers text[];
begin
  obligation := private.lock_and_authorize_obligation_for_finance(target_obligation_id);

  if obligation.status = 'processing' then
    raise exception 'PAYMENT_ALREADY_PROCESSING: an attempt is already in progress for this obligation' using errcode = '23514';
  end if;
  if obligation.status in ('succeeded', 'cancelled') then
    raise exception 'PAYMENT_NOT_ELIGIBLE_FOR_ATTEMPT: this obligation is % and cannot receive a new attempt', obligation.status using errcode = '23514';
  end if;
  if private.has_open_bounty_dispute(obligation.report_id) then
    raise exception 'BOUNTY_DISPUTED: the researcher has an open dispute about this bounty -- settle the mediation first' using errcode = '23514';
  end if;
  blockers := private.payout_blockers(obligation.researcher_id, obligation.program_id);
  if cardinality(blockers) > 0 then
    raise exception 'PAYOUT_NOT_READY: the researcher cannot be paid yet (%)', array_to_string(blockers, ', ') using errcode = '23514';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into next_attempt_number from public.payment_attempts where payment_obligation_id = target_obligation_id;

  -- The full bounty: the fee is the organization's charge, not the researcher's.
  insert into public.payment_attempts (payment_obligation_id, attempt_number, provider, state, requested_amount_minor_units, currency)
  values (target_obligation_id, next_attempt_number, 'manual', 'requires_operator_action', obligation.amount_minor_units, obligation.currency)
  returning * into attempt;

  update public.payment_obligations set status = 'processing', updated_at = now() where id = target_obligation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, obligation.organization_id, 'payment.initiated', 'report', obligation.report_id,
    jsonb_build_object('obligation_id', obligation.id, 'attempt_id', attempt.id, 'attempt_number', next_attempt_number, 'provider', 'manual',
                       'amount_minor_units', obligation.amount_minor_units, 'platform_fee_minor_units', obligation.platform_fee_minor_units));

  return attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Notifications
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type = any (array[
  'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
  'report_not_applicable', 'report_rejected', 'bounty_finalized', 'report_triage_started', 'report_accepted',
  'report_message_posted',
  'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated',
  'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled', 'report_mediation_opened'
]));

alter table public.notifications drop constraint notifications_category_matches_type_check;
alter table public.notifications add constraint notifications_category_matches_type_check check (
  (category = 'report_activity' and notification_type = any (array[
    'report_created', 'report_needs_information', 'report_resolved', 'report_duplicate', 'report_informative',
    'report_not_applicable', 'report_rejected', 'report_triage_started', 'report_accepted', 'report_message_posted',
    'report_mediation_opened'
  ]))
  or (category = 'bounty_activity' and notification_type = any (array[
    'bounty_finalized', 'bounty_adjusted', 'payment_scheduled', 'payment_succeeded', 'payment_failed', 'payment_cancelled'
  ]))
  or (category = 'platform_activity' and notification_type = any (array[
    'program_suspended', 'program_reinstated', 'organization_suspended', 'organization_reinstated'
  ]))
);

create or replace function private.enqueue_payment_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.action like 'payment.%' then
    select o.researcher_id into recipient from public.payment_obligations o where o.id = (new.metadata ->> 'obligation_id')::uuid;
  elsif new.action = 'bounty.adjusted' then
    select r.researcher_id into recipient from public.reports r where r.id = new.entity_id;
  end if;

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload, occurred_at)
  values (
    new.action, 1, 'report', new.entity_id, new.organization_id,
    jsonb_build_object('audit_log_id', new.id, 'report_id', new.entity_id, 'recipient_id', recipient),
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists audit_logs_enqueue_payment_event on public.audit_logs;
create trigger audit_logs_enqueue_payment_event
  after insert on public.audit_logs
  for each row
  when (new.action in ('payment.obligation_created', 'payment.succeeded', 'payment.failed', 'payment.cancelled', 'bounty.adjusted', 'report.mediation_opened'))
  execute function private.enqueue_payment_event();

-- Worker-only. Provenance: the event's own audit row must exist with the matching action.
create or replace function public.route_payment_notifications(p_source_event_id uuid, p_notification_type text)
returns setof public.notifications
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.outbox_events;
  report public.reports;
  expected_action text;
  v_category text;
  recipient uuid;
begin
  expected_action := case p_notification_type
    when 'payment_scheduled' then 'payment.obligation_created'
    when 'payment_succeeded' then 'payment.succeeded'
    when 'payment_failed' then 'payment.failed'
    when 'payment_cancelled' then 'payment.cancelled'
    when 'bounty_adjusted' then 'bounty.adjusted'
    when 'report_mediation_opened' then 'report.mediation_opened'
  end;
  if expected_action is null then
    raise exception 'INVALID_NOTIFICATION_TYPE: % is not a payment notification type', p_notification_type using errcode = '22023';
  end if;

  select * into ev from public.outbox_events where id = p_source_event_id;
  if ev.id is null then raise exception 'EVENT_NOT_FOUND: source event no longer exists' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.audit_logs al
    where al.id = (ev.payload ->> 'audit_log_id')::uuid and al.action = expected_action and al.entity_id = ev.aggregate_id
  ) then
    raise exception 'PROVENANCE_MISMATCH: no matching audit record for this notification' using errcode = '23514';
  end if;

  select * into report from public.reports where id = ev.aggregate_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: referenced report no longer exists' using errcode = 'P0002'; end if;

  if p_notification_type = 'report_mediation_opened' then
    v_category := 'report_activity';
    for recipient in select * from private.resolve_report_organization_recipients(report.id) loop
      if coalesce((select np.email_enabled from public.notification_preferences np where np.user_id = recipient and np.category = v_category), true) then
        insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
        values (recipient, report.organization_id, report.program_id, report.id, v_category, p_notification_type, ev.id, ev.occurred_at)
        on conflict (source_event_id, recipient_id) do nothing;
      end if;
    end loop;
  else
    -- Money owed to the recipient is never opt-out, matching bounty_finalized.
    recipient := (ev.payload ->> 'recipient_id')::uuid;
    if recipient is not null then
      insert into public.notifications (recipient_id, organization_id, program_id, report_id, category, notification_type, source_event_id, occurred_at)
      values (recipient, report.organization_id, report.program_id, report.id, 'bounty_activity', p_notification_type, ev.id, ev.occurred_at)
      on conflict (source_event_id, recipient_id) do nothing;
    end if;
  end if;

  return query select * from public.notifications where source_event_id = p_source_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Awarded vs paid
-- ---------------------------------------------------------------------------

drop function public.get_organization_bounty_spend_summary(uuid);
create function public.get_organization_bounty_spend_summary(target_organization_id uuid)
returns table (
  currency text,
  total_awarded_minor_units numeric,
  total_paid_minor_units numeric,
  total_outstanding_minor_units numeric,
  award_count bigint,
  paid_critical_count bigint,
  paid_high_count bigint,
  paid_medium_count bigint,
  paid_low_count bigint,
  paid_none_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.authorize_organization_analytics_read(target_organization_id);

  -- paid_<severity>_count keeps its historical meaning (finalized awards by severity).
  return query
  with obligations as (
    select o.currency,
      sum(o.amount_minor_units) filter (where o.status = 'succeeded') as paid,
      sum(o.amount_minor_units) filter (where o.status in ('pending', 'processing', 'failed')) as outstanding
    from public.payment_obligations o
    where o.organization_id = target_organization_id
    group by o.currency
  ),
  awards as (
    select d.currency,
      sum(d.final_amount_minor_units) as awarded,
      count(*) as n,
      count(*) filter (where d.severity_at_calculation = 'critical') as critical,
      count(*) filter (where d.severity_at_calculation = 'high') as high,
      count(*) filter (where d.severity_at_calculation = 'medium') as medium,
      count(*) filter (where d.severity_at_calculation = 'low') as low,
      count(*) filter (where d.severity_at_calculation = 'none') as none
    from public.report_bounty_decisions d
    where d.organization_id = target_organization_id and d.state = 'finalized'
    group by d.currency
  )
  select a.currency, a.awarded, coalesce(o.paid, 0), coalesce(o.outstanding, 0), a.n, a.critical, a.high, a.medium, a.low, a.none
  from awards a
  left join obligations o on o.currency = a.currency
  order by a.awarded desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.payout_blockers(uuid, uuid) from public;
revoke all on function private.has_open_bounty_dispute(uuid) from public;
revoke all on function private.enqueue_payment_event() from public;
revoke all on function public.create_payment_obligation(uuid) from public, anon;
revoke all on function public.get_report_payout_readiness(uuid) from public, anon;
revoke all on function public.list_pending_tax_forms() from public, anon;
revoke all on function public.review_tax_form(uuid, public.kyc_status, text) from public, anon;
revoke all on function public.accept_bounty(uuid) from public, anon;
revoke all on function public.get_organization_bounty_spend_summary(uuid) from public, anon;
grant execute on function public.create_payment_obligation(uuid) to authenticated;
grant execute on function public.get_report_payout_readiness(uuid) to authenticated;
grant execute on function public.list_pending_tax_forms() to authenticated;
grant execute on function public.review_tax_form(uuid, public.kyc_status, text) to authenticated;
grant execute on function public.accept_bounty(uuid) to authenticated;
grant execute on function public.get_organization_bounty_spend_summary(uuid) to authenticated;
revoke all on function public.route_payment_notifications(uuid, text) from public, authenticated, anon;
grant execute on function public.route_payment_notifications(uuid, text) to service_role;

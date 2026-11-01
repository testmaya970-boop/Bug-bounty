-- Race conditions from the 2026-10-13 system design review. Every app transaction runs at
-- READ COMMITTED, so concurrent writers are ordered only by row locks and unique constraints.
--
--  * deactivate_my_account: two co-owners deactivating at once both passed the "another
--    owner exists" check and the org was left with no owner (write skew; probed).
--  * verify_mfa_challenge: one emailed code, sent twice at once, verified two sessions
--    (the blocked caller re-checked only the id, not consumed_at; probed).
--  * prepare_notification_email: a delivery reclaimed by a second worker could be emailed
--    twice; it is now locked and skipped while another worker is sending it.
--  * submit_ctf_flag: a double-submitted correct flag raised a raw unique-violation error.
--  * initiate_manual_payment_attempt: could start while a dispute was being opened.

-- public.deactivate_my_account: co-owners deactivating at once queue on the owner rows (from 202609280003_deactivation_keeps_an_owner.sql)
create or replace function public.deactivate_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sole_owner_of text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  -- Two co-owners deactivating at the same moment both saw "another owner exists" and both
  -- left. Locking every owner row of the actor's orgs (same order everywhere) serialises them;
  -- the second one re-reads after the first commits and gets LAST_OWNER.
  perform 1 from public.organization_members m
  where m.role = 'owner' and m.status = 'active'
    and m.organization_id in (select o.organization_id from public.organization_members o where o.user_id = actor and o.role = 'owner' and o.status = 'active')
  order by m.organization_id, m.user_id
  for update;

  select o.name into sole_owner_of
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = actor and m.role = 'owner' and m.status = 'active'
    and not exists (
      select 1 from public.organization_members other
      join public.users u on u.id = other.user_id
      where other.organization_id = m.organization_id and other.role = 'owner' and other.status = 'active'
        and other.user_id <> actor and u.deactivated_at is null
    )
  order by o.name
  limit 1;
  if sole_owner_of is not null then
    raise exception 'LAST_OWNER: You are the only owner of %. Make another member an owner before you deactivate your account.', sole_owner_of using errcode = '42501';
  end if;

  update public.users set deactivated_at = now(), updated_at = now() where id = actor;
  delete from public.sessions where user_id = actor;
end;
$$;

-- public.verify_mfa_challenge: one code can't verify two sessions (from 202610010002_fix_mfa_verify_challenge_lookup.sql)
create or replace function public.verify_mfa_challenge(p_code_hash text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.mfa_challenges;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  update public.mfa_challenges
    set attempts = attempts + 1
    -- consumed_at is re-checked on the row itself: a concurrent caller blocked on this row
    -- used to pass after the first one consumed it (only the id was re-evaluated).
    where consumed_at is null and id = (
      select id from public.mfa_challenges
      where user_id = actor and consumed_at is null
      order by created_at desc
      limit 1
    )
    returning * into challenge;

  if challenge is null then
    raise exception 'INVALID_CODE: that code is invalid or has expired' using errcode = '22023';
  end if;

  if challenge.expires_at <= now() or challenge.attempts >= 5 or challenge.code_hash <> p_code_hash then
    if challenge.expires_at <= now() or challenge.attempts >= 5 then
      update public.mfa_challenges set consumed_at = now() where id = challenge.id;
    end if;
    return 'invalid';
  end if;

  update public.mfa_challenges set consumed_at = now() where id = challenge.id;

  if challenge.purpose = 'enroll' then
    update public.mfa_factors set status = 'verified', verified_at = now() where user_id = actor;
  end if;

  return challenge.purpose;
end;
$$;

-- public.prepare_notification_email: a delivery another worker is sending isn't sent twice (from 202609250007_platform_notifications.sql)
create or replace function public.prepare_notification_email(p_delivery_id uuid)
returns table (
  deliverable boolean,
  reason text,
  recipient_email text,
  recipient_display_name text,
  report_title text,
  program_name text,
  organization_name text,
  notification_type text,
  occurred_at timestamptz
)
language plpgsql set search_path = ''
as $$
declare
  delivery public.notification_deliveries;
  notif public.notifications;
  authorized boolean;
begin
  select * into delivery from public.notification_deliveries where id = p_delivery_id for update;
  if delivery.id is null then
    return query select false, 'DELIVERY_NOT_FOUND'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if delivery.state in ('delivered', 'permanent_failure') then
    return query select false, 'ALREADY_TERMINAL'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Another worker claimed it moments ago (lease reclaim, retry): let that one finish. A
  -- 'processing' row older than 5 minutes is a worker that died mid-send, so it is retried.
  if delivery.state = 'processing' and delivery.updated_at > now() - interval '5 minutes' then
    return query select false, 'IN_PROGRESS'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into notif from public.notifications where id = delivery.notification_id;

  if notif.category = 'platform_activity' then
    -- Still an active owner/security_admin of the organization the notice is about.
    authorized := exists (
      select 1 from public.organization_members m
      where m.organization_id = notif.organization_id and m.user_id = notif.recipient_id
        and m.status = 'active' and m.role in ('owner', 'security_admin')
    );
  else
    authorized := private.can_currently_read_report(notif.report_id, notif.recipient_id);
  end if;

  if not authorized then
    update public.notification_deliveries
      set state = 'permanent_failure', last_error = 'RECIPIENT_NO_LONGER_AUTHORIZED', updated_at = now()
      where id = p_delivery_id;
    return query select false, 'RECIPIENT_NO_LONGER_AUTHORIZED'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  update public.notification_deliveries set state = 'processing', updated_at = now() where id = p_delivery_id;

  return query
    select true, null::text, u.email, u.display_name, rp.title, prog.name, org.name, notif.notification_type, notif.occurred_at
    from public.notifications n
    join public.users u on u.id = n.recipient_id
    left join public.reports rp on rp.id = n.report_id
    left join public.programs prog on prog.id = n.program_id
    join public.organizations org on org.id = n.organization_id
    where n.id = notif.id;
end;
$$;

-- public.submit_ctf_flag: a double-submitted correct flag doesn't error (from 202610120002_qa_fixes_reputation_and_low_findings.sql)
create or replace function public.submit_ctf_flag(p_challenge_id text, p_flag text)
returns table (correct boolean, points_awarded integer, already_solved boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.ctf_challenges;
  newly_solved boolean := false;
  event_credits integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if exists (select 1 from public.users u where u.id = actor and (u.account_type = 'organization' or u.is_suspended)) then
    raise exception 'FORBIDDEN: this account cannot take part in CTF challenges' using errcode = '42501';
  end if;

  select * into challenge from public.ctf_challenges where id = p_challenge_id;
  if challenge.id is null then raise exception 'CHALLENGE_NOT_FOUND: unknown challenge' using errcode = 'P0002'; end if;

  if p_flag is null or encode(extensions.digest(trim(p_flag), 'sha256'), 'hex') <> challenge.flag_hash then
    correct := false; points_awarded := 0; already_solved := false; return next; return;
  end if;

  -- Practice score and reputation: once per researcher and challenge, ever.
  insert into public.ctf_solves (researcher_id, challenge_id, points_awarded)
  values (actor, p_challenge_id, challenge.points)
  on conflict (researcher_id, challenge_id) do nothing;
  if found then
    insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, source_event_id, event_type, schema_version, occurred_at)
    values (actor, null, null, null, 'ctf_challenge_solved', null, 'ctf.solved', 1, now());
    newly_solved := true;
  end if;

  -- Events: once per event, even for a challenge solved before the event opened.
  with credited as (
    insert into public.ctf_event_solves (event_id, researcher_id, challenge_id, points_awarded, solved_at)
    select e.id, actor, p_challenge_id, challenge.points, now()
    from public.ctf_events e
    join public.ctf_event_challenges c on c.event_id = e.id and c.challenge_id = p_challenge_id
    where e.status <> 'draft' and now() >= e.starts_at and now() < e.ends_at
    on conflict (event_id, researcher_id, challenge_id) do nothing
    returning 1
  )
  select count(*) into event_credits from credited;

  correct := true;
  already_solved := not newly_solved and event_credits = 0;
  points_awarded := case when already_solved then 0 else challenge.points end;
  return next;
end;
$$;

-- public.initiate_manual_payment_attempt: a dispute opened at the same moment is seen (from 202610060008_payout_lifecycle.sql)
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
  -- open_report_mediation locks the report; share-lock it so a dispute being opened right now
  -- is either visible here or waits for this attempt.
  perform 1 from public.reports r where r.id = obligation.report_id for share;
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

-- Audit P1-3 (Oct 15 system design audit): only reports had their lifecycle enforced at table
-- level (a transitions table + a BEFORE UPDATE trigger). Programs, payment obligations and
-- payment attempts were enforced only inside each RPC, so any new or edited function (or a
-- service-role script) could write an impossible status. They now follow the report pattern:
-- the transitions are data, and a trigger refuses anything not listed, whoever writes it.
-- Every transition the existing RPCs perform is listed (checked against the live catalog), so
-- no current flow changes.

-- Programs ------------------------------------------------------------------------------
-- The suspension edges were missing from the table (suspend/reinstate used hardcoded checks).
-- reinstate_program restores pre_suspension_status, which is active or paused.
insert into private.program_status_transitions (from_status, to_status) values
  ('active', 'suspended'), ('paused', 'suspended'), ('suspended', 'active'), ('suspended', 'paused')
on conflict do nothing;

create or replace function private.enforce_program_status_transition()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not exists (
    select 1 from private.program_status_transitions t where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'INVALID_PROGRAM_TRANSITION: a program cannot go from % to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger programs_enforce_status_transition
  before update of status on public.programs
  for each row execute function private.enforce_program_status_transition();

-- Payment obligations ------------------------------------------------------------------
create table private.payment_obligation_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);
insert into private.payment_obligation_transitions values
  ('pending', 'processing'),    -- initiate a payout
  ('failed', 'processing'),     -- retry after a failed attempt
  ('processing', 'succeeded'),  -- manual or provider result
  ('processing', 'failed'),
  ('pending', 'cancelled'),     -- cancel before paying, or a platform admin in a dispute
  ('failed', 'cancelled');

create or replace function private.enforce_payment_obligation_transition()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not exists (
    select 1 from private.payment_obligation_transitions t where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'INVALID_PAYMENT_TRANSITION: a payment cannot go from % to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payment_obligations_enforce_status_transition
  before update of status on public.payment_obligations
  for each row execute function private.enforce_payment_obligation_transition();

-- Payment attempts ---------------------------------------------------------------------
create table private.payment_attempt_transitions (
  from_state text not null,
  to_state text not null,
  primary key (from_state, to_state)
);
insert into private.payment_attempt_transitions values
  ('requires_operator_action', 'pending_provider'), -- handed to a payout provider
  ('requires_operator_action', 'succeeded'),        -- manual payout recorded
  ('requires_operator_action', 'failed'),
  ('pending_provider', 'succeeded'),                -- provider webhook
  ('pending_provider', 'failed');

create or replace function private.enforce_payment_attempt_transition()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.state is distinct from old.state and not exists (
    select 1 from private.payment_attempt_transitions t where t.from_state = old.state and t.to_state = new.state
  ) then
    raise exception 'INVALID_PAYMENT_TRANSITION: a payout attempt cannot go from % to %', old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payment_attempts_enforce_state_transition
  before update of state on public.payment_attempts
  for each row execute function private.enforce_payment_attempt_transition();

revoke all on private.payment_obligation_transitions, private.payment_attempt_transitions from public;

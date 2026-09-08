-- VDP vs. Paid-Bounty Program Type. Every existing program is implicitly "bounty
-- optional" today -- there is no first-class distinction between a pure
-- vulnerability-disclosure-only program (no payment, ever) and one that pays. Many real
-- organizations start with a VDP before graduating to a paid program; that on-ramp did
-- not exist. This slice adds it.
--
-- Design decisions:
-- 1. program_type is a real column on public.programs, not a derived fact ("has a bounty
--    policy" is not the same question -- a bounty program can exist with zero policy
--    versions configured yet, mid-setup). Default 'bounty' so every existing program's
--    real behavior is completely unchanged by this migration.
-- 2. A VDP program is enforced, not merely labeled: create_bounty_policy_version
--    (redefined, not duplicated) now rejects outright on a 'vdp' program -- this is a
--    real constraint an organization cannot bypass by simply not mentioning it in the
--    UI, matching this schema's existing pattern of enforcing every domain rule at the
--    RPC layer first.
-- 3. program_type may only be set at creation, not changed afterward, in this slice --
--    switching a live VDP program to paid-bounty (or back) is a real product decision
--    with real implications for researchers already working under the original terms;
--    deferring the transition RPC rather than building a shallow one. A program is
--    created once and its type is a foundational fact about it from that point on, the
--    same way asset scope precedence rules are foundational rather than editable
--    after the fact.
-- 4. No new authorization concept -- program_type is set by the same actor
--    (owner/security_admin) who can already create a program.

create type public.program_type as enum ('bounty', 'vdp');

alter table public.programs add column program_type public.program_type not null default 'bounty';

comment on column public.programs.program_type is 'bounty: may configure a paid bounty policy. vdp: vulnerability-disclosure-only, no payment ever -- enforced by create_bounty_policy_version rejecting a vdp program outright, not just a UI convention. See docs/decisions/0058.';

-- ---------------------------------------------------------------------------
-- create_program, redefined (not duplicated) to accept an optional p_program_type,
-- defaulting to 'bounty' so every existing caller (and every existing test) keeps
-- working unchanged. Identical to the prior definition otherwise.
--
-- A changed parameter list is a distinct overload to Postgres -- the old 3-parameter
-- signature must be dropped explicitly, or both versions coexist and PostgREST's RPC
-- dispatch cannot disambiguate a plain {target_org_id, program_name, p_idempotency_key}
-- call between them (found live: this broke every program creation, including the demo
-- seed script, until this drop was added -- the exact same class of bug this file's own
-- 202609030006 sibling migration hit and fixed for set_report_severity).
-- ---------------------------------------------------------------------------

drop function if exists public.create_program(uuid, text, uuid);

create or replace function public.create_program(target_org_id uuid, program_name text, p_idempotency_key uuid default null, p_program_type public.program_type default 'bounty')
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(program_name);
  new_program public.programs;
  existing public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot create a program in this organization' using errcode = '42501';
  end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_NAME: Enter a program name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 160 then
    raise exception 'INVALID_NAME: Use 160 characters or fewer.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into existing from public.programs
      where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
    if existing.id is not null then
      return existing;
    end if;
  end if;

  begin
    insert into public.programs (organization_id, name, created_by, idempotency_key, program_type)
    values (target_org_id, trimmed_name, actor, p_idempotency_key, p_program_type)
    returning * into new_program;
  exception
    when unique_violation then
      select * into existing from public.programs
        where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
      if existing.id is not null then
        return existing;
      end if;
      raise;
  end;

  insert into public.program_members (program_id, organization_id, user_id, role, added_by)
  values (new_program.id, target_org_id, actor, 'manager', actor);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'program.created', 'program', new_program.id, jsonb_build_object('name', trimmed_name, 'program_type', p_program_type));

  return new_program;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_bounty_policy_version, redefined (not duplicated) to add exactly one new rule:
-- reject with PROGRAM_IS_VDP if the program's type is 'vdp'. Every other check, the
-- authorization gate, and the insert logic are unchanged from 202608280002.
-- ---------------------------------------------------------------------------

create or replace function public.create_bounty_policy_version(
  target_program_id uuid,
  p_currency text,
  p_none_min bigint, p_none_max bigint,
  p_low_min bigint, p_low_max bigint,
  p_medium_min bigint, p_medium_max bigint,
  p_high_min bigint, p_high_max bigint,
  p_critical_min bigint, p_critical_max bigint
)
returns public.program_bounty_policy_versions
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  previous public.program_bounty_policy_versions;
  new_version public.program_bounty_policy_versions;
  next_version_number integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot configure bounty policy for this program' using errcode = '42501';
  end if;

  if program.program_type = 'vdp' then
    raise exception 'PROGRAM_IS_VDP: this is a vulnerability-disclosure-only program and cannot have a paid bounty policy' using errcode = '55000';
  end if;

  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'INVALID_CURRENCY: Use a real 3-letter currency code.' using errcode = '22023';
  end if;

  if p_none_max < p_none_min or p_low_max < p_low_min or p_medium_max < p_medium_min or p_high_max < p_high_min or p_critical_max < p_critical_min then
    raise exception 'INVALID_RANGE: Each severity''s maximum must be at least its minimum.' using errcode = '22023';
  end if;
  if p_none_min < 0 or p_low_min < 0 or p_medium_min < 0 or p_high_min < 0 or p_critical_min < 0 then
    raise exception 'INVALID_RANGE: Amounts cannot be negative.' using errcode = '22023';
  end if;

  select * into previous from public.program_bounty_policy_versions
    where program_id = target_program_id and superseded_at is null
    order by version_number desc limit 1
    for update;

  next_version_number := coalesce(previous.version_number, 0) + 1;

  if previous.id is not null then
    update public.program_bounty_policy_versions set superseded_at = now() where id = previous.id;
  end if;

  insert into public.program_bounty_policy_versions (program_id, organization_id, version_number, currency, created_by)
  values (target_program_id, program.organization_id, next_version_number, p_currency, actor)
  returning * into new_version;

  insert into public.program_bounty_policy_severity_ranges (policy_version_id, severity, min_amount_minor_units, max_amount_minor_units) values
    (new_version.id, 'none', p_none_min, p_none_max),
    (new_version.id, 'low', p_low_min, p_low_max),
    (new_version.id, 'medium', p_medium_min, p_medium_max),
    (new_version.id, 'high', p_high_min, p_high_max),
    (new_version.id, 'critical', p_critical_min, p_critical_max);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.bounty_policy_created', 'program', target_program_id,
    jsonb_build_object('version_number', next_version_number, 'currency', p_currency));

  return new_version;
end;
$$;

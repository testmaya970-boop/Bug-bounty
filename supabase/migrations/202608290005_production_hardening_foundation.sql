-- Production Backend Hardening & Integration Boundary.
--
-- This migration is deliberately narrow: it adds a reusable, Postgres-backed rate-limit
-- primitive and applies it to a representative, well-justified subset of abuse-sensitive
-- mutations (proving the pattern end to end, database-authoritative, never a UI
-- convention), plus adds real cursor pagination to `list_my_reports` (the one
-- researcher-facing collection backed by a SECURITY DEFINER RPC rather than a plain,
-- directly-paginatable table select). It does not touch RLS, does not add a second
-- authorization system, and does not introduce Kafka/Redis/a queue -- rate limiting reuses
-- the same Postgres instance every other invariant in this schema already lives in.
--
-- See docs/decisions/0018-production-hardening-and-integration-boundary.md for the full
-- architecture inventory, the reasoning behind which mutations were chosen, and the
-- explicit list of remaining abuse-sensitive operations documented as a concrete next
-- step (invitations, evidence upload) rather than rushed into this same migration.

-- ---------------------------------------------------------------------------
-- private.rate_limit_counters: a fixed-window counter, one row per (bucket, window).
-- `bucket_key` always encodes a SERVER-DERIVED identity (an actor id from auth.uid(), or
-- a normalized email string checked by a security-definer wrapper) -- never a
-- client-supplied identity a caller could pick to reset or evade their own limit.
-- Deliberately not a sliding-window/token-bucket design: a fixed window is simpler,
-- adequate for a first implementation, and the exact class of primitive this task asks
-- to justify before reaching for anything more complex. Rows accumulate over time (one
-- per bucket per window that was ever hit); a scheduled cleanup of rows whose
-- window_start is old is a documented future operational task, not implemented here (see
-- the ADR's "Data retention" section) since no query ever reads an old window again.
-- ---------------------------------------------------------------------------

create table private.rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket_key, window_start)
);

-- ---------------------------------------------------------------------------
-- private.check_and_consume_rate_limit: one atomic upsert, not a check-then-increment --
-- the same race-safety lesson this session already learned and applied in 0016/0017.
-- Returns true if the caller may proceed (this attempt is within the limit), false if
-- the limit has been exceeded for the current window. Never raises for a limit
-- violation itself -- the caller decides what that means (a mutation RPC raises
-- RATE_LIMITED; a pre-auth check just returns false).
-- ---------------------------------------------------------------------------

create or replace function private.check_and_consume_rate_limit(p_bucket_key text, p_max_count integer, p_window_seconds integer)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  current_window timestamptz;
  current_count integer;
begin
  current_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limit_counters (bucket_key, window_start, count)
  values (p_bucket_key, current_window, 1)
  on conflict (bucket_key, window_start) do update set count = private.rate_limit_counters.count + 1
  returning count into current_count;

  return current_count <= p_max_count;
end;
$$;

revoke all on function private.check_and_consume_rate_limit(text, integer, integer) from public;
grant execute on function private.check_and_consume_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- check_sign_in_rate_limit: the ONE pre-auth boundary in this schema, so the caller is
-- necessarily `anon` (no session exists yet). A plain (non-definer) function callable by
-- `anon` could not reach into `private.*` at all (anon has no USAGE on that schema, by
-- design -- see 202608260001), so this is SECURITY DEFINER specifically to safely bridge
-- that gap, mirroring mark_notification_read/set_notification_preference's identical
-- reasoning (a narrowly-scoped, safe operation exposed to a low-privileged role). Keyed
-- by the normalized email the caller is ATTEMPTING to sign in as -- this rate-limits
-- attempts against one account, never reveals whether that account exists, and is
-- deliberately additional to (not a replacement for) Supabase Auth's own IP-based
-- default rate limiting on the auth endpoints themselves.
-- ---------------------------------------------------------------------------

create or replace function public.check_sign_in_rate_limit(p_email text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  return private.check_and_consume_rate_limit('auth_sign_in:' || lower(trim(p_email)), 10, 900);
end;
$$;

revoke all on function public.check_sign_in_rate_limit(text) from public;
grant execute on function public.check_sign_in_rate_limit(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_report: redefined, not duplicated, to add exactly one rate-limit check --
-- every prior line of logic (authorization, program-status, validation, canonicalization,
-- scope matching, the reports/audit_logs/outbox_events inserts) is unchanged. Keyed by
-- the server-derived actor id, never a client-supplied identifier. 30 submissions per
-- rolling-hour window is a deliberately generous initial value (a legitimate researcher
-- actively testing a program can submit several reports in a session); tuning this
-- number is an operational decision, not an architectural one.
-- ---------------------------------------------------------------------------

create or replace function public.submit_report(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  target_input text,
  p_title text,
  p_description text
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed_title text := trim(p_title);
  trimmed_description text := trim(p_description);
  canon record;
  match_result record;
  new_report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.check_and_consume_rate_limit('report_submit:' || actor::text, 30, 3600) then
    raise exception 'RATE_LIMITED: too many reports submitted recently, try again later' using errcode = '53400';
  end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not private.is_researcher_authorized_for_program(target_program_id) then
    raise exception 'FORBIDDEN: actor is not an authorized researcher for this program' using errcode = '42501';
  end if;

  if program.status in ('paused', 'closed') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;

  if trimmed_title is null or char_length(trimmed_title) = 0 then
    raise exception 'INVALID_TITLE: Enter a report title.' using errcode = '22023';
  end if;
  if char_length(trimmed_title) > 200 then
    raise exception 'INVALID_TITLE: Use 200 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TITLE: Report title contains invalid characters.' using errcode = '22023';
  end if;

  if trimmed_description is null or char_length(trimmed_description) = 0 then
    raise exception 'INVALID_DESCRIPTION: Enter a description.' using errcode = '22023';
  end if;
  if char_length(trimmed_description) > 20000 then
    raise exception 'INVALID_DESCRIPTION: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);
  select * into match_result from private.match_program_scope(target_program_id, p_asset_type, canon.canonical, canon.cidr_value, canon.url_origin, canon.url_path);

  if match_result.matched_entry_id is null or match_result.matched_scope_state <> 'in_scope' then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.' using errcode = '22023';
  end if;

  insert into public.reports (program_id, organization_id, researcher_id, title, description, asset_type, target, display_target, matched_scope_entry_id, matched_scope_state, matched_target)
  values (target_program_id, program.organization_id, actor, trimmed_title, trimmed_description, p_asset_type, canon.canonical, canon.display, match_result.matched_entry_id, match_result.matched_scope_state, match_result.matched_target)
  returning * into new_report;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'report.created', 'report', new_report.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical));

  insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload)
  values (
    'report.created', 1, 'report', new_report.id, program.organization_id,
    jsonb_build_object(
      'report_id', new_report.id, 'program_id', target_program_id, 'organization_id', program.organization_id,
      'researcher_id', actor, 'title', trimmed_title, 'asset_type', p_asset_type, 'display_target', canon.display
    )
  );

  return new_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_organization: redefined, not duplicated, to add exactly one rate-limit check --
-- every prior line (validation, idempotent replay, slug generation/retry, the
-- organizations/organization_members/audit_logs inserts) is unchanged. The existing
-- idempotency key prevents a double-submit from creating a DUPLICATE of the SAME
-- organization; it does not limit how many DIFFERENT organizations one actor can create,
-- which is what this rate limit actually protects against.
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(org_name text, p_idempotency_key uuid default null)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(org_name);
  base_slug text;
  candidate_slug text;
  new_org public.organizations;
  existing public.organizations;
  attempt integer := 0;
  conflicting_index text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.check_and_consume_rate_limit('org_create:' || actor::text, 10, 86400) then
    raise exception 'RATE_LIMITED: too many organizations created recently, try again later' using errcode = '53400';
  end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_NAME: Enter an organization name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 160 then
    raise exception 'INVALID_NAME: Use 160 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME: Organization name contains invalid characters.' using errcode = '22023';
  end if;

  -- Idempotent replay: a client-supplied key that already produced an organization for
  -- this actor returns that organization instead of creating another one.
  if p_idempotency_key is not null then
    select * into existing from public.organizations
      where created_by = actor and idempotency_key = p_idempotency_key;
    if found then
      return existing;
    end if;
  end if;

  base_slug := lower(regexp_replace(trimmed_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if char_length(base_slug) < 3 then
    base_slug := base_slug || '-' || substr(md5(random()::text), 1, greatest(6 - char_length(base_slug), 3));
  end if;
  base_slug := left(base_slug, 55);
  candidate_slug := base_slug;

  loop
    begin
      insert into public.organizations (slug, name, created_by, status, idempotency_key)
      values (candidate_slug, trimmed_name, actor, 'active', p_idempotency_key)
      returning * into new_org;
      exit;
    exception when unique_violation then
      -- Two distinct unique constraints can fire here: the slug (retry with a suffix) or
      -- the per-creator idempotency key under a genuine concurrent double-submit (fetch
      -- and return the row the other concurrent transaction just committed).
      get stacked diagnostics conflicting_index = constraint_name;
      if conflicting_index = 'organizations_created_by_idempotency_key_idx' then
        select * into new_org from public.organizations
          where created_by = actor and idempotency_key = p_idempotency_key;
        exit;
      end if;
      attempt := attempt + 1;
      if attempt > 5 then
        raise exception 'SLUG_GENERATION_FAILED: could not generate a unique organization identifier, try again' using errcode = '23505';
      end if;
      candidate_slug := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role, status, joined_at, updated_at)
  values (new_org.id, actor, 'owner', 'active', now(), now());

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, new_org.id, 'organization.created', 'organization', new_org.id, jsonb_build_object('name', trimmed_name));

  return new_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_my_reports: redefined to add real cursor (keyset) pagination -- backward
-- compatible, since every new parameter has a default, so an existing zero-arg call
-- keeps working (returning the first page). The existing reports_researcher_id_idx
-- (researcher_id, submitted_at desc) already supports this predicate/ordering exactly;
-- no new index is required. p_limit is capped at 100 regardless of what is requested, so
-- a caller cannot defeat pagination by asking for an unbounded page.
-- ---------------------------------------------------------------------------

-- Postgres treats a different argument LIST as an entirely separate function -- `create
-- or replace` with new parameters does NOT replace the old zero-arg overload, it would
-- silently leave both existing side by side, and a caller invoking with no arguments
-- would keep resolving to the old, unpaginated version forever. The old signature must
-- be dropped explicitly for existing `.rpc("list_my_reports")` calls (which pass no
-- arguments) to actually reach the new, paginated implementation and its defaults.
drop function if exists public.list_my_reports();

create or replace function public.list_my_reports(
  p_limit integer default 20,
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  organization_id uuid,
  program_name text,
  organization_name text,
  title text,
  display_target text,
  status public.report_status,
  submitted_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  effective_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select r.id, r.program_id, r.organization_id, p.name, o.name, r.title, r.display_target, r.status, r.submitted_at
    from public.reports r
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where r.researcher_id = actor
      and (
        p_before_submitted_at is null
        or (r.submitted_at, r.id) < (p_before_submitted_at, p_before_id)
      )
    order by r.submitted_at desc, r.id desc
    limit effective_limit;
end;
$$;

revoke all on function public.list_my_reports(integer, timestamptz, uuid) from public;
grant execute on function public.list_my_reports(integer, timestamptz, uuid) to authenticated;

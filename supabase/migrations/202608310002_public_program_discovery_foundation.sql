-- Public Program Discovery Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0041-public-program-discovery-vertical-slice.md (which itself builds on
-- the research in 0037/0038/0039/0040).
--
-- 1. Visibility is a genuinely independent axis from lifecycle status, per DOMAIN.md's
--    own existing five-state lifecycle (unchanged, not touched by this migration) --
--    `program_visibility` is a new, separate two-value enum ('private'/'public'), never
--    a third lifecycle state and never a third value merged into `program_status`.
--    "Invite-only" is not a third visibility value: it is already fully expressed as
--    `visibility = 'private'` plus the existing, unchanged invitation mechanism
--    (0007) -- adding a distinct enum value for it would duplicate a behavior the schema
--    already has under a different name.
-- 2. Visibility can be SET at any lifecycle stage (including draft/review), but only
--    takes visible effect once status reaches 'active' or 'paused' -- both new
--    anon-facing read RPCs filter `status in ('active','paused')` in addition to
--    `visibility = 'public'`, so an organization can prepare its choice early without
--    ever risking an unfinished, possibly-scopeless draft leaking publicly. 'closed' is
--    deliberately excluded from both new RPCs for this slice -- the task's own explicit
--    instruction is "do not expose as an active opportunity in the initial MVP" -- richer
--    "stays visible as an archived record" behavior is a real, considered, later
--    extension (see 0040), not this slice's job.
-- 3. `programs.description` is a genuine, previously-missing field (confirmed absent in
--    0040's audit) -- every competitor researched has an equivalent org-authored
--    narrative field and Sentinel had none. Same length cap convention as
--    `researcher_profiles.biography` (5000 chars).
-- 4. `program_access_source` gains a second value, 'public', rather than forking
--    authorization logic: a researcher who joins a public program gets a completely
--    normal `program_researchers` row, so every existing downstream check
--    (`is_researcher_authorized_for_program`, `submit_report`, the reputation ledger,
--    `list_my_program_participations`) continues to work with zero special-casing. This
--    is why `submit_report` itself is NOT modified by this migration at all.
-- 5. `join_public_program` is a NEW, narrowly-scoped RPC -- not a new submission RPC, and
--    not a bypass of the existing authorization model. It only ever creates the
--    prerequisite row that `is_researcher_authorized_for_program` already checks; it
--    never touches `reports` or any report-authorization logic. It deliberately refuses
--    to silently reactivate an existing suspended/revoked row -- an organization's
--    deliberate removal of a researcher must never be undone by that same researcher
--    re-clicking a public "start researching" button.
-- 6. `set_program_visibility` reuses `private.lock_and_authorize_program_for_lifecycle`
--    (202608300001) verbatim -- the identical row-lock-and-authorize-as-manager
--    primitive every lifecycle transition already uses, not a new authorization path.
-- 7. Anonymous read access follows this schema's one existing, established pattern for
--    reaching `anon` at all: a thin SECURITY DEFINER RPC with an explicit column
--    projection (the `check_sign_in_rate_limit` precedent, 202608290005) -- never a new
--    permissive RLS policy on the base tables. `anon` gets zero new table grants from
--    this migration. Both new anonymous RPCs return the identical NOT_FOUND-shaped empty
--    result for a private program, a draft/review public-flagged program, and a genuinely
--    nonexistent id -- never distinguishing "exists but hidden" from "doesn't exist."

create type public.program_visibility as enum ('private', 'public');

alter table public.programs add column visibility public.program_visibility not null default 'private';
alter table public.programs add column description text check (description is null or char_length(description) <= 5000);

comment on column public.programs.visibility is 'Independent of lifecycle status (see 202608300001). Only takes visible effect via list_public_programs/get_public_program when status is active or paused -- draft/review/closed are never publicly discoverable regardless of this value.';
comment on column public.programs.description is 'Organization-authored public-facing narrative (company overview, submission notes). Nullable -- a program with no description simply omits it from its public page.';

-- Partial index: only public rows are ever scanned by the public listing query, and only
-- those rows need this ordering -- an organization's private programs (the overwhelming
-- majority of rows in practice) never participate in this index at all.
create index programs_public_listing_idx on public.programs(status, created_at desc) where visibility = 'public';

alter type public.program_access_source add value 'public';

-- ---------------------------------------------------------------------------
-- list_public_programs / get_public_program / list_public_program_scope: the only three
-- new anon-reachable surfaces. Each is a plain, explicit column projection -- no `select
-- *`, so a future column added to `programs`/`program_scope_entries` for an unrelated
-- reason can never silently become public just by existing.
-- ---------------------------------------------------------------------------

create or replace function public.list_public_programs()
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  description text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.description, p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.visibility = 'public' and p.status in ('active', 'paused')
    order by p.created_at desc;
end;
$$;

create or replace function public.get_public_program(target_program_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  description text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.description, p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused');
end;
$$;

-- Re-verifies the visibility/status gate independently rather than trusting a caller who
-- already called get_public_program -- this function is reachable on its own, directly,
-- with any program_id, so it must not assume anything about how it was reached.
create or replace function public.list_public_program_scope(target_program_id uuid)
returns table (
  id uuid,
  asset_type public.program_asset_type,
  display_target text,
  scope_state public.program_scope_state,
  description text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Table-qualified throughout: this function's own RETURNS TABLE declares an OUT
  -- parameter named `id`, which would otherwise collide with public.programs.id here --
  -- the identical "0003-class collision bug" 202608260006's own list_my_pending_program_
  -- invitations comment already warns about, caught live rather than repeated silently.
  if not exists (
    select 1 from public.programs p
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused')
  ) then
    return;
  end if;

  return query
    select e.id, e.asset_type, e.display_target, e.scope_state, e.description
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.status = 'active'
    order by e.created_at asc;
end;
$$;

revoke all on function public.list_public_programs() from public;
revoke all on function public.get_public_program(uuid) from public;
revoke all on function public.list_public_program_scope(uuid) from public;

grant execute on function public.list_public_programs() to anon, authenticated;
grant execute on function public.get_public_program(uuid) to anon, authenticated;
grant execute on function public.list_public_program_scope(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_program_visibility: the one new organization-facing mutation this slice needs.
-- ---------------------------------------------------------------------------

create or replace function public.set_program_visibility(target_program_id uuid, new_visibility public.program_visibility)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  update public.programs set visibility = new_visibility, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.visibility_changed', 'program', target_program_id,
    jsonb_build_object('previous_visibility', program.visibility, 'new_visibility', new_visibility));

  return updated;
end;
$$;

create or replace function public.update_program_description(target_program_id uuid, new_description text)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed text := nullif(trim(coalesce(new_description, '')), '');
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if trimmed is not null and char_length(trimmed) > 5000 then
    raise exception 'INVALID_DESCRIPTION: Use 5000 characters or fewer.' using errcode = '22023';
  end if;

  update public.programs set description = trimmed, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.description_updated', 'program', target_program_id, '{}'::jsonb);

  return updated;
end;
$$;

revoke all on function public.set_program_visibility(uuid, public.program_visibility) from public;
revoke all on function public.update_program_description(uuid, text) from public;
grant execute on function public.set_program_visibility(uuid, public.program_visibility) to authenticated;
grant execute on function public.update_program_description(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- join_public_program: the one new researcher-facing mutation. Creates a completely
-- normal program_researchers row (source='public') so every existing authorization check
-- downstream needs zero modification. See this migration's header, point 5.
-- ---------------------------------------------------------------------------

create or replace function public.join_public_program(target_program_id uuid)
returns public.program_researchers
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_suspended boolean;
  program public.programs;
  existing public.program_researchers;
  new_row public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select is_suspended into actor_suspended from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot join a program right now' using errcode = '42501';
  end if;

  select * into program from public.programs where id = target_program_id for update;
  if program.id is null or program.visibility <> 'public' or program.status <> 'active' then
    raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002';
  end if;

  select * into existing from public.program_researchers where program_id = target_program_id and user_id = actor;
  if found then
    if existing.status = 'active' then
      return existing;
    end if;
    -- Deliberately never silently reactivated: a manager's suspend/revoke decision is
    -- not undone by the same researcher re-clicking a public "start researching" action.
    raise exception 'ACCESS_UNAVAILABLE: your access to this program is not currently active' using errcode = '42501';
  end if;

  insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by)
  values (target_program_id, program.organization_id, actor, 'active', 'public', null)
  returning * into new_row;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'researcher.joined_public_program', 'program_researchers', target_program_id, jsonb_build_object('user_id', actor));

  return new_row;
end;
$$;

revoke all on function public.join_public_program(uuid) from public;
grant execute on function public.join_public_program(uuid) to authenticated;

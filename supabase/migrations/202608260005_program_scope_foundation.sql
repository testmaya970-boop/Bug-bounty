-- Program Scope & Asset Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0006-scope-asset-model.md.
--
-- 1. No global asset registry: a scope entry's canonical target lives directly on
--    program_scope_entries, scoped to exactly one program. Not a shared `assets` table.
-- 2. Canonicalization/validation lives in exactly one place --
--    private.canonicalize_scope_target -- called by both add_scope_entry and
--    evaluate_program_scope, never reimplemented in TypeScript. This is deliberate: two
--    independent implementations of the same rules is exactly how 0003's two live bugs
--    happened, and canonicalization here is materially more complex than anything in 0003.
-- 3. IP/CIDR targets are stored as Postgres's native `cidr` type, not hand-rolled string
--    matching -- `cidr` itself rejects a range whose host bits are set beyond its prefix
--    (e.g. 203.0.113.5/24 is invalid), a real validation guarantee gained for free.
-- 4. Scope entries are never physically deleted -- "remove" is a status transition
--    (active -> removed), the same pattern organization_members already uses, so a
--    future report referencing a since-removed scope entry always has a real row to
--    point at.
-- 5. Every scope mutation requires program.status = 'draft'. Currently unconditionally
--    true (no status-transition RPC exists yet -- see 0005-program-lifecycle.md), but
--    real, tested code, not a promise.
-- 6. evaluate_program_scope is authorized identically to every other scope operation
--    (org owner/security_admin oversight, or a program_members row) -- it is an internal
--    tool for program managers to verify their own scope rules, never a researcher-facing
--    endpoint (researchers are not organization members and this check rejects them).

create type public.program_asset_type as enum ('domain', 'url', 'ip_cidr');
create type public.program_scope_state as enum ('in_scope', 'out_of_scope');
create type public.program_scope_entry_status as enum ('active', 'removed');

create table public.program_scope_entries (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null,
  asset_type public.program_asset_type not null,
  target text not null,
  display_target text not null,
  target_cidr cidr,
  url_origin text,
  url_path text,
  scope_state public.program_scope_state not null default 'in_scope',
  description text check (description is null or char_length(description) <= 500),
  status public.program_scope_entry_status not null default 'active',
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.users(id) on delete set null,
  constraint program_scope_entries_removed_at_check check (status = 'removed' or (removed_at is null and removed_by is null)),
  constraint program_scope_entries_cidr_check check ((asset_type = 'ip_cidr') = (target_cidr is not null)),
  constraint program_scope_entries_url_check check ((asset_type = 'url') = (url_origin is not null and url_path is not null)),
  constraint program_scope_entries_id_organization_id_key unique (id, organization_id),
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade
);

-- Duplicate prevention after canonicalization: exactly one active logical entry per
-- (program, asset_type, canonical target), including under genuine concurrency.
create unique index program_scope_entries_unique_active_target on public.program_scope_entries(program_id, asset_type, target) where status = 'active';
create index program_scope_entries_program_id_idx on public.program_scope_entries(program_id, status);

alter table public.program_scope_entries enable row level security;

-- ---------------------------------------------------------------------------
-- private.canonicalize_scope_target: the ONLY place target validation/canonicalization
-- happens. Read-only (no table access, no SECURITY DEFINER needed), but kept in
-- `private` and search_path='' for the same defensive consistency as every other helper
-- in this schema.
--
-- Deliberately uses out_* local variable names distinct from this function's own
-- RETURNS TABLE column names (canonical/display/cidr_value/url_origin/url_path) --
-- RETURNS TABLE column names are OUT-parameter-scoped variables across the ENTIRE
-- function body, not just the final assignment, and a local variable sharing that name
-- is ambiguous to Postgres (confirmed live, the exact class of bug found in 0003's
-- list_my_pending_invitations). Avoided here structurally rather than re-found live.
-- ---------------------------------------------------------------------------

create or replace function private.canonicalize_scope_target(p_asset_type public.program_asset_type, target_input text)
returns table (canonical text, display text, cidr_value cidr, url_origin text, url_path text)
language plpgsql stable set search_path = ''
as $$
declare
  raw text := trim(target_input);
  m text[];
  scheme_part text;
  host_part text;
  port_part text;
  path_part text;
  out_canonical text;
  out_display text;
  out_cidr cidr;
  out_origin text;
  out_path text;
begin
  if raw is null or char_length(raw) = 0 then
    raise exception 'INVALID_TARGET: Enter a target.' using errcode = '22023';
  end if;

  if p_asset_type = 'domain' then
    out_canonical := lower(raw);
    if right(out_canonical, 1) = '.' then out_canonical := left(out_canonical, -1); end if;
    if out_canonical ~ '[:/]' then
      raise exception 'INVALID_TARGET: Enter a bare hostname, e.g. api.example.com or *.example.com -- not a URL, port, or path.' using errcode = '22023';
    end if;
    if out_canonical !~ '^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'INVALID_TARGET: Enter a valid hostname, e.g. api.example.com or *.example.com.' using errcode = '22023';
    end if;
    out_display := out_canonical;

  elsif p_asset_type = 'url' then
    m := regexp_match(raw, '^(https?)://([a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?(/[^\s?#]*)?$', 'i');
    if m is null then
      raise exception 'INVALID_TARGET: Enter a valid http(s) URL without a query string or fragment, e.g. https://api.example.com/admin.' using errcode = '22023';
    end if;
    scheme_part := lower(m[1]);
    host_part := lower(m[2]);
    port_part := m[3];
    path_part := coalesce(m[4], '/');
    if path_part = '' then path_part := '/'; end if;
    if host_part !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'INVALID_TARGET: Enter a valid URL hostname.' using errcode = '22023';
    end if;
    if (scheme_part = 'http' and port_part = '80') or (scheme_part = 'https' and port_part = '443') then
      port_part := null;
    end if;
    out_origin := scheme_part || '://' || host_part || coalesce(':' || port_part, '');
    out_path := path_part;
    out_canonical := out_origin || out_path;
    out_display := out_canonical;

  elsif p_asset_type = 'ip_cidr' then
    begin
      out_cidr := raw::cidr;
    exception when others then
      raise exception 'INVALID_TARGET: Enter a valid IP address or CIDR range, e.g. 203.0.113.0/24 or 203.0.113.5.' using errcode = '22023';
    end;
    out_canonical := out_cidr::text;
    out_display := out_canonical;
  end if;

  canonical := out_canonical;
  display := out_display;
  cidr_value := out_cidr;
  url_origin := out_origin;
  url_path := out_path;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS policies. No insert/update/delete policy: every write goes through the
-- SECURITY DEFINER functions below, the same "service-only" boundary every table in
-- this schema uses. Removed rows remain readable (for audit/history), same as every
-- other read policy in this schema does not filter on status -- the UI decides what to
-- show, RLS decides who may see it at all.
-- ---------------------------------------------------------------------------

create policy "scope entries read by org admins or program members" on public.program_scope_entries
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

grant select on public.program_scope_entries to authenticated;
grant select, insert, update, delete on public.program_scope_entries to service_role;

-- ---------------------------------------------------------------------------
-- add_scope_entry
-- ---------------------------------------------------------------------------

create or replace function public.add_scope_entry(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  target_input text,
  p_scope_state public.program_scope_state default 'in_scope',
  p_description text default null
)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  canon record;
  trimmed_description text := nullif(trim(coalesce(p_description, '')), '');
  new_entry public.program_scope_entries;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage scope for this program' using errcode = '42501';
  end if;

  if program.status <> 'draft' then
    raise exception 'SCOPE_LOCKED: scope can only be changed while the program is in draft' using errcode = '55000';
  end if;

  if trimmed_description is not null and char_length(trimmed_description) > 500 then
    raise exception 'INVALID_DESCRIPTION: Use 500 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);

  begin
    insert into public.program_scope_entries (program_id, organization_id, asset_type, target, display_target, target_cidr, url_origin, url_path, scope_state, description, created_by)
    values (target_program_id, program.organization_id, p_asset_type, canon.canonical, canon.display, canon.cidr_value, canon.url_origin, canon.url_path, p_scope_state, trimmed_description, actor)
    returning * into new_entry;
  exception when unique_violation then
    raise exception 'DUPLICATE_TARGET: This target is already in scope for this program.' using errcode = '23505';
  end;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_added', 'program_scope_entry', new_entry.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical, 'scope_state', p_scope_state));

  return new_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_scope_entry: scope_state/description only -- the underlying target/type is
-- immutable once created (see 0006 for why: changing it in place would make audit
-- history ambiguous about what target actually existed at a point in time).
-- ---------------------------------------------------------------------------

create or replace function public.update_scope_entry(entry_id uuid, p_scope_state public.program_scope_state, p_description text default null)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  entry public.program_scope_entries;
  program public.programs;
  trimmed_description text := nullif(trim(coalesce(p_description, '')), '');
  updated public.program_scope_entries;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into entry from public.program_scope_entries where id = entry_id for update;
  if entry.id is null or entry.status = 'removed' then
    raise exception 'SCOPE_ENTRY_NOT_FOUND: scope entry not found' using errcode = 'P0002';
  end if;

  select * into program from public.programs where id = entry.program_id;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage scope for this program' using errcode = '42501';
  end if;

  if program.status <> 'draft' then
    raise exception 'SCOPE_LOCKED: scope can only be changed while the program is in draft' using errcode = '55000';
  end if;

  if trimmed_description is not null and char_length(trimmed_description) > 500 then
    raise exception 'INVALID_DESCRIPTION: Use 500 characters or fewer.' using errcode = '22023';
  end if;

  update public.program_scope_entries
    set scope_state = p_scope_state, description = trimmed_description, updated_at = now()
    where id = entry_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_updated', 'program_scope_entry', entry_id,
    jsonb_build_object('program_id', program.id, 'previous_scope_state', entry.scope_state, 'new_scope_state', p_scope_state));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_scope_entry: soft-delete (status -> removed). Never a physical DELETE -- see
-- 0006 for why history has to survive.
-- ---------------------------------------------------------------------------

create or replace function public.remove_scope_entry(entry_id uuid)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  entry public.program_scope_entries;
  program public.programs;
  updated public.program_scope_entries;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into entry from public.program_scope_entries where id = entry_id for update;
  if entry.id is null or entry.status = 'removed' then
    raise exception 'SCOPE_ENTRY_NOT_FOUND: scope entry not found' using errcode = 'P0002';
  end if;

  select * into program from public.programs where id = entry.program_id;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot manage scope for this program' using errcode = '42501';
  end if;

  if program.status <> 'draft' then
    raise exception 'SCOPE_LOCKED: scope can only be changed while the program is in draft' using errcode = '55000';
  end if;

  update public.program_scope_entries
    set status = 'removed', removed_at = now(), removed_by = actor, updated_at = now()
    where id = entry_id
    returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'scope.asset_removed', 'program_scope_entry', entry_id,
    jsonb_build_object('program_id', program.id, 'asset_type', entry.asset_type, 'target', entry.target));

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- evaluate_program_scope: the internal, authorized scope-decision boundary. See the
-- migration header and docs/decisions/0006-scope-asset-model.md for why this is not a
-- researcher-facing endpoint.
--
-- Deliberately uses is_in_scope/matched_* as RETURNS TABLE column names and a separate
-- `best_match` record variable for the query result, never a bare identifier matching
-- one of those column names, for the same structural reason canonicalize_scope_target
-- avoids it above.
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_program_scope(target_program_id uuid, p_asset_type public.program_asset_type, target_input text)
returns table (is_in_scope boolean, matched_scope_state public.program_scope_state, matched_entry_id uuid, matched_target text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  canon record;
  best_match record;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program.id)
  ) then
    raise exception 'FORBIDDEN: actor cannot view scope for this program' using errcode = '42501';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);

  if p_asset_type = 'domain' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'domain' and e.status = 'active'
      and (
        e.target = canon.canonical
        or (left(e.target, 2) = '*.' and canon.canonical like ('%.' || substr(e.target, 3)))
      )
    order by (e.target = canon.canonical) desc, char_length(e.target) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'ip_cidr' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'ip_cidr' and e.status = 'active'
      and e.target_cidr >>= canon.cidr_value
    order by masklen(e.target_cidr) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'url' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'url' and e.status = 'active'
      and e.url_origin = canon.url_origin
      and (
        e.url_path = canon.url_path
        or canon.url_path like (case when e.url_path = '/' then '/' else e.url_path || '/' end) || '%'
      )
    order by char_length(e.url_path) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;
  end if;

  if best_match.id is null then
    is_in_scope := false;
    matched_scope_state := null;
    matched_entry_id := null;
    matched_target := null;
  else
    is_in_scope := true;
    matched_scope_state := best_match.scope_state;
    matched_entry_id := best_match.id;
    matched_target := best_match.target;
  end if;
  return next;
end;
$$;

revoke all on function public.add_scope_entry(uuid, public.program_asset_type, text, public.program_scope_state, text) from public;
revoke all on function public.update_scope_entry(uuid, public.program_scope_state, text) from public;
revoke all on function public.remove_scope_entry(uuid) from public;
revoke all on function public.evaluate_program_scope(uuid, public.program_asset_type, text) from public;

grant execute on function public.add_scope_entry(uuid, public.program_asset_type, text, public.program_scope_state, text) to authenticated;
grant execute on function public.update_scope_entry(uuid, public.program_scope_state, text) to authenticated;
grant execute on function public.remove_scope_entry(uuid) to authenticated;
grant execute on function public.evaluate_program_scope(uuid, public.program_asset_type, text) to authenticated;

-- Report Foundation. Design decisions recorded here and expanded in
-- docs/decisions/0008-report-authorization-and-scope-snapshot.md.
--
-- 1. Report status starts at 'new' (DOMAIN.md's own lifecycle), never a task-suggested
--    'submitted' -- DOMAIN.md wins. All eight DOMAIN.md-specified statuses are defined
--    at the enum level; no transition RPC exists yet (triage is out of scope for this
--    slice), the same "implement the full enum, defer the transitions" pattern already
--    used for programs (0005) and scope (0006).
-- 2. private.match_program_scope factors the matching logic (which scope entry, if any,
--    a canonical target resolves to) out of evaluate_program_scope so submit_report can
--    reuse it. This is NOT a self-authorizing helper, unlike every other private
--    function in this schema -- it trusts its caller to have already decided whether the
--    result may be seen or acted on. evaluate_program_scope (redefined below, not
--    duplicated) still authorizes as a program manager before calling it; submit_report
--    authorizes as an active researcher before calling it. One matching implementation,
--    two independently correct authorization gates in front of it. See 0008 for the full
--    reasoning -- auth.uid() reflects the original caller regardless of which SECURITY
--    DEFINER function is executing, so submit_report could never have called the public,
--    manager-only evaluate_program_scope RPC directly on a researcher's behalf.
-- 3. Scope snapshot is "both" (option C): matched_scope_entry_id (FK, on delete set
--    null) plus matched_scope_state/matched_target frozen at submission time -- a later
--    scope edit or removal never retroactively changes what an already-created report
--    says was true when it was accepted.
-- 4. Report submission is blocked only when program.status in ('paused', 'closed') --
--    not the full lifecycle bypass researcher invitation (0007) uses, and not a 'draft'
--    block either (every reachable program is 'draft' today; blocking it would make this
--    slice permanently unreachable, the same bind 0007 already documented). Whether
--    'draft' should also block submission is left for whichever slice adds real
--    transitions.

create type public.report_status as enum ('new', 'triaging', 'needs_information', 'accepted', 'resolved', 'duplicate', 'informative', 'not_applicable', 'rejected');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null,
  researcher_id uuid not null references public.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 20000),
  asset_type public.program_asset_type not null,
  target text not null,
  display_target text not null,
  matched_scope_entry_id uuid references public.program_scope_entries(id) on delete set null,
  matched_scope_state public.program_scope_state not null,
  matched_target text not null,
  status public.report_status not null default 'new',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_id_organization_id_key unique (id, organization_id),
  foreign key (program_id, organization_id) references public.programs(id, organization_id) on delete cascade
);

create index reports_program_id_idx on public.reports(program_id, submitted_at desc);
create index reports_researcher_id_idx on public.reports(researcher_id, submitted_at desc);

alter table public.reports enable row level security;

create policy "reports read by researcher, org admins, or program managers" on public.reports
  for select to authenticated
  using (
    researcher_id = auth.uid()
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

grant select on public.reports to authenticated;
grant select, insert, update, delete on public.reports to service_role;

-- ---------------------------------------------------------------------------
-- private.match_program_scope: shared, NON-AUTHORIZING matching primitive. Extracted
-- verbatim from evaluate_program_scope's own matching branches (202608260005) -- the
-- precedence rules (exact-before-wildcard, longest-suffix, most-specific-CIDR,
-- longest-path-prefix, explicit-exclusion tie-break) are unchanged, not reimplemented.
-- Deliberately does not check auth.uid() or any authorization -- every other private
-- helper in this schema does, and this is the one deliberate exception: it is safe only
-- because its two callers (evaluate_program_scope, submit_report) each independently
-- authorize their own caller before ever invoking it. Do not call this from anywhere
-- that has not already made that decision.
-- ---------------------------------------------------------------------------

create or replace function private.match_program_scope(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  canonical_target text,
  cidr_value cidr,
  p_url_origin text,
  p_url_path text
)
returns table (matched_entry_id uuid, matched_scope_state public.program_scope_state, matched_target text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  best_match record;
begin
  if p_asset_type = 'domain' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'domain' and e.status = 'active'
      and (
        e.target = canonical_target
        or (left(e.target, 2) = '*.' and canonical_target like ('%.' || substr(e.target, 3)))
      )
    order by (e.target = canonical_target) desc, char_length(e.target) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'ip_cidr' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'ip_cidr' and e.status = 'active'
      and e.target_cidr >>= cidr_value
    order by masklen(e.target_cidr) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'url' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'url' and e.status = 'active'
      and e.url_origin = p_url_origin
      and (
        e.url_path = p_url_path
        or p_url_path like (case when e.url_path = '/' then '/' else e.url_path || '/' end) || '%'
      )
    order by char_length(e.url_path) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;
  end if;

  matched_entry_id := best_match.id;
  matched_scope_state := best_match.scope_state;
  matched_target := best_match.target;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- evaluate_program_scope, redefined (not duplicated) to call the shared helper above.
-- Signature, authorization, and external behavior are unchanged from 202608260005 --
-- re-verified live after this migration to confirm the refactor introduced no
-- regression.
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_program_scope(target_program_id uuid, p_asset_type public.program_asset_type, target_input text)
returns table (is_in_scope boolean, matched_scope_state public.program_scope_state, matched_entry_id uuid, matched_target text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  canon record;
  match_result record;
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
  select * into match_result from private.match_program_scope(target_program_id, p_asset_type, canon.canonical, canon.cidr_value, canon.url_origin, canon.url_path);

  if match_result.matched_entry_id is null then
    is_in_scope := false;
    matched_scope_state := null;
    matched_entry_id := null;
    matched_target := null;
  else
    is_in_scope := true;
    matched_scope_state := match_result.matched_scope_state;
    matched_entry_id := match_result.matched_entry_id;
    matched_target := match_result.matched_target;
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_report: the only writer of public.reports. Composes, in order: researcher
-- authorization (private.is_researcher_authorized_for_program), program lifecycle
-- (paused/closed blocked), input validation, canonicalization
-- (private.canonicalize_scope_target), and scope matching
-- (private.match_program_scope) -- each an independent, reused primitive, never
-- reimplemented here.
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

  -- Identical rejection for "no scope entry matches at all" and "a scope entry matches
  -- but explicitly excludes it" -- deliberately, so neither response can be used to
  -- infer the existence or shape of a private scope entry the researcher cannot read
  -- the details of. See 0008.
  if match_result.matched_entry_id is null or match_result.matched_scope_state <> 'in_scope' then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.' using errcode = '22023';
  end if;

  insert into public.reports (program_id, organization_id, researcher_id, title, description, asset_type, target, display_target, matched_scope_entry_id, matched_scope_state, matched_target)
  values (target_program_id, program.organization_id, actor, trimmed_title, trimmed_description, p_asset_type, canon.canonical, canon.display, match_result.matched_entry_id, match_result.matched_scope_state, match_result.matched_target)
  returning * into new_report;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'report.created', 'report', new_report.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical));

  return new_report;
end;
$$;

revoke all on function public.submit_report(uuid, public.program_asset_type, text, text, text) from public;
grant execute on function public.submit_report(uuid, public.program_asset_type, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- list_my_reports: the researcher's own cross-program report list. A direct RLS-scoped
-- query already lets a researcher read their own `reports` rows, but embedding the
-- program/organization name would silently resolve to null once that researcher is no
-- longer an ACTIVE participant (suspended/revoked) -- the exact same class of gap found
-- live in 0007 for the manager-facing roster's profile embed. SECURITY DEFINER, scoped
-- to auth.uid()'s own reports, sidesteps it the same way list_my_program_participations
-- does.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_reports()
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
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select r.id, r.program_id, r.organization_id, p.name, o.name, r.title, r.display_target, r.status, r.submitted_at
    from public.reports r
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where r.researcher_id = actor
    order by r.submitted_at desc;
end;
$$;

revoke all on function public.list_my_reports() from public;
grant execute on function public.list_my_reports() to authenticated;

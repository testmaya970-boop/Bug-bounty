-- Evidence & Secure Communication Foundation. Design decisions recorded here and
-- expanded in docs/decisions/0010-report-evidence-and-communication.md.
--
-- 1. Communication (report_messages) and evidence (report_evidence) are two separate
--    tables, never a generic "comments" table -- DOMAIN.md names both concepts
--    independently.
-- 2. Visibility is exactly two values (report_visibility: researcher_visible/internal),
--    a considered default where DOMAIN.md is silent, enforced by a real enum column and
--    RLS, never inferred from "can the caller read the report at all."
-- 3. author_context (researcher/organization) is always derived server-side by comparing
--    the actor to reports.researcher_id, never a client-supplied parameter.
-- 4. private.authorize_report_for_communication is a NEW, non-locking sibling of 0009's
--    private.lock_and_authorize_report_for_triage -- appends need the identical
--    authorization predicate but no row lock (no read-modify-write on the report row).
--    0009's migration is not edited.
-- 5. reports.information_request_reason / reports.researcher_response (0009) are DROPPED
--    and superseded by report_messages rows. reports.resolution_summary is untouched --
--    it is current-state triage data, not a communication exchange. request_information
--    is redefined (same signature/behavior/audit event) to write a message instead of a
--    column; respond_to_information_request is dropped and replaced by
--    post_researcher_message, no longer gated to needs_information (communication is not
--    itself a state transition).
-- 6. Both new tables are append-only in this slice: no update/delete RPC, no such RLS
--    grant. A deliberate, disclosed deferral, not an oversight.
-- 7. A public.users read-policy gap (a researcher could not read a manager's/owner's
--    profile when embedding a message author) is closed proactively here, before it
--    could be found live a third time (see 0007, 0008 for the first two occurrences of
--    this exact bug class).
-- 8. No binary/file evidence, no storage bucket, no attachment table -- deferred, with
--    the future security requirements documented in 0010, not partially implemented.

create type public.report_visibility as enum ('researcher_visible', 'internal');
create type public.report_author_context as enum ('researcher', 'organization');
create type public.report_evidence_type as enum ('text', 'code', 'url', 'log');

-- A composite tie so a message/evidence row can never disagree with its report's real
-- program/organization -- the same pattern program_scope_entries/program_members already
-- use against programs(id, organization_id).
alter table public.reports
  add constraint reports_id_program_id_organization_id_key unique (id, program_id, organization_id);

-- Superseded by report_messages rows -- see 0010 for why these are dropped rather than
-- kept alongside the new model.
alter table public.reports
  drop column information_request_reason,
  drop column researcher_response;

create table public.report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  program_id uuid not null,
  organization_id uuid not null,
  researcher_id uuid not null references public.users(id) on delete restrict,
  author_id uuid not null references public.users(id) on delete restrict,
  author_context public.report_author_context not null,
  visibility public.report_visibility not null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade
);

create index report_messages_report_id_idx on public.report_messages(report_id, created_at);

create table public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  program_id uuid not null,
  organization_id uuid not null,
  researcher_id uuid not null references public.users(id) on delete restrict,
  author_id uuid not null references public.users(id) on delete restrict,
  author_context public.report_author_context not null,
  visibility public.report_visibility not null,
  evidence_type public.report_evidence_type not null,
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (report_id, program_id, organization_id) references public.reports(id, program_id, organization_id) on delete cascade
);

create index report_evidence_report_id_idx on public.report_evidence(report_id, created_at);

alter table public.report_messages enable row level security;
alter table public.report_evidence enable row level security;

-- Visible to: the submitting researcher, but only for researcher_visible rows; org
-- owner/security_admin (oversight); a program_members manager. Never a bare
-- "can read the report" check -- visibility is its own axis. No insert/update/delete
-- policy on either table -- every write goes through the RPCs below.
create policy "report messages read by permitted viewers" on public.report_messages
  for select to authenticated
  using (
    (visibility = 'researcher_visible' and researcher_id = auth.uid())
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

create policy "report evidence read by permitted viewers" on public.report_evidence
  for select to authenticated
  using (
    (visibility = 'researcher_visible' and researcher_id = auth.uid())
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
  );

grant select on public.report_messages, public.report_evidence to authenticated;
grant select, insert, update, delete on public.report_messages, public.report_evidence to service_role;

-- Real gap found by design review before it could ship broken (the same bug class 0007
-- and 0008 each found live once): a researcher reading a message/evidence row authored by
-- a manager or an oversight-acting owner/security_admin had no RLS path to that author's
-- public.users profile at all, since the only existing paths are "self," "org
-- co-members" (a researcher is never one), and 0007's manager-reads-researcher path
-- (the wrong direction).
--
-- A first attempt at the reverse policy inlined exists() queries directly against
-- program_members/organization_members inside the policy body -- the same shape 0007's
-- own manager-reads-researcher policy uses. That shape works for 0007 because the
-- calling manager already has RLS-permitted read access to program_researchers (via
-- has_org_role/is_program_member). It does NOT work in reverse: a researcher has no
-- RLS-permitted read access to program_members or organization_members at all (their own
-- SELECT policies grant nothing to a plain researcher), so an inline exists() subquery
-- against either table is itself filtered down to zero rows by THEIR RLS before this
-- policy's exists() ever sees a match -- silently and always false, caught here before
-- shipping by simulating a researcher session directly against Postgres (SET LOCAL
-- request.jwt.claims) and observing the exists() evaluate to false despite the
-- underlying row genuinely existing. This is the identical RLS self-reference problem
-- the private schema helper pattern exists to solve throughout this codebase; the fix is
-- the same one: a SECURITY DEFINER helper that bypasses program_members'/
-- organization_members' RLS internally, exactly like private.has_org_role/
-- private.is_program_member already do for their own tables.
create or replace function private.is_manager_or_admin_of_my_program(candidate_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  return exists (
    select 1
    from public.program_researchers pr
    join public.program_members m on m.program_id = pr.program_id
    where pr.user_id = actor and pr.status = 'active' and m.user_id = candidate_user_id
  ) or exists (
    select 1
    from public.program_researchers pr
    join public.programs p on p.id = pr.program_id
    join public.organization_members om on om.organization_id = p.organization_id
    where pr.user_id = actor and pr.status = 'active'
      and om.user_id = candidate_user_id and om.status = 'active' and om.role in ('owner', 'security_admin')
  );
end;
$$;

grant execute on function private.is_manager_or_admin_of_my_program(uuid) to authenticated;

-- This adds the reverse of 0007's policy: a researcher may read the profile of a user
-- who is either a program_members manager of a program the researcher is actively
-- authorized for, or an active owner/security_admin of that program's organization --
-- resolved entirely from real relationships via the helper above, never a client-supplied
-- id, and bounded to the researcher's OWN authorized programs (it cannot be used to probe
-- managers of a program the researcher has no relationship to).
create policy "users read by researchers of a program the user manages or administers" on public.users
  for select to authenticated
  using (private.is_manager_or_admin_of_my_program(id));

-- ---------------------------------------------------------------------------
-- private.authorize_report_for_communication: the non-locking sibling of 0009's
-- private.lock_and_authorize_report_for_triage. A plain SELECT, not FOR UPDATE -- posting
-- a message or adding evidence is a pure append with no read-modify-write on the report
-- row, so locking it would only serialize unrelated concurrent communication for no
-- correctness benefit. The two-line authorization predicate is duplicated from 0009's
-- helper rather than shared, deliberately, so 0009's already-delivered migration is never
-- edited -- the same acceptable duplication 0006's add/update/remove-scope-entry
-- functions already each inline independently.
-- ---------------------------------------------------------------------------

create or replace function private.authorize_report_for_communication(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot communicate on this report' using errcode = '42501';
  end if;

  return report;
end;
$$;

-- ---------------------------------------------------------------------------
-- private.insert_report_message / private.insert_report_evidence: shared,
-- NON-AUTHORIZING insert primitives -- the same "one implementation, several
-- independently-authorized callers" structure as private.match_program_scope (0008).
-- Trusted only because every caller below has already authorized and located the report
-- row before calling these. Do not call from anywhere that has not already done so.
-- ---------------------------------------------------------------------------

create or replace function private.insert_report_message(
  p_report public.reports,
  p_author_context public.report_author_context,
  p_visibility public.report_visibility,
  p_body text
)
returns public.report_messages
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_body text := trim(p_body);
  new_message public.report_messages;
begin
  if trimmed_body is null or char_length(trimmed_body) = 0 then
    raise exception 'INVALID_MESSAGE: Enter a message.' using errcode = '22023';
  end if;
  if char_length(trimmed_body) > 5000 then
    raise exception 'INVALID_MESSAGE: Use 5000 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.report_messages (report_id, program_id, organization_id, researcher_id, author_id, author_context, visibility, body)
  values (p_report.id, p_report.program_id, p_report.organization_id, p_report.researcher_id, actor, p_author_context, p_visibility, trimmed_body)
  returning * into new_message;

  return new_message;
end;
$$;

create or replace function private.insert_report_evidence(
  p_report public.reports,
  p_author_context public.report_author_context,
  p_visibility public.report_visibility,
  p_evidence_type public.report_evidence_type,
  p_content text
)
returns public.report_evidence
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_content text := trim(p_content);
  new_evidence public.report_evidence;
begin
  if trimmed_content is null or char_length(trimmed_content) = 0 then
    raise exception 'INVALID_EVIDENCE: Enter evidence content.' using errcode = '22023';
  end if;
  if char_length(trimmed_content) > 20000 then
    raise exception 'INVALID_EVIDENCE: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.report_evidence (report_id, program_id, organization_id, researcher_id, author_id, author_context, visibility, evidence_type, content)
  values (p_report.id, p_report.program_id, p_report.organization_id, p_report.researcher_id, actor, p_author_context, p_visibility, p_evidence_type, trimmed_content)
  returning * into new_evidence;

  return new_evidence;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs.
-- ---------------------------------------------------------------------------

-- Researcher-only: the same distinct researcher-identity authorization
-- respond_to_information_request (0009) used, not the manager helper. Not gated to any
-- particular report status -- communication is supporting data, not a state transition.
create or replace function public.post_researcher_message(target_report_id uuid, p_body text)
returns public.report_messages
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_message public.report_messages;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can post to this report' using errcode = '42501';
  end if;
  if not private.is_researcher_authorized_for_program(report.program_id) then
    raise exception 'FORBIDDEN: your access to this program is not currently active' using errcode = '42501';
  end if;

  new_message := private.insert_report_message(report, 'researcher', 'researcher_visible', p_body);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.message_posted', 'report', target_report_id, jsonb_build_object('message_id', new_message.id, 'author_context', 'researcher', 'visibility', 'researcher_visible'));

  return new_message;
end;
$$;

create or replace function public.post_organization_message(target_report_id uuid, p_body text, p_visibility public.report_visibility)
returns public.report_messages
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_message public.report_messages;
begin
  report := private.authorize_report_for_communication(target_report_id);

  new_message := private.insert_report_message(report, 'organization', p_visibility, p_body);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.message_posted', 'report', target_report_id, jsonb_build_object('message_id', new_message.id, 'author_context', 'organization', 'visibility', p_visibility));

  return new_message;
end;
$$;

create or replace function public.add_researcher_evidence(target_report_id uuid, p_evidence_type public.report_evidence_type, p_content text)
returns public.report_evidence
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_evidence public.report_evidence;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into report from public.reports where id = target_report_id;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;

  if report.researcher_id <> actor then
    raise exception 'FORBIDDEN: only the submitting researcher can add evidence to this report' using errcode = '42501';
  end if;
  if not private.is_researcher_authorized_for_program(report.program_id) then
    raise exception 'FORBIDDEN: your access to this program is not currently active' using errcode = '42501';
  end if;

  new_evidence := private.insert_report_evidence(report, 'researcher', 'researcher_visible', p_evidence_type, p_content);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.evidence_added', 'report', target_report_id, jsonb_build_object('evidence_id', new_evidence.id, 'author_context', 'researcher', 'visibility', 'researcher_visible', 'evidence_type', p_evidence_type));

  return new_evidence;
end;
$$;

create or replace function public.add_organization_evidence(target_report_id uuid, p_evidence_type public.report_evidence_type, p_content text, p_visibility public.report_visibility)
returns public.report_evidence
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_evidence public.report_evidence;
begin
  report := private.authorize_report_for_communication(target_report_id);

  new_evidence := private.insert_report_evidence(report, 'organization', p_visibility, p_evidence_type, p_content);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.evidence_added', 'report', target_report_id, jsonb_build_object('evidence_id', new_evidence.id, 'author_context', 'organization', 'visibility', p_visibility, 'evidence_type', p_evidence_type));

  return new_evidence;
end;
$$;

-- Redefined (not duplicated) from 0009: identical signature, identical transition/audit
-- behavior, but writes the reason into a report_messages row via the shared insert
-- primitive instead of the now-dropped information_request_reason column.
create or replace function public.request_information(target_report_id uuid, p_reason text)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  updated public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(target_report_id);

  if not private.is_valid_report_transition(report.status, 'needs_information') then
    raise exception 'INVALID_TRANSITION: this report cannot move to needs information from its current state' using errcode = '23514';
  end if;

  perform private.insert_report_message(report, 'organization', 'researcher_visible', p_reason);

  update public.reports set status = 'needs_information', updated_at = now()
    where id = target_report_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.information_requested', 'report', target_report_id, jsonb_build_object('previous_status', report.status));

  return updated;
end;
$$;

-- Superseded by post_researcher_message -- communication is no longer gated to
-- needs_information. See 0010.
drop function if exists public.respond_to_information_request(uuid, text);

revoke all on function public.post_researcher_message(uuid, text) from public;
revoke all on function public.post_organization_message(uuid, text, public.report_visibility) from public;
revoke all on function public.add_researcher_evidence(uuid, public.report_evidence_type, text) from public;
revoke all on function public.add_organization_evidence(uuid, public.report_evidence_type, text, public.report_visibility) from public;

grant execute on function public.post_researcher_message(uuid, text) to authenticated;
grant execute on function public.post_organization_message(uuid, text, public.report_visibility) to authenticated;
grant execute on function public.add_researcher_evidence(uuid, public.report_evidence_type, text) to authenticated;
grant execute on function public.add_organization_evidence(uuid, public.report_evidence_type, text, public.report_visibility) to authenticated;

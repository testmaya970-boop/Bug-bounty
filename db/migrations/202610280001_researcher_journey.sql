-- Researcher journey completion (decision 0089). Internal workflows only: nothing here talks to
-- an external service, and no state claims an outcome an outside party has not produced (a CVE
-- is "assigned" only when platform staff record the identifier with its evidence).
--
--   1. Collaboration invitations   consent before someone becomes a report collaborator
--   2. CVE requests                internal request + review; assignment recorded with evidence
--   3. Acknowledgements            Hall of Fame: organization proposes, researcher consents
--   4. Hacking events              platform-run events with registration and capacity
--   5. Mentorship                  opt-in mentors, requests, accept with scheduling details
--   6. Swag                        platform catalog with real stock, requests, fulfilment
--   7. Followed programs           "Subscriptions"
--   8. Platform agreements         versioned text, acknowledgement records (not e-signatures)
--   9. get_my_researcher_actions   one summary read for the dashboard action center

-- 1. Collaboration invitations --------------------------------------------------------------------
-- report_collaborators stays the set of ACCEPTED collaborators, so payout fan-out, read access and
-- the split trigger keep working unchanged. Pending invitations reserve their share so an
-- acceptance can never overflow the split.
create table public.report_collaboration_invitations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  inviter_id uuid not null references public.users(id) on delete restrict,
  invitee_id uuid not null references public.users(id) on delete restrict,
  bounty_split_percent numeric(5,2) not null check (bounty_split_percent > 0 and bounty_split_percent < 100),
  message text check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index report_collaboration_invitations_one_pending on public.report_collaboration_invitations(report_id, invitee_id) where status = 'pending';
create index report_collaboration_invitations_invitee_idx on public.report_collaboration_invitations(invitee_id, status);
alter table public.report_collaboration_invitations enable row level security;
create policy "collaboration invitations read by inviter or invitee" on public.report_collaboration_invitations for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());
grant select on public.report_collaboration_invitations to authenticated;
grant select on public.report_collaboration_invitations to service_role;

create or replace function public.invite_report_collaborator(target_report_id uuid, p_collaborator_username text, p_bounty_split_percent numeric, p_message text)
returns public.report_collaboration_invitations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  invitee uuid;
  reserved numeric;
  people integer;
  result public.report_collaboration_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if report.researcher_id <> actor then raise exception 'FORBIDDEN: only the submitting researcher can invite collaborators' using errcode = '42501'; end if;
  if report.status not in ('new', 'triaging') then
    raise exception 'REPORT_LOCKED_FOR_COLLABORATION: collaborators can only be invited while the report is new or in triage' using errcode = '23514';
  end if;
  if p_bounty_split_percent is null or p_bounty_split_percent <= 0 or p_bounty_split_percent >= 100 or p_bounty_split_percent <> round(p_bounty_split_percent, 2) then
    raise exception 'INVALID_SPLIT: the share must be more than 0 and less than 100, with at most two decimals' using errcode = '22023';
  end if;
  select u.id into invitee from public.users u where u.deactivated_at is null
    and (lower(u.username) = lower(trim(coalesce(p_collaborator_username, ''))) or lower(u.public_username) = lower(trim(coalesce(p_collaborator_username, ''))))
  limit 1;
  if invitee is null then raise exception 'COLLABORATOR_NOT_FOUND: no researcher exists with that username' using errcode = 'P0002'; end if;
  if invitee = actor then raise exception 'INVALID_COLLABORATOR: you cannot invite yourself' using errcode = '23514'; end if;
  if not exists (select 1 from public.program_researchers where program_id = report.program_id and user_id = invitee and status = 'active') then
    raise exception 'COLLABORATOR_NOT_AUTHORIZED: that researcher is not an active participant of this program' using errcode = '42501';
  end if;
  if exists (select 1 from public.report_collaborators where report_id = report.id and researcher_id = invitee) then
    raise exception 'ALREADY_COLLABORATOR: that researcher is already a collaborator on this report' using errcode = '23505';
  end if;
  if exists (select 1 from public.report_collaboration_invitations where report_id = report.id and invitee_id = invitee and status = 'pending') then
    raise exception 'INVITATION_PENDING: that researcher already has a pending invitation for this report' using errcode = '23505';
  end if;
  select coalesce(sum(s), 0), count(*) into reserved, people from (
    select bounty_split_percent s from public.report_collaborators where report_id = report.id
    union all
    select bounty_split_percent from public.report_collaboration_invitations where report_id = report.id and status = 'pending'
  ) x;
  if people >= 10 then raise exception 'COLLABORATOR_LIMIT_REACHED: a report can have at most 10 collaborators and pending invitations' using errcode = '23514'; end if;
  if reserved + p_bounty_split_percent >= 100 then
    raise exception 'SPLIT_EXCEEDS_TOTAL: collaborators and pending invitations already hold % percent, so at most % percent is left while you keep a share', reserved, 100 - reserved - 0.01 using errcode = '23514';
  end if;
  insert into public.report_collaboration_invitations (report_id, inviter_id, invitee_id, bounty_split_percent, message)
  values (report.id, actor, invitee, p_bounty_split_percent, nullif(trim(coalesce(p_message, '')), ''))
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.collaborator_invited', 'report', report.id, jsonb_build_object('invitee_id', invitee, 'bounty_split_percent', p_bounty_split_percent));
  return result;
end;
$$;

create or replace function public.respond_collaboration_invitation(p_invitation_id uuid, p_accept boolean)
returns public.report_collaboration_invitations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inv public.report_collaboration_invitations;
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into inv from public.report_collaboration_invitations where id = p_invitation_id for update;
  if inv.id is null or inv.invitee_id <> actor then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if inv.status <> 'pending' then raise exception 'INVITATION_CLOSED: this invitation was already %', inv.status using errcode = '23514'; end if;
  select * into report from public.reports where id = inv.report_id for update;
  if not p_accept then
    update public.report_collaboration_invitations set status = 'declined', responded_at = now() where id = inv.id returning * into inv;
  elsif report.status not in ('new', 'triaging') then
    update public.report_collaboration_invitations set status = 'expired', responded_at = now() where id = inv.id;
    raise exception 'REPORT_LOCKED_FOR_COLLABORATION: the report has moved past triage, so this invitation can no longer be accepted' using errcode = '23514';
  elsif not exists (select 1 from public.program_researchers where program_id = report.program_id and user_id = actor and status = 'active') then
    raise exception 'COLLABORATOR_NOT_AUTHORIZED: you are no longer an active participant of this program' using errcode = '42501';
  else
    -- The split trigger on report_collaborators re-validates the total.
    insert into public.report_collaborators (report_id, researcher_id, bounty_split_percent, added_by)
    values (report.id, actor, inv.bounty_split_percent, inv.inviter_id);
    update public.report_collaboration_invitations set status = 'accepted', responded_at = now() where id = inv.id returning * into inv;
  end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, case when p_accept then 'report.collaborator_added' else 'report.collaboration_declined' end, 'report', report.id,
    jsonb_build_object('collaborator_id', actor, 'bounty_split_percent', inv.bounty_split_percent, 'via', 'invitation'));
  return inv;
end;
$$;

create or replace function public.revoke_collaboration_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inv public.report_collaboration_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.report_collaboration_invitations set status = 'revoked', responded_at = now()
   where id = p_invitation_id and inviter_id = actor and status = 'pending'
  returning * into inv;
  if inv.id is null then raise exception 'INVITATION_NOT_FOUND: no pending invitation of yours with that id' using errcode = 'P0002'; end if;
end;
$$;

/** Every collaboration the caller is part of: as submitter (collaborators and invitations they
 * sent) and as collaborator or invitee. One row per person per report. */
create or replace function public.list_my_collaborations()
returns table (
  kind text, id uuid, report_id uuid, report_title text, report_status public.report_status, program_name text,
  my_role text, other_user_id uuid, other_display_name text, other_username text, bounty_split_percent numeric,
  status text, created_at timestamptz, editable boolean
)
language sql stable security definer set search_path = ''
as $$
  select 'collaborator', c.id, r.id, r.title, r.status, p.name,
    case when r.researcher_id = auth.uid() then 'submitter' else 'collaborator' end,
    case when r.researcher_id = auth.uid() then c.researcher_id else r.researcher_id end,
    ou.display_name, ou.username,
    c.bounty_split_percent, 'accepted', c.added_at,
    r.researcher_id = auth.uid() and r.status in ('new', 'triaging')
  from public.report_collaborators c
  join public.reports r on r.id = c.report_id
  join public.programs p on p.id = r.program_id
  join public.users ou on ou.id = case when r.researcher_id = auth.uid() then c.researcher_id else r.researcher_id end
  where auth.uid() is not null and (r.researcher_id = auth.uid() or c.researcher_id = auth.uid())
  union all
  select 'invitation', i.id, r.id, r.title, r.status, p.name,
    case when i.inviter_id = auth.uid() then 'submitter' else 'invitee' end,
    case when i.inviter_id = auth.uid() then i.invitee_id else i.inviter_id end,
    ou.display_name, ou.username,
    i.bounty_split_percent,
    -- A pending invitation on a report past triage can no longer be accepted.
    case when i.status = 'pending' and r.status not in ('new', 'triaging') then 'expired' else i.status end,
    i.created_at,
    i.status = 'pending' and r.status in ('new', 'triaging')
  from public.report_collaboration_invitations i
  join public.reports r on r.id = i.report_id
  join public.programs p on p.id = r.program_id
  join public.users ou on ou.id = case when i.inviter_id = auth.uid() then i.invitee_id else i.inviter_id end
  where auth.uid() is not null and (i.inviter_id = auth.uid() or i.invitee_id = auth.uid())
    and i.status <> 'accepted' -- accepted ones appear as collaborator rows
  order by 13 desc;
$$;

-- Consent: adding someone now goes through an invitation they accept.
revoke execute on function public.add_report_collaborator(uuid, text, numeric) from authenticated;

-- 2. CVE requests ------------------------------------------------------------------------------------
create table public.cve_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete restrict,
  affected_product text not null check (char_length(affected_product) between 2 and 200),
  affected_versions text not null check (char_length(affected_versions) between 1 and 200),
  justification text not null check (char_length(justification) between 30 and 4000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'assigned')),
  reviewer_id uuid references public.users(id) on delete set null,
  reviewer_note text check (char_length(reviewer_note) <= 2000),
  reviewed_at timestamptz,
  cve_id text check (cve_id ~ '^CVE-[0-9]{4}-[0-9]{4,}$'),
  cve_evidence_url text check (cve_evidence_url ~ '^https://'),
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cve_requests_assignment_shape check ((status = 'assigned') = (cve_id is not null and cve_evidence_url is not null and assigned_at is not null))
);
create unique index cve_requests_one_open_per_report on public.cve_requests(report_id) where status in ('pending', 'approved', 'assigned');
alter table public.cve_requests enable row level security;
create policy "cve requests read by requester or platform staff" on public.cve_requests for select to authenticated
  using (requester_id = auth.uid() or private.is_platform_admin());
grant select on public.cve_requests to authenticated;
grant select on public.cve_requests to service_role;

/** Eligible = the caller submitted the report, it was resolved, and its disclosure is published. */
create or replace function private.cve_request_eligibility(p_report_id uuid, p_user uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when r.id is null or r.researcher_id <> p_user then 'not_yours'
    when r.status <> 'resolved' then 'not_resolved'
    when not exists (select 1 from public.report_disclosures d where d.report_id = r.id and d.status = 'approved' and d.published_at is not null and d.unpublished_at is null) then 'not_disclosed'
    else 'eligible'
  end
  from (select p_report_id as rid) x left join public.reports r on r.id = x.rid;
$$;

create or replace function public.request_cve(p_report_id uuid, p_affected_product text, p_affected_versions text, p_justification text)
returns public.cve_requests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  eligibility text;
  result public.cve_requests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  eligibility := private.cve_request_eligibility(p_report_id, actor);
  if eligibility = 'not_yours' then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if eligibility = 'not_resolved' then raise exception 'CVE_NOT_ELIGIBLE: only resolved reports can get a CVE' using errcode = '23514'; end if;
  if eligibility = 'not_disclosed' then raise exception 'CVE_NOT_ELIGIBLE: the report must be publicly disclosed first' using errcode = '23514'; end if;
  if exists (select 1 from public.cve_requests where report_id = p_report_id and status in ('pending', 'approved', 'assigned')) then
    raise exception 'CVE_REQUEST_EXISTS: this report already has an open or assigned CVE request' using errcode = '23505';
  end if;
  insert into public.cve_requests (report_id, organization_id, requester_id, affected_product, affected_versions, justification)
  select r.id, r.organization_id, actor, trim(p_affected_product), trim(p_affected_versions), trim(p_justification)
  from public.reports r where r.id = p_report_id
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, result.organization_id, 'cve.requested', 'report', p_report_id, jsonb_build_object('cve_request_id', result.id));
  return result;
end;
$$;

create or replace function public.withdraw_cve_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.cve_requests set status = 'withdrawn' where id = p_request_id and requester_id = auth.uid() and status = 'pending';
  if not found then raise exception 'NOT_FOUND: no pending CVE request of yours with that id' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.list_my_cve_requests()
returns table (id uuid, report_id uuid, report_title text, program_name text, affected_product text, affected_versions text, status text, reviewer_note text, cve_id text, cve_evidence_url text, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.report_id, r.title, p.name, c.affected_product, c.affected_versions, c.status, c.reviewer_note, c.cve_id, c.cve_evidence_url, c.created_at, c.reviewed_at
  from public.cve_requests c join public.reports r on r.id = c.report_id join public.programs p on p.id = r.program_id
  where c.requester_id = auth.uid()
  order by c.created_at desc;
$$;

/** The caller's reports that could get a CVE now (resolved, publicly disclosed, no open request). */
create or replace function public.list_my_cve_eligible_reports()
returns table (report_id uuid, report_title text, program_name text, published_title text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.title, p.name, d.published_title
  from public.reports r
  join public.programs p on p.id = r.program_id
  join public.report_disclosures d on d.report_id = r.id and d.status = 'approved' and d.published_at is not null and d.unpublished_at is null
  where r.researcher_id = auth.uid() and r.status = 'resolved'
    and not exists (select 1 from public.cve_requests c where c.report_id = r.id and c.status in ('pending', 'approved', 'assigned'))
  order by d.published_at desc;
$$;

create or replace function public.list_cve_requests_for_review()
returns table (id uuid, report_id uuid, published_title text, organization_name text, program_name text, requester_username text, affected_product text, affected_versions text, justification text, status text, reviewer_note text, cve_id text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  return query
    select c.id, c.report_id, d.published_title, o.name, p.name, u.username, c.affected_product, c.affected_versions, c.justification, c.status, c.reviewer_note, c.cve_id, c.created_at
    from public.cve_requests c
    join public.reports r on r.id = c.report_id
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = c.organization_id
    join public.users u on u.id = c.requester_id
    left join public.report_disclosures d on d.report_id = c.report_id
    where c.status in ('pending', 'approved')
    order by c.created_at asc;
end;
$$;

create or replace function public.review_cve_request(p_request_id uuid, p_decision text, p_note text)
returns public.cve_requests
language plpgsql security definer set search_path = ''
as $$
declare
  result public.cve_requests;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'INVALID_INPUT: decide approved or rejected' using errcode = '22023'; end if;
  if p_decision = 'rejected' and nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED: tell the researcher why' using errcode = '22023'; end if;
  update public.cve_requests set status = p_decision, reviewer_id = auth.uid(), reviewer_note = nullif(trim(coalesce(p_note, '')), ''), reviewed_at = now()
   where id = p_request_id and status = 'pending'
  returning * into result;
  if result.id is null then raise exception 'NOT_PENDING: this request is not waiting for review' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), result.organization_id, 'cve.reviewed', 'report', result.report_id, jsonb_build_object('cve_request_id', result.id, 'decision', p_decision));
  return result;
end;
$$;

/** Records an identifier a CVE Numbering Authority actually issued, with the public record that proves it. */
create or replace function public.record_cve_assignment(p_request_id uuid, p_cve_id text, p_evidence_url text)
returns public.cve_requests
language plpgsql security definer set search_path = ''
as $$
declare
  result public.cve_requests;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  if coalesce(p_cve_id, '') !~ '^CVE-[0-9]{4}-[0-9]{4,}$' then raise exception 'INVALID_CVE_ID: use the form CVE-2026-12345' using errcode = '22023'; end if;
  if coalesce(p_evidence_url, '') !~ '^https://[^\s]+$' then raise exception 'EVIDENCE_REQUIRED: link the public CVE record (https)' using errcode = '22023'; end if;
  update public.cve_requests set status = 'assigned', cve_id = upper(p_cve_id), cve_evidence_url = p_evidence_url, assigned_at = now()
   where id = p_request_id and status = 'approved'
  returning * into result;
  if result.id is null then raise exception 'NOT_APPROVED: only an approved request can be marked assigned' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), result.organization_id, 'cve.assigned', 'report', result.report_id, jsonb_build_object('cve_request_id', result.id, 'cve_id', result.cve_id, 'evidence', p_evidence_url));
  return result;
end;
$$;

-- 3. Acknowledgements (Hall of Fame) ---------------------------------------------------------------
create table public.program_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null unique references public.reports(id) on delete cascade,
  researcher_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'published', 'declined', 'revoked')),
  note text check (char_length(note) <= 280),
  proposed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  published_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null
);
create index program_acknowledgements_program_idx on public.program_acknowledgements(program_id, status, published_at desc);
create index program_acknowledgements_researcher_idx on public.program_acknowledgements(researcher_id, status);
alter table public.program_acknowledgements enable row level security;
create policy "acknowledgements read by the researcher or the organization's staff" on public.program_acknowledgements for select to authenticated
  using (researcher_id = auth.uid() or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(program_id));
grant select on public.program_acknowledgements to authenticated;
grant select on public.program_acknowledgements to service_role;

create or replace function public.propose_acknowledgement(p_report_id uuid, p_note text)
returns public.program_acknowledgements
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  result public.program_acknowledgements;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = p_report_id;
  if report.id is null or not (private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(report.program_id)) then
    raise exception 'FORBIDDEN: only the organization''s security staff can acknowledge a report' using errcode = '42501';
  end if;
  if report.status not in ('resolved', 'accepted') then
    raise exception 'ACK_NOT_ELIGIBLE: only accepted or resolved reports can be acknowledged' using errcode = '23514';
  end if;
  insert into public.program_acknowledgements (program_id, organization_id, report_id, researcher_id, note, proposed_by)
  values (report.program_id, report.organization_id, report.id, report.researcher_id, nullif(trim(coalesce(p_note, '')), ''), actor)
  on conflict (report_id) do update set status = 'proposed', note = excluded.note, proposed_by = actor, created_at = now(), responded_at = null, published_at = null, revoked_at = null, revoked_by = null
    where public.program_acknowledgements.status in ('revoked')
  returning * into result;
  if result.id is null then raise exception 'ACK_EXISTS: this report already has an acknowledgement' using errcode = '23505'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'acknowledgement.proposed', 'report', report.id, '{}'::jsonb);
  return result;
end;
$$;

/** The researcher decides whether their name appears publicly. */
create or replace function public.respond_acknowledgement(p_acknowledgement_id uuid, p_publish boolean)
returns public.program_acknowledgements
language plpgsql security definer set search_path = ''
as $$
declare
  result public.program_acknowledgements;
begin
  update public.program_acknowledgements
     set status = case when p_publish then 'published' else 'declined' end,
         responded_at = now(), published_at = case when p_publish then now() end
   where id = p_acknowledgement_id and researcher_id = auth.uid() and status = 'proposed'
  returning * into result;
  if result.id is null then raise exception 'NOT_FOUND: no acknowledgement waiting for your answer' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), result.organization_id, case when p_publish then 'acknowledgement.published' else 'acknowledgement.declined' end, 'report', result.report_id, '{}'::jsonb);
  return result;
end;
$$;

/** Either side can take a published acknowledgement down; the researcher can also withdraw consent. */
create or replace function public.revoke_acknowledgement(p_acknowledgement_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.program_acknowledgements;
begin
  select * into a from public.program_acknowledgements where id = p_acknowledgement_id for update;
  if a.id is null or not (a.researcher_id = auth.uid() or private.has_org_role(a.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(a.program_id)) then
    raise exception 'NOT_FOUND: acknowledgement not found' using errcode = 'P0002';
  end if;
  if a.status not in ('proposed', 'published') then raise exception 'NOT_ACTIVE: this acknowledgement is already %', a.status using errcode = '23514'; end if;
  update public.program_acknowledgements set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where id = a.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), a.organization_id, 'acknowledgement.revoked', 'report', a.report_id, '{}'::jsonb);
end;
$$;

create or replace function public.list_my_acknowledgements()
returns table (id uuid, program_id uuid, organization_id uuid, program_name text, organization_name text, report_id uuid, report_title text, status text, note text, created_at timestamptz, published_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.program_id, a.organization_id, p.name, o.name, a.report_id, r.title, a.status, a.note, a.created_at, a.published_at
  from public.program_acknowledgements a
  join public.programs p on p.id = a.program_id
  join public.organizations o on o.id = a.organization_id
  join public.reports r on r.id = a.report_id
  where a.researcher_id = auth.uid()
  order by a.created_at desc;
$$;

/** Public Hall of Fame: published acknowledgements on public, live programs only. Never a report
 * title or anything about the finding, just who and when. p_program_id null = every program. */
create or replace function public.list_hall_of_fame(p_program_id uuid, p_limit integer)
returns table (program_id uuid, organization_id uuid, program_name text, organization_name text, researcher_display_name text, researcher_username text, note text, published_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.program_id, a.organization_id, p.name, o.name, u.display_name, coalesce(u.public_username, u.username), a.note, a.published_at
  from public.program_acknowledgements a
  join public.programs p on p.id = a.program_id
  join public.organizations o on o.id = a.organization_id
  join public.users u on u.id = a.researcher_id
  where a.status = 'published' and p.visibility = 'public' and p.status in ('active', 'paused') and o.status <> 'suspended'
    and u.deactivated_at is null and not u.is_suspended
    and (p_program_id is null or a.program_id = p_program_id)
  order by a.published_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- 4. Hacking events --------------------------------------------------------------------------------
create table public.hacking_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  description text not null check (char_length(description) between 10 and 4000),
  format text not null check (format in ('online', 'in_person', 'hybrid')),
  location text check (char_length(location) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  registration_closes_at timestamptz not null,
  capacity integer check (capacity is null or capacity between 1 and 10000),
  min_reputation integer not null default 0 check (min_reputation >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and registration_closes_at <= ends_at),
  check (format = 'online' or location is not null)
);
create table public.hacking_event_registrations (
  event_id uuid not null references public.hacking_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  primary key (event_id, user_id)
);
alter table public.hacking_events enable row level security;
alter table public.hacking_event_registrations enable row level security;
create policy "published events readable by signed-in users" on public.hacking_events for select to authenticated using (status <> 'draft' or private.is_platform_admin());
create policy "own registrations readable" on public.hacking_event_registrations for select to authenticated using (user_id = auth.uid() or private.is_platform_admin());
grant select on public.hacking_events, public.hacking_event_registrations to authenticated, service_role;

create or replace function public.save_hacking_event(p_id uuid, p_title text, p_description text, p_format text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz, p_registration_closes_at timestamptz, p_capacity integer, p_min_reputation integer)
returns public.hacking_events
language plpgsql security definer set search_path = ''
as $$
declare
  result public.hacking_events;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.hacking_events (title, description, format, location, starts_at, ends_at, registration_closes_at, capacity, min_reputation, created_by)
    values (trim(p_title), trim(p_description), p_format, nullif(trim(coalesce(p_location, '')), ''), p_starts_at, p_ends_at, p_registration_closes_at, p_capacity, coalesce(p_min_reputation, 0), auth.uid())
    returning * into result;
  else
    update public.hacking_events set title = trim(p_title), description = trim(p_description), format = p_format, location = nullif(trim(coalesce(p_location, '')), ''),
      starts_at = p_starts_at, ends_at = p_ends_at, registration_closes_at = p_registration_closes_at, capacity = p_capacity, min_reputation = coalesce(p_min_reputation, 0)
    where id = p_id and status <> 'cancelled'
    returning * into result;
    if result.id is null then raise exception 'NOT_FOUND: event not found or cancelled' using errcode = 'P0002'; end if;
  end if;
  return result;
end;
$$;

create or replace function public.set_hacking_event_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  if p_status not in ('published', 'cancelled') then raise exception 'INVALID_INPUT: publish or cancel' using errcode = '22023'; end if;
  update public.hacking_events set status = p_status where id = p_id and status <> 'cancelled';
  if not found then raise exception 'NOT_FOUND: event not found or already cancelled' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), null, 'event.' || p_status, 'hacking_event', p_id, '{}'::jsonb);
end;
$$;

create or replace function public.list_hacking_events()
returns table (id uuid, title text, description text, format text, location text, starts_at timestamptz, ends_at timestamptz, registration_closes_at timestamptz, capacity integer, min_reputation integer, status text, registered_count bigint, my_status text)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.title, e.description, e.format, e.location, e.starts_at, e.ends_at, e.registration_closes_at, e.capacity, e.min_reputation, e.status,
    (select count(*) from public.hacking_event_registrations x where x.event_id = e.id and x.status = 'registered'),
    (select x.status from public.hacking_event_registrations x where x.event_id = e.id and x.user_id = auth.uid())
  from public.hacking_events e
  where auth.uid() is not null and (e.status <> 'draft' or private.is_platform_admin())
  order by e.starts_at desc;
$$;

create or replace function public.register_for_hacking_event(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  e public.hacking_events;
  taken bigint;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.users where id = actor and account_type = 'researcher' and deactivated_at is null and not is_suspended) then
    raise exception 'FORBIDDEN: events are for researcher accounts' using errcode = '42501';
  end if;
  select * into e from public.hacking_events where id = p_event_id for update; -- serializes capacity checks
  if e.id is null or e.status <> 'published' then raise exception 'NOT_FOUND: event not open' using errcode = 'P0002'; end if;
  if now() > e.registration_closes_at then raise exception 'REGISTRATION_CLOSED: registration has closed' using errcode = '23514'; end if;
  if e.min_reputation > 0 and coalesce(public.get_researcher_reputation_score(actor), 0) < e.min_reputation then
    raise exception 'NOT_ELIGIBLE: this event needs % reputation', e.min_reputation using errcode = '23514';
  end if;
  select count(*) into taken from public.hacking_event_registrations where event_id = e.id and status = 'registered' and user_id <> actor;
  if e.capacity is not null and taken >= e.capacity then raise exception 'EVENT_FULL: every place is taken' using errcode = '23514'; end if;
  insert into public.hacking_event_registrations (event_id, user_id) values (e.id, actor)
  on conflict (event_id, user_id) do update set status = 'registered', registered_at = now(), cancelled_at = null;
end;
$$;

create or replace function public.cancel_hacking_event_registration(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.hacking_event_registrations set status = 'cancelled', cancelled_at = now()
   where event_id = p_event_id and user_id = auth.uid() and status = 'registered';
  if not found then raise exception 'NOT_FOUND: you are not registered for this event' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.list_hacking_event_registrations(p_event_id uuid)
returns table (username text, display_name text, status text, registered_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  return query select u.username, u.display_name, r.status, r.registered_at
    from public.hacking_event_registrations r join public.users u on u.id = r.user_id
    where r.event_id = p_event_id order by r.registered_at;
end;
$$;

-- 5. Mentorship ------------------------------------------------------------------------------------
create table public.mentor_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  headline text not null check (char_length(headline) between 5 and 140),
  topics text[] not null check (cardinality(topics) between 1 and 8),
  accepting boolean not null default true,
  max_active integer not null default 3 check (max_active between 1 and 20),
  updated_at timestamptz not null default now()
);
create table public.mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.users(id) on delete cascade,
  mentee_id uuid not null references public.users(id) on delete cascade,
  topic text not null check (char_length(topic) between 2 and 80),
  message text not null check (char_length(message) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  mentor_note text check (char_length(mentor_note) <= 1000),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (mentor_id <> mentee_id)
);
create unique index mentorship_requests_one_open on public.mentorship_requests(mentor_id, mentee_id) where status in ('pending', 'accepted');
alter table public.mentor_profiles enable row level security;
alter table public.mentorship_requests enable row level security;
create policy "mentor profiles readable by signed-in users" on public.mentor_profiles for select to authenticated using (true);
create policy "mentorship requests read by the two people" on public.mentorship_requests for select to authenticated using (mentor_id = auth.uid() or mentee_id = auth.uid());
grant select on public.mentor_profiles, public.mentorship_requests to authenticated, service_role;

/** Mentors need a track record: at least three resolved reports. */
create or replace function public.save_my_mentor_profile(p_headline text, p_topics text[], p_accepting boolean, p_max_active integer)
returns public.mentor_profiles
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  resolved bigint;
  result public.mentor_profiles;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select coalesce(max(t.resolved_count), 0) into resolved from private.researcher_reputation_totals() t where t.researcher_id = actor;
  if resolved < 3 then raise exception 'NOT_ELIGIBLE: mentors need at least 3 resolved reports' using errcode = '23514'; end if;
  insert into public.mentor_profiles (user_id, headline, topics, accepting, max_active)
  values (actor, trim(p_headline), (select array_agg(distinct trim(t)) from unnest(p_topics) t where trim(t) <> ''), coalesce(p_accepting, true), coalesce(p_max_active, 3))
  on conflict (user_id) do update set headline = excluded.headline, topics = excluded.topics, accepting = excluded.accepting, max_active = excluded.max_active, updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.list_mentors()
returns table (user_id uuid, display_name text, username text, headline text, topics text[], accepting boolean, open_slots integer, resolved_reports bigint, my_request_status text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.display_name, coalesce(u.public_username, u.username), m.headline, m.topics, m.accepting,
    greatest(m.max_active - (select count(*) from public.mentorship_requests r where r.mentor_id = m.user_id and r.status = 'accepted')::integer, 0),
    coalesce((select t.resolved_count from private.researcher_reputation_totals() t where t.researcher_id = m.user_id), 0),
    (select r.status from public.mentorship_requests r where r.mentor_id = m.user_id and r.mentee_id = auth.uid() order by r.created_at desc limit 1)
  from public.mentor_profiles m join public.users u on u.id = m.user_id
  where auth.uid() is not null and u.deactivated_at is null and not u.is_suspended
  order by m.accepting desc, u.display_name;
$$;

create or replace function public.request_mentorship(p_mentor_id uuid, p_topic text, p_message text)
returns public.mentorship_requests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  m public.mentor_profiles;
  result public.mentorship_requests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.users where id = actor and account_type = 'researcher' and deactivated_at is null and not is_suspended) then
    raise exception 'FORBIDDEN: mentorship is for researcher accounts' using errcode = '42501';
  end if;
  select * into m from public.mentor_profiles where user_id = p_mentor_id;
  if m.user_id is null or not m.accepting then raise exception 'NOT_ACCEPTING: this mentor is not taking requests' using errcode = '23514'; end if;
  if p_mentor_id = actor then raise exception 'INVALID_INPUT: you cannot mentor yourself' using errcode = '22023'; end if;
  if exists (select 1 from public.mentorship_requests where mentor_id = p_mentor_id and mentee_id = actor and status in ('pending', 'accepted')) then
    raise exception 'REQUEST_EXISTS: you already have an open request with this mentor' using errcode = '23505';
  end if;
  if not private.check_and_consume_rate_limit('mentorship_request:' || actor, 5, 86400) then
    raise exception 'RATE_LIMITED: at most 5 mentorship requests a day' using errcode = '54000';
  end if;
  insert into public.mentorship_requests (mentor_id, mentee_id, topic, message) values (p_mentor_id, actor, trim(p_topic), trim(p_message)) returning * into result;
  return result;
end;
$$;

/** Mentor answers. Accepting shares how to meet (mentor_note), which only the mentee can read. */
create or replace function public.respond_mentorship_request(p_request_id uuid, p_accept boolean, p_note text)
returns public.mentorship_requests
language plpgsql security definer set search_path = ''
as $$
declare
  r public.mentorship_requests;
  m public.mentor_profiles;
begin
  select * into r from public.mentorship_requests where id = p_request_id and mentor_id = auth.uid() and status = 'pending' for update;
  if r.id is null then raise exception 'NOT_FOUND: no pending request with that id' using errcode = 'P0002'; end if;
  if p_accept then
    select * into m from public.mentor_profiles where user_id = auth.uid() for update;
    if (select count(*) from public.mentorship_requests where mentor_id = auth.uid() and status = 'accepted') >= m.max_active then
      raise exception 'NO_SLOTS: you are at your limit of active mentees' using errcode = '23514';
    end if;
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED: tell the mentee how and when you will meet' using errcode = '22023'; end if;
  end if;
  update public.mentorship_requests set status = case when p_accept then 'accepted' else 'declined' end, mentor_note = nullif(trim(coalesce(p_note, '')), ''), responded_at = now()
   where id = r.id returning * into r;
  return r;
end;
$$;

/** Mentee cancels a pending/accepted request; either side marks an accepted one completed. */
create or replace function public.close_mentorship_request(p_request_id uuid, p_outcome text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_outcome = 'cancelled' then
    update public.mentorship_requests set status = 'cancelled', responded_at = coalesce(responded_at, now())
     where id = p_request_id and status in ('pending', 'accepted') and (mentee_id = auth.uid() or (mentor_id = auth.uid() and status = 'accepted'));
  elsif p_outcome = 'completed' then
    update public.mentorship_requests set status = 'completed' where id = p_request_id and status = 'accepted' and (mentee_id = auth.uid() or mentor_id = auth.uid());
  else
    raise exception 'INVALID_INPUT: cancel or complete' using errcode = '22023';
  end if;
  if not found then raise exception 'NOT_FOUND: no open request of yours with that id' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.list_my_mentorships()
returns table (id uuid, my_role text, other_display_name text, other_username text, topic text, message text, status text, mentor_note text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, case when r.mentor_id = auth.uid() then 'mentor' else 'mentee' end, u.display_name, coalesce(u.public_username, u.username), r.topic, r.message, r.status, r.mentor_note, r.created_at
  from public.mentorship_requests r
  join public.users u on u.id = case when r.mentor_id = auth.uid() then r.mentee_id else r.mentor_id end
  where r.mentor_id = auth.uid() or r.mentee_id = auth.uid()
  order by (r.status in ('pending', 'accepted')) desc, r.created_at desc;
$$;

-- 6. Swag -------------------------------------------------------------------------------------------
create table public.swag_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  description text not null check (char_length(description) between 5 and 1000),
  min_reputation integer not null default 0 check (min_reputation >= 0),
  stock integer not null check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.swag_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.swag_items(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  shipping_name text not null check (char_length(shipping_name) between 2 and 120),
  shipping_address text not null check (char_length(shipping_address) between 10 and 600),
  status text not null default 'requested' check (status in ('requested', 'approved', 'shipped', 'rejected', 'cancelled')),
  staff_note text check (char_length(staff_note) <= 500),
  tracking_reference text check (char_length(tracking_reference) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index swag_requests_one_open on public.swag_requests(item_id, user_id) where status in ('requested', 'approved');
alter table public.swag_items enable row level security;
alter table public.swag_requests enable row level security;
create policy "swag catalog readable by signed-in users" on public.swag_items for select to authenticated using (active or private.is_platform_admin());
create policy "swag requests read by requester or platform staff" on public.swag_requests for select to authenticated using (user_id = auth.uid() or private.is_platform_admin());
grant select on public.swag_items, public.swag_requests to authenticated, service_role;

create or replace function public.save_swag_item(p_id uuid, p_name text, p_description text, p_min_reputation integer, p_stock integer, p_active boolean)
returns public.swag_items
language plpgsql security definer set search_path = ''
as $$
declare
  result public.swag_items;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.swag_items (name, description, min_reputation, stock, active) values (trim(p_name), trim(p_description), coalesce(p_min_reputation, 0), p_stock, coalesce(p_active, true)) returning * into result;
  else
    update public.swag_items set name = trim(p_name), description = trim(p_description), min_reputation = coalesce(p_min_reputation, 0), stock = p_stock, active = coalesce(p_active, true)
     where id = p_id returning * into result;
    if result.id is null then raise exception 'NOT_FOUND: item not found' using errcode = 'P0002'; end if;
  end if;
  return result;
end;
$$;

create or replace function public.request_swag(p_item_id uuid, p_shipping_name text, p_shipping_address text)
returns public.swag_requests
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.swag_items;
  result public.swag_requests;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.users where id = actor and account_type = 'researcher' and deactivated_at is null and not is_suspended) then
    raise exception 'FORBIDDEN: swag is for researcher accounts' using errcode = '42501';
  end if;
  select * into item from public.swag_items where id = p_item_id and active;
  if item.id is null then raise exception 'NOT_FOUND: item not available' using errcode = 'P0002'; end if;
  if item.stock <= 0 then raise exception 'OUT_OF_STOCK: none left right now' using errcode = '23514'; end if;
  if coalesce(public.get_researcher_reputation_score(actor), 0) < item.min_reputation then
    raise exception 'NOT_ELIGIBLE: this item needs % reputation', item.min_reputation using errcode = '23514';
  end if;
  if exists (select 1 from public.swag_requests where item_id = item.id and user_id = actor and status in ('requested', 'approved')) then
    raise exception 'REQUEST_EXISTS: you already have an open request for this item' using errcode = '23505';
  end if;
  insert into public.swag_requests (item_id, user_id, shipping_name, shipping_address) values (item.id, actor, trim(p_shipping_name), trim(p_shipping_address)) returning * into result;
  return result;
end;
$$;

create or replace function public.cancel_swag_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.swag_requests set status = 'cancelled', updated_at = now() where id = p_request_id and user_id = auth.uid() and status = 'requested';
  if not found then raise exception 'NOT_FOUND: no cancellable request of yours with that id' using errcode = 'P0002'; end if;
end;
$$;

/** Staff move a request along. Approving takes one from stock (and fails if none is left). */
create or replace function public.update_swag_request(p_request_id uuid, p_status text, p_note text, p_tracking text)
returns public.swag_requests
language plpgsql security definer set search_path = ''
as $$
declare
  r public.swag_requests;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  select * into r from public.swag_requests where id = p_request_id for update;
  if r.id is null then raise exception 'NOT_FOUND: request not found' using errcode = 'P0002'; end if;
  if not ((r.status = 'requested' and p_status in ('approved', 'rejected')) or (r.status = 'approved' and p_status in ('shipped', 'rejected'))) then
    raise exception 'INVALID_TRANSITION: cannot move a % request to %', r.status, p_status using errcode = '23514';
  end if;
  if p_status = 'approved' then
    update public.swag_items set stock = stock - 1 where id = r.item_id and stock > 0;
    if not found then raise exception 'OUT_OF_STOCK: no stock left to approve this request' using errcode = '23514'; end if;
  elsif p_status = 'rejected' and r.status = 'approved' then
    update public.swag_items set stock = stock + 1 where id = r.item_id; -- give the reserved one back
  end if;
  update public.swag_requests set status = p_status, staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note),
    tracking_reference = coalesce(nullif(trim(coalesce(p_tracking, '')), ''), tracking_reference), updated_at = now()
   where id = r.id returning * into r;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), null, 'swag.' || p_status, 'swag_request', r.id, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.list_swag_requests_for_staff()
returns table (id uuid, item_name text, username text, shipping_name text, shipping_address text, status text, staff_note text, tracking_reference text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  return query select r.id, i.name, u.username, r.shipping_name, r.shipping_address, r.status, r.staff_note, r.tracking_reference, r.created_at
    from public.swag_requests r join public.swag_items i on i.id = r.item_id join public.users u on u.id = r.user_id
    order by (r.status in ('requested', 'approved')) desc, r.created_at desc limit 300;
end;
$$;

-- 7. Followed programs ("Subscriptions") ------------------------------------------------------------
create table public.program_follows (
  user_id uuid not null references public.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
alter table public.program_follows enable row level security;
create policy "own follows" on public.program_follows for select to authenticated using (user_id = auth.uid());
grant select on public.program_follows to authenticated, service_role;

/** Only a program the caller can already see: public and live, or one they participate in. */
create or replace function public.set_program_follow(p_program_id uuid, p_follow boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not p_follow then
    delete from public.program_follows where user_id = auth.uid() and program_id = p_program_id;
    return;
  end if;
  if not exists (
    select 1 from public.programs p where p.id = p_program_id and p.status in ('active', 'paused')
      and (p.visibility = 'public' or exists (select 1 from public.program_researchers pr where pr.program_id = p.id and pr.user_id = auth.uid() and pr.status = 'active'))
  ) then raise exception 'NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  insert into public.program_follows (user_id, program_id) values (auth.uid(), p_program_id) on conflict do nothing;
end;
$$;

create or replace function public.list_my_followed_programs()
returns table (program_id uuid, organization_id uuid, program_name text, organization_name text, program_type public.program_type, program_status public.program_status, followed_at timestamptz, policy_published_at timestamptz, scope_changed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.organization_id, p.name, o.name, p.program_type, p.status, f.created_at,
    (select max(v.created_at) from public.program_policy_versions v where v.program_id = p.id),
    (select max(greatest(e.created_at, e.updated_at, coalesce(e.removed_at, e.created_at))) from public.program_scope_entries e where e.program_id = p.id)
  from public.program_follows f
  join public.programs p on p.id = f.program_id
  join public.organizations o on o.id = p.organization_id
  where f.user_id = auth.uid()
    and (p.visibility = 'public' or exists (select 1 from public.program_researchers pr where pr.program_id = p.id and pr.user_id = auth.uid() and pr.status = 'active'))
  order by f.created_at desc;
$$;

-- 8. Platform agreements ----------------------------------------------------------------------------
-- Acknowledgement records (who, which version, when), not legally verified e-signatures.
create table public.platform_agreements (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  version integer not null check (version > 0),
  title text not null,
  body text not null,
  source_path text,
  published_at timestamptz not null default now(),
  unique (slug, version)
);
create table public.platform_agreement_acceptances (
  agreement_id uuid not null references public.platform_agreements(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (agreement_id, user_id)
);
alter table public.platform_agreements enable row level security;
alter table public.platform_agreement_acceptances enable row level security;
create policy "agreements readable by signed-in users" on public.platform_agreements for select to authenticated using (true);
create policy "own acceptances" on public.platform_agreement_acceptances for select to authenticated using (user_id = auth.uid());
grant select on public.platform_agreements, public.platform_agreement_acceptances to authenticated, service_role;

-- Version 1 is the Code of Conduct already published at /safe-harbor (app/safe-harbor/page.tsx).
insert into public.platform_agreements (slug, version, title, body, source_path) values ('code-of-conduct', 1, 'Code of Conduct',
'Every researcher and every organization on Unpatched is expected to:
- Communicate honestly. A report''s severity, impact, and reproduction steps should describe what you actually found, never exaggerated to influence a bounty decision.
- Submit your own, original findings. Reports copied from another researcher''s work, from a public disclosure, or generated without a real understanding of the vulnerability are not acceptable.
- Respect the researcher-organization communication channel. Every message on a report is real and reviewed by real people; use it in good faith, not to pressure or threaten.
- Never demand payment as a condition of disclosure, and never threaten to disclose a vulnerability publicly to force a specific bounty amount.
- Respect scope and access boundaries even after finding a way past them.
A violation can result in removal from a program, or from Unpatched, depending on severity.', '/safe-harbor');

create or replace function public.accept_platform_agreement(p_agreement_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Only the latest version of an agreement can be accepted.
  if not exists (select 1 from public.platform_agreements a where a.id = p_agreement_id and a.version = (select max(b.version) from public.platform_agreements b where b.slug = a.slug)) then
    raise exception 'NOT_CURRENT: that is not the current version' using errcode = '23514';
  end if;
  insert into public.platform_agreement_acceptances (agreement_id, user_id) values (p_agreement_id, auth.uid()) on conflict do nothing;
end;
$$;

/** Platform agreements (latest version, accepted or not) plus program policies the caller
 * accepted when submitting reports (reports.policy_version_id). */
create or replace function public.list_my_agreements()
returns table (kind text, agreement_id uuid, title text, version integer, body text, source_path text, published_at timestamptz, accepted_at timestamptz, program_id uuid, organization_id uuid)
language sql stable security definer set search_path = ''
as $$
  select 'platform', a.id, a.title, a.version, a.body, a.source_path, a.published_at, x.accepted_at, null::uuid, null::uuid
  from public.platform_agreements a
  left join public.platform_agreement_acceptances x on x.agreement_id = a.id and x.user_id = auth.uid()
  where a.version = (select max(b.version) from public.platform_agreements b where b.slug = a.slug) and auth.uid() is not null
  union all
  select 'program_policy', v.id, p.name || ' program policy', v.version_number, null, null, v.created_at, min(r.submitted_at), p.id, p.organization_id
  from public.reports r
  join public.program_policy_versions v on v.id = r.policy_version_id
  join public.programs p on p.id = v.program_id
  where r.researcher_id = auth.uid()
  group by v.id, p.name, v.version_number, v.created_at, p.id, p.organization_id
  order by 1, 8 desc nulls first;
$$;

-- 9. Dashboard action center --------------------------------------------------------------------------
create or replace function public.get_my_researcher_actions()
returns table (collaboration_invitations bigint, acknowledgements_to_answer bigint, mentorship_requests_to_answer bigint, cve_eligible_reports bigint, unaccepted_agreements bigint, upcoming_events bigint)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.report_collaboration_invitations i join public.reports r on r.id = i.report_id
      where i.invitee_id = auth.uid() and i.status = 'pending' and r.status in ('new', 'triaging')),
    (select count(*) from public.program_acknowledgements where researcher_id = auth.uid() and status = 'proposed'),
    (select count(*) from public.mentorship_requests where mentor_id = auth.uid() and status = 'pending'),
    (select count(*) from public.list_my_cve_eligible_reports()),
    (select count(*) from public.list_my_agreements() a where a.kind = 'platform' and a.accepted_at is null),
    (select count(*) from public.hacking_event_registrations g join public.hacking_events e on e.id = g.event_id
      where g.user_id = auth.uid() and g.status = 'registered' and e.status = 'published' and e.ends_at > now())
  where auth.uid() is not null;
$$;

-- Grants -----------------------------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.invite_report_collaborator(uuid, text, numeric, text)', 'public.respond_collaboration_invitation(uuid, boolean)', 'public.revoke_collaboration_invitation(uuid)', 'public.list_my_collaborations()',
    'public.request_cve(uuid, text, text, text)', 'public.withdraw_cve_request(uuid)', 'public.list_my_cve_requests()', 'public.list_my_cve_eligible_reports()',
    'public.list_cve_requests_for_review()', 'public.review_cve_request(uuid, text, text)', 'public.record_cve_assignment(uuid, text, text)',
    'public.propose_acknowledgement(uuid, text)', 'public.respond_acknowledgement(uuid, boolean)', 'public.revoke_acknowledgement(uuid)', 'public.list_my_acknowledgements()',
    'public.save_hacking_event(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, integer)', 'public.set_hacking_event_status(uuid, text)', 'public.list_hacking_events()',
    'public.register_for_hacking_event(uuid)', 'public.cancel_hacking_event_registration(uuid)', 'public.list_hacking_event_registrations(uuid)',
    'public.save_my_mentor_profile(text, text[], boolean, integer)', 'public.list_mentors()', 'public.request_mentorship(uuid, text, text)', 'public.respond_mentorship_request(uuid, boolean, text)',
    'public.close_mentorship_request(uuid, text)', 'public.list_my_mentorships()',
    'public.save_swag_item(uuid, text, text, integer, integer, boolean)', 'public.request_swag(uuid, text, text)', 'public.cancel_swag_request(uuid)', 'public.update_swag_request(uuid, text, text, text)', 'public.list_swag_requests_for_staff()',
    'public.set_program_follow(uuid, boolean)', 'public.list_my_followed_programs()',
    'public.accept_platform_agreement(uuid)', 'public.list_my_agreements()', 'public.get_my_researcher_actions()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- The public Hall of Fame is readable signed out.
revoke all on function public.list_hall_of_fame(uuid, integer) from public;
grant execute on function public.list_hall_of_fame(uuid, integer) to anon, authenticated;
revoke all on function private.cve_request_eligibility(uuid, uuid) from public;
grant execute on function private.cve_request_eligibility(uuid, uuid) to service_role;

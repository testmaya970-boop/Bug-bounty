-- Report submission, part 2: many drafts, staged direct uploads, researcher CVSS, a chosen
-- scope entry, and idempotent submission. Additive; the one replaced function signature
-- (submit_report) and the two draft RPCs are updated in the app in the same change.
--
-- 1. Drafts: a researcher may keep several drafts per program (each has its own id), with an
--    optimistic-concurrency version so two tabs never silently overwrite each other. A draft
--    is deleted by the submit that consumes it (no more "delete every draft for this program"
--    trigger). Private to the owner (RLS select; writes only through these functions).
-- 2. evidence_uploads: a file is uploaded straight to object storage under a short-lived,
--    size-bound signed URL, then verified by the server (size, file signature, SHA-256) before
--    it is usable. A verified upload belongs either to a draft (attached at submission) or to
--    a report (attached immediately through the existing add_*_file_evidence functions).
-- 3. The evidence size cap moves from a hardcoded 10 MiB to a 1 GiB ceiling; the effective
--    limit is the app's EVIDENCE_MAX_FILE_MB setting (lib/evidence-limits.ts), which must stay
--    at or below this ceiling.
-- 4. reports.submission_key: a retried submit (network drop after the server committed)
--    returns the report it already created instead of creating a second one.
-- 5. Researcher CVSS (v4.0 or v3.1): vector + version + score as the researcher's own
--    assessment. The score is computed by the server action from the vector (never taken from
--    the browser); the database checks the vector shape and range. Separate from the
--    triager's CVSS columns, from confirmed severity, and from priority.

-- 1. Drafts -----------------------------------------------------------------------------------
alter table public.report_drafts add column if not exists id uuid not null default gen_random_uuid();
alter table public.report_drafts add column if not exists version integer not null default 1;
alter table public.report_drafts drop constraint if exists report_drafts_pkey;
alter table public.report_drafts add primary key (id);
create index if not exists report_drafts_owner_recent_idx on public.report_drafts (researcher_id, updated_at desc);

drop trigger if exists reports_clear_draft_on_submit on public.reports;
drop function if exists private.clear_report_draft_on_submit();

drop function if exists public.save_my_report_draft(uuid, jsonb);
drop function if exists public.delete_my_report_draft(uuid);

create or replace function public.save_my_report_draft(p_draft_id uuid, target_program_id uuid, p_draft jsonb, p_expected_version integer)
returns table (id uuid, version integer, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  existing public.report_drafts;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.program_researchers pr where pr.program_id = target_program_id and pr.user_id = actor and pr.status = 'active') then
    raise exception 'FORBIDDEN: you are not an active researcher on this program' using errcode = '42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or pg_column_size(p_draft) > 120000 then
    raise exception 'INVALID_DRAFT: the draft is too large' using errcode = '22023';
  end if;

  if p_draft_id is null then
    if (select count(*) from public.report_drafts d where d.researcher_id = actor) >= 50 then
      raise exception 'TOO_MANY_DRAFTS: you have 50 drafts -- submit or delete one first' using errcode = '54000';
    end if;
    return query
      insert into public.report_drafts as d (researcher_id, program_id, draft, updated_at) values (actor, target_program_id, p_draft, now())
      returning d.id, d.version, d.updated_at;
    return;
  end if;

  select * into existing from public.report_drafts d where d.id = p_draft_id and d.researcher_id = actor for update;
  if existing.id is null then raise exception 'DRAFT_NOT_FOUND: this draft no longer exists' using errcode = 'P0002'; end if;
  if existing.program_id <> target_program_id then raise exception 'INVALID_DRAFT: this draft belongs to another program' using errcode = '22023'; end if;
  if p_expected_version is not null and existing.version <> p_expected_version then
    raise exception 'DRAFT_CONFLICT: this draft was changed in another tab or device -- reload it to continue' using errcode = '40001';
  end if;
  return query
    update public.report_drafts d set draft = p_draft, version = d.version + 1, updated_at = now()
    where d.id = p_draft_id
    returning d.id, d.version, d.updated_at;
end;
$$;

create or replace function public.delete_my_report_draft(p_draft_id uuid)
returns setof text
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Returns the object keys of the draft's staged files so the caller can remove the bytes.
  return query
    delete from public.evidence_uploads u where u.draft_id = p_draft_id and u.owner_id = actor and u.status <> 'attached' returning u.object_key;
  delete from public.report_drafts d where d.id = p_draft_id and d.researcher_id = actor;
end;
$$;

-- 2. Staged uploads ---------------------------------------------------------------------------
create table if not exists public.evidence_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  draft_id uuid references public.report_drafts(id) on delete set null,
  report_id uuid references public.reports(id) on delete cascade,
  visibility public.report_visibility,
  object_key text not null unique check (object_key ~ '^evidence/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (char_length(content_type) between 1 and 100),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 1073741824),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'ready', 'attached')),
  evidence_id uuid references public.report_evidence(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists evidence_uploads_draft_idx on public.evidence_uploads (draft_id) where draft_id is not null;
alter table public.evidence_uploads enable row level security;
create policy "staged uploads are private to their uploader" on public.evidence_uploads for select to authenticated using (owner_id = auth.uid());
grant select on public.evidence_uploads to authenticated;
grant select, insert, update, delete on public.evidence_uploads to service_role;

create or replace function public.create_evidence_upload(
  p_draft_id uuid, p_report_id uuid, p_visibility public.report_visibility,
  p_filename text, p_content_type text, p_size_bytes bigint, p_max_files integer
)
returns public.evidence_uploads
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.evidence_uploads;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if (p_draft_id is null) = (p_report_id is null) then raise exception 'INVALID_INPUT: choose a draft or a report for this file' using errcode = '22023'; end if;
  if p_size_bytes is null or p_size_bytes <= 0 then raise exception 'INVALID_EVIDENCE: the file is empty' using errcode = '22023'; end if;
  if p_size_bytes > 1073741824 then raise exception 'INVALID_EVIDENCE: the file is too large' using errcode = '22023'; end if;

  if p_draft_id is not null then
    if not exists (select 1 from public.report_drafts d where d.id = p_draft_id and d.researcher_id = actor) then
      raise exception 'DRAFT_NOT_FOUND: this draft no longer exists' using errcode = 'P0002';
    end if;
    if (select count(*) from public.evidence_uploads u where u.draft_id = p_draft_id) >= greatest(coalesce(p_max_files, 20), 1) then
      raise exception 'TOO_MANY_FILES: this report already has the maximum number of attachments' using errcode = '54000';
    end if;
  else
    -- A pre-check only: the add_*_file_evidence function that attaches the verified file makes
    -- the real authorization decision (researcher vs organization side, visibility).
    if not private.can_currently_read_report(p_report_id, actor) then
      raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002';
    end if;
  end if;

  if not private.check_and_consume_rate_limit('evidence_upload:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many uploads recently -- try again later' using errcode = '53400';
  end if;

  insert into public.evidence_uploads (owner_id, draft_id, report_id, visibility, object_key, original_filename, content_type, size_bytes)
  values (actor, p_draft_id, p_report_id, p_visibility, 'evidence/' || gen_random_uuid()::text, trim(p_filename), p_content_type, p_size_bytes)
  returning * into result;
  return result;
end;
$$;

-- Called by the server only after it has checked the stored object's size and file signature
-- and hashed it.
create or replace function public.mark_evidence_upload_ready(p_upload_id uuid, p_sha256 text)
returns public.evidence_uploads
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.evidence_uploads;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_EVIDENCE: file integrity check failed' using errcode = '22023'; end if;
  update public.evidence_uploads u set sha256 = p_sha256, status = 'ready'
  where u.id = p_upload_id and u.owner_id = actor and u.status = 'pending'
  returning * into result;
  if result.id is null then raise exception 'UPLOAD_NOT_FOUND: this upload no longer exists' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.mark_evidence_upload_attached(p_upload_id uuid, p_evidence_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.evidence_uploads u set status = 'attached', evidence_id = p_evidence_id
  where u.id = p_upload_id and u.owner_id = auth.uid() and u.status = 'ready'
    and exists (select 1 from public.report_evidence e where e.id = p_evidence_id and e.object_key = u.object_key);
  if not found then raise exception 'UPLOAD_NOT_FOUND: this upload no longer exists' using errcode = 'P0002'; end if;
end;
$$;

-- Removing a staged file (or a failed verification): returns its object key for byte cleanup.
-- An attached file is evidence now, and evidence is never deleted this way.
create or replace function public.delete_my_evidence_upload(p_upload_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  key text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  delete from public.evidence_uploads u where u.id = p_upload_id and u.owner_id = auth.uid() and u.status <> 'attached' returning u.object_key into key;
  if key is null then raise exception 'UPLOAD_NOT_FOUND: this file can no longer be removed' using errcode = 'P0002'; end if;
  return key;
end;
$$;

-- 3. Size ceiling -----------------------------------------------------------------------------
alter table public.report_evidence drop constraint if exists report_evidence_size_bytes_check;
alter table public.report_evidence add constraint report_evidence_size_bytes_check check (size_bytes is null or (size_bytes > 0 and size_bytes <= 1073741824));

create or replace function private.insert_report_file_evidence(
  p_report public.reports,
  p_author_context public.report_author_context,
  p_visibility public.report_visibility,
  p_object_key text,
  p_original_filename text,
  p_content_type text,
  p_size_bytes bigint,
  p_sha256 text
)
returns public.report_evidence
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_filename text := trim(p_original_filename);
  new_evidence public.report_evidence;
begin
  if trimmed_filename is null or char_length(trimmed_filename) = 0 then
    raise exception 'INVALID_EVIDENCE: Enter a file name.' using errcode = '22023';
  end if;
  if char_length(trimmed_filename) > 255 then
    raise exception 'INVALID_EVIDENCE: File name must be 255 characters or fewer.' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'INVALID_EVIDENCE: File is empty.' using errcode = '22023';
  end if;
  if p_size_bytes > 1073741824 then
    raise exception 'INVALID_EVIDENCE: File is too large.' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_EVIDENCE: File integrity check failed.' using errcode = '22023';
  end if;
  -- Only bytes the server verified may become evidence: the object must be a ready staged
  -- upload by this actor with the same size and hash.
  if not exists (
    select 1 from public.evidence_uploads u
    where u.object_key = p_object_key and u.owner_id = actor and u.status = 'ready' and u.size_bytes = p_size_bytes and u.sha256 = p_sha256
  ) then
    raise exception 'INVALID_EVIDENCE: this file has not finished uploading' using errcode = '22023';
  end if;

  insert into public.report_evidence (report_id, program_id, organization_id, researcher_id, author_id, author_context, visibility, evidence_type, object_key, original_filename, content_type, size_bytes, sha256)
  values (p_report.id, p_report.program_id, p_report.organization_id, p_report.researcher_id, actor, p_author_context, p_visibility, 'file', p_object_key, trimmed_filename, p_content_type, p_size_bytes, p_sha256)
  returning * into new_evidence;

  return new_evidence;
end;
$$;

-- 4 + 5. Report columns ------------------------------------------------------------------------
alter table public.reports
  add column if not exists submission_key uuid,
  add column if not exists researcher_cvss_version text check (researcher_cvss_version in ('4.0', '3.1')),
  add column if not exists researcher_cvss_vector text,
  add column if not exists researcher_cvss_score numeric(3, 1) check (researcher_cvss_score between 0 and 10);
alter table public.reports drop constraint if exists reports_researcher_cvss_shape_check;
alter table public.reports add constraint reports_researcher_cvss_shape_check check (
  (researcher_cvss_version is null and researcher_cvss_vector is null and researcher_cvss_score is null)
  or (researcher_cvss_version = '4.0' and researcher_cvss_score is not null
      and researcher_cvss_vector ~ '^CVSS:4\.0/AV:[NALP]/AC:[LH]/AT:[NP]/PR:[NLH]/UI:[NPA]/VC:[HLN]/VI:[HLN]/VA:[HLN]/SC:[HLN]/SI:[HLN]/SA:[HLN]$')
  or (researcher_cvss_version = '3.1' and researcher_cvss_score is not null
      and researcher_cvss_vector ~ '^CVSS:3\.1/AV:[NALP]/AC:[LH]/PR:[NLH]/UI:[NR]/S:[UC]/C:[HLN]/I:[HLN]/A:[HLN]$')
);
create unique index if not exists reports_submission_key_idx on public.reports (researcher_id, submission_key) where submission_key is not null;

drop function if exists public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity);

create or replace function public.submit_report(
  target_program_id uuid, p_asset_type public.program_asset_type, target_input text, p_title text, p_description text,
  p_weakness_type public.report_weakness_type, p_impact text, p_researcher_severity public.report_severity,
  p_scope_entry_id uuid, p_cvss_version text, p_cvss_vector text, p_cvss_score numeric,
  p_draft_id uuid, p_upload_ids uuid[], p_submission_key uuid
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_suspended boolean;
  program public.programs;
  trimmed_title text := trim(p_title);
  trimmed_description text := trim(p_description);
  trimmed_impact text := trim(p_impact);
  canon record;
  match_result record;
  new_report public.reports;
  upload public.evidence_uploads;
  attached integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  -- A retry of a submit that already committed returns that report, before any rate limit
  -- is consumed or any check could reject the identical request.
  if p_submission_key is not null then
    select * into new_report from public.reports r where r.researcher_id = actor and r.submission_key = p_submission_key;
    if new_report.id is not null then return new_report; end if;
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = actor) then
    raise exception 'FORBIDDEN: platform staff accounts can''t join programs or submit reports' using errcode = '42501';
  end if;

  select is_suspended into actor_suspended from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot submit reports right now' using errcode = '42501';
  end if;

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

  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can submit reports' using errcode = '42501';
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

  if p_weakness_type is null then
    raise exception 'INVALID_WEAKNESS_TYPE: Select a vulnerability category.' using errcode = '22023';
  end if;

  if trimmed_impact is null or char_length(trimmed_impact) = 0 then
    raise exception 'INVALID_IMPACT: Describe the impact of this finding.' using errcode = '22023';
  end if;
  if char_length(trimmed_impact) > 20000 then
    raise exception 'INVALID_IMPACT: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  select * into canon from private.canonicalize_scope_target(p_asset_type, target_input);
  select * into match_result from private.match_program_scope(target_program_id, p_asset_type, canon.canonical, canon.cidr_value, canon.url_origin, canon.url_path);

  if match_result.matched_entry_id is null or match_result.matched_scope_state <> 'in_scope' then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not currently eligible for this program.' using errcode = '22023';
  end if;
  -- The researcher picked a scope entry: the server's own most-specific match must be that same
  -- entry. A more specific rule (an out-of-scope host inside an in-scope wildcard, say) wins.
  if p_scope_entry_id is not null and match_result.matched_entry_id <> p_scope_entry_id then
    raise exception 'TARGET_NOT_ELIGIBLE: This target is not covered by the asset you selected.' using errcode = '22023';
  end if;

  if p_cvss_vector is not null then
    if p_cvss_version not in ('4.0', '3.1') or p_cvss_score is null or p_cvss_score < 0 or p_cvss_score > 10 then
      raise exception 'INVALID_CVSS: the CVSS vector could not be scored' using errcode = '22023';
    end if;
  end if;

  insert into public.reports (
    program_id, organization_id, researcher_id, title, description, asset_type, target, display_target,
    matched_scope_entry_id, matched_scope_state, matched_target, weakness_type, impact, researcher_severity,
    researcher_cvss_version, researcher_cvss_vector, researcher_cvss_score, submission_key
  )
  values (
    target_program_id, program.organization_id, actor, trimmed_title, trimmed_description, p_asset_type, canon.canonical, canon.display,
    match_result.matched_entry_id, match_result.matched_scope_state, match_result.matched_target, p_weakness_type, trimmed_impact, p_researcher_severity,
    case when p_cvss_vector is null then null else p_cvss_version end, p_cvss_vector, case when p_cvss_vector is null then null else round(p_cvss_score, 1) end, p_submission_key
  )
  returning * into new_report;

  -- Staged, verified files become evidence in the same transaction as the report: the report is
  -- never created with half its attachments.
  for upload in
    select * from public.evidence_uploads u
    where u.id = any(coalesce(p_upload_ids, '{}')) and u.owner_id = actor and u.status = 'ready'
      and (p_draft_id is null or u.draft_id = p_draft_id)
    order by u.created_at
  loop
    declare evidence public.report_evidence;
    begin
      evidence := private.insert_report_file_evidence(new_report, 'researcher', 'researcher_visible', upload.object_key, upload.original_filename, upload.content_type, upload.size_bytes, upload.sha256);
      update public.evidence_uploads set status = 'attached', evidence_id = evidence.id, draft_id = null where id = upload.id;
      attached := attached + 1;
    end;
  end loop;
  if attached <> coalesce(array_length(p_upload_ids, 1), 0) then
    raise exception 'UPLOAD_NOT_READY: one of your attachments has not finished uploading -- remove it or wait for it, then submit again' using errcode = '22023';
  end if;

  if p_draft_id is not null then
    delete from public.report_drafts d where d.id = p_draft_id and d.researcher_id = actor;
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'report.created', 'report', new_report.id,
    jsonb_build_object('program_id', target_program_id, 'asset_type', p_asset_type, 'target', canon.canonical, 'attachments', attached));

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

revoke all on function public.save_my_report_draft(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.save_my_report_draft(uuid, uuid, jsonb, integer) to authenticated;
revoke all on function public.delete_my_report_draft(uuid) from public, anon;
grant execute on function public.delete_my_report_draft(uuid) to authenticated;
revoke all on function public.create_evidence_upload(uuid, uuid, public.report_visibility, text, text, bigint, integer) from public, anon;
grant execute on function public.create_evidence_upload(uuid, uuid, public.report_visibility, text, text, bigint, integer) to authenticated;
revoke all on function public.mark_evidence_upload_ready(uuid, text) from public, anon;
grant execute on function public.mark_evidence_upload_ready(uuid, text) to authenticated;
revoke all on function public.mark_evidence_upload_attached(uuid, uuid) from public, anon;
grant execute on function public.mark_evidence_upload_attached(uuid, uuid) to authenticated;
revoke all on function public.delete_my_evidence_upload(uuid) from public, anon;
grant execute on function public.delete_my_evidence_upload(uuid) to authenticated;
revoke all on function public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity, uuid, text, text, numeric, uuid, uuid[], uuid) from public, anon;
grant execute on function public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity, uuid, text, text, numeric, uuid, uuid[], uuid) to authenticated;

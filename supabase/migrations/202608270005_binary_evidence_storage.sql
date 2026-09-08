-- Binary Evidence & Secure Object Storage Foundation. Design decisions recorded here and
-- expanded in docs/decisions/0011-binary-evidence-storage.md. report_evidence_type's
-- 'file' value was added in the prior migration (202608270004), which must commit before
-- this file's check constraints can reference it (SQLSTATE 55P04 otherwise).
--
-- 1. report_evidence gains five nullable columns describing an opaque object reference --
--    never a Supabase-specific concept. The actual bytes live in Supabase Storage,
--    reached exclusively through lib/evidence-store.ts's EvidenceObjectStore
--    abstraction; nothing in this migration or the TypeScript layer outside that one
--    file talks to storage directly.
-- 2. No upload_status column: the upload orchestration (services/report-file-evidence.ts)
--    writes the object to storage BEFORE calling the RPCs below, never the reverse -- a
--    persisted file-typed row is, by construction, proof the object exists. See 0011 for
--    the documented (not automated) orphan-object failure mode this leaves.
-- 3. Object keys are generated in TypeScript (crypto.randomUUID(), a CSPRNG) as
--    'evidence/<uuid>' -- never the client filename, never derived from
--    organization/report/researcher ids. A check constraint enforces the exact shape at
--    the schema level regardless of what any future code path might try to insert.
-- 4. Size limit is 10 MiB, enforced by a check constraint -- see 0011 for the rationale.
-- 5. The bucket is private (public = false); no storage.objects RLS policy is added for
--    authenticated/anon, because no browser session ever talks to storage directly in
--    this architecture -- every read and write goes through the service-role client only
--    after Sentinel's own RLS/RPC authorization has already decided the outcome.
-- 6. Authorization for the two new public RPCs is the identical two-path/researcher-path
--    shape 0010's non-file evidence RPCs already use -- no new capability was invented.

alter table public.report_evidence
  alter column content drop not null,
  add column object_key text,
  add column original_filename text,
  add column content_type text,
  add column size_bytes bigint,
  add column sha256 text;

alter table public.report_evidence
  add constraint report_evidence_file_shape_check check (
    (evidence_type = 'file' and object_key is not null and content is null and original_filename is not null and content_type is not null and size_bytes is not null and sha256 is not null)
    or (evidence_type <> 'file' and object_key is null and content is not null)
  ),
  add constraint report_evidence_object_key_format_check check (object_key is null or object_key ~ '^evidence/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  add constraint report_evidence_size_bytes_check check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760)),
  add constraint report_evidence_sha256_format_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add constraint report_evidence_original_filename_check check (original_filename is null or char_length(original_filename) between 1 and 255);

-- Private bucket: public = false, matching SECURITY.md's "private storage" requirement
-- for attachments. file_size_limit is a second, storage-layer backstop behind the
-- application-level check constraint above; the application's own 10 MiB limit is what a
-- user actually sees rejecting an oversized file (a clear, mapped error), not this one.
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 10485760)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- private.insert_report_file_evidence: the file-shaped sibling of 0010's
-- private.insert_report_evidence -- a new function, not an edit to 0010's already-
-- delivered one, following the same non-authorizing shared-insert-primitive pattern.
-- ---------------------------------------------------------------------------

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
  if p_size_bytes > 10485760 then
    raise exception 'INVALID_EVIDENCE: File must be 10 MB or smaller.' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_EVIDENCE: File integrity check failed.' using errcode = '22023';
  end if;

  insert into public.report_evidence (report_id, program_id, organization_id, researcher_id, author_id, author_context, visibility, evidence_type, object_key, original_filename, content_type, size_bytes, sha256)
  values (p_report.id, p_report.program_id, p_report.organization_id, p_report.researcher_id, actor, p_author_context, p_visibility, 'file', p_object_key, trimmed_filename, p_content_type, p_size_bytes, p_sha256)
  returning * into new_evidence;

  return new_evidence;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs. Called only AFTER the object has already been written to storage --
-- the object_key/size_bytes/sha256 passed in describe an object that already exists.
-- ---------------------------------------------------------------------------

create or replace function public.add_researcher_file_evidence(
  target_report_id uuid,
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

  new_evidence := private.insert_report_file_evidence(report, 'researcher', 'researcher_visible', p_object_key, p_original_filename, p_content_type, p_size_bytes, p_sha256);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.evidence_added', 'report', target_report_id, jsonb_build_object('evidence_id', new_evidence.id, 'author_context', 'researcher', 'visibility', 'researcher_visible', 'evidence_type', 'file'));

  return new_evidence;
end;
$$;

create or replace function public.add_organization_file_evidence(
  target_report_id uuid,
  p_object_key text,
  p_original_filename text,
  p_content_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_visibility public.report_visibility
)
returns public.report_evidence
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
  new_evidence public.report_evidence;
begin
  report := private.authorize_report_for_communication(target_report_id);

  new_evidence := private.insert_report_file_evidence(report, 'organization', p_visibility, p_object_key, p_original_filename, p_content_type, p_size_bytes, p_sha256);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, report.organization_id, 'report.evidence_added', 'report', target_report_id, jsonb_build_object('evidence_id', new_evidence.id, 'author_context', 'organization', 'visibility', p_visibility, 'evidence_type', 'file'));

  return new_evidence;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_evidence_download: independently re-derives the same visibility check
-- report_evidence's own RLS policy already expresses, then records the audit event --
-- defense in depth, the same "every RPC re-authorizes, never trusts a prior check"
-- discipline every other mutation in this schema follows. services/report-file-evidence.ts
-- additionally performs its own RLS-scoped read before ever reaching this call (see
-- 0011), so a denied caller never even learns whether the evidence id exists.
-- ---------------------------------------------------------------------------

create or replace function public.record_evidence_download(target_evidence_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  evidence public.report_evidence;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into evidence from public.report_evidence
    where id = target_evidence_id
      and (
        (visibility = 'researcher_visible' and researcher_id = actor)
        or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
        or private.is_program_member(program_id)
      );
  if evidence.id is null then raise exception 'EVIDENCE_NOT_FOUND: evidence not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, evidence.organization_id, 'report.evidence_downloaded', 'report', evidence.report_id, jsonb_build_object('evidence_id', evidence.id));
end;
$$;

revoke all on function public.add_researcher_file_evidence(uuid, text, text, text, bigint, text) from public;
revoke all on function public.add_organization_file_evidence(uuid, text, text, text, bigint, text, public.report_visibility) from public;
revoke all on function public.record_evidence_download(uuid) from public;

grant execute on function public.add_researcher_file_evidence(uuid, text, text, text, bigint, text) to authenticated;
grant execute on function public.add_organization_file_evidence(uuid, text, text, text, bigint, text, public.report_visibility) to authenticated;
grant execute on function public.record_evidence_download(uuid) to authenticated;

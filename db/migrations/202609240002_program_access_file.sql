-- Program access file: a single, org-uploaded file per program (a VPN config, a PDF of
-- setup steps, whatever a private/internal engagement needs) alongside the plain-text
-- Access instructions field (202609240001). This is the "org accepts the shared-
-- credential tradeoff" path discussed alongside that field: a single uploaded file has no
-- per-researcher revocation (whoever downloaded it keeps the bytes even after being
-- revoked from the program) -- that limitation is disclosed to the org in the upload UI,
-- not hidden, and is the org's own call to make about their own network, the same way an
-- org already accepts responsibility for who they invite at all.
--
-- Deliberately its own table, not a repurposed report_evidence row: this file belongs to
-- the PROGRAM, not to any one report, has exactly one live version at a time (upload
-- replaces, matching update_program_description's replace-not-append semantics), and is
-- downloadable by every currently-active researcher on the program, never scoped to a
-- single report's own participants. Reuses the exact object-store contract
-- (lib/evidence-store.ts's EvidenceObjectStore) and the same key/constraint shapes
-- report_evidence already established (202608270005) -- same store, same guarantees,
-- different owning table.

create table public.program_access_files (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  object_key text not null,
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint program_access_files_object_key_format_check check (object_key ~ '^program-access/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint program_access_files_original_filename_check check (char_length(original_filename) between 1 and 255),
  -- One live file per program -- upload_program_access_file below deletes any existing
  -- row (and its storage object) before inserting the new one, so this is a belt-and-
  -- braces invariant, not the primary enforcement mechanism (see that function).
  constraint program_access_files_one_per_program unique (program_id)
);

create index program_access_files_organization_id_idx on public.program_access_files(organization_id);

alter table public.program_access_files enable row level security;

create policy "program access files read by org admins, program members, or active researchers" on public.program_access_files
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
    or private.is_researcher_authorized_for_program(program_id)
  );

-- No insert/update/delete policy: every write goes through the SECURITY DEFINER
-- functions below, which authorize via lock_and_authorize_program_for_lifecycle
-- (the same primitive update_program_description/update_program_access_instructions
-- already use) -- identical reasoning to why report_evidence has no direct-write policy.

create or replace function public.upload_program_access_file(
  target_program_id uuid,
  new_object_key text,
  new_original_filename text,
  new_content_type text,
  new_size_bytes bigint,
  new_sha256 text
)
returns public.program_access_files
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  inserted public.program_access_files;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if new_size_bytes <= 0 or new_size_bytes > 10485760 then
    raise exception 'INVALID_ACCESS_FILE: File must be 10 MB or smaller.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(new_original_filename, ''))) = 0 then
    raise exception 'INVALID_ACCESS_FILE: Choose a file to upload.' using errcode = '22023';
  end if;

  -- Replace semantics: at most one access file per program. The previous row (if any) is
  -- returned to the caller so it can delete the now-orphaned storage object -- this
  -- function only ever manages the database row, never storage I/O, the same split
  -- add_organization_file_evidence's own caller (services/report-file-evidence.ts)
  -- already keeps.
  delete from public.program_access_files where program_id = target_program_id;

  insert into public.program_access_files (program_id, organization_id, uploaded_by, object_key, original_filename, content_type, size_bytes, sha256)
  values (target_program_id, program.organization_id, actor, new_object_key, trim(new_original_filename), new_content_type, new_size_bytes, new_sha256)
  returning * into inserted;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.access_file_uploaded', 'program', target_program_id, jsonb_build_object('filename', inserted.original_filename));

  return inserted;
end;
$$;

create or replace function public.remove_program_access_file(target_program_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  removed public.program_access_files;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  delete from public.program_access_files where program_id = target_program_id returning * into removed;
  if removed.id is null then raise exception 'ACCESS_FILE_NOT_FOUND: no access file to remove' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.access_file_removed', 'program', target_program_id, jsonb_build_object('filename', removed.original_filename));
end;
$$;

-- Mirrors record_evidence_download (202608270005) exactly: every download of a
-- credential-adjacent file is audited, since knowing who pulled a shared VPN config and
-- when is the one incident-response signal Unpatched can actually provide once the file
-- itself is out of its hands (see this migration's own header on why per-researcher
-- revocation of the file's contents is not possible).
create or replace function public.record_program_access_file_download(target_program_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  file public.program_access_files;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into file from public.program_access_files where program_id = target_program_id
    and (
      private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
      or private.is_program_member(program_id)
      or private.is_researcher_authorized_for_program(program_id)
    );
  if file.id is null then raise exception 'ACCESS_FILE_NOT_FOUND: access file not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, file.organization_id, 'program.access_file_downloaded', 'program', target_program_id, jsonb_build_object('access_file_id', file.id));
end;
$$;

revoke all on function public.upload_program_access_file(uuid, text, text, text, bigint, text) from public;
revoke all on function public.remove_program_access_file(uuid) from public;
revoke all on function public.record_program_access_file_download(uuid) from public;
grant execute on function public.upload_program_access_file(uuid, text, text, text, bigint, text) to authenticated;
grant execute on function public.remove_program_access_file(uuid) to authenticated;
grant execute on function public.record_program_access_file_download(uuid) to authenticated;

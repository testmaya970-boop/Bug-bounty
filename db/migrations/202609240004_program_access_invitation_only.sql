-- Restricts BOTH access-instructions text and the access file (202609240001/202609240002)
-- to invited researchers only, enforced at the database, not just hidden in the UI.
--
-- Why this is needed: join_public_program (202608310002) lets any active, non-suspended
-- Sentinel account self-enroll into a PUBLIC program with no vetting at all -- there is no
-- invitation step to trust. private.is_researcher_authorized_for_program (used by this
-- table's own RLS policy and by the shared programs-row policy access_instructions used to
-- ride along on) returns true for that self-enrolled researcher exactly the same as it
-- does for someone the org actually invited -- correct for scope/report authorization
-- (which should apply to any active researcher, public or invited), wrong for a VPN
-- credential or an internal contact, which should only ever reach someone the org
-- specifically vetted. This migration adds a second, stricter helper -- deliberately not
-- widening is_researcher_authorized_for_program itself, which stays correct for every
-- other consumer.
--
-- access_instructions moves OFF the shared programs-row select entirely (it no longer
-- rides along on PROGRAM_SELECT in services/programs.ts) and behind its own
-- SECURITY DEFINER read, mirroring program_access_files' own dedicated table+RLS exactly
-- -- both credential-adjacent fields now get identical, real database enforcement, not
-- one enforced by RLS and the other merely hidden by a service-layer read of a shared row.

create or replace function private.is_invited_researcher_for_program(target_program_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.program_researchers
    where program_id = target_program_id and user_id = auth.uid() and status = 'active' and source = 'invitation'
  );
end;
$$;

revoke all on function private.is_invited_researcher_for_program(uuid) from public;
grant execute on function private.is_invited_researcher_for_program(uuid) to authenticated;

-- program_access_files' RLS policy is replaced to use the stricter helper for the
-- researcher path (the org-admin/program-member paths are unchanged -- managers can
-- always see their own program's access file regardless of how any researcher joined).
drop policy "program access files read by org admins, program members, or active researchers" on public.program_access_files;

create policy "program access files read by org admins, program members, or invited researchers" on public.program_access_files
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(program_id)
    or private.is_invited_researcher_for_program(program_id)
  );

-- record_program_access_file_download's inline authorization check gets the same swap.
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
      or private.is_invited_researcher_for_program(program_id)
    );
  if file.id is null then raise exception 'ACCESS_FILE_NOT_FOUND: access file not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, file.organization_id, 'program.access_file_downloaded', 'program', target_program_id, jsonb_build_object('access_file_id', file.id));
end;
$$;

-- Access instructions: dedicated read RPC, same authorization shape as the file's own
-- table policy above. update_program_access_instructions (202609240001) is unchanged --
-- writing stays gated to managers only via lock_and_authorize_program_for_lifecycle,
-- regardless of the program's visibility or any researcher's access source; only READING
-- it as a researcher is newly restricted here.
create or replace function public.get_program_access_instructions(target_program_id uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select access_instructions into result from public.programs
    where id = target_program_id
      and (
        private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
        or private.is_program_member(id)
        or private.is_invited_researcher_for_program(id)
      );
  -- No row found (either the program doesn't exist or the caller isn't authorized to read
  -- it here) and "authorized but nothing written yet" are intentionally indistinguishable
  -- -- both return null, the same confidentiality-safe shape getEvidenceDownloadUrl/
  -- getProgramAccessFileDownloadUrl already use.
  return result;
end;
$$;

revoke all on function public.get_program_access_instructions(uuid) from public;
grant execute on function public.get_program_access_instructions(uuid) to authenticated;

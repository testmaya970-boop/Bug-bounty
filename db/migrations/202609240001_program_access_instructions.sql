-- Program access instructions: a real, org-managed place to tell an already-authorized
-- researcher how to actually reach a private/internal target -- VPN credentials, a
-- required contact, a separate credentialing system, whatever this specific program
-- needs. The platform never provisions network/VPN access itself (that would mean owning
-- credential lifecycle and network security for someone else's infrastructure, a wholly
-- separate system); this column is instructions text only, the same boundary HackerOne's
-- own model draws by putting this in a program's own rules-of-engagement content, not in
-- platform-managed infrastructure.
--
-- Deliberately a SEPARATE column from programs.description, not appended to it:
-- description is shown on the PUBLIC discovery row (list_public_programs/
-- get_public_program, 202608310002) to anyone browsing, before they have any
-- relationship to the program at all. Access instructions are exactly the kind of detail
-- that must never appear there -- they are only meaningful (and only safe to disclose)
-- once a researcher is actually authorized on the program. This column is therefore never
-- added to any public-facing select list; it is read only through get_program's existing
-- RLS-scoped path (private.is_researcher_authorized_for_program OR manager), the same
-- boundary 0007 already draws for scope-entry visibility.
--
-- Same shape as update_program_description (202608310002) -- trimmed-to-null-if-empty,
-- 5000-char cap, one audit_logs row -- reusing
-- private.lock_and_authorize_program_for_lifecycle (202608300001) for authorization,
-- exactly as update_program_description does.

alter table public.programs add column if not exists access_instructions text;

create or replace function public.update_program_access_instructions(target_program_id uuid, new_access_instructions text)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed text := nullif(trim(coalesce(new_access_instructions, '')), '');
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if trimmed is not null and char_length(trimmed) > 5000 then
    raise exception 'INVALID_ACCESS_INSTRUCTIONS: Use 5000 characters or fewer.' using errcode = '22023';
  end if;

  update public.programs set access_instructions = trimmed, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.access_instructions_updated', 'program', target_program_id, '{}'::jsonb);

  return updated;
end;
$$;

revoke all on function public.update_program_access_instructions(uuid, text) from public;
grant execute on function public.update_program_access_instructions(uuid, text) to authenticated;

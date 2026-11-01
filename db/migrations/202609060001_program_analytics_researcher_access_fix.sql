-- Fix: private.authorize_program_analytics_read (202609050015) only checked
-- has_org_role(owner/security_admin) OR private.is_program_member(program_id) --
-- is_program_member checks public.program_members, which is ORG-SIDE program-manager
-- membership, never a joined researcher (that's public.program_researchers, checked by the
-- separate private.is_researcher_authorized_for_program helper, 202608260006). This left a
-- real gap: an active, authorized researcher on a program got a hard FORBIDDEN from the
-- three get_program_* analytics RPCs, which the program control-center page does not
-- catch -- caught live this session via an actual end-to-end browser test as a real
-- Application error 500 on /organizations/.../programs/.../ for a genuinely joined
-- researcher, not a hypothetical.
--
-- The page's own gating comment already assumed "an authorized researcher sees the same
-- read-only health signal a manager does" (app/organizations/[organizationId]/programs/
-- [programId]/page.tsx's canManageProgram || isActiveResearcher check) -- the RPC-level
-- authorization simply never matched that assumption. This migration corrects the RPC to
-- match the page's own already-correct intent, adding the third path.

create or replace function private.authorize_program_analytics_read(target_program_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into program from public.programs where id = target_program_id;
  if program.id is null then raise exception 'PROGRAM_NOT_FOUND: program not found' using errcode = 'P0002'; end if;

  if not (
    private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_member(target_program_id)
    or private.is_researcher_authorized_for_program(target_program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot view analytics for this program' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.authorize_program_analytics_read(uuid) from public;

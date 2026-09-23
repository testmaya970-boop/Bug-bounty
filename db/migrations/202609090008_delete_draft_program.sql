-- Turn: engagement delete/archive. Every existing lifecycle transition (submit_program_
-- for_review, activate_program, pause_program, resume_program, close_program --
-- 202608300001_program_lifecycle_foundation.sql) only ever moves a program forward
-- through public.program_status; nothing ever removes one. That is deliberately correct
-- for any program that reached review/active/paused/closed -- those can carry real
-- researcher access, reports, and audit history that must never disappear. It is NOT
-- correct for a `draft` program: by construction a draft has never been submitted for
-- review, so it can hold scope entries (drafted, never activated) but never a report,
-- researcher-access grant, or bounty decision (every one of those requires the program to
-- have left draft first -- see report_foundation's/researcher_access_foundation's own
-- program-status checks). A draft program is exactly the "duplicate test engagement,
-- created by mistake, never going anywhere" case, and until now there was no way to
-- remove one -- confirmed live: three identically-named "Second Pentest Engagement Test"
-- drafts, permanently stuck in an org's Engagements list with no cleanup path.
--
-- delete_draft_program is a REAL hard delete (not a soft-delete/status flag) --
-- correct here specifically because a draft's only possible dependents (program_scope_
-- entries, program_members) already cascade on program deletion
-- (foreign key (program_id, organization_id) references public.programs(id,
-- organization_id) on delete cascade, in each of their own migrations), and none of
-- those rows can carry the kind of history (a submitted report, a finalized bounty, an
-- active researcher relationship) that would make cascading them destructive. Any program
-- that has ever left draft must use close_program instead -- that path is unchanged.

create or replace function public.delete_draft_program(target_program_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if program.status <> 'draft' then
    raise exception 'INVALID_PROGRAM_TRANSITION: only a draft program can be deleted -- close this program instead' using errcode = '23514';
  end if;

  -- Audited before the delete (the row disappears immediately after) -- program_id is
  -- kept in metadata rather than entity_id, since entity_id conventionally points at a
  -- still-existing row elsewhere in this codebase's audit trail and this one will not.
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.deleted', 'program', target_program_id, jsonb_build_object('name', program.name, 'previous_status', program.status));

  delete from public.programs where id = target_program_id;
end;
$$;

revoke all on function public.delete_draft_program(uuid) from public;
grant execute on function public.delete_draft_program(uuid) to authenticated;

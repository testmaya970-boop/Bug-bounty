-- Audit TEN-1 / PAY-1 (P0). delete_draft_program (202609090008) hard-deletes a draft on the
-- premise that "a draft can never hold a report, researcher-access grant, or bounty
-- decision". That premise was false: submit_report only blocked paused/closed (suspended
-- via trigger), and invite_researcher_to_program / accept_program_invitation[_by_id] /
-- join_public_program had no program-status check at all. An org could therefore run a
-- private program entirely in draft or review -- skipping the platform launch review
-- (202609050013) -- receive and pay reports, then delete the program and cascade away the
-- reports, bounty decisions and payment obligations.
--
-- Enforced at the table level (same shape as reports_block_suspended_program, 202609250003)
-- rather than by redefining each RPC, so every current and future write path is covered:
--   * reports: insert only into an `active` program.
--   * program_researchers: a participation can only become `active` on an active/paused
--     program (paused keeps existing participants; submit_report already blocks paused).
--   * program_invitations: issued only for an active/paused program.
-- delete_draft_program additionally refuses when any report, participation or invitation
-- exists, so rows created before this migration can never be cascade-deleted through it.

create or replace function private.block_reports_on_unlaunched_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.programs p where p.id = new.program_id and p.status = 'active') then
    raise exception 'SUBMISSIONS_CLOSED: this program is not currently accepting reports' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_block_unlaunched_program on public.reports;
create trigger reports_block_unlaunched_program
  before insert on public.reports
  for each row execute function private.block_reports_on_unlaunched_program();

create or replace function private.block_participation_on_unlaunched_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not exists (select 1 from public.programs p where p.id = new.program_id and p.status in ('active', 'paused')) then
    raise exception 'PROGRAM_NOT_LAUNCHED: researchers can only join a launched program' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists program_researchers_block_unlaunched_program on public.program_researchers;
create trigger program_researchers_block_unlaunched_program
  before insert or update of status on public.program_researchers
  for each row execute function private.block_participation_on_unlaunched_program();

create or replace function private.block_invitations_on_unlaunched_program()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.programs p where p.id = new.program_id and p.status in ('active', 'paused')) then
    raise exception 'PROGRAM_NOT_LAUNCHED: researchers can only be invited to a launched program' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists program_invitations_block_unlaunched_program on public.program_invitations;
create trigger program_invitations_block_unlaunched_program
  before insert on public.program_invitations
  for each row execute function private.block_invitations_on_unlaunched_program();

revoke all on function private.block_reports_on_unlaunched_program() from public;
revoke all on function private.block_participation_on_unlaunched_program() from public;
revoke all on function private.block_invitations_on_unlaunched_program() from public;

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

  if exists (select 1 from public.reports where program_id = target_program_id)
     or exists (select 1 from public.program_researchers where program_id = target_program_id)
     or exists (select 1 from public.program_invitations where program_id = target_program_id) then
    raise exception 'PROGRAM_HAS_HISTORY: this program has reports or researcher activity and cannot be deleted -- close it instead' using errcode = '23514';
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.deleted', 'program', target_program_id, jsonb_build_object('name', program.name, 'previous_status', program.status));

  delete from public.programs where id = target_program_id;
end;
$$;

revoke all on function public.delete_draft_program(uuid) from public;
grant execute on function public.delete_draft_program(uuid) to authenticated;

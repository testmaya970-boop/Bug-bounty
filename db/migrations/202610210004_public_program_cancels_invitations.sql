-- Making a program public cancels its pending invitations. Once anyone can join, an
-- outstanding invitation only misleads: the invitee waits on a link (which can expire) for
-- access they already have, and the program's invitation list keeps showing people as
-- "pending" forever. Revoked with a recorded reason so the history says why.
--
-- A trigger on programs.visibility (not another copy of set_program_visibility), so every
-- path that makes a program public is covered.

alter table public.program_invitations add column if not exists revoke_reason text
  check (revoke_reason is null or revoke_reason in ('revoked_by_staff', 'program_made_public'));

create or replace function private.programs_cancel_invitations_when_public()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cancelled integer;
begin
  if new.visibility = 'public' and old.visibility is distinct from 'public' then
    update public.program_invitations
    set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'program_made_public', updated_at = now()
    where program_id = new.id and accepted_at is null and revoked_at is null;
    get diagnostics cancelled = row_count;
    if cancelled > 0 then
      insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
      values (auth.uid(), new.organization_id, 'program.invitations_cancelled', 'program', new.id,
        jsonb_build_object('reason', 'program_made_public', 'count', cancelled));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.programs_cancel_invitations_when_public() from public, anon;
grant execute on function private.programs_cancel_invitations_when_public() to service_role;

create trigger programs_cancel_invitations_when_public after update of visibility on public.programs
  for each row execute function private.programs_cancel_invitations_when_public();

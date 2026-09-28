-- An expired invitation blocked re-inviting the same email forever.
--
-- program_invitations_pending_unique / organization_invitations_pending_unique treat any
-- invitation with accepted_at and revoked_at both null as "pending" -- including one whose
-- expires_at has passed (an index predicate cannot reference now()). So once an invitation
-- lapsed, invite_researcher_to_program / the org invite RPC failed with INVITATION_PENDING
-- ("an invitation is already pending") until someone found and revoked the dead one by hand.
-- Found live: the E2E seed's Sep 9 program invitation expired and could not be replaced.
--
-- Fix, for every insert path at once: before a new invitation is inserted, close out any
-- EXPIRED, unaccepted, unrevoked invitation for the same target and email by stamping
-- revoked_at. An expired invitation is already unusable (acceptance checks expires_at), so
-- this changes no one's access -- it only lets the uniqueness check see what is really
-- pending. A still-valid pending invitation is untouched, so INVITATION_PENDING keeps
-- guarding against genuine duplicates.

create or replace function private.close_expired_program_invitations()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.program_invitations
     set revoked_at = now()
   where program_id = new.program_id and email = new.email
     and accepted_at is null and revoked_at is null and expires_at <= now();
  return new;
end;
$$;

drop trigger if exists program_invitations_close_expired on public.program_invitations;
create trigger program_invitations_close_expired
  before insert on public.program_invitations
  for each row execute function private.close_expired_program_invitations();

create or replace function private.close_expired_organization_invitations()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.organization_invitations
     set revoked_at = now()
   where organization_id = new.organization_id and email = new.email
     and accepted_at is null and revoked_at is null and expires_at <= now();
  return new;
end;
$$;

drop trigger if exists organization_invitations_close_expired on public.organization_invitations;
create trigger organization_invitations_close_expired
  before insert on public.organization_invitations
  for each row execute function private.close_expired_organization_invitations();

-- An organization could not invite a researcher it had revoked: invite_researcher_by_username
-- refused whenever any program_researchers row existed, revoked ones included
-- (ALREADY_PARTICIPATING). Revoking is how an organization removes someone, so inviting them
-- back must work. accept_program_invitation already handles it: an invitation created after
-- the revocation reactivates the row, and an older one cannot. Only a researcher who is still
-- in the program (active or suspended, which has its own Reinstate) is refused now.
do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.invite_researcher_by_username(uuid, text, text, text)'::regprocedure) into definition;
  patched := replace(definition,
    'where pr.program_id = program.id and pr.user_id = researcher.id) then',
    'where pr.program_id = program.id and pr.user_id = researcher.id and pr.status <> ''revoked'') then');
  if patched = definition then
    raise exception 'invite_researcher_by_username: the participation check was not found';
  end if;
  execute patched;
end;
$$;

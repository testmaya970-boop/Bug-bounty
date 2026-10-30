-- Follow-up to 202610300004: an invitation made by the sign-up @username recorded the
-- researcher's public_username (null for most researchers) on the invitation row and in the
-- audit log, so the organization's invitation list showed a blank name. Record whichever
-- handle the researcher has, public first.
do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.invite_researcher_by_username(uuid, text, text, text)'::regprocedure) into definition;
  patched := replace(definition, 'researcher.public_username', 'coalesce(researcher.public_username, researcher.username)');
  if patched = definition then
    raise exception 'invite_researcher_by_username: researcher.public_username was not found';
  end if;
  execute patched;
end;
$$;

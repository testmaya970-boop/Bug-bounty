-- Usernames are now public (the leaderboard and organizations show @username, 202610300004),
-- but a researcher who left the username blank at sign-up got one made from their email:
-- the email's local part plus 6 characters of their id ("demo.researcher@..." became
-- "demo_researcher_d10314"). That put part of their email address on a public page.
--
-- 1. A blank (or taken) username now becomes a random mix of letters and numbers.
-- 2. Every username that was auto-made that way (it ends in "_" + the first 6 hex characters
--    of the account id) is replaced with a random one. Usernames people chose are untouched.
-- 3. The organization's researcher list returns @username, so two researchers with the
--    same name can be told apart (and invited) there too.

create or replace function private.random_username()
returns text
language sql volatile set search_path = ''
as $$
  -- "r" + 9 of [a-z0-9]: 36^9 combinations; a clash only fails one insert's unique check.
  select 'r' || string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1), '')
  from generate_series(1, 9);
$$;
revoke all on function private.random_username() from public, anon, authenticated;

do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.create_user(text, text, text, text)'::regprocedure) into definition;
  patched := replace(definition,
    $old$fallback_username := regexp_replace(lower(split_part(p_email, '@', 1)), '[^a-z0-9_]', '_', 'g');$old$,
    'fallback_username := private.random_username();');
  patched := replace(patched,
    $old$fallback_username := left(fallback_username, 24) || '_' || left(replace(new_id::text, '-', ''), 6);$old$,
    '');
  if patched = definition or position('split_part(p_email, ''@'', 1)), ''[^a-z0-9_]''' in patched) > 0 then
    raise exception 'create_user: the email-derived username fallback was not found';
  end if;
  execute patched;
end;
$$;

update public.users
set username = private.random_username(), updated_at = now()
where username like '%\_' || left(replace(id::text, '-', ''), 6);

do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.list_researchers_for_organization(uuid)'::regprocedure) into definition;
  patched := replace(definition, 'last_submitted_at timestamp with time zone)', 'last_submitted_at timestamp with time zone, username text)');
  patched := replace(patched, E'rec.last_submitted_at\n  from researcher_programs rp', E'rec.last_submitted_at,\n    u.username\n  from researcher_programs rp');
  if (length(patched) - length(definition)) <> length(', username text') + length(E',\n    u.username') then
    raise exception 'list_researchers_for_organization: the return list or final select has changed';
  end if;
  drop function public.list_researchers_for_organization(uuid);
  execute patched;
end;
$$;
revoke all on function public.list_researchers_for_organization(uuid) from public;
grant execute on function public.list_researchers_for_organization(uuid) to authenticated;

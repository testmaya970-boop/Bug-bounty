-- Display names are compared by a "skeleton" (Oct 14 QA): case, Unicode compatibility forms,
-- common Cyrillic/Greek lookalike letters, spaces, punctuation and invisible characters are
-- folded away, so "E2E Veteran Researcher" can't be copied with a Cyrillic "Е", a double
-- space, a trailing "." or a zero-width space. Names with invisible characters are refused.
-- ponytail: compared by scanning users; add an expression index on the key when it matters.
create or replace function private.display_name_key(p_name text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select regexp_replace(
    translate(lower(normalize(coalesce(p_name, ''), NFKC)), 'аеорсухкмтвніјѕԁӏοαερντικ', 'aeopcyxkmtbhijsdloaepvtik'),
    '[[:space:][:punct:]​-‏⁠﻿­]', '', 'g');
$$;
revoke all on function private.display_name_key(text) from public, anon;
grant execute on function private.display_name_key(text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_my_display_name(p_display_name text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(p_display_name);
  updated public.users;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_DISPLAY_NAME: Enter a display name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 100 then
    raise exception 'INVALID_DISPLAY_NAME: Use 100 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_DISPLAY_NAME: Display name contains invalid characters.' using errcode = '22023';
  end if;

  if trimmed_name ~ '[​-‏⁠﻿­]' then
    raise exception 'INVALID_DISPLAY_NAME: Display name contains invisible characters.' using errcode = '22023';
  end if;
  if private.display_name_key(trimmed_name) = '' then
    raise exception 'INVALID_DISPLAY_NAME: Use at least one letter or number.' using errcode = '22023';
  end if;
  if exists (select 1 from public.users u where u.id <> actor and u.deactivated_at is null and private.display_name_key(u.display_name) = private.display_name_key(trimmed_name)) then
    raise exception 'DISPLAY_NAME_TAKEN: that name is already used by another account -- choose another' using errcode = '22023';
  end if;

  update public.users set display_name = trimmed_name, updated_at = now() where id = actor returning * into updated;

  updated.password_hash := null; -- never leaves the database
  return updated;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.create_user(p_email text, p_password_hash text, p_display_name text DEFAULT NULL::text, p_requested_username text DEFAULT NULL::text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_id uuid := gen_random_uuid();
  fallback_username text;
  requested_username text;
  resolved_username text;
  created_row public.users;
begin
  fallback_username := regexp_replace(lower(split_part(p_email, '@', 1)), '[^a-z0-9_]', '_', 'g');
  fallback_username := left(fallback_username, 24) || '_' || left(replace(new_id::text, '-', ''), 6);

  requested_username := nullif(lower(trim(p_requested_username)), '');
  resolved_username := fallback_username;

  -- A chosen display name can't copy another active account's (impersonation). The default
  -- (the email's local part) isn't a choice, so it's exempt.
  if nullif(trim(p_display_name), '') is not null and exists (select 1 from public.users u where u.deactivated_at is null and private.display_name_key(u.display_name) = private.display_name_key(p_display_name)) then
    raise exception 'DISPLAY_NAME_TAKEN: that name is already used by another account -- choose another' using errcode = '22023';
  end if;

  if requested_username is not null and requested_username ~ '^[a-z0-9_]{3,32}$' then
    begin
      insert into public.users (id, username, display_name, email, password_hash)
      values (new_id, requested_username, coalesce(p_display_name, split_part(p_email, '@', 1)), lower(p_email), p_password_hash)
      returning * into created_row;
      return created_row;
    exception
      when unique_violation then
        -- The requested username (or the email) is already taken. If it was the email,
        -- re-raise -- signup must fail loudly for a duplicate account, never silently
        -- fall through. If it was only the username, fall through to the auto-derived
        -- one below, which is guaranteed unique because it embeds the account's own id.
        if exists (select 1 from public.users where email = lower(p_email)) then
          raise exception 'EMAIL_TAKEN: an account with that email already exists' using errcode = '23505';
        end if;
        null;
    end;
  end if;

  insert into public.users (id, username, display_name, email, password_hash)
  values (new_id, resolved_username, coalesce(p_display_name, split_part(p_email, '@', 1)), lower(p_email), p_password_hash)
  returning * into created_row;
  return created_row;
exception
  when unique_violation then
    raise exception 'EMAIL_TAKEN: an account with that email already exists' using errcode = '23505';
end;
$function$
;


-- Lets a fresh signup choose its own username and display name (via Supabase Auth
-- signup metadata), instead of every account getting an auto-derived
-- "email-prefix_xxxxxx" username forever. See docs/decisions/0050.
--
-- Deliberately NOT a separate "check username availability" RPC callable pre-signup:
-- that would need EXECUTE granted to `anon`, which is otherwise zero everywhere in this
-- schema (see 0049's own finding about researcher_profiles' grants). Instead the trigger
-- itself, which already runs SECURITY DEFINER as part of the same transaction that
-- creates the auth.users row, tries the requested username and falls back to the
-- existing auto-derived one on any collision or invalid format -- signup can never fail
-- because of a username race or a taken name, it just silently gets the safe fallback.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fallback_username text;
  requested_username text;
  resolved_username text;
begin
  fallback_username := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '_', 'g');
  fallback_username := left(fallback_username, 24) || '_' || left(replace(new.id::text, '-', ''), 6);

  requested_username := nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '');

  resolved_username := fallback_username;
  if requested_username is not null and requested_username ~ '^[a-z0-9_]{3,32}$' then
    begin
      insert into public.users (id, username, display_name, email)
      values (new.id, requested_username, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), lower(new.email))
      on conflict (id) do nothing;
      resolved_username := requested_username;
      return new;
    exception
      when unique_violation then
        -- The requested username is already taken (or this trigger fired twice) --
        -- fall through to the auto-derived username below, which is guaranteed unique
        -- because it embeds the account's own id.
        null;
    end;
  end if;

  insert into public.users (id, username, display_name, email)
  values (new.id, resolved_username, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), lower(new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- docs/decisions/0049-researcher-identity-audit.md
--
-- `public.researcher_profiles` (biography, avatar_path, reputation_score) has existed
-- since 202608250001 and was, until this migration, completely dead: zero application
-- code (services/actions/components) ever read or wrote it, no signup trigger ever
-- created a row for any user, and no INSERT policy existed even if one had tried. It also
-- carried two real, previously-undiscovered risks:
--
-- 1. `reputation_score` -- a mutable integer column that 202608290003's own migration
--    comment already flagged as "explicitly NOT the mechanism" the real, fact-based
--    reputation ledger uses, and warned is read/written by zero application code. A
--    column with that name sitting in the schema is a live landmine: a future change
--    (by a person or a model) could plausibly wire it up as a shortcut, quietly
--    reintroducing exactly the "score/ranking" this product has repeatedly, explicitly
--    rejected (0016, 0042, 0043). Dropped outright, not just left unused.
-- 2. `anon` and `authenticated` both held Supabase's default broad table grants
--    (INSERT/UPDATE/DELETE/TRUNCATE, not merely SELECT) on this table -- RLS policies
--    happened to block anon and most of authenticated's access in practice (no INSERT/
--    DELETE policy existed), but the raw grant itself violated this schema's own
--    documented, otherwise-universal policy that anon holds zero table grants anywhere,
--    and every other mutable table's writes go through a SECURITY DEFINER RPC, never a
--    direct table grant. Corrected to match that convention exactly.
--
-- This migration turns the table into the real, minimal researcher self-service profile
-- (display name + bio) the audit concluded is a genuine, low-risk, high-value gap:
-- Sentinel had ZERO account self-editing of any kind for any user before this. Avatar
-- upload is deliberately NOT built here -- `avatar_path` stays unused, a disclosed,
-- deferred capability (real image upload/storage is a separable slice, not a few extra
-- lines on this one).
-- ---------------------------------------------------------------------------

alter table public.researcher_profiles drop column reputation_score;

drop policy "profiles update own" on public.researcher_profiles;
revoke all on public.researcher_profiles from anon, authenticated;
grant select on public.researcher_profiles to authenticated;
grant select, insert, update, delete on public.researcher_profiles to service_role;

-- ---------------------------------------------------------------------------
-- upsert_my_researcher_profile: the one, self-only mutation path for biography. Creates
-- the row on first use (no row is ever created at signup) or updates it if one already
-- exists -- the exact reason this is an upsert, not a plain update: the "profiles update
-- own" RLS-only path this migration removes could never have created a first row anyway
-- (no INSERT policy ever existed), so a real researcher's very first edit would have
-- silently no-op'd under the old design.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_my_researcher_profile(p_biography text)
returns public.researcher_profiles
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_bio text := nullif(trim(coalesce(p_biography, '')), '');
  updated public.researcher_profiles;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if trimmed_bio is not null and char_length(trimmed_bio) > 5000 then
    raise exception 'INVALID_BIOGRAPHY: Use 5000 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.researcher_profiles (user_id, biography)
  values (actor, trimmed_bio)
  on conflict (user_id) do update set biography = excluded.biography, updated_at = now()
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.upsert_my_researcher_profile(text) from public;
grant execute on function public.upsert_my_researcher_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_my_display_name: display_name lives on public.users, not researcher_profiles
-- (it is an identity fact shared by every account type, not researcher-specific) -- this
-- was, until this migration, editable by NO ONE after signup's auto-derived default.
-- ---------------------------------------------------------------------------

create or replace function public.update_my_display_name(p_display_name text)
returns public.users
language plpgsql security definer set search_path = ''
as $$
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

  update public.users set display_name = trimmed_name, updated_at = now() where id = actor returning * into updated;

  return updated;
end;
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

-- External security profiles: a HackerOne handle joins the existing self-reported handles,
-- every handle gets a real format check (the app normalizes pasted profile URLs down to the
-- handle; lib/external-profiles.ts holds the same patterns), and a researcher may opt in to
-- listing them on their public profile. Additive: no stored handle is changed or dropped.
-- Existing rows are not re-validated (a legacy value that fails a pattern is only rejected
-- when its owner next saves the form, with a message naming the field).

alter table public.researcher_profiles
  add column if not exists hackerone_handle text check (hackerone_handle ~ '^[A-Za-z0-9_-]{1,40}$'),
  -- Off by default: handles were never public before, so nobody's profile changes until they choose.
  add column if not exists show_external_links boolean not null default false;

-- A 6-argument call against both a 6-arg and a 7-arg-with-defaults overload is ambiguous, so
-- the old signature goes; the app is updated in the same change.
drop function if exists public.update_my_external_handles(text, text, text, text, text, text);

create or replace function public.update_my_external_handles(
  p_hackerone_handle text, p_bugcrowd_handle text, p_cobalt_handle text, p_github_handle text,
  p_gitlab_handle text, p_x_handle text, p_hackthebox_handle text, p_show_external_links boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_h1 text := nullif(trim(p_hackerone_handle), '');
  v_bc text := nullif(trim(p_bugcrowd_handle), '');
  v_co text := nullif(trim(p_cobalt_handle), '');
  v_gh text := nullif(trim(p_github_handle), '');
  v_gl text := nullif(trim(p_gitlab_handle), '');
  v_x text := nullif(trim(p_x_handle), '');
  v_htb text := nullif(trim(p_hackthebox_handle), '');
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if v_h1 is not null and v_h1 !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'INVALID_HANDLE: HackerOne username is not valid' using errcode = '22023'; end if;
  if v_bc is not null and v_bc !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'INVALID_HANDLE: Bugcrowd username is not valid' using errcode = '22023'; end if;
  if v_co is not null and v_co !~ '^[A-Za-z0-9._-]{1,40}$' then raise exception 'INVALID_HANDLE: Cobalt username is not valid' using errcode = '22023'; end if;
  if v_gh is not null and v_gh !~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$' then raise exception 'INVALID_HANDLE: GitHub username is not valid' using errcode = '22023'; end if;
  if v_gl is not null and v_gl !~ '^[A-Za-z0-9._-]{1,40}$' then raise exception 'INVALID_HANDLE: GitLab username is not valid' using errcode = '22023'; end if;
  if v_x is not null and v_x !~ '^[A-Za-z0-9_]{1,15}$' then raise exception 'INVALID_HANDLE: X username is not valid' using errcode = '22023'; end if;
  if v_htb is not null and v_htb !~ '^[A-Za-z0-9._-]{1,40}$' then raise exception 'INVALID_HANDLE: Hack The Box username is not valid' using errcode = '22023'; end if;

  insert into public.researcher_profiles (user_id, hackerone_handle, bugcrowd_handle, cobalt_handle, github_handle, gitlab_handle, x_handle, hackthebox_handle, show_external_links)
  values (actor, v_h1, v_bc, v_co, v_gh, v_gl, v_x, v_htb, coalesce(p_show_external_links, false))
  on conflict (user_id) do update set
    hackerone_handle = excluded.hackerone_handle, bugcrowd_handle = excluded.bugcrowd_handle, cobalt_handle = excluded.cobalt_handle,
    github_handle = excluded.github_handle, gitlab_handle = excluded.gitlab_handle, x_handle = excluded.x_handle,
    hackthebox_handle = excluded.hackthebox_handle, show_external_links = excluded.show_external_links, updated_at = now();
end;
$$;
revoke all on function public.update_my_external_handles(text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.update_my_external_handles(text, text, text, text, text, text, text, boolean) to authenticated;

-- The public profile's links: only for a researcher with a public username who opted in, under
-- exactly the same visibility rule as get_public_researcher_profile (not found looks identical
-- to not opted in). Handles only; the URL is rebuilt by the app from each platform's base.
create or replace function public.get_public_researcher_links(p_username text)
returns table (hackerone_handle text, bugcrowd_handle text, cobalt_handle text, github_handle text, gitlab_handle text, x_handle text, hackthebox_handle text)
language sql stable security definer set search_path = ''
as $$
  select rp.hackerone_handle, rp.bugcrowd_handle, rp.cobalt_handle, rp.github_handle, rp.gitlab_handle, rp.x_handle, rp.hackthebox_handle
  from public.users u
  join public.researcher_profiles rp on rp.user_id = u.id
  where lower(u.public_username) = lower(trim(p_username)) and u.deactivated_at is null and not u.is_suspended
    and rp.show_external_links;
$$;
revoke all on function public.get_public_researcher_links(text) from public;
grant execute on function public.get_public_researcher_links(text) to anon, authenticated;

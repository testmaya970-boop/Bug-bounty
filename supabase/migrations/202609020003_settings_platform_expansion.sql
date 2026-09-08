-- Settings platform expansion: personal API tokens, external platform handles
-- (self-reported, explicitly unverified), researcher feedback, report templates, and
-- self-service account deactivation. See docs/decisions/0055.
--
-- This slice deliberately reopens 0038/0039/0049's rejection of "external platform
-- handles" -- not by accident, but on explicit, repeated user instruction. The honesty
-- boundary that made 0049 reject it (presenting an unverifiable claim as a trust signal)
-- is preserved a different way here: these fields are stored and displayed, but never
-- read by reputation/matching/any trust-relevant code path, and the UI must label them
-- self-reported, unverified (see components/settings/external-services-settings.tsx).

-- ---------------------------------------------------------------------------
-- Personal access tokens -- real bearer-token auth for /api/v1/*, not just a settings
-- page with nothing behind it. High-entropy random token, only its SHA-256 hash stored
-- (identical convention to organization_invitations' token_hash). Verification is
-- anon-callable (a bearer-token request has no Supabase session at all) but only ever
-- returns a bare user_id -- never any other user data -- the same "narrow oracle,
-- high-entropy secret" reasoning organization invitation tokens already rely on.
-- ---------------------------------------------------------------------------

create table public.personal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index personal_access_tokens_user_idx on public.personal_access_tokens(user_id) where revoked_at is null;

alter table public.personal_access_tokens enable row level security;
revoke all on public.personal_access_tokens from anon, authenticated;
grant select, insert, update, delete on public.personal_access_tokens to service_role;

create or replace function public.list_my_api_tokens()
returns table (id uuid, name text, created_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return query select t.id, t.name, t.created_at, t.last_used_at from public.personal_access_tokens t
    where t.user_id = actor and t.revoked_at is null order by t.created_at desc;
end;
$$;
revoke all on function public.list_my_api_tokens() from public;
grant execute on function public.list_my_api_tokens() to authenticated;

-- Returns the real, plaintext token exactly once -- only its hash is ever stored, the
-- same "shown once, hashed forever after" convention as MFA backup codes (0052).
create or replace function public.create_my_api_token(p_name text, p_token_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); new_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'INVALID_NAME: give this token a name' using errcode = '22023'; end if;
  insert into public.personal_access_tokens (user_id, name, token_hash) values (actor, trim(p_name), p_token_hash) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_my_api_token(text, text) from public;
grant execute on function public.create_my_api_token(text, text) to authenticated;

create or replace function public.revoke_my_api_token(target_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.personal_access_tokens set revoked_at = now() where id = target_id and user_id = actor and revoked_at is null;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: token not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.revoke_my_api_token(uuid) from public;
grant execute on function public.revoke_my_api_token(uuid) to authenticated;

-- Anon-callable: a bearer-token request has no Supabase session to derive auth.uid()
-- from. Never returns anything beyond the owning user_id; updates last_used_at as a side
-- effect so a token's real recency is always accurate, not a fabricated 'active' status.
create or replace function public.verify_api_token(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  update public.personal_access_tokens set last_used_at = now()
    where token_hash = p_token_hash and revoked_at is null
    returning user_id into owner;
  return owner;
end;
$$;
revoke all on function public.verify_api_token(text) from public;
grant execute on function public.verify_api_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- External platform handles -- self-reported, explicitly unverified. Never read by
-- reputation, matching, or any trust-relevant code path (see this file's own header).
-- ---------------------------------------------------------------------------

alter table public.researcher_profiles
  add column bugcrowd_handle text check (char_length(bugcrowd_handle) <= 80),
  add column cobalt_handle text check (char_length(cobalt_handle) <= 80),
  add column github_handle text check (char_length(github_handle) <= 80),
  add column gitlab_handle text check (char_length(gitlab_handle) <= 80),
  add column x_handle text check (char_length(x_handle) <= 80),
  add column hackthebox_handle text check (char_length(hackthebox_handle) <= 80);

create or replace function public.update_my_external_handles(
  p_bugcrowd_handle text default null, p_cobalt_handle text default null, p_github_handle text default null,
  p_gitlab_handle text default null, p_x_handle text default null, p_hackthebox_handle text default null
)
returns public.researcher_profiles
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); result public.researcher_profiles;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  insert into public.researcher_profiles (user_id, bugcrowd_handle, cobalt_handle, github_handle, gitlab_handle, x_handle, hackthebox_handle)
  values (actor, nullif(trim(p_bugcrowd_handle),''), nullif(trim(p_cobalt_handle),''), nullif(trim(p_github_handle),''),
          nullif(trim(p_gitlab_handle),''), nullif(trim(p_x_handle),''), nullif(trim(p_hackthebox_handle),''))
  on conflict (user_id) do update set
    bugcrowd_handle = excluded.bugcrowd_handle, cobalt_handle = excluded.cobalt_handle, github_handle = excluded.github_handle,
    gitlab_handle = excluded.gitlab_handle, x_handle = excluded.x_handle, hackthebox_handle = excluded.hackthebox_handle,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.update_my_external_handles(text,text,text,text,text,text) from public;
grant execute on function public.update_my_external_handles(text,text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Researcher feedback -- a real, persisted submission, not a fake "thanks!" toast over
-- nothing. No response/ticketing workflow is built -- disclosed, not implied.
-- ---------------------------------------------------------------------------

create table public.researcher_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.researcher_feedback enable row level security;
revoke all on public.researcher_feedback from anon, authenticated;
grant select, insert on public.researcher_feedback to service_role;

create or replace function public.submit_my_feedback(p_message text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); trimmed text := trim(coalesce(p_message, ''));
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if trimmed = '' then raise exception 'INVALID_MESSAGE: enter your feedback' using errcode = '22023'; end if;
  insert into public.researcher_feedback (user_id, message) values (actor, trimmed);
end;
$$;
revoke all on function public.submit_my_feedback(text) from public;
grant execute on function public.submit_my_feedback(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Report templates -- real, reusable composer boilerplate. Never auto-submitted; a
-- template only ever pre-fills the real composer form (0047), which still runs every
-- one of its own real validations before submit_report is called.
-- ---------------------------------------------------------------------------

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  weakness_type public.report_weakness_type,
  description_template text check (char_length(description_template) <= 10000),
  impact_template text check (char_length(impact_template) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.report_templates enable row level security;
revoke all on public.report_templates from anon, authenticated;
grant select, insert, update, delete on public.report_templates to service_role;

create or replace function public.list_my_report_templates()
returns setof public.report_templates
language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return query select * from public.report_templates where user_id = actor order by updated_at desc;
end;
$$;
revoke all on function public.list_my_report_templates() from public;
grant execute on function public.list_my_report_templates() to authenticated;

-- Reordering params (p_name first) changes the signature -- create or replace cannot
-- silently repoint the old (uuid,text,enum,text,text) overload, so it is dropped first.
drop function if exists public.upsert_my_report_template(uuid, text, public.report_weakness_type, text, text);

create or replace function public.upsert_my_report_template(
  p_name text,
  p_id uuid default null,
  p_weakness_type public.report_weakness_type default null,
  p_description_template text default null,
  p_impact_template text default null
)
returns public.report_templates
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); result public.report_templates;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'INVALID_NAME: name this template' using errcode = '22023'; end if;

  if p_id is not null then
    update public.report_templates set
      name = trim(p_name), weakness_type = p_weakness_type, description_template = p_description_template,
      impact_template = p_impact_template, updated_at = now()
    where id = p_id and user_id = actor
    returning * into result;
    if result.id is null then raise exception 'NOT_FOUND: template not found' using errcode = 'P0002'; end if;
  else
    insert into public.report_templates (user_id, name, weakness_type, description_template, impact_template)
    values (actor, trim(p_name), p_weakness_type, p_description_template, p_impact_template)
    returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.upsert_my_report_template(text,uuid,public.report_weakness_type,text,text) from public;
grant execute on function public.upsert_my_report_template(text,uuid,public.report_weakness_type,text,text) to authenticated;

create or replace function public.delete_my_report_template(target_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); affected int;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  delete from public.report_templates where id = target_id and user_id = actor;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'NOT_FOUND: template not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.delete_my_report_template(uuid) from public;
grant execute on function public.delete_my_report_template(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-service account deactivation. Deliberately a distinct column from users.
-- is_suspended (an admin-only, for-cause flag already enforced elsewhere, e.g.
-- join_public_program) -- these are two different concepts that must never collide.
-- Hard deletion is NOT implemented: nearly every foreign key from a user's own real
-- activity (organizations.created_by, programs.created_by, reports.researcher_id, ...)
-- is `on delete restrict`, meaning a genuine hard delete would fail loudly for any
-- account with real history, or silently orphan data if those constraints were loosened
-- -- neither is acceptable. See docs/decisions/0055 for what this means for the UI.
-- ---------------------------------------------------------------------------

alter table public.users add column deactivated_at timestamptz;

create or replace function public.deactivate_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  update public.users set deactivated_at = now(), updated_at = now() where id = actor;
  delete from auth.sessions where user_id = actor;
end;
$$;
revoke all on function public.deactivate_my_account() from public;
grant execute on function public.deactivate_my_account() to authenticated;

-- Read by middleware on every authenticated request, the same enforcement pattern as
-- get_my_mfa_status (0052) -- a page-level check alone could be bypassed by navigating
-- directly to a URL.
create or replace function public.am_i_deactivated()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select deactivated_at is not null from public.users where id = auth.uid();
$$;
revoke all on function public.am_i_deactivated() from public;
grant execute on function public.am_i_deactivated() to authenticated;

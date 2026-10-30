-- Inviting a Managed Triage analyst who has no Unpatched account yet (follow-up to 202610290008).
--
-- A platform admin invites an email. An existing, verified account becomes an analyst at once
-- (as before). Otherwise an invitation is stored -- only the SHA-256 of a 256-bit token -- and
-- the email gets a link valid for 14 days. Opening it, the person either creates their account
-- right there (the link reached their inbox, which proves they own the email, so no separate
-- code) or, if they have since registered, accepts while signed in with that same email.
-- Either way they become an analyst and still need two-factor before the queue opens
-- (private.is_triage_analyst). Same separation rule: never someone in an organization.

create table public.triage_analyst_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.users (id),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index triage_analyst_invitations_one_pending on public.triage_analyst_invitations (email) where accepted_at is null and revoked_at is null;
alter table public.triage_analyst_invitations enable row level security;
revoke all on public.triage_analyst_invitations from public, anon, authenticated;
grant select, insert, update on public.triage_analyst_invitations to service_role;

-- Shared by both acceptance paths: the separation rule, then the analyst row and the audit row.
create or replace function private.grant_triage_analyst(p_user_id uuid, p_invited_by uuid, p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.organization_members m where m.user_id = p_user_id and m.status = 'active') then
    raise exception 'ANALYST_CONFLICT: this account belongs to an organization, so it can''t triage for other organizations' using errcode = '23514';
  end if;
  insert into public.triage_analysts (user_id, added_by) values (p_user_id, p_invited_by)
  on conflict (user_id) do update set active = true, added_by = p_invited_by, added_at = now();
  update public.triage_analyst_invitations set accepted_by = p_user_id, accepted_at = now() where id = p_invitation_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (p_user_id, null, 'platform.triage_analyst_joined', 'user', p_user_id, jsonb_build_object('invitation_id', p_invitation_id));
end;
$$;
revoke all on function private.grant_triage_analyst(uuid, uuid, uuid) from public, anon, authenticated;

-- Platform admin. 'added': an existing verified account became an analyst now. 'invited': an
-- invitation was stored (replacing any pending one for that email); the caller emails the link.
create or replace function public.invite_triage_analyst(p_email text, p_token_hash text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  target public.users;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL: enter the analyst''s email address' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_TOKEN: invalid invitation token' using errcode = '22023'; end if;

  select * into target from public.users where lower(email) = v_email;
  if target.id is not null and target.email_verified_at is not null then
    if exists (select 1 from public.organization_members m where m.user_id = target.id and m.status = 'active') then
      raise exception 'ANALYST_CONFLICT: this account belongs to an organization, so it can''t triage for other organizations' using errcode = '23514';
    end if;
    insert into public.triage_analysts (user_id, added_by) values (target.id, actor)
    on conflict (user_id) do update set active = true, added_by = actor, added_at = now();
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (actor, null, 'platform.triage_analyst_added', 'user', target.id, jsonb_build_object('email', target.email));
    return 'added';
  end if;

  update public.triage_analyst_invitations set revoked_at = now() where email = v_email and accepted_at is null and revoked_at is null;
  insert into public.triage_analyst_invitations (email, token_hash, invited_by) values (v_email, p_token_hash, actor);
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, null, 'platform.triage_analyst_invited', 'user', actor, jsonb_build_object('email', v_email));
  return 'invited';
end;
$$;

create or replace function public.list_triage_analyst_invitations()
returns table (id uuid, email text, invited_by_name text, created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  return query
  select i.id, i.email, u.display_name, i.created_at, i.expires_at
  from public.triage_analyst_invitations i left join public.users u on u.id = i.invited_by
  where i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  order by i.created_at desc;
end;
$$;

create or replace function public.revoke_triage_analyst_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501'; end if;
  update public.triage_analyst_invitations set revoked_at = now() where id = p_invitation_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'NOT_FOUND: no pending invitation' using errcode = 'P0002'; end if;
end;
$$;

-- Signed in: accept with the account whose email the invitation was sent to.
create or replace function public.accept_triage_analyst_invitation(p_token_hash text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inv public.triage_analyst_invitations;
  me public.users;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into inv from public.triage_analyst_invitations where token_hash = p_token_hash for update;
  if inv.id is null or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'INVITATION_INVALID: this invitation has expired or was already used -- ask for a new one' using errcode = 'P0002';
  end if;
  select * into me from public.users where id = actor;
  if lower(me.email) <> inv.email or me.email_verified_at is null then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email -- sign in with that account' using errcode = '42501';
  end if;
  perform private.grant_triage_analyst(actor, inv.invited_by, inv.id);
end;
$$;

-- Not signed in, no account (server action, service_role): the emailed link proves the email,
-- so the account is created verified, and it becomes an analyst in the same transaction.
create or replace function public.redeem_triage_analyst_invitation(p_token_hash text, p_password_hash text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.triage_analyst_invitations;
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  new_user uuid;
begin
  select * into inv from public.triage_analyst_invitations where token_hash = p_token_hash for update;
  if inv.id is null or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'INVITATION_INVALID: this invitation has expired or was already used -- ask for a new one' using errcode = 'P0002';
  end if;
  if v_name is null or char_length(v_name) > 100 then raise exception 'INVALID_NAME: enter your name' using errcode = '22023'; end if;
  if exists (select 1 from public.users u where lower(u.email) = inv.email and u.email_verified_at is not null) then
    raise exception 'ACCOUNT_EXISTS: an account already uses this email -- sign in, then open the invitation link again' using errcode = '23505';
  end if;
  -- An abandoned, never-verified sign-up with this email is taken over: the link proves ownership,
  -- so its unproven password is replaced.
  select u.id into new_user from public.users u where lower(u.email) = inv.email;
  if new_user is null then
    select id into new_user from public.create_user(inv.email, p_password_hash, v_name, null);
  else
    update public.users set password_hash = p_password_hash, display_name = v_name, updated_at = now() where id = new_user;
  end if;
  update public.users set email_verified_at = now() where id = new_user;
  perform private.grant_triage_analyst(new_user, inv.invited_by, inv.id);
  return new_user;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.invite_triage_analyst(text, text)', 'public.list_triage_analyst_invitations()',
    'public.revoke_triage_analyst_invitation(uuid)', 'public.accept_triage_analyst_invitation(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.redeem_triage_analyst_invitation(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_triage_analyst_invitation(text, text, text) to service_role;

-- SAML single sign-on and SCIM 2.0 provisioning (docs/plans/organization-integrations.md,
-- module 6). Built on the organization's VERIFIED domains (202610260008): a connection only ever
-- signs in or provisions emails on a domain the organization proved it controls, which is what
-- makes its identity provider authoritative for those addresses.
--
--   SAML: SP-initiated only. The server (lib/auth/saml.ts, @node-saml/node-saml) checks the
--     signature against the configured certificate, audience, destination, validity window and
--     InResponseTo (sso_auth_requests), and refuses a replayed assertion (sso_assertion_replay).
--   Accounts: an existing ORGANIZATION account on a verified domain is linked; researcher
--     accounts are refused (strict two-sided accounts); new people are created just in time
--     when allowed, with the connection's default role or a mapped role. SSO never grants or
--     removes "owner", and never touches an owner's membership.
--   Enforcement: when on, members on the verified domains can't sign in with a password; owners
--     keep their password as the break-glass way in. MFA still applies (middleware).
--   SCIM: per-connection bearer token (stored as a SHA-256 hash, shown once). Deprovisioning
--     suspends the membership and ends the person's sessions.

create table public.sso_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active')),
  idp_entity_id text not null check (char_length(idp_entity_id) between 1 and 500),
  idp_sso_url text not null check (idp_sso_url ~ '^https://' and char_length(idp_sso_url) <= 1000),
  idp_certificate text not null check (char_length(idp_certificate) between 100 and 10000),
  enforced boolean not null default false,
  allow_jit boolean not null default true,
  default_role public.organization_member_role not null default 'triager' check (default_role <> 'owner'),
  role_attribute text check (char_length(role_attribute) <= 200),
  role_mappings jsonb not null default '{}'::jsonb,
  scim_token_hash text,
  scim_token_last4 text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sso_identities (
  connection_id uuid not null references public.sso_connections(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name_id text not null check (char_length(name_id) <= 500),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (connection_id, name_id),
  unique (connection_id, user_id)
);

create table public.sso_auth_requests (
  request_id text primary key check (char_length(request_id) <= 200),
  connection_id uuid not null references public.sso_connections(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.sso_assertion_replay (
  assertion_id text primary key check (char_length(assertion_id) <= 200),
  connection_id uuid not null references public.sso_connections(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.sso_connections enable row level security;
alter table public.sso_identities enable row level security;
alter table public.sso_auth_requests enable row level security;
alter table public.sso_assertion_replay enable row level security;
create policy "sso connections read by org admins" on public.sso_connections for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
revoke all on public.sso_connections, public.sso_identities, public.sso_auth_requests, public.sso_assertion_replay from anon, authenticated;
grant select (id, organization_id, status, idp_entity_id, idp_sso_url, enforced, allow_jit, default_role, role_attribute, role_mappings, scim_token_last4, created_by, created_at, updated_at) on public.sso_connections to authenticated;
grant select, insert, update, delete on public.sso_connections, public.sso_identities, public.sso_auth_requests, public.sso_assertion_replay to service_role;

-- Admin ---------------------------------------------------------------------------------------------
create or replace function public.save_sso_connection(p_organization_id uuid, p_idp_entity_id text, p_idp_sso_url text, p_idp_certificate text, p_allow_jit boolean, p_default_role public.organization_member_role, p_role_attribute text, p_role_mappings jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  v jsonb;
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_default_role = 'owner' then raise exception 'INVALID_ROLE: single sign-on never grants the owner role' using errcode = '22023'; end if;
  for v in select value from jsonb_each(coalesce(p_role_mappings, '{}'::jsonb)) loop
    if v #>> '{}' not in ('security_admin', 'program_manager', 'triager', 'billing_admin') then
      raise exception 'INVALID_ROLE: map groups to security_admin, program_manager, triager or billing_admin' using errcode = '22023';
    end if;
  end loop;
  insert into public.sso_connections (organization_id, idp_entity_id, idp_sso_url, idp_certificate, allow_jit, default_role, role_attribute, role_mappings, created_by)
  values (p_organization_id, trim(p_idp_entity_id), trim(p_idp_sso_url), trim(p_idp_certificate), coalesce(p_allow_jit, true), coalesce(p_default_role, 'triager'), nullif(trim(coalesce(p_role_attribute, '')), ''), coalesce(p_role_mappings, '{}'::jsonb), auth.uid())
  on conflict (organization_id) do update set idp_entity_id = excluded.idp_entity_id, idp_sso_url = excluded.idp_sso_url, idp_certificate = excluded.idp_certificate,
    allow_jit = excluded.allow_jit, default_role = excluded.default_role, role_attribute = excluded.role_attribute, role_mappings = excluded.role_mappings, updated_at = now()
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'sso.configured', 'sso_connection', new_id, jsonb_build_object('idp', p_idp_entity_id, 'default_role', p_default_role));
  return new_id;
end;
$$;

/** Turning SSO on (or enforcing it) needs at least one verified domain. */
create or replace function public.set_sso_state(p_organization_id uuid, p_active boolean, p_enforced boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_active and not exists (select 1 from public.organization_domains where organization_id = p_organization_id and status = 'verified') then
    raise exception 'DOMAIN_REQUIRED: verify your email domain in Settings first' using errcode = '23514';
  end if;
  update public.sso_connections set status = case when p_active then 'active' else 'draft' end, enforced = p_active and coalesce(p_enforced, false), updated_at = now()
   where organization_id = p_organization_id;
  if not found then raise exception 'NOT_FOUND: set up single sign-on first' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'sso.state_changed', 'organization', p_organization_id, jsonb_build_object('active', p_active, 'enforced', p_active and coalesce(p_enforced, false)));
end;
$$;

create or replace function public.set_scim_token(p_organization_id uuid, p_token_hash text, p_last4 text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INPUT: token' using errcode = '22023'; end if;
  update public.sso_connections set scim_token_hash = p_token_hash, scim_token_last4 = p_last4, updated_at = now() where organization_id = p_organization_id;
  if not found then raise exception 'NOT_FOUND: set up single sign-on first' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'scim.token_rotated', 'organization', p_organization_id, '{}'::jsonb);
end;
$$;

create or replace function public.delete_sso_connection(p_organization_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_org_integration_admin(p_organization_id);
  delete from public.sso_connections where organization_id = p_organization_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'sso.removed', 'organization', p_organization_id, '{}'::jsonb);
end;
$$;

-- Sign-in and provisioning (server, service role) ---------------------------------------------------
/** The active connection for an email, through the organization's verified domains. */
create or replace function private.sso_connection_for_email(p_email text)
returns table (connection_id uuid, organization_id uuid, enforced boolean)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.organization_id, c.enforced
  from public.sso_connections c
  join public.organization_domains d on d.organization_id = c.organization_id and d.status = 'verified'
  where c.status = 'active' and lower(split_part(p_email, '@', 2)) = d.domain
  limit 1;
$$;

/** Password sign-in refused: SSO is enforced for this person's organization and they aren't an owner. */
create or replace function private.password_sign_in_blocked(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    join public.sso_connections c on c.status = 'active' and c.enforced
    join public.organization_domains d on d.organization_id = c.organization_id and d.status = 'verified' and d.domain = lower(split_part(u.email, '@', 2))
    join public.organization_members m on m.organization_id = c.organization_id and m.user_id = u.id and m.status = 'active' and m.role <> 'owner'
    where u.id = p_user_id
  );
$$;

/** Links or creates the person and their membership after the server validated the assertion
 * (or a SCIM request). Returns the user id. p_user_if_new is created by the server beforehand
 * only when no account exists for the email. */
create or replace function private.sso_provision_member(p_connection_id uuid, p_email text, p_name_id text, p_display_name text, p_mapped_role public.organization_member_role, p_new_user uuid, p_via text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c public.sso_connections;
  u public.users;
  m public.organization_members;
  v_email text := lower(trim(p_email));
  role public.organization_member_role;
begin
  select * into c from public.sso_connections where id = p_connection_id;
  if c.id is null then raise exception 'SSO_NOT_FOUND: no such connection' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.organization_domains d where d.organization_id = c.organization_id and d.status = 'verified' and d.domain = split_part(v_email, '@', 2)) then
    raise exception 'SSO_DOMAIN: that email is not on one of this organization''s verified domains' using errcode = '42501';
  end if;
  select * into u from public.users where email = v_email;
  if u.id is null and p_new_user is not null then select * into u from public.users where id = p_new_user; end if;
  if u.id is null then raise exception 'SSO_NO_ACCOUNT: there is no account for that person and provisioning is off' using errcode = 'P0002'; end if;
  if u.account_type <> 'organization' then raise exception 'SSO_RESEARCHER_ACCOUNT: that email belongs to a researcher account, which can''t join an organization' using errcode = '42501'; end if;
  if u.deactivated_at is not null then raise exception 'SSO_DEACTIVATED: that account is deactivated' using errcode = '42501'; end if;

  select * into m from public.organization_members where organization_id = c.organization_id and user_id = u.id;
  role := coalesce(p_mapped_role, c.default_role);
  if role = 'owner' then role := c.default_role; end if;
  if m.user_id is null then
    if not c.allow_jit and p_via = 'saml' then raise exception 'SSO_NOT_MEMBER: ask an admin to add you to the organization first' using errcode = '42501'; end if;
    insert into public.organization_members (organization_id, user_id, role, status) values (c.organization_id, u.id, role, 'active');
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (u.id, c.organization_id, 'sso.member_provisioned', 'user', u.id, jsonb_build_object('role', role, 'via', p_via));
  elsif m.status <> 'active' and p_via = 'saml' then
    raise exception 'SSO_SUSPENDED: your access to this organization is suspended' using errcode = '42501';
  elsif p_mapped_role is not null and m.role <> 'owner' and m.role <> role then
    update public.organization_members set role = role, updated_at = now() where organization_id = c.organization_id and user_id = u.id;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (u.id, c.organization_id, 'sso.role_mapped', 'user', u.id, jsonb_build_object('from', m.role, 'to', role, 'via', p_via));
  end if;

  if p_name_id is not null then
    insert into public.sso_identities (connection_id, user_id, name_id, last_login_at) values (c.id, u.id, p_name_id, case when p_via = 'saml' then now() end)
    on conflict (connection_id, user_id) do update set name_id = excluded.name_id, last_login_at = coalesce(excluded.last_login_at, public.sso_identities.last_login_at);
  end if;
  if p_via = 'saml' then
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (u.id, c.organization_id, 'sso.login', 'user', u.id, '{}'::jsonb);
  end if;
  return u.id;
end;
$$;

/** SCIM deactivate / reactivate. Owners are never touched; deactivation ends every session. */
create or replace function private.scim_set_active(p_connection_id uuid, p_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.sso_connections;
  m public.organization_members;
begin
  select * into c from public.sso_connections where id = p_connection_id;
  select * into m from public.organization_members where organization_id = c.organization_id and user_id = p_user_id;
  if m.user_id is null then raise exception 'SCIM_NOT_FOUND: not a member' using errcode = 'P0002'; end if;
  if m.role = 'owner' then raise exception 'SCIM_OWNER: owners are managed in Unpatched, not by provisioning' using errcode = '42501'; end if;
  if p_active then
    update public.organization_members set status = 'active', suspended_at = null, updated_at = now() where organization_id = c.organization_id and user_id = p_user_id and status = 'suspended';
  else
    update public.organization_members set status = 'suspended', suspended_at = now(), updated_at = now() where organization_id = c.organization_id and user_id = p_user_id and status = 'active';
    delete from public.sessions where user_id = p_user_id;
  end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (null, c.organization_id, case when p_active then 'scim.member_reactivated' else 'scim.member_deprovisioned' end, 'user', p_user_id, '{}'::jsonb);
end;
$$;

grant execute on function private.sso_connection_for_email(text), private.password_sign_in_blocked(uuid),
  private.sso_provision_member(uuid, text, text, text, public.organization_member_role, uuid, text), private.scim_set_active(uuid, uuid, boolean) to service_role;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.save_sso_connection(uuid, text, text, text, boolean, public.organization_member_role, text, jsonb)', 'public.set_sso_state(uuid, boolean, boolean)',
    'public.set_scim_token(uuid, text, text)', 'public.delete_sso_connection(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

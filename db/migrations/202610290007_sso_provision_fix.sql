-- 202610290006's provisioning function named a variable `role`, which is ambiguous with the
-- organization_members.role column in its own UPDATE. Same function, variable renamed.

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
  v_role public.organization_member_role;
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
  v_role := coalesce(p_mapped_role, c.default_role);
  if v_role = 'owner' then v_role := c.default_role; end if;
  if m.user_id is null then
    if not c.allow_jit and p_via = 'saml' then raise exception 'SSO_NOT_MEMBER: ask an admin to add you to the organization first' using errcode = '42501'; end if;
    insert into public.organization_members (organization_id, user_id, role, status) values (c.organization_id, u.id, v_role, 'active');
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (u.id, c.organization_id, 'sso.member_provisioned', 'user', u.id, jsonb_build_object('role', v_role, 'via', p_via));
  elsif m.status <> 'active' and p_via = 'saml' then
    raise exception 'SSO_SUSPENDED: your access to this organization is suspended' using errcode = '42501';
  elsif p_mapped_role is not null and m.role <> 'owner' and m.role <> v_role then
    update public.organization_members set role = v_role, updated_at = now() where organization_id = c.organization_id and user_id = u.id;
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (u.id, c.organization_id, 'sso.role_mapped', 'user', u.id, jsonb_build_object('from', m.role, 'to', v_role, 'via', p_via));
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


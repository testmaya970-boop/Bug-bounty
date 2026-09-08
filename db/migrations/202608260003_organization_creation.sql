-- Organization creation. Design decisions recorded here and expanded in
-- docs/decisions/0003-organization-creation.md.
--
-- 1. Slug is auto-generated from name, server-side, never asked of the user. Routing is
--    already UUID-based (app/organizations/[organizationId]/...), so a human-typed slug
--    would add a form field and a uniqueness-conflict UX problem for zero product value.
--    `slug` remains a real, unique, ASCII-normalized internal identifier (Phase 1's
--    column and constraint are unchanged) -- `name` is never altered from what the user
--    typed (only trimmed), since slug and display name are deliberately separate concepts.
-- 2. Idempotency is a real database mechanism (a nullable, per-creator-unique
--    `idempotency_key`), not just a disabled submit button: a client-generated key
--    replayed with the same value returns the already-created organization instead of
--    creating a second one, including under a genuine concurrent race (see the
--    unique_violation branch below).
-- 3. Multiple organizations per user are allowed -- nothing in DOMAIN.md or the existing
--    schema forbids it, and organization_members' composite primary key already supports
--    a user belonging to many organizations. Not restricting this is a deliberate choice,
--    not an oversight.
-- 4. Two invitation-acceptance paths now exist: the original token-based one (for a
--    shared link, works before the invitee has independently discovered anything) and a
--    new id-based one (for a signed-in user browsing their own pending invitations in the
--    app). Both are gated by the identical check -- the accepting account's authenticated
--    email must equal the invitation's email -- so neither is weaker than the other; the
--    token's role was always "how did you find out about this," not an independent proof
--    the email-match check doesn't already provide.

alter table public.organizations add column idempotency_key uuid;
create unique index organizations_created_by_idempotency_key_idx on public.organizations(created_by, idempotency_key) where idempotency_key is not null;

-- The idempotency parameter is named p_idempotency_key, not idempotency_key: plpgsql
-- parameters are visible as variables throughout the function body, and a parameter
-- sharing a name with a table column it's compared against is genuinely ambiguous to
-- Postgres ("column reference is ambiguous", SQLSTATE 42702) inside any query that
-- touches that column -- confirmed by actually running this function before the rename.
-- Prefixing parameters is the standard plpgsql idiom for avoiding this class of bug.
create or replace function public.create_organization(org_name text, p_idempotency_key uuid default null)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(org_name);
  base_slug text;
  candidate_slug text;
  new_org public.organizations;
  existing public.organizations;
  attempt integer := 0;
  conflicting_index text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_NAME: Enter an organization name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 160 then
    raise exception 'INVALID_NAME: Use 160 characters or fewer.' using errcode = '22023';
  end if;
  if trimmed_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME: Organization name contains invalid characters.' using errcode = '22023';
  end if;

  -- Idempotent replay: a client-supplied key that already produced an organization for
  -- this actor returns that organization instead of creating another one.
  if p_idempotency_key is not null then
    select * into existing from public.organizations
      where created_by = actor and idempotency_key = p_idempotency_key;
    if found then
      return existing;
    end if;
  end if;

  base_slug := lower(regexp_replace(trimmed_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if char_length(base_slug) < 3 then
    base_slug := base_slug || '-' || substr(md5(random()::text), 1, greatest(6 - char_length(base_slug), 3));
  end if;
  base_slug := left(base_slug, 55);
  candidate_slug := base_slug;

  loop
    begin
      insert into public.organizations (slug, name, created_by, status, idempotency_key)
      values (candidate_slug, trimmed_name, actor, 'active', p_idempotency_key)
      returning * into new_org;
      exit;
    exception when unique_violation then
      -- Two distinct unique constraints can fire here: the slug (retry with a suffix) or
      -- the per-creator idempotency key under a genuine concurrent double-submit (fetch
      -- and return the row the other concurrent transaction just committed).
      get stacked diagnostics conflicting_index = constraint_name;
      if conflicting_index = 'organizations_created_by_idempotency_key_idx' then
        select * into new_org from public.organizations
          where created_by = actor and idempotency_key = p_idempotency_key;
        exit;
      end if;
      attempt := attempt + 1;
      if attempt > 5 then
        raise exception 'SLUG_GENERATION_FAILED: could not generate a unique organization identifier, try again' using errcode = '23505';
      end if;
      candidate_slug := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role, status, joined_at, updated_at)
  values (new_org.id, actor, 'owner', 'active', now(), now());

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, new_org.id, 'organization.created', 'organization', new_org.id, jsonb_build_object('name', trimmed_name));

  return new_org;
end;
$$;

-- Lets an authenticated user see invitations addressed to their own email, including the
-- organization's name -- something no existing policy permits (organizations' own SELECT
-- policy requires active membership, which by definition an invitee doesn't have yet).
-- SECURITY DEFINER is required to read the organization name across that boundary; scope
-- is limited to auth.uid()'s own email, derived server-side, never a parameter.
create or replace function public.list_my_pending_invitations()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  role public.organization_member_role,
  invited_by_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- `id` (and every other RETURNS TABLE column name) is an OUT-parameter-like variable
  -- in scope across this ENTIRE function body, not just the final RETURN QUERY -- a bare
  -- `id` here is ambiguous with that output column, confirmed by actually running this
  -- function before qualifying it (same class of bug as create_organization's
  -- idempotency_key parameter, different mechanism: output columns, not an argument).
  select users.email into actor_email from public.users where users.id = actor;
  if actor_email is null then return; end if;

  return query
    select i.id, i.organization_id, o.name, i.role, u.display_name, i.expires_at, i.created_at
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
    left join public.users u on u.id = i.invited_by
    where i.email = actor_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

-- Accept a known invitation (surfaced via list_my_pending_invitations) without the raw
-- token -- the email-match check below is the same authorization boundary the token-based
-- accept_organization_invitation already relies on, so this is not a weaker path.
create or replace function public.accept_organization_invitation_by_id(invitation_id uuid)
returns public.organization_members
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.organization_invitations;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select email into actor_email from public.users where id = actor;

  select * into invitation from public.organization_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  insert into public.organization_members (organization_id, user_id, role, status, invited_by, joined_at, updated_at)
  values (invitation.organization_id, actor, invitation.role, 'active', invitation.invited_by, now(), now())
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', joined_at = now(), suspended_at = null, removed_at = null, updated_at = now()
  returning * into membership;

  update public.organization_invitations set accepted_at = now(), accepted_by = actor, updated_at = now() where id = invitation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'member.invitation_accepted', 'organization_member', actor,
    jsonb_build_object('role', invitation.role, 'invitation_id', invitation.id));

  return membership;
end;
$$;

-- Widened to let the invitee decline their own not-yet-accepted invitation, in addition
-- to org admins revoking it -- both are the same underlying state transition
-- (revoked_at set), so this reuses member.invitation_cancelled rather than inventing a
-- separate "declined" concept DOMAIN.md doesn't define.
create or replace function public.cancel_organization_invitation(invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.organization_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into invitation from public.organization_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;

  select email into actor_email from public.users where id = actor;

  if not (private.has_org_role(invitation.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or actor_email = invitation.email) then
    raise exception 'FORBIDDEN: actor cannot manage this invitation' using errcode = '42501';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023';
  end if;

  update public.organization_invitations set revoked_at = now(), updated_at = now() where id = invitation_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'member.invitation_cancelled', 'organization_invitation', invitation.id,
    jsonb_build_object('email', invitation.email, 'cancelled_by_invitee', actor_email = invitation.email));
end;
$$;

revoke all on function public.create_organization(text, uuid) from public;
revoke all on function public.list_my_pending_invitations() from public;
revoke all on function public.accept_organization_invitation_by_id(uuid) from public;
grant execute on function public.create_organization(text, uuid) to authenticated;
grant execute on function public.list_my_pending_invitations() to authenticated;
grant execute on function public.accept_organization_invitation_by_id(uuid) to authenticated;

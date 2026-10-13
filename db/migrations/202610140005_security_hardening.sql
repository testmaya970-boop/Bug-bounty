-- Security hardening from the Oct 13 white/black/grey-box tests.
--
-- 1. Invitations count only a VERIFIED email. changeMyEmail sets the new address at once
--    (email_verified_at = null), so before this anyone could switch their email to an invited
--    address they don't own and accept that invitation -- including an owner invite.
-- 2. Accepting an organization invitation never rewrites an existing membership: no role
--    escalation around owner-only change_member_role, and no undoing a later suspension or
--    removal (the program version already had INVITATION_SUPERSEDED).
-- 3. Removing MFA (factor or backup codes) needs a session that proved a second factor.
-- 4. Only an owner can reactivate a suspended owner.
-- 5. Signup/rate-limit internals are service-role only.

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(token_hash_input text)
 RETURNS organization_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.organization_invitations;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select case when email_verified_at is not null then email end into actor_email from public.users where id = actor;

  select * into invitation from public.organization_invitations where token_hash = token_hash_input for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  -- An invitation never changes an existing membership: an active member's role changes only
  -- through change_member_role (owner-only), and a suspension or removal made after this
  -- invitation was sent is never undone by accepting it.
  if exists (select 1 from public.organization_members m
             where m.organization_id = invitation.organization_id and m.user_id = actor
               and (m.status = 'active' or greatest(m.suspended_at, m.removed_at) >= invitation.created_at)) then
    raise exception 'INVITATION_SUPERSEDED: you are already a member of this organization, or were removed after this invitation was sent' using errcode = '42501';
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
$function$
;


CREATE OR REPLACE FUNCTION public.accept_organization_invitation_by_id(invitation_id uuid)
 RETURNS organization_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.organization_invitations;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select case when email_verified_at is not null then email end into actor_email from public.users where id = actor;

  select * into invitation from public.organization_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  -- An invitation never changes an existing membership: an active member's role changes only
  -- through change_member_role (owner-only), and a suspension or removal made after this
  -- invitation was sent is never undone by accepting it.
  if exists (select 1 from public.organization_members m
             where m.organization_id = invitation.organization_id and m.user_id = actor
               and (m.status = 'active' or greatest(m.suspended_at, m.removed_at) >= invitation.created_at)) then
    raise exception 'INVITATION_SUPERSEDED: you are already a member of this organization, or were removed after this invitation was sent' using errcode = '42501';
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
$function$
;


CREATE OR REPLACE FUNCTION public.accept_program_invitation(token_hash_input text)
 RETURNS program_researchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
  actor_suspended boolean;
  invitation public.program_invitations;
  program public.programs;
  participation public.program_researchers;
  existing public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select is_suspended, case when email_verified_at is not null then email end into actor_suspended, actor_email from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot accept a program invitation right now' using errcode = '42501';
  end if;

  select * into invitation from public.program_invitations where token_hash = token_hash_input for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  select * into program from public.programs where id = invitation.program_id;
  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can join' using errcode = '42501';
  end if;

  -- An invitation sent before this researcher was suspended or revoked must not undo that.
  select * into existing from public.program_researchers where program_id = invitation.program_id and user_id = actor;
  if existing.status in ('suspended', 'revoked') and greatest(existing.suspended_at, existing.revoked_at) >= invitation.created_at then
    raise exception 'INVITATION_SUPERSEDED: you were removed from this program after this invitation was sent' using errcode = '42501';
  end if;

  insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by, joined_at, updated_at)
  values (invitation.program_id, invitation.organization_id, actor, 'active', 'invitation', invitation.invited_by, now(), now())
  on conflict (program_id, user_id) do update
    set status = 'active', joined_at = now(), suspended_at = null, suspended_by = null, revoked_at = null, revoked_by = null, updated_at = now()
  returning * into participation;

  update public.program_invitations set accepted_at = now(), accepted_by = actor, updated_at = now() where id = invitation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'researcher.invitation_accepted', 'program_researcher', actor,
    jsonb_build_object('program_id', invitation.program_id, 'invitation_id', invitation.id));

  return participation;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.accept_program_invitation_by_id(invitation_id uuid)
 RETURNS program_researchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
  actor_suspended boolean;
  invitation public.program_invitations;
  program public.programs;
  participation public.program_researchers;
  existing public.program_researchers;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select is_suspended, case when email_verified_at is not null then email end into actor_suspended, actor_email from public.users where id = actor;
  if coalesce(actor_suspended, true) then
    raise exception 'FORBIDDEN: your account cannot accept a program invitation right now' using errcode = '42501';
  end if;

  select * into invitation from public.program_invitations where id = invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND: invitation not found' using errcode = 'P0002'; end if;
  if invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED: invitation was revoked' using errcode = '22023'; end if;
  if invitation.accepted_at is not null then raise exception 'INVITATION_ALREADY_ACCEPTED: invitation already accepted' using errcode = '22023'; end if;
  if invitation.expires_at < now() then raise exception 'INVITATION_EXPIRED: invitation has expired' using errcode = '22023'; end if;
  if actor_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address' using errcode = '22023';
  end if;

  select * into program from public.programs where id = invitation.program_id;
  if program.requires_kyc and not private.researcher_has_verified_kyc(actor) then
    raise exception 'KYC_REQUIRED: this program requires identity verification before you can join' using errcode = '42501';
  end if;

  -- An invitation sent before this researcher was suspended or revoked must not undo that.
  select * into existing from public.program_researchers where program_id = invitation.program_id and user_id = actor;
  if existing.status in ('suspended', 'revoked') and greatest(existing.suspended_at, existing.revoked_at) >= invitation.created_at then
    raise exception 'INVITATION_SUPERSEDED: you were removed from this program after this invitation was sent' using errcode = '42501';
  end if;

  insert into public.program_researchers (program_id, organization_id, user_id, status, source, invited_by, joined_at, updated_at)
  values (invitation.program_id, invitation.organization_id, actor, 'active', 'invitation', invitation.invited_by, now(), now())
  on conflict (program_id, user_id) do update
    set status = 'active', joined_at = now(), suspended_at = null, suspended_by = null, revoked_at = null, revoked_by = null, updated_at = now()
  returning * into participation;

  update public.program_invitations set accepted_at = now(), accepted_by = actor, updated_at = now() where id = invitation.id;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, invitation.organization_id, 'researcher.invitation_accepted', 'program_researcher', actor,
    jsonb_build_object('program_id', invitation.program_id, 'invitation_id', invitation.id));

  return participation;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.list_my_pending_invitations()
 RETURNS TABLE(id uuid, organization_id uuid, organization_name text, role organization_member_role, invited_by_name text, expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select case when users.email_verified_at is not null then users.email end into actor_email from public.users where users.id = actor;
  if actor_email is null then return; end if;

  return query
    select i.id, i.organization_id, o.name, i.role, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), i.expires_at, i.created_at
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
    left join public.users u on u.id = i.invited_by
    where i.email = actor_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.list_my_pending_program_invitations()
 RETURNS TABLE(id uuid, program_id uuid, program_name text, organization_name text, invited_by_name text, expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select case when users.email_verified_at is not null then users.email end into actor_email from public.users where users.id = actor;
  if actor_email is null then return; end if;

  return query
    select i.id, i.program_id, p.name, o.name, (case when u.deactivated_at is null then u.display_name else 'Deactivated account' end), i.expires_at, i.created_at
    from public.program_invitations i
    join public.programs p on p.id = i.program_id
    join public.organizations o on o.id = i.organization_id
    left join public.users u on u.id = i.invited_by
    where i.email = actor_email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.unenroll_my_mfa_factor()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Removing a second factor takes a session that proved one (aal2 or a redeemed backup code).
  if not exists (select 1 from public.sessions s
                 where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = actor
                   and (s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = actor))) then
    raise exception 'STRONG_AUTH_REQUIRED: verify your one-time code before removing two-factor authentication' using errcode = '42501';
  end if;
  delete from public.mfa_factors where user_id = actor;
  delete from public.mfa_challenges where user_id = actor;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.clear_my_mfa_backup_codes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  -- Removing a second factor takes a session that proved one (aal2 or a redeemed backup code).
  if not exists (select 1 from public.sessions s
                 where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = actor
                   and (s.aal = 'aal2' or exists (select 1 from public.mfa_verified_sessions v where v.session_id = s.id and v.user_id = actor))) then
    raise exception 'STRONG_AUTH_REQUIRED: verify your one-time code before removing two-factor authentication' using errcode = '42501';
  end if;
  delete from public.mfa_backup_codes where user_id = actor;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.reactivate_member(target_org_id uuid, target_user_id uuid)
 RETURNS organization_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_membership public.organization_members;
  target_membership public.organization_members;
  membership public.organization_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into actor_membership from public.organization_members
    where organization_id = target_org_id and user_id = actor and status = 'active';
  if actor_membership.user_id is null or actor_membership.role not in ('owner', 'security_admin') then
    raise exception 'FORBIDDEN: actor cannot reactivate members in this organization' using errcode = '42501';
  end if;

  select * into target_membership from public.organization_members
    where organization_id = target_org_id and user_id = target_user_id for update;
  if target_membership.user_id is null or target_membership.status <> 'suspended' then
    raise exception 'MEMBER_NOT_SUSPENDED: member is not currently suspended' using errcode = 'P0002';
  end if;
  if target_membership.role = 'owner' and actor_membership.role <> 'owner' then
    raise exception 'FORBIDDEN: only an owner can reactivate an owner' using errcode = '42501';
  end if;

  update public.organization_members set status = 'active', suspended_at = null, updated_at = now()
    where organization_id = target_org_id and user_id = target_user_id
    returning * into membership;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.reactivated', 'organization_member', target_user_id, '{}'::jsonb);

  return membership;
end;
$function$
;


revoke execute on function public.create_user(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_user(text, text, text, text) to service_role;
revoke execute on function public.check_sign_in_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_sign_in_rate_limit(text) to service_role;

-- From 202610140004 (applied before these edits): amounts in the error rounded to cents,
-- and the seed's service-role grant on deposits.
create or replace function private.guard_obligation_balance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  remaining bigint;
begin
  if not new.funded_from_balance then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('org_balance:' || new.organization_id || ':' || new.currency, 0));
  select b.available into remaining from private.organization_balance(new.organization_id) b where b.currency = new.currency;
  if coalesce(remaining, 0) < new.amount_minor_units + new.platform_fee_minor_units then
    raise exception 'INSUFFICIENT_BALANCE: this award needs % % (bounty + fee) but the % balance has % available -- add funds first',
      new.currency, round((new.amount_minor_units + new.platform_fee_minor_units) / 100.0, 2), new.currency, round(coalesce(remaining, 0) / 100.0, 2)
      using errcode = '23514';
  end if;
  return new;
end;
$$;
grant select, insert on public.organization_deposits to service_role;

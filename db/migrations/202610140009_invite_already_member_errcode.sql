-- 202610140008's ALREADY_MEMBER used errcode 23505, which this function's own
-- `when unique_violation` handler rewrote to INVITATION_PENDING. Same check, distinct code.

CREATE OR REPLACE FUNCTION public.invite_organization_member(target_org_id uuid, invitee_email text, invitee_role organization_member_role, invite_message text, token_hash_input text, expires_in_hours integer DEFAULT 168)
 RETURNS organization_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  normalized_email text := lower(trim(invitee_email));
  new_invitation public.organization_invitations;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot invite members to this organization' using errcode = '42501';
  end if;
  if invitee_role = 'owner' and not private.has_org_role(target_org_id, array['owner']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner can invite another owner' using errcode = '42501';
  end if;

  if not private.organization_is_operable(target_org_id) then
    raise exception 'ORGANIZATION_SUSPENDED: this organization is currently suspended and cannot invite members' using errcode = '42501';
  end if;

  if not private.check_and_consume_rate_limit('org_invite:' || actor::text, 20, 3600) then
    raise exception 'RATE_LIMITED: too many invitations sent recently, try again later' using errcode = '53400';
  end if;

  if exists (select 1 from public.organization_members m join public.users u on u.id = m.user_id
             where m.organization_id = target_org_id and m.status = 'active' and u.email = normalized_email) then
    raise exception 'ALREADY_MEMBER: This person is already an active member of your organization. Change their role from Members instead.' using errcode = '23514';
  end if;

  insert into public.organization_invitations (organization_id, email, role, invited_by, token_hash, message, expires_at)
  values (target_org_id, normalized_email, invitee_role, actor, token_hash_input, nullif(invite_message, ''), now() + make_interval(hours => expires_in_hours))
  returning * into new_invitation;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'member.invited', 'organization_invitation', new_invitation.id,
    jsonb_build_object('email', normalized_email, 'role', invitee_role));

  return new_invitation;
exception
  when unique_violation then
    raise exception 'INVITATION_PENDING: an invitation is already pending for this email' using errcode = '23505';
end;
$function$
;

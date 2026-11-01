-- Oct 14 QA fixes.
--
-- 1. Program triagers saw every researcher as "Deactivated account": the users policy for
--    program staff checked program_researchers inside the policy, but triagers can't read
--    that table, so the check was always false. A SECURITY DEFINER helper now answers it,
--    and also covers researchers who submitted to (or collaborated on a report in) a
--    program the viewer administers or triages.
-- 2. Owners and security admins saw a suspended member as "Unknown member": co-member
--    visibility required both sides to be active. Org admins now see their organization's
--    suspended and removed members too (others still see only active co-members).
-- 3. Inviting someone who is already an active member is refused (ALREADY_MEMBER).

create or replace function private.is_researcher_in_my_programs(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.program_researchers r
    where r.user_id = target_user_id
      and (private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(r.program_id))
  ) or exists (
    select 1 from public.reports rep
    where rep.researcher_id = target_user_id
      and (private.has_org_role(rep.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(rep.program_id))
  ) or exists (
    select 1 from public.report_collaborators c join public.reports rep on rep.id = c.report_id
    where c.researcher_id = target_user_id
      and (private.has_org_role(rep.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_triager(rep.program_id))
  );
$$;
revoke all on function private.is_researcher_in_my_programs(uuid) from public, anon;
grant execute on function private.is_researcher_in_my_programs(uuid) to authenticated;

drop policy "users read by managers of a program the user participates in" on public.users;
create policy "users read by managers of a program the user participates in" on public.users for select to authenticated
  using (deactivated_at is null and private.is_researcher_in_my_programs(id));

create or replace function private.shares_organization_with(target_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
begin
  return exists (
    select 1 from public.organization_members m1
    join public.organization_members m2 on m1.organization_id = m2.organization_id
    where m1.user_id = target_user_id and m2.user_id = auth.uid() and m2.status = 'active'
      and (m1.status = 'active' or m2.role in ('owner', 'security_admin'))
  );
end;
$function$;

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
    raise exception 'ALREADY_MEMBER: This person is already an active member of your organization. Change their role from Members instead.' using errcode = '23505';
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

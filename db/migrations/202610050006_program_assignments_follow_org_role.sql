-- Audit ORG-1 + NTF-3 (P1). program_members.role is set from the org role at assignment time
-- only (assign_program_member, create_program's creator row). change_member_role,
-- suspend_member and remove_member never touch it, and accept_organization_invitation
-- re-activates a membership in place. So a Program Manager demoted to Billing Admin, or
-- removed and later re-invited as a Triager, kept 'manager' on every assigned program
-- (lifecycle, scope, finalize_bounty) -- and resolve_report_organization_recipients /
-- can_currently_read_report kept emailing them report titles.
--
-- One trigger on organization_members keeps assignments consistent with the current org
-- role, for every write path:
--   * not active (suspended/removed) or billing_admin -> assignments deleted
--   * triager -> any 'manager' assignment downgraded to 'triager'
--   * owner / security_admin / program_manager -> unchanged (owners and security admins
--     already have org-wide authority; a program manager's assignments are what they were)
-- Assignments removed on suspension are not restored on reactivation -- re-assign explicitly.

create or replace function private.sync_program_assignments_to_org_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.program_members where organization_id = old.organization_id and user_id = old.user_id;
    return old;
  end if;

  if new.status <> 'active' or new.role = 'billing_admin' then
    delete from public.program_members where organization_id = new.organization_id and user_id = new.user_id;
  elsif new.role = 'triager' then
    update public.program_members set role = 'triager'
      where organization_id = new.organization_id and user_id = new.user_id and role = 'manager';
  end if;
  return new;
end;
$$;

revoke all on function private.sync_program_assignments_to_org_role() from public;

drop trigger if exists organization_members_sync_program_assignments on public.organization_members;
create trigger organization_members_sync_program_assignments
  after update of role, status on public.organization_members
  for each row
  when (old.role is distinct from new.role or old.status is distinct from new.status)
  execute function private.sync_program_assignments_to_org_role();

drop trigger if exists organization_members_delete_program_assignments on public.organization_members;
create trigger organization_members_delete_program_assignments
  after delete on public.organization_members
  for each row execute function private.sync_program_assignments_to_org_role();

-- Backfill: bring any assignment already out of line with the current org role into line.
delete from public.program_members pm
using public.organization_members om
where om.organization_id = pm.organization_id and om.user_id = pm.user_id
  and (om.status <> 'active' or om.role = 'billing_admin');

update public.program_members pm set role = 'triager'
from public.organization_members om
where om.organization_id = pm.organization_id and om.user_id = pm.user_id
  and om.role = 'triager' and pm.role = 'manager';

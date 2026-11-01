-- Organization staff cannot research their own organization's programs (2026-09-28).
--
-- Found by the UI sweep: an organization's Billing Admin was offered "Start researching" on
-- the organization's own public program, joined it, and could then have submitted reports
-- -- and, as billing admin, paid the bounty to themselves. join_public_program and
-- submit_report only check that the actor is an authorized researcher, never that they are
-- not staff of the organization that owns the program.
--
-- Enforced on the rows every path writes, not by re-copying those large function bodies
-- (same approach as 202609250003's reports_block_suspended_program): one trigger stops
-- anyone becoming, or being re-activated as, a researcher on their own organization's
-- program (public join, invitation acceptance, any future path); another stops them
-- submitting a report to it.
--
-- "Staff" = an organization_members row that is active or suspended: a suspended member is
-- still staff, a removed one is not. Existing rows are untouched -- a researcher who later
-- joined the organization keeps their history, but cannot submit new reports to it while
-- they are staff.

create or replace function private.is_organization_staff(target_org_id uuid, person uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org_id and m.user_id = person and m.status in ('active', 'suspended')
  );
$$;

revoke all on function private.is_organization_staff(uuid, uuid) from public;

create or replace function private.block_own_staff_as_program_researcher()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and private.is_organization_staff(new.organization_id, new.user_id) then
    raise exception 'FORBIDDEN: Members of this organization cannot research its programs.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists program_researchers_block_own_staff on public.program_researchers;
create trigger program_researchers_block_own_staff
  before insert or update of status on public.program_researchers
  for each row execute function private.block_own_staff_as_program_researcher();

create or replace function private.block_reports_from_own_staff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_organization_staff(new.organization_id, new.researcher_id) then
    raise exception 'FORBIDDEN: Members of this organization cannot submit reports to its programs.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_block_own_staff on public.reports;
create trigger reports_block_own_staff
  before insert on public.reports
  for each row execute function private.block_reports_from_own_staff();

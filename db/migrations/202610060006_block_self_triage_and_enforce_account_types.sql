-- P0 from the 2026-10-06 audit (live-verified): a researcher who submitted to org A could
-- accept an invitation to A's staff and then start_triage / set_report_severity('critical')
-- on their own report, and read A's internal notes on it. Two independent fixes:
--
-- (1) Every triage action goes through private.lock_and_authorize_report_for_triage. It now
--     calls private.forbid_self_dealing, so the report's own researcher or a collaborator is
--     refused for triage, severity and every other action routed through it -- not only
--     accept/resolve and payments (202610060001).
-- (2) The two sides of the platform are kept apart at the table level, closing the path that
--     made (1) reachable and matching the product rule that researcher and organization
--     accounts are separate:
--       * an organization membership can only become active for an organization account
--         that is neither suspended nor deactivated;
--       * a program participation can only become active for a researcher account.
--     Existing rows are untouched; only new or re-activated rows are checked.

create or replace function private.lock_and_authorize_report_for_triage(target_report_id uuid)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  report public.reports;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into report from public.reports where id = target_report_id for update;
  if report.id is null then raise exception 'REPORT_NOT_FOUND: report not found' using errcode = 'P0002'; end if;
  if not (
    private.has_org_role(report.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_triager(report.program_id)
  ) then
    raise exception 'FORBIDDEN: actor cannot triage this report' using errcode = '42501';
  end if;
  perform private.forbid_self_dealing(report.id);
  return report;
end;
$$;

create or replace function private.require_organization_account_for_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not exists (
      select 1 from public.users u
      where u.id = new.user_id and u.account_type = 'organization' and not u.is_suspended and u.deactivated_at is null
    ) then
      raise exception 'ACCOUNT_TYPE_MISMATCH: only an active organization account can join an organization''s team -- researcher accounts cannot' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.require_researcher_account_for_participation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not exists (select 1 from public.users u where u.id = new.user_id and u.account_type = 'researcher') then
      raise exception 'ACCOUNT_TYPE_MISMATCH: only a researcher account can join a program -- organization accounts cannot' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.require_organization_account_for_membership() from public;
revoke all on function private.require_researcher_account_for_participation() from public;

drop trigger if exists organization_members_require_organization_account on public.organization_members;
create trigger organization_members_require_organization_account
  before insert or update of status on public.organization_members
  for each row execute function private.require_organization_account_for_membership();

drop trigger if exists program_researchers_require_researcher_account on public.program_researchers;
create trigger program_researchers_require_researcher_account
  before insert or update of status on public.program_researchers
  for each row execute function private.require_researcher_account_for_participation();

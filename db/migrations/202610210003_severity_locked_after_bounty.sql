-- Severity locked once the bounty is finalized. set_report_severity refused changes only on a
-- terminal status (duplicate / informative / not_applicable / rejected). accepted and resolved
-- are not terminal (a resolved report can reopen), so after a bounty was finalized -- and paid
-- -- the organization could still change the confirmed severity or CVSS vector, leaving the
-- record saying "low" for a payout made as "high". The bounty is computed from the severity,
-- so once that money decision is final the severity is part of it.
--
-- A trigger on the table, not another copy of set_report_severity: every path that writes
-- these columns is covered, and no function body is copied forward.
create or replace function private.reports_lock_severity_after_bounty()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.confirmed_severity, new.cvss_attack_vector, new.cvss_attack_complexity, new.cvss_privileges_required, new.cvss_user_interaction,
      new.cvss_scope, new.cvss_confidentiality_impact, new.cvss_integrity_impact, new.cvss_availability_impact)
     is distinct from
     (old.confirmed_severity, old.cvss_attack_vector, old.cvss_attack_complexity, old.cvss_privileges_required, old.cvss_user_interaction,
      old.cvss_scope, old.cvss_confidentiality_impact, old.cvss_integrity_impact, old.cvss_availability_impact)
     and exists (select 1 from public.report_bounty_decisions d where d.report_id = new.id and d.state = 'finalized') then
    raise exception 'SEVERITY_LOCKED: the bounty for this report is finalized, so its severity can no longer be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.reports_lock_severity_after_bounty() from public, anon;
grant execute on function private.reports_lock_severity_after_bounty() to service_role;

create trigger reports_lock_severity_after_bounty before update of confirmed_severity, cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required,
  cvss_user_interaction, cvss_scope, cvss_confidentiality_impact, cvss_integrity_impact, cvss_availability_impact on public.reports
  for each row execute function private.reports_lock_severity_after_bounty();

-- 202610060008's bounty_acceptances read policy called private.can_currently_read_report,
-- which signed-in users cannot execute: any researcher or staff read of the table failed
-- with "permission denied for function", crashing the report page (found by
-- e2e/payouts.spec.ts). Read access now defers to the reports table's own RLS -- whoever
-- can see the report sees its award confirmations.
drop policy "bounty acceptances read by anyone who can read the report" on public.bounty_acceptances;
create policy "bounty acceptances read with the report" on public.bounty_acceptances
  for select to authenticated using (exists (select 1 from public.reports r where r.id = report_id));

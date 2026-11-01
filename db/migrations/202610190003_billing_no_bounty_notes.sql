-- Audit P2: billing admins never read report content, but the report_bounty_decisions read
-- policy included billing_admin, so a billing admin could read finalization_note -- free text a
-- triager writes about the report. No billing surface reads this table (the Payments ledger
-- goes through list_payment_obligations_for_billing, SECURITY DEFINER), so billing_admin is
-- simply removed: researchers (their own reports), owners, security admins and program staff
-- keep reading it exactly as before.
drop policy "report bounty decisions read by researcher, org admins, or prog" on public.report_bounty_decisions;
create policy "report bounty decisions read by researcher, org admins, or program staff" on public.report_bounty_decisions
  for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_bounty_decisions.report_id and r.researcher_id = auth.uid())
    or private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[])
    or private.is_program_triager(program_id)
  );

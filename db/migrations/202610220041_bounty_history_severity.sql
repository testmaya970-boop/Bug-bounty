-- 202610220040 read reports.severity; the column is confirmed_severity.
create or replace function public.list_organization_bounty_history(p_organization_id uuid, p_from date, p_to date)
returns table (obligation_id uuid, awarded_at timestamptz, paid_at timestamptz, status text, program_name text, report_id uuid, report_title text,
  researcher_name text, severity text, currency text, bounty_minor_units bigint, fee_minor_units bigint, invoice_number text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.has_org_role(p_organization_id, array['owner', 'security_admin', 'billing_admin']::public.organization_member_role[]) or private.is_platform_admin()) then
    raise exception 'FORBIDDEN: only an owner, security admin or billing admin can view bounty history' using errcode = '42501';
  end if;
  if p_to < p_from then raise exception 'INVALID_PERIOD: the end date is before the start date' using errcode = '22023'; end if;
  return query
  select o.id, o.created_at,
    (select max(a.completed_at) from public.payment_attempts a where a.payment_obligation_id = o.id and a.state = 'succeeded'),
    o.status, p.name, o.report_id, r.title, u.display_name, r.confirmed_severity::text, o.currency, o.amount_minor_units, o.platform_fee_minor_units,
    (select i.number from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where l.obligation_id = o.id)
  from public.payment_obligations o
  left join public.programs p on p.id = o.program_id
  left join public.reports r on r.id = o.report_id
  left join public.users u on u.id = o.researcher_id
  where o.organization_id = p_organization_id
    and o.created_at >= p_from::timestamp at time zone 'UTC' and o.created_at < (p_to + 1)::timestamp at time zone 'UTC'
  order by o.created_at desc;
end;
$$;
revoke all on function public.list_organization_bounty_history(uuid, date, date) from public, anon;
grant execute on function public.list_organization_bounty_history(uuid, date, date) to authenticated;

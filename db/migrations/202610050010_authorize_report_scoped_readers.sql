-- Audit TEN-3 (P1). list_report_mediations, list_report_retests and list_report_collaborators
-- are SECURITY DEFINER (they bypass RLS) and filtered only by report_id, granted to
-- `authenticated`. The only protection was the report page calling getReport first, so
-- anyone holding a report UUID through any other call path -- a removed staff member, a
-- revoked researcher, a collaborator reading mediation notes the report_mediations RLS
-- policy denies them -- got the rows.
--
-- Each now applies the same report-level rule as its table's own RLS policy and returns no
-- rows (like RLS) when the caller doesn't meet it:
--   mediations, retests: the submitting researcher, an org owner/security admin, or a
--     program triager/manager.
--   collaborators: the same, plus the report's collaborators (they already see the report).

create or replace function public.list_report_mediations(target_report_id uuid)
returns setof public.report_mediations
language sql stable security definer set search_path = ''
as $$
  select m.* from public.report_mediations m
  where m.report_id = target_report_id
    and exists (
      select 1 from public.reports r
      where r.id = target_report_id
        and (r.researcher_id = auth.uid()
          or private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_triager(r.program_id))
    )
  order by m.opened_at desc;
$$;

create or replace function public.list_report_retests(target_report_id uuid)
returns setof public.report_retests
language sql stable security definer set search_path = ''
as $$
  select t.* from public.report_retests t
  where t.report_id = target_report_id
    and exists (
      select 1 from public.reports r
      where r.id = target_report_id
        and (r.researcher_id = auth.uid()
          or private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_triager(r.program_id))
    )
  order by t.requested_at desc;
$$;

create or replace function public.list_report_collaborators(target_report_id uuid)
returns table (id uuid, researcher_id uuid, display_name text, public_username text, bounty_split_percent numeric, added_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.researcher_id, u.display_name, u.public_username, c.bounty_split_percent, c.added_at
  from public.report_collaborators c
  join public.users u on u.id = c.researcher_id
  where c.report_id = target_report_id
    and exists (
      select 1 from public.reports r
      where r.id = target_report_id
        and (r.researcher_id = auth.uid()
          or private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
          or private.is_program_triager(r.program_id)
          or private.is_report_collaborator(r.id))
    )
  order by c.added_at asc;
$$;

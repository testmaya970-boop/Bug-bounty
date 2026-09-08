-- The second real /api/v1/* endpoint (GET /api/v1/reports/:id), the natural next one
-- after the list endpoint 202609030003 shipped -- see docs/decisions/0075's own finding
-- that the researcher API surface is 1 of ~20 representative endpoints, and app/api/v1/
-- reports/route.ts's own comment ("Nineteen more endpoints are explicitly NOT built").
-- This adds exactly one more, honestly scoped, rather than inventing the rest
-- speculatively -- report detail is the one every consumer of the list endpoint would
-- need next.
--
-- Same SECURITY INVOKER + service_role-only shape as list_reports_for_actor
-- (202609030003) for the identical reason: a bearer-token API call has no cookie session,
-- so auth.uid() is null and every ordinary SECURITY DEFINER RPC is unusable for it. This
-- is not a general-purpose "read any report" RPC -- p_actor_id is fed only by
-- lib/api-auth.ts's resolveBearerUserId (itself fed only a hash-verified token), and the
-- WHERE clause below still requires that actor to be the report's OWN submitting
-- researcher -- a bearer token never grants access to a report the token's own owner
-- didn't submit, matching the RLS boundary a cookie-authenticated researcher already has.

create or replace function public.get_report_for_actor(p_actor_id uuid, p_report_id uuid)
returns table (
  id uuid,
  program_id uuid,
  organization_id uuid,
  program_name text,
  organization_name text,
  title text,
  description text,
  display_target text,
  status public.report_status,
  confirmed_severity public.report_severity,
  weakness_type public.report_weakness_type,
  impact text,
  submitted_at timestamptz,
  updated_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_actor_id is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select r.id, r.program_id, r.organization_id, p.name, o.name, r.title, r.description, r.display_target, r.status, r.confirmed_severity, r.weakness_type, r.impact, r.submitted_at, r.updated_at
    from public.reports r
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where r.id = p_report_id and r.researcher_id = p_actor_id;
end;
$$;

revoke all on function public.get_report_for_actor(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_report_for_actor(uuid, uuid) to service_role;

-- Bearer-token API authentication: the missing half of docs/decisions/0055's personal
-- access tokens. verify_api_token already resolves a real token hash to its owning user
-- id (service-callable, no auth.uid() dependency), but no downstream read RPC could be
-- called on that resolved user's behalf -- every existing "list my X" RPC is SECURITY
-- DEFINER against auth.uid(), which is null for a service-role-authenticated request (a
-- bearer-token API call has no cookie session; there is no way to "become" a user via a
-- service-role key at the Postgres level). See app/api/v1/reports/route.ts's own prior
-- comment disclosing this exact gap.
--
-- Design decision: list_reports_for_actor is NOT a general-purpose "read any user's
-- reports" RPC -- it is SECURITY INVOKER (not DEFINER) and callable only by service_role,
-- never anon/authenticated. The caller (lib/api-auth.ts's resolveBearerUserId, itself
-- fed only a hash-verified token) is the only thing that may ever choose the actor
-- parameter; nothing client-supplied reaches it. This mirrors service-role's own existing
-- narrow use in this codebase (lib/evidence-store.ts's storageClient, for Storage
-- access) rather than inventing a new authorization model.

create or replace function public.list_reports_for_actor(
  p_actor_id uuid,
  p_limit integer default 20,
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  organization_id uuid,
  program_name text,
  organization_name text,
  title text,
  display_target text,
  status public.report_status,
  submitted_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
declare
  effective_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if p_actor_id is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
    select r.id, r.program_id, r.organization_id, p.name, o.name, r.title, r.display_target, r.status, r.submitted_at
    from public.reports r
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where r.researcher_id = p_actor_id
      and (
        p_before_submitted_at is null
        or (r.submitted_at, r.id) < (p_before_submitted_at, p_before_id)
      )
    order by r.submitted_at desc, r.id desc
    limit effective_limit;
end;
$$;

-- SECURITY INVOKER + service_role-only grant is the actual enforcement: this function
-- runs as whatever role calls it, and only service_role holds table-level select on
-- public.reports without RLS restricting it (service_role bypasses RLS entirely, by
-- Postgres/Supabase convention -- the same reason lib/evidence-store.ts's storageClient
-- is safe). anon/authenticated are explicitly never granted execute here, unlike every
-- SECURITY DEFINER RPC elsewhere in this schema -- this one row is deliberately the one
-- exception to that pattern, not a template for future RPCs.
revoke all on function public.list_reports_for_actor(uuid, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.list_reports_for_actor(uuid, integer, timestamptz, uuid) to service_role;

-- API surface expansion: report status counts, report evidence, report messages, and CTF
-- solves, each for a bearer-token-authenticated actor. Same SECURITY INVOKER +
-- service_role-only shape as list_reports_for_actor/get_report_for_actor
-- (202609030003/202609050007), for the identical reason: a bearer-token request has no
-- cookie session, so auth.uid() is null and every ordinary SECURITY DEFINER "get my X" RPC
-- is unusable for it.
--
-- report_evidence/report_messages specifically: these two tables' existing RLS policies
-- key off auth.uid() (researcher_visible rows readable by the report's own researcher, or
-- an org admin/program member) -- service_role BYPASSES RLS entirely, so a naive
-- "just query the table with the service-role client" sibling would leak internal
-- (organization-only) evidence/messages to any bearer-authenticated researcher. Both new
-- RPCs below hardcode `visibility = 'researcher_visible'` in their own WHERE clause and
-- independently require `researcher_id = p_actor_id` -- never trusting RLS to do either
-- job under a role that ignores RLS.

create or replace function public.get_report_status_counts_for_actor(p_actor_id uuid)
returns table (status public.report_status, count bigint)
language sql stable security invoker set search_path = ''
as $$
  select r.status, count(*)
  from public.reports r
  where p_actor_id is not null and r.researcher_id = p_actor_id
  group by r.status;
$$;

revoke all on function public.get_report_status_counts_for_actor(uuid) from public, anon, authenticated;
grant execute on function public.get_report_status_counts_for_actor(uuid) to service_role;

create or replace function public.list_report_evidence_for_actor(p_actor_id uuid, p_report_id uuid)
returns table (
  id uuid,
  evidence_type public.report_evidence_type,
  content text,
  object_key text,
  original_filename text,
  content_type text,
  size_bytes bigint,
  sha256 text,
  author_context public.report_author_context,
  created_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select e.id, e.evidence_type, e.content, e.object_key, e.original_filename, e.content_type, e.size_bytes, e.sha256, e.author_context, e.created_at
  from public.report_evidence e
  where p_actor_id is not null
    and e.researcher_id = p_actor_id
    and e.visibility = 'researcher_visible'
    and e.report_id = p_report_id
  order by e.created_at asc;
$$;

revoke all on function public.list_report_evidence_for_actor(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_report_evidence_for_actor(uuid, uuid) to service_role;

create or replace function public.list_report_messages_for_actor(p_actor_id uuid, p_report_id uuid)
returns table (
  id uuid,
  body text,
  author_context public.report_author_context,
  created_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select m.id, m.body, m.author_context, m.created_at
  from public.report_messages m
  where p_actor_id is not null
    and m.researcher_id = p_actor_id
    and m.visibility = 'researcher_visible'
    and m.report_id = p_report_id
  order by m.created_at asc;
$$;

revoke all on function public.list_report_messages_for_actor(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_report_messages_for_actor(uuid, uuid) to service_role;

create or replace function public.list_ctf_solves_for_actor(p_actor_id uuid)
returns table (challenge_id text, points_awarded integer, solved_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select challenge_id, points_awarded, solved_at
  from public.ctf_solves
  where p_actor_id is not null and researcher_id = p_actor_id
  order by solved_at desc;
$$;

revoke all on function public.list_ctf_solves_for_actor(uuid) from public, anon, authenticated;
grant execute on function public.list_ctf_solves_for_actor(uuid) to service_role;

-- What a researcher needs to know before joining a public program (202610220001/0002): open
-- or by request, any track-record requirement, and their own pending request. Public-safe:
-- only for public programs, and only the caller's own request.
create or replace function public.get_program_join_info(target_program_id uuid)
returns table (join_mode text, min_signal numeric, min_valid_reports integer, my_request_id uuid, my_request_status text, my_request_at timestamptz, my_decision_note text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  prog public.programs;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into prog from public.programs p where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused');
  if prog.id is null then return; end if;
  return query
  select prog.join_mode, prog.min_signal, prog.min_valid_reports, r.id, r.status, coalesce(r.decided_at, r.created_at), r.decision_note
  from (select 1) one
  left join lateral (
    select ar.* from public.program_access_requests ar
    where ar.program_id = prog.id and ar.user_id = auth.uid() and ar.status in ('pending', 'declined')
    order by ar.created_at desc limit 1
  ) r on true;
end;
$$;
revoke all on function public.get_program_join_info(uuid) from public, anon;
grant execute on function public.get_program_join_info(uuid) to authenticated;

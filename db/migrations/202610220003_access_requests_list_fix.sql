-- 202610220002: list_program_access_requests had an unqualified "id" that clashed with its
-- own output column ("column reference id is ambiguous"), so the staff list always failed.
create or replace function public.list_program_access_requests(target_program_id uuid)
returns table (id uuid, user_id uuid, display_name text, username text, note text, created_at timestamptz,
               signal numeric, valid_count integer, closed_count integer, tier text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  program public.programs;
begin
  select * into program from public.programs p where p.id = target_program_id;
  if program.id is null or not (private.has_org_role(program.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(target_program_id)) then
    raise exception 'FORBIDDEN: actor cannot manage this program' using errcode = '42501';
  end if;
  return query
  select r.id, r.user_id, u.display_name, coalesce(u.public_username, u.username), r.note, r.created_at, st.signal, st.valid_count, st.closed_count, st.tier
  from public.program_access_requests r
  join public.users u on u.id = r.user_id
  cross join lateral private.submission_standing(r.user_id) st
  where r.program_id = target_program_id and r.status = 'pending'
  order by r.created_at
  limit 200;
end;
$$;
revoke all on function public.list_program_access_requests(uuid) from public, anon;
grant execute on function public.list_program_access_requests(uuid) to authenticated;

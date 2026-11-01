-- Fixes 202610060002: for a signed-out caller auth.uid() is NULL, so
-- `p_researcher_id = auth.uid() or <false>` evaluated to NULL, `if not NULL` did not return,
-- and anonymous callers still got a non-opted-in researcher's badges (caught live).

create or replace function private.researcher_badges_visible(p_researcher_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_researcher_id = auth.uid(), false) or exists (
    select 1 from public.users u
    where u.id = p_researcher_id and u.public_username is not null and u.deactivated_at is null and not u.is_suspended
  );
$$;

revoke all on function private.researcher_badges_visible(uuid) from public;

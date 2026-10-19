-- Platform > Researchers listed suspended accounts with no search, and never listed
-- deactivated accounts at all (reactivating one meant knowing its email). One searchable list
-- of every account an admin can restore: suspended (-> Reinstate) and self-deactivated
-- (-> Reactivate). Accounts a platform admin deleted are left out: the database refuses to
-- reactivate those (reactivate_account_platform_wide), so offering it would be a dead button.
create or replace function public.list_restricted_accounts_for_admin(p_query text default null, p_limit integer default 50)
returns table (id uuid, username text, display_name text, email text, account_type text, state text, since timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
  pattern text;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  if q is not null then
    pattern := '%' || replace(replace(replace(left(q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select u.id, u.username, u.display_name, u.email, u.account_type::text,
    case when u.is_suspended then 'suspended' else 'deactivated' end,
    case when u.is_suspended then u.updated_at else u.deactivated_at end
  from public.users u
  where (u.is_suspended or u.deactivated_at is not null)
    and not exists (select 1 from public.audit_logs a where a.action = 'platform.researcher_deleted' and a.entity_id = u.id)
    and (pattern is null or u.display_name ilike pattern or u.username ilike pattern or u.email ilike pattern)
  order by 7 desc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.list_restricted_accounts_for_admin(text, integer) from public, anon;
grant execute on function public.list_restricted_accounts_for_admin(text, integer) to authenticated;

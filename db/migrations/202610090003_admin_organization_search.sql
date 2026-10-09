-- Organization search for the platform-admin suspend form, which used to need the exact
-- slug typed from memory (same idea as search_accounts_for_admin, 202610090002).
--
-- search_organizations_for_admin(query): platform admins only. Matches the query anywhere
-- in the organization's name, slug, or its creator's email (case-insensitive; % and _ are
-- literal), top 10 -- exact slug matches first. Returns status and the creator's email so
-- the admin can tell look-alike organizations apart before acting.

create or replace function public.search_organizations_for_admin(p_query text)
returns table (id uuid, slug text, name text, status text, owner_email text, member_count integer)
language plpgsql stable security definer set search_path = ''
as $$
declare
  q text := lower(trim(coalesce(p_query, '')));
  pattern text;
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;
  if char_length(q) < 2 then return; end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select o.id, o.slug::text, o.name::text, o.status::text, u.email::text,
      (select count(*)::int from public.organization_members m where m.organization_id = o.id)
    from public.organizations o
    join public.users u on u.id = o.created_by
    where lower(o.name) like pattern or lower(o.slug) like pattern or lower(u.email) like pattern
    order by (lower(o.slug) = q) desc, lower(o.name)
    limit 10;
end;
$$;

revoke all on function public.search_organizations_for_admin(text) from public;
grant execute on function public.search_organizations_for_admin(text) to authenticated;

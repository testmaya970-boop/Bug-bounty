-- Account search for the platform-admin researcher forms (suspend / delete / reactivate),
-- which used to need the exact username typed from memory.
--
-- search_accounts_for_admin(query, only_deactivated): platform admins only. Matches the
-- query anywhere in username, display name or email (case-insensitive; % and _ in the
-- query are literal), researchers only, top 10 -- exact username/email matches first.
-- Returns each account's state so the admin can see who is already suspended or
-- deactivated before acting. Accounts a platform admin deleted are left out: there is
-- nothing left to act on, and their scrubbed rows would only be noise.

create or replace function public.search_accounts_for_admin(p_query text, p_only_deactivated boolean default false)
returns table (id uuid, username text, display_name text, email text, is_suspended boolean, deactivated_at timestamptz)
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
    select u.id, u.username::text, u.display_name::text, u.email::text, u.is_suspended, u.deactivated_at
    from public.users u
    where u.account_type = 'researcher'
      and (lower(u.username) like pattern or lower(u.display_name) like pattern or lower(u.email) like pattern)
      and (not p_only_deactivated or u.deactivated_at is not null)
      and not exists (select 1 from public.audit_logs a where a.action = 'platform.researcher_deleted' and a.entity_id = u.id)
    order by (lower(u.username) = q or lower(u.email) = q) desc, lower(u.username)
    limit 10;
end;
$$;

revoke all on function public.search_accounts_for_admin(text, boolean) from public;
grant execute on function public.search_accounts_for_admin(text, boolean) to authenticated;

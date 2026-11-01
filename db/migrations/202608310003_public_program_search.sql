-- Public Program Search. Design decisions recorded here and expanded in
-- docs/decisions/0042-researcher-product-completion.md.
--
-- 1. 0040/0041 deliberately shipped `list_public_programs()` with no search/filter,
--    reasoning that realistic near-term program volume didn't justify it yet. This
--    migration is the explicit, later decision to build it for real, not a reversal of
--    that reasoning -- the previous slice's caution was about not inventing
--    infrastructure speculatively, not a permanent ban.
-- 2. A different parameter list than the original zero-argument function is a distinct
--    Postgres function by signature -- `create or replace` cannot silently widen it, so
--    the old zero-arg overload is explicitly dropped first, never left dangling
--    alongside the new one.
-- 3. Keyset pagination reuses the exact `encodeCursor`/`decodeCursor` (lib/pagination.ts)
--    convention already established by every other paginated list in this codebase
--    (listReportsForProgram, list_my_reports, etc.) -- a composite (updated_at, id)
--    cursor, not a new pagination scheme.
-- 4. Sort key changes from `created_at` to `updated_at`: a public program registry is
--    more useful ordered by real recent activity (a scope edit, a description update)
--    than by original creation date. A program's own `updated_at` already changes on
--    every one of those real mutations (set_program_visibility, update_program_
--    description, and every lifecycle transition already touch it) -- no new trigger or
--    column needed.
-- 5. Search is a plain `ilike` over `name`/organization `name` -- no trigram/GIN index.
--    The filtered set (visibility='public' and status in ('active','paused')) is small
--    at any realistic near-term volume; a leading-wildcard `ilike` scan over that already-
--    narrow, indexed subset is proportionate. Revisit only if real volume changes this.
-- 6. Status filter is restricted to 'active'/'paused' (the same two values the base
--    predicate already allows) -- passing any other value simply returns nothing, never
--    an error, so this can never become an oracle for whether draft/closed/private
--    programs exist.

drop function if exists public.list_public_programs();

create or replace function public.list_public_programs(
  p_search text default null,
  p_status public.program_status default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  organization_name text,
  status public.program_status,
  description text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  effective_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  trimmed_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  return query
    select p.id, p.organization_id, p.name, o.name, p.status, p.description, p.updated_at
    from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.visibility = 'public'
      and p.status in ('active', 'paused')
      and (p_status is null or p.status = p_status)
      and (trimmed_search is null or p.name ilike '%' || trimmed_search || '%' or o.name ilike '%' || trimmed_search || '%')
      and (
        p_cursor_updated_at is null
        or p.updated_at < p_cursor_updated_at
        or (p.updated_at = p_cursor_updated_at and p.id < p_cursor_id)
      )
    order by p.updated_at desc, p.id desc
    limit effective_limit;
end;
$$;

revoke all on function public.list_public_programs(text, public.program_status, timestamptz, uuid, int) from public;
grant execute on function public.list_public_programs(text, public.program_status, timestamptz, uuid, int) to anon, authenticated;

drop index if exists public.programs_public_listing_idx;
create index programs_public_listing_idx on public.programs(visibility, status, updated_at desc, id desc) where visibility = 'public';

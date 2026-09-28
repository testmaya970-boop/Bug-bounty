-- Widens list_programs_pending_review_for_admin's output (program/engagement type,
-- visibility, KYC, focus areas, active scope count) for /platform/programs' review cards.
--
-- This change was first made by editing 202609050013 in place, which broke building the
-- schema from scratch: that file sorts before 202609070002, where engagement_type is
-- created. 202609050013 is restored to its shipped form and the change lives here instead.
-- A changed return type needs drop + create (create or replace cannot alter it).

drop function if exists public.list_programs_pending_review_for_admin();

create function public.list_programs_pending_review_for_admin()
returns table (
  id uuid,
  name text,
  description text,
  organization_id uuid,
  organization_name text,
  submitted_at timestamptz,
  program_type public.program_type,
  engagement_type public.engagement_type,
  visibility public.program_visibility,
  requires_kyc boolean,
  focus_areas public.researcher_focus_area[],
  scope_entry_count bigint
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.name, p.description, p.organization_id, o.name, p.updated_at,
    p.program_type, p.engagement_type, p.visibility, p.requires_kyc, p.focus_areas,
    (select count(*) from public.program_scope_entries s where s.program_id = p.id and s.status = 'active')
  from public.programs p
  join public.organizations o on o.id = p.organization_id
  where p.status = 'review'
  order by p.updated_at asc;
end;
$$;

revoke all on function public.list_programs_pending_review_for_admin() from public;
grant execute on function public.list_programs_pending_review_for_admin() to authenticated;

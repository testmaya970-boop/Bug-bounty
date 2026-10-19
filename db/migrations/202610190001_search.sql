-- Audit P1-5 (Oct 15 system design audit): search was an ILIKE over public program names in
-- one RPC, with no index. A researcher could not find a private program they were invited to,
-- and nobody could search reports or researchers.
--
-- search_everything(q) is the one permission-aware search across canonical entities:
--   * programs  -- public live programs, plus any program the caller works on (org staff) or
--                  takes part in / is invited to (researchers), the same rules as program RLS
--   * reports   -- reports the caller can triage (owners, security admins, program staff), their
--                  own, and ones they collaborate on
--   * researchers -- only public profiles (a public username, not deactivated or suspended), the
--                  same rule as get_public_researcher_profile
-- Trigram GIN indexes make the substring match indexed instead of a sequential scan.

create extension if not exists pg_trgm with schema extensions;

create index if not exists programs_name_trgm_idx on public.programs using gin (name extensions.gin_trgm_ops);
create index if not exists organizations_name_trgm_idx on public.organizations using gin (name extensions.gin_trgm_ops);
create index if not exists reports_title_trgm_idx on public.reports using gin (title extensions.gin_trgm_ops);
create index if not exists users_display_name_trgm_idx on public.users using gin (display_name extensions.gin_trgm_ops) where public_username is not null;
create index if not exists users_public_username_trgm_idx on public.users using gin (public_username extensions.gin_trgm_ops) where public_username is not null;

create or replace function public.search_everything(p_query text, p_limit integer default 8)
returns table (kind text, id uuid, title text, subtitle text, organization_id uuid, program_id uuid, slug text, status text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q text := trim(coalesce(p_query, ''));
  pattern text;
  per_kind integer := least(greatest(coalesce(p_limit, 8), 1), 25);
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if char_length(q) < 2 then return; end if;
  q := left(q, 100);
  -- The query is data, never a pattern: escape LIKE's wildcards before wrapping it.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  (select 'program'::text, p.id, p.name, o.name, p.organization_id, p.id, null::text, p.status::text
   from public.programs p join public.organizations o on o.id = p.organization_id
   where (p.name ilike pattern or o.name ilike pattern)
     and (
       (p.visibility = 'public' and p.status in ('active', 'paused') and o.status <> 'suspended')
       or private.has_org_role(p.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
       or private.is_program_triager(p.id)
       or private.is_researcher_authorized_for_program(p.id)
       or private.is_invited_researcher_for_program(p.id)
     )
   order by extensions.similarity(p.name, q) desc, p.name
   limit per_kind)
  union all
  (select 'report'::text, r.id, r.title, pr.name, r.organization_id, r.program_id, null::text, r.status::text
   from public.reports r join public.programs pr on pr.id = r.program_id
   where r.title ilike pattern
     and (
       r.researcher_id = actor
       or private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[])
       or private.is_program_triager(r.program_id)
       or private.is_report_collaborator(r.id)
     )
   order by extensions.similarity(r.title, q) desc, r.submitted_at desc nulls last
   limit per_kind)
  union all
  (select 'researcher'::text, u.id, u.display_name, '@' || u.public_username, null::uuid, null::uuid, u.public_username, null::text
   from public.users u
   where u.public_username is not null and u.deactivated_at is null and not u.is_suspended and u.account_type = 'researcher'
     and (u.display_name ilike pattern or u.public_username ilike pattern)
   order by greatest(extensions.similarity(u.display_name, q), extensions.similarity(u.public_username, q)) desc, u.display_name
   limit per_kind);
end;
$$;
revoke all on function public.search_everything(text, integer) from public, anon;
grant execute on function public.search_everything(text, integer) to authenticated;

-- Organization logos, shown on the organization's programs (cards, tables, search, program
-- and organization headers) the way HackerOne and Bugcrowd show a team's logo. Before this the
-- product had no branding upload at all and fell back to a letter monogram everywhere.
--
--   * One small image per organization, stored in the database (no public bucket needed):
--     PNG, JPEG or WebP only, at most 256 KB. The app checks the file's magic bytes before
--     calling set_organization_logo; the checks here are the backstop. SVG is never accepted
--     (it can carry script).
--   * Owners and security admins set or remove it (the same people who edit the description).
--   * Reading goes through the app's logo route with the service role; which logos may be
--     shown is decided there (a logo is as public as the organization's name on its programs).

create table public.organization_logos (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 262144),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.organization_logos enable row level security;
revoke all on public.organization_logos from public, anon, authenticated;
grant select, insert, update, delete on public.organization_logos to service_role;

create or replace function public.set_organization_logo(p_organization_id uuid, p_content_type text, p_bytes bytea)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  stamp timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can change the logo' using errcode = '42501';
  end if;
  if p_content_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'INVALID_LOGO: use a PNG, JPEG or WebP image' using errcode = '22023';
  end if;
  if p_bytes is null or octet_length(p_bytes) = 0 or octet_length(p_bytes) > 262144 then
    raise exception 'INVALID_LOGO: the image must be 256 KB or smaller' using errcode = '22023';
  end if;
  insert into public.organization_logos (organization_id, content_type, bytes, updated_by, updated_at)
  values (p_organization_id, p_content_type, p_bytes, auth.uid(), now())
  on conflict (organization_id) do update set content_type = excluded.content_type, bytes = excluded.bytes, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning updated_at into stamp;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'organization.logo_updated', 'organization', p_organization_id, jsonb_build_object('content_type', p_content_type, 'bytes', octet_length(p_bytes)));
  return stamp;
end;
$$;
revoke all on function public.set_organization_logo(uuid, text, bytea) from public, anon;
grant execute on function public.set_organization_logo(uuid, text, bytea) to authenticated;

create or replace function public.remove_organization_logo(p_organization_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can change the logo' using errcode = '42501';
  end if;
  delete from public.organization_logos where organization_id = p_organization_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'organization.logo_removed', 'organization', p_organization_id, '{}'::jsonb);
end;
$$;
revoke all on function public.remove_organization_logo(uuid) from public, anon;
grant execute on function public.remove_organization_logo(uuid) to authenticated;

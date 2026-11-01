-- Scope ownership: an organization can no longer authorize testing of assets it doesn't own.
--
-- The hole: since 202609230001 an owner/security admin can add any target as in-scope (on a live
-- program too), and the scope matcher immediately treats it as authorized, so researchers could
-- be sent to attack a third party's domain. Now every in-scope entry carries a CLEARANCE, set by a
-- trigger (so add_scope_entry, update_scope_entry, the CSV import and anything later are all
-- covered), and only cleared entries authorize anything:
--
--   domain / url   verified     the host is (a subdomain of) a domain the organization proved it
--                               controls with a DNS TXT record (organization_domains). Only the
--                               server can mark a domain verified, after it performed the lookup.
--                  not_required RFC 2606/6761 reserved names (.example .test .invalid .localhost,
--                               example.com/.net/.org): nobody owns them, so no third party exists.
--                  pending_verification otherwise.
--   other types    pending_review until a platform admin approves (DNS can't prove ownership of an
--                  IP range, app listing, repository, device or model); approved / rejected.
--   out_of_scope   not_required: an exclusion never authorizes anything.
--
-- Uncleared entries are invisible to researchers (restrictive RLS), never matched by
-- private.match_program_scope (so no report can be filed against them), left out of the public
-- scope list, and a program cannot enter review or go live without at least one cleared
-- in-scope asset. Existing entries are re-evaluated below by the same rules.

create type public.scope_clearance as enum ('not_required', 'verified', 'pending_verification', 'pending_review', 'approved', 'rejected');

-- 1. Organization domains --------------------------------------------------------------------------
create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' and char_length(domain) <= 253),
  token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'verified')),
  verified_at timestamptz,
  last_checked_at timestamptz,
  last_check_error text check (char_length(last_check_error) <= 300),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, domain)
);
alter table public.organization_domains enable row level security;
create policy "org domains readable by the organization's active members" on public.organization_domains for select to authenticated
  using (exists (select 1 from public.organization_members om where om.organization_id = organization_domains.organization_id and om.user_id = auth.uid() and om.status = 'active'));
grant select on public.organization_domains to authenticated;
grant select, insert, update, delete on public.organization_domains to service_role;

-- 2. Clearance on scope entries --------------------------------------------------------------------
alter table public.program_scope_entries
  add column if not exists clearance public.scope_clearance not null default 'pending_review',
  add column if not exists clearance_reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists clearance_reviewed_at timestamptz,
  add column if not exists clearance_note text check (char_length(clearance_note) <= 500);

create or replace function private.is_reserved_test_host(p_host text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_host ~ '(^|\.)(example|test|invalid|localhost)$' or p_host ~ '(^|\.)example\.(com|net|org)$';
$$;

/** The host a domain/url entry authorizes: a wildcard's base, or a URL origin's hostname. */
create or replace function private.scope_entry_host(p_asset_type public.program_asset_type, p_target text, p_url_origin text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_asset_type = 'domain' then lower(regexp_replace(p_target, '^\*\.', ''))
    when p_asset_type = 'url' then lower(substring(coalesce(p_url_origin, p_target) from '^[a-z][a-z0-9+.-]*://([^/:]+)'))
  end;
$$;

create or replace function private.compute_scope_clearance(e public.program_scope_entries, previous public.program_scope_entries)
returns public.scope_clearance
language plpgsql stable security definer set search_path = ''
as $$
declare
  host text;
begin
  if e.scope_state = 'out_of_scope' then return 'not_required'; end if;
  if e.asset_type in ('domain', 'url') then
    host := private.scope_entry_host(e.asset_type, e.target, e.url_origin);
    if host is null then return 'pending_verification'; end if;
    if private.is_reserved_test_host(host) then return 'not_required'; end if;
    if exists (
      select 1 from public.organization_domains d
      where d.organization_id = e.organization_id and d.status = 'verified' and (host = d.domain or host like '%.' || d.domain)
    ) then return 'verified'; end if;
    return 'pending_verification';
  end if;
  -- A platform decision survives edits that don't change what is authorized.
  if previous.id is not null and previous.clearance in ('approved', 'rejected')
     and previous.target = e.target and previous.asset_type = e.asset_type and previous.scope_state = e.scope_state then
    return previous.clearance;
  end if;
  return 'pending_review';
end;
$$;

create or replace function private.program_scope_entries_set_clearance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.clearance := private.compute_scope_clearance(new, case when tg_op = 'UPDATE' then old else null end);
  if new.clearance not in ('approved', 'rejected') then
    new.clearance_reviewed_by := null; new.clearance_reviewed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists program_scope_entries_clearance on public.program_scope_entries;
create trigger program_scope_entries_clearance
  before insert or update of target, asset_type, scope_state, url_origin on public.program_scope_entries
  for each row execute function private.program_scope_entries_set_clearance();

/** Cleared = may authorize testing and be shown to researchers. */
create or replace function private.scope_clearance_ok(c public.scope_clearance)
returns boolean
language sql immutable set search_path = ''
as $$ select c in ('not_required', 'verified', 'approved'); $$;

-- Re-evaluate an organization's domain/url entries after its verified domains change.
create or replace function private.recompute_domain_clearance(p_organization_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.program_scope_entries e
     set clearance = private.compute_scope_clearance(e, null)
   where e.organization_id = p_organization_id and e.asset_type in ('domain', 'url');
end;
$$;

create or replace function private.organization_domains_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.recompute_domain_clearance(coalesce(new.organization_id, old.organization_id));
  return null;
end;
$$;
create trigger organization_domains_recompute
  after insert or delete or update of status, domain on public.organization_domains
  for each row execute function private.organization_domains_changed();

-- Backfill every existing entry by the same rules (no prior platform decisions exist yet).
update public.program_scope_entries e set clearance = private.compute_scope_clearance(e, null);

-- 3. Only cleared entries authorize: matcher, public list, researcher visibility ---------------------
create or replace function private.match_program_scope(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  canonical_target text,
  cidr_value cidr,
  p_url_origin text,
  p_url_path text
)
returns table (matched_entry_id uuid, matched_scope_state public.program_scope_state, matched_target text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  best_match record;
begin
  -- Unchanged from 202609030005 except: only cleared entries take part (scope_clearance_ok).
  if p_asset_type = 'domain' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'domain' and e.status = 'active' and private.scope_clearance_ok(e.clearance)
      and (
        e.target = canonical_target
        or (left(e.target, 2) = '*.' and canonical_target like ('%.' || substr(e.target, 3)))
      )
    order by (e.target = canonical_target) desc, char_length(e.target) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'ip_cidr' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'ip_cidr' and e.status = 'active' and private.scope_clearance_ok(e.clearance)
      and e.target_cidr >>= cidr_value
    order by masklen(e.target_cidr) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'url' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'url' and e.status = 'active' and private.scope_clearance_ok(e.clearance)
      and e.url_origin = p_url_origin
      and (
        e.url_path = p_url_path
        or p_url_path like (case when e.url_path = '/' then '/' else e.url_path || '/' end) || '%'
      )
    order by char_length(e.url_path) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type in ('ios_app', 'android_app', 'source_code', 'hardware', 'ai_model') then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = p_asset_type and e.status = 'active' and private.scope_clearance_ok(e.clearance)
      and e.target = canonical_target
    order by (e.scope_state = 'out_of_scope') desc
    limit 1;
  end if;

  matched_entry_id := best_match.id;
  matched_scope_state := best_match.scope_state;
  matched_target := best_match.target;
  return next;
end;
$$;

create or replace function public.list_public_program_scope(target_program_id uuid)
returns table (id uuid, asset_type public.program_asset_type, display_target text, scope_state public.program_scope_state, description text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.programs p
    join public.organizations o on o.id = p.organization_id
    where p.id = target_program_id and p.visibility = 'public' and p.status in ('active', 'paused')
      and o.status <> 'suspended'
  ) then
    return;
  end if;

  return query
    select e.id, e.asset_type, e.display_target, e.scope_state, e.description
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.status = 'active' and private.scope_clearance_ok(e.clearance)
    order by e.created_at asc;
end;
$$;

-- Restrictive: on top of the existing read policies, a researcher only ever sees cleared entries.
-- The organization (any active member), program members and platform staff see everything, so
-- they can see what is waiting and fix it.
create policy "uncleared scope is hidden from researchers" on public.program_scope_entries
  as restrictive for select to authenticated
  using (
    private.scope_clearance_ok(clearance)
    or exists (select 1 from public.organization_members om where om.organization_id = program_scope_entries.organization_id and om.user_id = auth.uid() and om.status = 'active')
    or private.is_program_member(program_id)
    or private.is_platform_admin()
  );

-- 4. No review or launch without a cleared in-scope asset -------------------------------------------
create or replace function private.programs_require_cleared_scope()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('review', 'active') and new.status is distinct from old.status
     and not exists (
       select 1 from public.program_scope_entries e
       where e.program_id = new.id and e.status = 'active' and e.scope_state = 'in_scope' and private.scope_clearance_ok(e.clearance)
     ) then
    raise exception 'SCOPE_UNVERIFIED: prove ownership of at least one in-scope asset first -- verify its domain under Settings, Verified domains, or wait for platform review of non-domain assets' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists programs_require_cleared_scope on public.programs;
create trigger programs_require_cleared_scope before update of status on public.programs
  for each row execute function private.programs_require_cleared_scope();

-- 5. Functions ----------------------------------------------------------------------------------------
create or replace function private.normalize_domain(p_input text)
returns text
language sql immutable set search_path = ''
as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(p_input, ''))), '^[a-z][a-z0-9+.-]*://', ''), '[/:?#].*$', ''), '^(\*\.)|\.$', '', 'g'), '');
$$;

create or replace function public.add_organization_domain(p_organization_id uuid, p_domain text)
returns public.organization_domains
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_domain text := private.normalize_domain(p_domain);
  result public.organization_domains;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can manage verified domains' using errcode = '42501';
  end if;
  if v_domain is null or v_domain !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' or char_length(v_domain) > 253 then
    raise exception 'INVALID_DOMAIN: enter a domain like example.com' using errcode = '22023';
  end if;
  if private.is_reserved_test_host(v_domain) then
    raise exception 'INVALID_DOMAIN: reserved test domains need no verification' using errcode = '22023';
  end if;
  if (select count(*) from public.organization_domains where organization_id = p_organization_id) >= 50 then
    raise exception 'TOO_MANY_DOMAINS: an organization can register up to 50 domains' using errcode = '54000';
  end if;
  insert into public.organization_domains (organization_id, domain, created_by) values (p_organization_id, v_domain, actor)
  on conflict (organization_id, domain) do update set domain = excluded.domain
  returning * into result;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, p_organization_id, 'domain.added', 'organization_domain', result.id, jsonb_build_object('domain', v_domain));
  return result;
end;
$$;

create or replace function public.remove_organization_domain(p_domain_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  d public.organization_domains;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into d from public.organization_domains where id = p_domain_id;
  if d.id is null or not private.has_org_role(d.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can manage verified domains' using errcode = '42501';
  end if;
  delete from public.organization_domains where id = p_domain_id; -- trigger re-evaluates scope
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, d.organization_id, 'domain.removed', 'organization_domain', d.id, jsonb_build_object('domain', d.domain, 'was_verified', d.status = 'verified'));
end;
$$;

/** For the server's DNS check: the domain and its token, only for an owner/security admin. */
create or replace function public.get_domain_for_verification(p_domain_id uuid)
returns public.organization_domains
language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.organization_domains;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  select * into d from public.organization_domains where id = p_domain_id;
  if d.id is null or not private.has_org_role(d.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: only an owner or security admin can verify domains' using errcode = '42501';
  end if;
  return d;
end;
$$;

/** Server only (service_role): records the outcome of a DNS check the SERVER performed. A
 * browser/user can never call this, so "verified" always means the record was really there. */
create or replace function public.record_domain_check(p_domain_id uuid, p_found boolean, p_error text, p_actor uuid)
returns public.organization_domains
language plpgsql security definer set search_path = ''
as $$
declare
  d public.organization_domains;
begin
  update public.organization_domains
     set status = case when p_found then 'verified' else status end,
         verified_at = case when p_found then coalesce(verified_at, now()) else verified_at end,
         last_checked_at = now(),
         last_check_error = case when p_found then null else left(p_error, 300) end
   where id = p_domain_id
  returning * into d;
  if d.id is null then raise exception 'DOMAIN_NOT_FOUND: domain not found' using errcode = 'P0002'; end if;
  if p_found then
    insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
    values (p_actor, d.organization_id, 'domain.verified', 'organization_domain', d.id, jsonb_build_object('domain', d.domain, 'method', 'dns_txt'));
  end if;
  return d;
end;
$$;

create or replace function public.list_scope_entries_pending_review()
returns table (id uuid, organization_id uuid, organization_name text, program_id uuid, program_name text, asset_type public.program_asset_type, display_target text, description text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  return query
    select e.id, e.organization_id, o.name, e.program_id, p.name, e.asset_type, e.display_target, e.description, e.created_at
    from public.program_scope_entries e
    join public.programs p on p.id = e.program_id
    join public.organizations o on o.id = e.organization_id
    where e.status = 'active' and e.clearance = 'pending_review'
    order by e.created_at asc;
end;
$$;

create or replace function public.review_scope_entry(p_entry_id uuid, p_decision text, p_note text)
returns public.program_scope_entries
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  e public.program_scope_entries;
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'INVALID_INPUT: decide approved or rejected' using errcode = '22023'; end if;
  if p_decision = 'rejected' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'NOTE_REQUIRED: say why, so the organization can fix it' using errcode = '22023';
  end if;
  update public.program_scope_entries
     set clearance = p_decision::public.scope_clearance, clearance_reviewed_by = actor, clearance_reviewed_at = now(), clearance_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_entry_id and clearance = 'pending_review'
  returning * into e;
  if e.id is null then raise exception 'NOT_PENDING: this asset is not waiting for review' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, e.organization_id, 'scope.clearance_reviewed', 'program_scope_entry', e.id, jsonb_build_object('decision', p_decision, 'target', e.target, 'asset_type', e.asset_type));
  return e;
end;
$$;

revoke all on function public.add_organization_domain(uuid, text) from public, anon;
grant execute on function public.add_organization_domain(uuid, text) to authenticated;
revoke all on function public.remove_organization_domain(uuid) from public, anon;
grant execute on function public.remove_organization_domain(uuid) to authenticated;
revoke all on function public.get_domain_for_verification(uuid) from public, anon;
grant execute on function public.get_domain_for_verification(uuid) to authenticated;
revoke all on function public.record_domain_check(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.record_domain_check(uuid, boolean, text, uuid) to service_role;
revoke all on function public.list_scope_entries_pending_review() from public, anon;
grant execute on function public.list_scope_entries_pending_review() to authenticated;
revoke all on function public.review_scope_entry(uuid, text, text) from public, anon;
grant execute on function public.review_scope_entry(uuid, text, text) to authenticated;

-- GitHub and GitLab issue sync (docs/plans/organization-integrations.md, module 4). Same shape as
-- Jira (202610010001): per-organization connection, encrypted credentials, staff-only issue
-- links, inbound webhooks that call the EXISTING resolve_report as a real person.
--
--   GitHub: a GitHub App. Unpatched stores only the installation id; it mints short-lived
--     installation tokens with the app key. The install callback proved (server-side, with the
--     installer's own OAuth code) that the installer can access that installation.
--   GitLab: a project or group access token (api scope), encrypted; a per-connection webhook
--     secret (X-Gitlab-Token), generated here and shown once.
--
-- Vulnerability details go only to PRIVATE repositories: the server checks visibility when a
-- program's repository is chosen and again immediately before each issue is created. Issues are
-- created only for accepted or resolved reports, by triage staff.

create table public.code_host_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('github', 'gitlab')),
  status text not null default 'active' check (status in ('active', 'error')),
  account_label text not null check (char_length(account_label) <= 200),
  github_installation_id text check (github_installation_id ~ '^[0-9]{1,20}$'),
  gitlab_base_url text check (gitlab_base_url ~ '^https?://[^/\s]+$'),
  token_encrypted bytea,
  token_last4 text check (char_length(token_last4) <= 4),
  webhook_secret_encrypted bytea,
  created_by uuid not null references public.users(id),
  last_error text check (char_length(last_error) <= 300),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, provider),
  check ((provider = 'github') = (github_installation_id is not null)),
  check ((provider = 'gitlab') = (gitlab_base_url is not null and token_encrypted is not null and webhook_secret_encrypted is not null))
);
create unique index code_host_connections_installation on public.code_host_connections(github_installation_id) where github_installation_id is not null;

create table public.program_repositories (
  program_id uuid not null references public.programs(id) on delete cascade,
  provider text not null check (provider in ('github', 'gitlab')),
  connection_id uuid not null references public.code_host_connections(id) on delete cascade,
  repo_id text not null check (char_length(repo_id) <= 40),
  repo_full_name text not null check (char_length(repo_full_name) <= 300),
  repo_url text not null check (repo_url ~ '^https?://'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (program_id, provider)
);

create table public.report_issue_links (
  report_id uuid not null references public.reports(id) on delete cascade,
  provider text not null check (provider in ('github', 'gitlab')),
  connection_id uuid not null references public.code_host_connections(id) on delete cascade,
  repo_id text not null,
  repo_full_name text not null,
  issue_number integer not null check (issue_number > 0),
  issue_url text not null check (issue_url ~ '^https?://'),
  state text not null default 'open' check (state in ('open', 'closed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  primary key (report_id, provider),
  unique (connection_id, repo_id, issue_number)
);

alter table public.code_host_connections enable row level security;
alter table public.program_repositories enable row level security;
alter table public.report_issue_links enable row level security;
create policy "code host connections read by org admins" on public.code_host_connections for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
create policy "program repositories read by org admins and program staff" on public.program_repositories for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and (private.has_org_role(p.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(p.id))));
create policy "issue links read by triage staff" on public.report_issue_links for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and (private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(r.program_id))));
revoke all on public.code_host_connections, public.program_repositories, public.report_issue_links from anon, authenticated;
grant select (id, organization_id, provider, status, account_label, github_installation_id, gitlab_base_url, token_last4, created_by, last_error, last_error_at, created_at) on public.code_host_connections to authenticated;
grant select on public.program_repositories, public.report_issue_links to authenticated;
grant select, insert, update, delete on public.code_host_connections, public.program_repositories, public.report_issue_links to service_role;

-- Connections ------------------------------------------------------------------------------------
create or replace function private.create_github_connection(p_organization_id uuid, p_actor uuid, p_installation_id text, p_account text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.organization_members where organization_id = p_organization_id and user_id = p_actor and status = 'active' and role in ('owner', 'security_admin')) then
    raise exception 'FORBIDDEN: only an owner or security admin can connect GitHub' using errcode = '42501';
  end if;
  if exists (select 1 from public.code_host_connections where github_installation_id = p_installation_id and organization_id <> p_organization_id) then
    raise exception 'INSTALLATION_IN_USE: that GitHub installation is connected to another organization' using errcode = '23505';
  end if;
  insert into public.code_host_connections (organization_id, provider, account_label, github_installation_id, created_by)
  values (p_organization_id, 'github', left(p_account, 200), p_installation_id, p_actor)
  on conflict (organization_id, provider) do update set github_installation_id = excluded.github_installation_id, account_label = excluded.account_label, created_by = excluded.created_by, status = 'active', last_error = null
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_organization_id, 'integration.github_connected', 'code_host_connection', new_id, jsonb_build_object('account', p_account));
  return new_id;
end;
$$;

create or replace function public.create_gitlab_connection(p_organization_id uuid, p_base_url text, p_token text, p_webhook_secret text, p_account_label text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_token is null or char_length(p_token) not between 16 and 512 or p_token ~ '\s' then raise exception 'INVALID_TOKEN: paste a GitLab access token' using errcode = '22023'; end if;
  if p_webhook_secret is null or char_length(p_webhook_secret) < 32 then raise exception 'INVALID_INPUT: webhook secret' using errcode = '22023'; end if;
  insert into public.code_host_connections (organization_id, provider, account_label, gitlab_base_url, token_encrypted, token_last4, webhook_secret_encrypted, created_by)
  values (p_organization_id, 'gitlab', left(p_account_label, 200), rtrim(p_base_url, '/'), private.encrypt_sensitive_field(p_token), right(p_token, 4), private.encrypt_sensitive_field(p_webhook_secret), auth.uid())
  on conflict (organization_id, provider) do update set gitlab_base_url = excluded.gitlab_base_url, token_encrypted = excluded.token_encrypted, token_last4 = excluded.token_last4,
    webhook_secret_encrypted = excluded.webhook_secret_encrypted, account_label = excluded.account_label, created_by = excluded.created_by, status = 'active', last_error = null
  returning id into new_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'integration.gitlab_connected', 'code_host_connection', new_id, jsonb_build_object('base_url', p_base_url));
  return new_id;
end;
$$;

create or replace function public.delete_code_host_connection(p_connection_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.code_host_connections;
begin
  select * into c from public.code_host_connections where id = p_connection_id;
  if c.id is null then raise exception 'NOT_FOUND: not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(c.organization_id);
  delete from public.code_host_connections where id = c.id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), c.organization_id, 'integration.' || c.provider || '_disconnected', 'code_host_connection', c.id, '{}'::jsonb);
end;
$$;

/** The server has already confirmed the repository exists, is reachable, and is PRIVATE. */
create or replace function public.set_program_repository(p_program_id uuid, p_provider text, p_repo_id text, p_full_name text, p_url text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
  conn uuid;
begin
  select organization_id into org from public.programs where id = p_program_id;
  if org is null then raise exception 'NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(org);
  select id into conn from public.code_host_connections where organization_id = org and provider = p_provider;
  if conn is null then raise exception 'NOT_CONNECTED: connect the organization first' using errcode = '23514'; end if;
  insert into public.program_repositories (program_id, provider, connection_id, repo_id, repo_full_name, repo_url, created_by)
  values (p_program_id, p_provider, conn, p_repo_id, p_full_name, p_url, auth.uid())
  on conflict (program_id, provider) do update set connection_id = excluded.connection_id, repo_id = excluded.repo_id, repo_full_name = excluded.repo_full_name, repo_url = excluded.repo_url, created_by = excluded.created_by, created_at = now();
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), org, 'integration.repository_set', 'program', p_program_id, jsonb_build_object('provider', p_provider, 'repository', p_full_name));
end;
$$;

create or replace function public.clear_program_repository(p_program_id uuid, p_provider text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
begin
  select organization_id into org from public.programs where id = p_program_id;
  if org is null then raise exception 'NOT_FOUND: program not found' using errcode = 'P0002'; end if;
  perform private.assert_org_integration_admin(org);
  delete from public.program_repositories where program_id = p_program_id and provider = p_provider;
end;
$$;

-- Issue creation -----------------------------------------------------------------------------------
/** Step 1 (as the triager): authorize and return what the server needs. Step 2 (server) checks
 * visibility and creates the issue; step 3 (service role) records the link. */
create or replace function public.begin_report_issue(p_report_id uuid, p_provider text)
returns table (connection_id uuid, repo_id text, repo_full_name text, title text, description text, impact text, severity text, weakness text, target text, program_name text, organization_id uuid, program_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  report public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(p_report_id);
  if report.status not in ('accepted', 'resolved') then
    raise exception 'ISSUE_NOT_ELIGIBLE: create an issue once the report is accepted' using errcode = '23514';
  end if;
  if exists (select 1 from public.report_issue_links l where l.report_id = p_report_id and l.provider = p_provider) then
    raise exception 'ISSUE_EXISTS: this report already has an issue there' using errcode = '23505';
  end if;
  return query
    select pr.connection_id, pr.repo_id, pr.repo_full_name, report.title, report.description, report.impact,
      coalesce(report.confirmed_severity, report.researcher_severity)::text, report.weakness_type::text, report.display_target, p.name, report.organization_id, report.program_id
    from public.program_repositories pr join public.programs p on p.id = pr.program_id
    join public.code_host_connections c on c.id = pr.connection_id and c.status = 'active'
    where pr.program_id = report.program_id and pr.provider = p_provider;
  if not found then raise exception 'NO_REPOSITORY: choose a private repository for this program in Integrations first' using errcode = '23514'; end if;
end;
$$;

create or replace function private.code_host_credentials(p_connection_id uuid)
returns table (provider text, organization_id uuid, github_installation_id text, gitlab_base_url text, token text, webhook_secret text, created_by uuid)
language sql stable security definer set search_path = ''
as $$
  select c.provider, c.organization_id, c.github_installation_id, c.gitlab_base_url,
    case when c.token_encrypted is not null then private.decrypt_sensitive_field(c.token_encrypted) end,
    case when c.webhook_secret_encrypted is not null then private.decrypt_sensitive_field(c.webhook_secret_encrypted) end,
    c.created_by
  from public.code_host_connections c where c.id = p_connection_id;
$$;

create or replace function private.record_report_issue(p_report_id uuid, p_provider text, p_connection_id uuid, p_repo_id text, p_full_name text, p_number integer, p_url text, p_actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
begin
  select r.organization_id into org from public.reports r join public.code_host_connections c on c.organization_id = r.organization_id and c.id = p_connection_id where r.id = p_report_id;
  if org is null then raise exception 'INVALID_INPUT: report and connection belong to different organizations' using errcode = '22023'; end if;
  insert into public.report_issue_links (report_id, provider, connection_id, repo_id, repo_full_name, issue_number, issue_url, created_by)
  values (p_report_id, p_provider, p_connection_id, p_repo_id, p_full_name, p_number, p_url, p_actor)
  on conflict do nothing;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (p_actor, org, 'integration.issue_created', 'report', p_report_id, jsonb_build_object('provider', p_provider, 'repository', p_full_name, 'issue', p_number));
end;
$$;

create or replace function private.record_code_host_error(p_connection_id uuid, p_error text)
returns void
language sql security definer set search_path = ''
as $$
  update public.code_host_connections set last_error = left(p_error, 300), last_error_at = now() where id = p_connection_id;
$$;

grant execute on function private.create_github_connection(uuid, uuid, text, text), private.code_host_credentials(uuid), private.record_report_issue(uuid, text, uuid, text, text, integer, text, uuid), private.record_code_host_error(uuid, text) to service_role;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_gitlab_connection(uuid, text, text, text, text)', 'public.delete_code_host_connection(uuid)',
    'public.set_program_repository(uuid, text, text, text, text)', 'public.clear_program_repository(uuid, text)', 'public.begin_report_issue(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ServiceNow remediation tickets (docs/plans/organization-integrations.md, module 5). Same shape
-- as Jira and GitLab: per-organization connection with the customer's own credentials (a
-- dedicated integration user, Basic auth over HTTPS), encrypted; triage staff create a ticket for
-- an accepted report; closing the report adds a work note (and resolves an incident); a verified
-- inbound call from the customer's Business Rule resolves the report as the connecting admin.
-- The instance URL is restricted to ServiceNow hosts by the server (SSRF), and every call goes
-- through lib/integrations/safe-fetch.ts.

create table public.servicenow_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  instance_url text not null check (instance_url ~ '^https?://[^/\s]+$'),
  username text not null check (char_length(username) between 1 and 120),
  password_encrypted bytea not null,
  table_name text not null check (table_name in ('incident', 'sn_si_incident')),
  assignment_group text check (char_length(assignment_group) <= 120),
  webhook_secret_encrypted bytea not null,
  created_by uuid not null references public.users(id),
  last_error text check (char_length(last_error) <= 300),
  last_error_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_servicenow_links (
  report_id uuid primary key references public.reports(id) on delete cascade,
  organization_id uuid not null references public.servicenow_connections(organization_id) on delete cascade,
  table_name text not null,
  sys_id text not null check (sys_id ~ '^[0-9a-f]{32}$'),
  number text not null check (char_length(number) <= 40),
  state text not null default 'open' check (state in ('open', 'closed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, sys_id)
);

alter table public.servicenow_connections enable row level security;
alter table public.report_servicenow_links enable row level security;
create policy "servicenow connections read by org admins" on public.servicenow_connections for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'security_admin']::public.organization_member_role[]));
create policy "servicenow links read by triage staff" on public.report_servicenow_links for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and (private.has_org_role(r.organization_id, array['owner', 'security_admin']::public.organization_member_role[]) or private.is_program_member(r.program_id))));
revoke all on public.servicenow_connections, public.report_servicenow_links from anon, authenticated;
grant select (organization_id, instance_url, username, table_name, assignment_group, created_by, last_error, last_error_at, created_at) on public.servicenow_connections to authenticated;
grant select on public.report_servicenow_links to authenticated;
grant select, insert, update, delete on public.servicenow_connections, public.report_servicenow_links to service_role;

create or replace function public.save_servicenow_connection(p_organization_id uuid, p_instance_url text, p_username text, p_password text, p_table text, p_group text, p_webhook_secret text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_org_integration_admin(p_organization_id);
  if p_table not in ('incident', 'sn_si_incident') then raise exception 'INVALID_INPUT: incident or sn_si_incident' using errcode = '22023'; end if;
  if p_password is null or char_length(p_password) not between 1 and 512 then raise exception 'INVALID_INPUT: password' using errcode = '22023'; end if;
  insert into public.servicenow_connections (organization_id, instance_url, username, password_encrypted, table_name, assignment_group, webhook_secret_encrypted, created_by)
  values (p_organization_id, rtrim(p_instance_url, '/'), trim(p_username), private.encrypt_sensitive_field(p_password), p_table, nullif(trim(coalesce(p_group, '')), ''), private.encrypt_sensitive_field(p_webhook_secret), auth.uid())
  on conflict (organization_id) do update set instance_url = excluded.instance_url, username = excluded.username, password_encrypted = excluded.password_encrypted,
    table_name = excluded.table_name, assignment_group = excluded.assignment_group, webhook_secret_encrypted = excluded.webhook_secret_encrypted, created_by = excluded.created_by, last_error = null;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'integration.servicenow_connected', 'organization', p_organization_id, jsonb_build_object('instance', p_instance_url, 'table', p_table));
end;
$$;

create or replace function public.delete_servicenow_connection(p_organization_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_org_integration_admin(p_organization_id);
  delete from public.servicenow_connections where organization_id = p_organization_id;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_organization_id, 'integration.servicenow_disconnected', 'organization', p_organization_id, '{}'::jsonb);
end;
$$;

create or replace function public.begin_servicenow_record(p_report_id uuid)
returns table (organization_id uuid, program_id uuid, program_name text, title text, description text, impact text, severity text, target text)
language plpgsql security definer set search_path = ''
as $$
declare
  report public.reports;
begin
  report := private.lock_and_authorize_report_for_triage(p_report_id);
  if report.status not in ('accepted', 'resolved') then raise exception 'TICKET_NOT_ELIGIBLE: create a ticket once the report is accepted' using errcode = '23514'; end if;
  if not exists (select 1 from public.servicenow_connections c where c.organization_id = report.organization_id) then raise exception 'NOT_CONNECTED: connect ServiceNow in Integrations first' using errcode = '23514'; end if;
  if exists (select 1 from public.report_servicenow_links l where l.report_id = p_report_id) then raise exception 'TICKET_EXISTS: this report already has a ServiceNow ticket' using errcode = '23505'; end if;
  return query select report.organization_id, report.program_id, p.name, report.title, report.description, report.impact, coalesce(report.confirmed_severity, report.researcher_severity)::text, report.display_target
    from public.programs p where p.id = report.program_id;
end;
$$;

create or replace function private.servicenow_credentials(p_organization_id uuid)
returns table (instance_url text, username text, password text, table_name text, assignment_group text, webhook_secret text, created_by uuid)
language sql stable security definer set search_path = ''
as $$
  select c.instance_url, c.username, private.decrypt_sensitive_field(c.password_encrypted), c.table_name, c.assignment_group, private.decrypt_sensitive_field(c.webhook_secret_encrypted), c.created_by
  from public.servicenow_connections c where c.organization_id = p_organization_id;
$$;

create or replace function private.record_servicenow_link(p_report_id uuid, p_sys_id text, p_number text, p_actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.servicenow_connections;
begin
  select sc.* into c from public.servicenow_connections sc join public.reports r on r.organization_id = sc.organization_id where r.id = p_report_id;
  if c.organization_id is null then raise exception 'NOT_CONNECTED: no ServiceNow connection for this report''s organization' using errcode = '23514'; end if;
  insert into public.report_servicenow_links (report_id, organization_id, table_name, sys_id, number, created_by)
  values (p_report_id, c.organization_id, c.table_name, p_sys_id, p_number, p_actor) on conflict do nothing;
  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (p_actor, c.organization_id, 'integration.servicenow_ticket_created', 'report', p_report_id, jsonb_build_object('number', p_number));
end;
$$;

create or replace function private.record_servicenow_error(p_organization_id uuid, p_error text)
returns void
language sql security definer set search_path = ''
as $$ update public.servicenow_connections set last_error = left(p_error, 300), last_error_at = now() where organization_id = p_organization_id; $$;

grant execute on function private.servicenow_credentials(uuid), private.record_servicenow_link(uuid, text, text, uuid), private.record_servicenow_error(uuid, text) to service_role;
do $$
declare
  f text;
begin
  foreach f in array array['public.save_servicenow_connection(uuid, text, text, text, text, text, text)', 'public.delete_servicenow_connection(uuid)', 'public.begin_servicenow_record(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

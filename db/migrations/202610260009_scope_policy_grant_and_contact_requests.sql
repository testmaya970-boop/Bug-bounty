-- 1. The restrictive scope policy (202610260008) evaluates private.scope_clearance_ok as the
--    signed-in caller, and private functions are not executable by default (202610160006).
grant execute on function private.scope_clearance_ok(public.scope_clearance) to authenticated;

-- 2. Contact requests: an organization can reach Unpatched before it has an account.
--    Written only by the server (service_role), which has already checked the honeypot/captcha
--    and supplies a hashed client IP for rate limiting. Read and closed by platform staff.
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company text not null check (char_length(company) between 1 and 160),
  website text check (char_length(website) <= 300),
  topic text not null check (topic in ('launch_program', 'pricing', 'security', 'partnership', 'other')),
  message text not null check (char_length(message) between 20 and 4000),
  status text not null default 'new' check (status in ('new', 'handled')),
  handled_by uuid references public.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index contact_requests_status_created_idx on public.contact_requests(status, created_at desc);
alter table public.contact_requests enable row level security;
grant select, insert, update on public.contact_requests to service_role;

create or replace function public.submit_contact_request(
  p_name text, p_email text, p_company text, p_website text, p_topic text, p_message text, p_client_key text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_website text := nullif(trim(coalesce(p_website, '')), '');
  new_id uuid;
begin
  if not private.check_and_consume_rate_limit('contact:client:' || coalesce(p_client_key, 'unknown'), 5, 3600)
     or not private.check_and_consume_rate_limit('contact:email:' || v_email, 3, 3600) then
    raise exception 'RATE_LIMITED: too many messages, try again in an hour' using errcode = '54000';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 120
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254
     or char_length(trim(coalesce(p_company, ''))) not between 1 and 160
     or char_length(trim(coalesce(p_message, ''))) not between 20 and 4000
     or coalesce(p_topic, '') not in ('launch_program', 'pricing', 'security', 'partnership', 'other')
     or (v_website is not null and (char_length(v_website) > 300 or v_website !~* '^https?://[^\s/]+\.[^\s]+$')) then
    raise exception 'INVALID_INPUT: check the highlighted fields' using errcode = '22023';
  end if;
  insert into public.contact_requests (name, email, company, website, topic, message)
  values (trim(p_name), v_email, trim(p_company), v_website, p_topic, trim(p_message))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_contact_request(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_contact_request(text, text, text, text, text, text, text) to service_role;

create or replace function public.list_contact_requests(p_status text)
returns setof public.contact_requests
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  return query select * from public.contact_requests
    where p_status is null or status = p_status
    order by (status = 'new') desc, created_at desc
    limit 200;
end;
$$;

create or replace function public.mark_contact_request_handled(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'FORBIDDEN: platform staff only' using errcode = '42501'; end if;
  update public.contact_requests set status = 'handled', handled_by = auth.uid(), handled_at = now()
   where id = p_id and status = 'new';
  if not found then raise exception 'NOT_FOUND: request not found or already handled' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.list_contact_requests(text) from public, anon;
grant execute on function public.list_contact_requests(text) to authenticated;
revoke all on function public.mark_contact_request_handled(uuid) from public, anon;
grant execute on function public.mark_contact_request_handled(uuid) to authenticated;

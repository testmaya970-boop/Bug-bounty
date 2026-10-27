-- Documentation IP ranges (RFC 5737, RFC 3849) need no ownership proof, like reserved names.

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
  -- RFC 5737 / RFC 3849 documentation ranges belong to nobody, like the reserved names.
  if e.asset_type = 'ip_cidr' and e.target_cidr is not null
     and (e.target_cidr <<= '192.0.2.0/24'::cidr or e.target_cidr <<= '198.51.100.0/24'::cidr
          or e.target_cidr <<= '203.0.113.0/24'::cidr or e.target_cidr <<= '2001:db8::/32'::cidr) then
    return 'not_required';
  end if;
  -- A platform decision survives edits that don't change what is authorized.
  if previous.id is not null and previous.clearance in ('approved', 'rejected')
     and previous.target = e.target and previous.asset_type = e.asset_type and previous.scope_state = e.scope_state then
    return previous.clearance;
  end if;
  return 'pending_review';
end;
$$;

update public.program_scope_entries e set clearance = private.compute_scope_clearance(e, null) where e.asset_type = 'ip_cidr';

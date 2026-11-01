-- 202610220012 checked private ranges, but Node records IPv4 clients in IPv6-mapped form
-- (::ffff:127.0.0.1), which never matches 127.0.0.0/8. Unwrap the mapped form first.
create or replace function private.sessions_record_fingerprint()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  raw text;
  addr inet;
begin
  if new.ip is null or new.ip::text = '' then return new; end if;
  raw := regexp_replace(new.ip::text, '^::ffff:', '', 'i');
  begin
    addr := raw::inet;
  exception when others then
    return new;
  end;
  if addr <<= '127.0.0.0/8'::inet or addr <<= '10.0.0.0/8'::inet or addr <<= '172.16.0.0/12'::inet or addr <<= '192.168.0.0/16'::inet
     or addr <<= '169.254.0.0/16'::inet or addr <<= '::1/128'::inet or addr <<= 'fc00::/7'::inet or addr <<= 'fe80::/10'::inet then
    return new;
  end if;
  insert into public.sign_in_fingerprints (user_id, network_hash)
  values (new.user_id, encode(extensions.digest('unpatched-net:' || raw, 'sha256'), 'hex'))
  on conflict (user_id, network_hash) do update set last_seen = now(), sign_ins = public.sign_in_fingerprints.sign_ins + 1;
  return new;
end;
$$;

-- Rows recorded from private addresses before this fix (hash every private address a session
-- holds, mapped or not).
delete from public.sign_in_fingerprints f
using (
  select distinct encode(extensions.digest('unpatched-net:' || s.ip, 'sha256'), 'hex') as h
  from public.sessions s
  where s.ip is not null and s.ip <> ''
    and (regexp_replace(s.ip, '^::ffff:', '', 'i') ~ '^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' or s.ip in ('::1'))
) p
where f.network_hash = p.h;

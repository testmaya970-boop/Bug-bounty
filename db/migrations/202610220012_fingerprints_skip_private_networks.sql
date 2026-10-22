-- Collusion signals (202610220001) counted loopback and private-network addresses. Those
-- describe the proxy in front of the app, not the person: behind a misconfigured proxy, or on
-- a local machine, every account "shares" 127.0.0.1 and every paid researcher was flagged.
-- Only public addresses are recorded now, and the loopback/private rows already stored go.
create or replace function private.sessions_record_fingerprint()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  addr inet;
begin
  if new.ip is null or new.ip::text = '' then return new; end if;
  begin
    addr := new.ip::inet;
  exception when others then
    return new; -- not an address: nothing meaningful to compare
  end;
  if addr <<= '127.0.0.0/8'::inet or addr <<= '10.0.0.0/8'::inet or addr <<= '172.16.0.0/12'::inet or addr <<= '192.168.0.0/16'::inet
     or addr <<= '169.254.0.0/16'::inet or addr <<= '::1/128'::inet or addr <<= 'fc00::/7'::inet or addr <<= 'fe80::/10'::inet then
    return new;
  end if;
  insert into public.sign_in_fingerprints (user_id, network_hash)
  values (new.user_id, encode(extensions.digest('unpatched-net:' || new.ip::text, 'sha256'), 'hex'))
  on conflict (user_id, network_hash) do update set last_seen = now(), sign_ins = public.sign_in_fingerprints.sign_ins + 1;
  return new;
end;
$$;

delete from public.sign_in_fingerprints
where network_hash in (
  select encode(extensions.digest('unpatched-net:' || a, 'sha256'), 'hex')
  from unnest(array['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']) as a
);

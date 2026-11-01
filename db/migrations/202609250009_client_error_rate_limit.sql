-- /api/client-errors called private.check_and_consume_rate_limit directly, which fails:
-- it is not SECURITY DEFINER and service_role cannot write private.rate_limit_counters
-- (found live -- every browser error report got a 503). Same fix as every other limit in
-- this schema (check_sign_in_rate_limit, check_evidence_upload_rate_limit): a narrow
-- SECURITY DEFINER wrapper, not wider table grants.
--
-- Two buckets, both consumed: per client (30/min) and a global cap (1000/hour) that bounds
-- how many app_errors rows browsers can create no matter how many clients report.

create or replace function public.check_client_error_rate_limit(p_client text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  per_client boolean;
  global_ok boolean;
begin
  per_client := private.check_and_consume_rate_limit('client_error:' || left(coalesce(p_client, 'unknown'), 100), 30, 60);
  global_ok := private.check_and_consume_rate_limit('client_error:all', 1000, 3600);
  return per_client and global_ok;
end;
$$;

revoke all on function public.check_client_error_rate_limit(text) from public, authenticated, anon;
grant execute on function public.check_client_error_rate_limit(text) to service_role;

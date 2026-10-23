-- Every researcher must have a verified identity before submitting a report (product
-- decision, 2026-10-23): Aadhaar, PAN or passport verified by Unpatched, or an approved
-- identity check in the last 12 months (private.researcher_has_verified_kyc). Enforced on the
-- reports table itself, so every path that creates a report is covered. Programs' own
-- requires_kyc flag still gates payouts as before; this gate is platform-wide and earlier.

create or replace function private.require_reporter_kyc() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.researcher_has_verified_kyc(new.researcher_id) then
    raise exception 'KYC_REQUIRED: verify your identity in Settings, Identity before submitting a report' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.require_reporter_kyc() from public, anon, authenticated;
grant execute on function private.require_reporter_kyc() to service_role;
create trigger reports_require_kyc before insert on public.reports for each row execute function private.require_reporter_kyc();

-- For the submit page: whether the signed-in researcher can report yet.
create or replace function public.am_i_identity_verified()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and private.researcher_has_verified_kyc(auth.uid());
$$;
revoke all on function public.am_i_identity_verified() from public, anon;
grant execute on function public.am_i_identity_verified() to authenticated;

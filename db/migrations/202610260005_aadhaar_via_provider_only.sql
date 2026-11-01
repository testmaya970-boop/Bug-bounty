-- Aadhaar is verified only through the authorized provider flow (DigiLocker via Cashfree,
-- /settings/identity): Unpatched no longer collects Aadhaar numbers itself. The provider flow
-- stores a reference and an outcome, never the number, an OTP, or a document.
--
-- Existing manually submitted Aadhaar records are deliberately left as they are (owner's
-- decision, Oct 26): their encrypted numbers and reviewed statuses are unchanged and admins can
-- still review a pending one. Only NEW numbers are refused, by whichever path tries to write
-- one, so the app form, the action and any direct RPC call all hit the same wall.
create or replace function private.refuse_new_aadhaar_numbers()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.aadhaar_number_encrypted is not null
     and (tg_op = 'INSERT' or new.aadhaar_number_encrypted is distinct from old.aadhaar_number_encrypted) then
    raise exception 'AADHAAR_VIA_PROVIDER: Aadhaar is verified through DigiLocker -- use Identity & phone in Settings' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_new_aadhaar_numbers() from public;

drop trigger if exists researcher_kyc_refuse_new_aadhaar on public.researcher_kyc;
create trigger researcher_kyc_refuse_new_aadhaar
  before insert or update of aadhaar_number_encrypted on public.researcher_kyc
  for each row execute function private.refuse_new_aadhaar_numbers();

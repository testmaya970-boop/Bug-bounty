-- Audit GOV-3 (P0). private.sensitive_field_encryption_key() (202609010004) silently fell
-- back to a hardcoded, publicly committed string whenever app.settings.kyc_encryption_key
-- was unset -- so Aadhaar/PAN/passport numbers and bank details were effectively encrypted
-- with a known key on any environment that forgot to configure one (confirmed live: the
-- dev DB had no key set). It now fails closed: encrypting or decrypting with no key raises
-- instead of producing ciphertext anyone can decrypt.
--
-- Configure per environment, never in a migration:
--   alter database <db> set app.settings.kyc_encryption_key = '<secret from a secret manager>';
-- Local dev sets the old dev-only string explicitly (db/init/01-app-role.sql), so rows
-- already encrypted with it stay readable. lib/startup-check.ts refuses to boot production
-- when the key is unset or still that dev string.

create or replace function private.sensitive_field_encryption_key()
returns text
language plpgsql stable
as $$
declare
  key text := current_setting('app.settings.kyc_encryption_key', true);
begin
  if key is null or key = '' then
    raise exception 'ENCRYPTION_KEY_MISSING: sensitive-field encryption key is not configured' using errcode = '55000';
  end if;
  return key;
end;
$$;

revoke all on function private.sensitive_field_encryption_key() from public;

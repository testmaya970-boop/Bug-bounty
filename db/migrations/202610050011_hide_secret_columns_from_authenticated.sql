-- Audit TEN-5 (P2, live-verified). `authenticated` had table-wide SELECT on public.users,
-- public.organization_invitations and public.program_invitations, so any row RLS let a user
-- see came with its secret columns: one active researcher could read 5 other users'
-- password_hash (argon2 hashes, but still offline-crackable) and the invitation token
-- hashes. The app never reads these as `authenticated` -- every password_hash read/write is
-- under service_role (services/auth.ts, services/account.ts) and invitation token hashes
-- are only compared inside SECURITY DEFINER functions -- so the boundary held only by code
-- discipline.
--
-- Table-wide SELECT is replaced by a column grant of everything except the secrets.
-- A column added to one of these tables later is NOT readable by `authenticated` until a
-- migration grants it explicitly -- the safe default for tables holding secrets.

do $$
declare
  spec record;
  cols text;
begin
  for spec in
    select * from (values
      ('users', array['password_hash', 'must_reset_password']),
      ('organization_invitations', array['token_hash']),
      ('program_invitations', array['token_hash'])
    ) as t(table_name, hidden)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = spec.table_name and column_name <> all (spec.hidden);

    execute format('revoke select on public.%I from authenticated', spec.table_name);
    execute format('grant select (%s) on public.%I to authenticated', cols, spec.table_name);
  end loop;
end;
$$;

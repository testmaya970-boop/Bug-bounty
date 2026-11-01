-- Audit AUD-1 (P1). public.audit_logs was mutable: service_role had UPDATE/DELETE, no trigger
-- stopped either, and the actor_id / organization_id foreign keys were ON DELETE SET NULL --
-- so deleting a user or an organization silently erased who did what, and an org-scoped row
-- with a nulled organization_id also vanished from that org's own audit view.
--
-- Now append-only for every role, the same way reputation_ledger already is (202608290003):
--   * UPDATE, DELETE and TRUNCATE raise.
--   * The two FKs are dropped and the raw ids kept, so attribution survives the deletion of
--     the user or organization it refers to (an FK action would be an UPDATE, which the
--     append-only rule must refuse anyway).
-- Break-glass: a superuser can still `alter table ... disable trigger`, which is itself a
-- deliberate, visible act -- not something any application role can do.

alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs drop constraint if exists audit_logs_organization_id_fkey;

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);

create or replace function private.reject_audit_log_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AUDIT_LOG_IMMUTABLE: audit log entries cannot be changed or deleted' using errcode = '42501';
end;
$$;

revoke all on function private.reject_audit_log_change() from public;

drop trigger if exists audit_logs_no_update_or_delete on public.audit_logs;
create trigger audit_logs_no_update_or_delete
  before update or delete on public.audit_logs
  for each row execute function private.reject_audit_log_change();

drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.reject_audit_log_change();

revoke update, delete, truncate on public.audit_logs from service_role, authenticated, anon;

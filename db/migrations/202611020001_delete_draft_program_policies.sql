-- A draft created with a published policy (the Launch Program Studio does this) could never be
-- deleted: the program delete cascades to program_policy_versions and the append-only guard
-- refused it. Allow the delete only when it is that cascade, i.e. the parent program row is
-- already gone. Programs are deleted only through delete_draft_program (drafts with no
-- history), so a direct delete or edit of a policy version is still refused.
create or replace function private.guard_program_policy_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.programs where id = old.program_id) then
      return old;
    end if;
    raise exception 'IMMUTABLE_POLICY: published policy versions cannot be deleted' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'superseded_at') is distinct from (to_jsonb(old) - 'superseded_at') or old.superseded_at is not null then
    raise exception 'IMMUTABLE_POLICY: a published policy version cannot be edited -- publish a new version' using errcode = '42501';
  end if;
  return new;
end;
$$;

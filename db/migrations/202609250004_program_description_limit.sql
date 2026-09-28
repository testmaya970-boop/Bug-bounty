-- Raise the public program description cap from 5,000 to 20,000 characters -- 5,000 is too
-- short for a real program policy (overview, rules of engagement, testing notes, reward
-- guidance). 20,000 matches reports.description's existing cap. Widening only: no existing
-- row can violate the new constraint.

alter table public.programs drop constraint if exists programs_description_check;
alter table public.programs add constraint programs_description_check check (description is null or char_length(description) <= 20000);

-- Identical to 202608310002's version except the length check.
create or replace function public.update_program_description(target_program_id uuid, new_description text)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  trimmed text := nullif(trim(coalesce(new_description, '')), '');
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if trimmed is not null and char_length(trimmed) > 20000 then
    raise exception 'INVALID_DESCRIPTION: Use 20000 characters or fewer.' using errcode = '22023';
  end if;

  update public.programs set description = trimmed, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.description_updated', 'program', target_program_id, '{}'::jsonb);

  return updated;
end;
$$;

-- HackerOne-style Engagement type. Same shape as program_type (bounty/vdp,
-- 202609030002) -- a real column on public.programs, immutable at creation, enforced by
-- create_program's own signature, never a derived fact and never mutable afterward in
-- this slice. Deliberately a SEPARATE, coexisting column from program_type: program_type
-- answers "may this program configure a paid bounty policy" (enforced by
-- create_bounty_policy_version), an orthogonal, narrower financial-workflow question;
-- engagement_type answers "what kind of security engagement is this" (the
-- HackerOne-style category an organization's own Engagements tab groups programs by).
-- Neither implies the other -- a pentest or a code-audit engagement can still be a real
-- 'bounty' program_type if the organization pays for it, and a challenge/campaign
-- engagement is very unlikely to ever configure a bounty policy but nothing here forces
-- program_type='vdp' on it. Conflating the two into one column would have silently
-- broken create_bounty_policy_version's own program_type='vdp' rejection for every
-- non-bug_bounty engagement type that DOES pay (pentest, response, code_audit all
-- realistically can).
--
-- Design decisions (mirroring 202609030002's own numbered rationale exactly):
-- 1. engagement_type is a real column, default 'bug_bounty' so every existing program's
--    real behavior and category are completely unchanged by this migration -- the exact
--    safe migration the user asked for, no relationship/data loss, no re-typing.
-- 2. Not separately "enforced" the way program_type is (no RPC currently branches
--    behavior on engagement_type) -- it is a real category fact used for grouping/
--    filtering on the Engagements page, not (yet) a behavioral gate. Nothing in this
--    migration invents a rule engagement_type doesn't actually need to enforce today.
-- 3. engagement_type may only be set at creation, not changed afterward, in this slice --
--    identical reasoning to program_type: a live engagement's category is a foundational
--    fact from the point researchers/reports start attaching to it. No
--    set_engagement_type-style RPC exists; none is added here.
-- 4. No new authorization concept -- engagement_type is set by the same actor
--    (owner/security_admin) who can already create a program.

create type public.engagement_type as enum ('bug_bounty', 'response', 'pentest', 'code_audit', 'challenge', 'campaign', 'spot_check');

alter table public.programs add column engagement_type public.engagement_type not null default 'bug_bounty';

comment on column public.programs.engagement_type is 'The HackerOne-style engagement category this program is (bug_bounty/response/pentest/code_audit/challenge/campaign/spot_check) -- set once at creation, never mutated afterward. Orthogonal to program_type (bounty vs. vdp, a narrower paid-bounty-policy gate): see this migration''s own header comment for why the two must never be conflated. See docs/decisions/0076.';

-- ---------------------------------------------------------------------------
-- create_program, redefined (not duplicated) to accept an optional p_engagement_type,
-- defaulting to 'bug_bounty' so every existing caller keeps working unchanged. Identical
-- to 202609030002's own definition otherwise, with the same overload-disambiguation
-- discipline: the prior 4-parameter signature is a distinct overload to Postgres/
-- PostgREST and must be dropped explicitly first, or the two coexist and dispatch
-- becomes ambiguous for any caller passing only the original 4 arguments (the exact live
-- bug 202609030002's own comment already documents once for this same function).
-- ---------------------------------------------------------------------------

drop function if exists public.create_program(uuid, text, uuid, public.program_type);

create or replace function public.create_program(
  target_org_id uuid,
  program_name text,
  p_idempotency_key uuid default null,
  p_program_type public.program_type default 'bounty',
  p_engagement_type public.engagement_type default 'bug_bounty'
)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trimmed_name text := trim(program_name);
  new_program public.programs;
  existing public.programs;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  if not private.has_org_role(target_org_id, array['owner', 'security_admin']::public.organization_member_role[]) then
    raise exception 'FORBIDDEN: actor cannot create a program in this organization' using errcode = '42501';
  end if;

  if trimmed_name is null or char_length(trimmed_name) = 0 then
    raise exception 'INVALID_NAME: Enter a program name.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) > 160 then
    raise exception 'INVALID_NAME: Use 160 characters or fewer.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into existing from public.programs
      where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
    if existing.id is not null then
      return existing;
    end if;
  end if;

  begin
    insert into public.programs (organization_id, name, created_by, idempotency_key, program_type, engagement_type)
    values (target_org_id, trimmed_name, actor, p_idempotency_key, p_program_type, p_engagement_type)
    returning * into new_program;
  exception
    when unique_violation then
      select * into existing from public.programs
        where organization_id = target_org_id and created_by = actor and idempotency_key = p_idempotency_key;
      if existing.id is not null then
        return existing;
      end if;
      raise;
  end;

  insert into public.program_members (program_id, organization_id, user_id, role, added_by)
  values (new_program.id, target_org_id, actor, 'manager', actor);

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, target_org_id, 'program.created', 'program', new_program.id,
    jsonb_build_object('name', trimmed_name, 'program_type', p_program_type, 'engagement_type', p_engagement_type));

  return new_program;
end;
$$;

revoke all on function public.create_program(uuid, text, uuid, public.program_type, public.engagement_type) from public;
grant execute on function public.create_program(uuid, text, uuid, public.program_type, public.engagement_type) to authenticated;

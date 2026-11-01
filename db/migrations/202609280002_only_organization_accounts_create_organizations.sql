-- Only organization accounts can create an organization (product decision, 2026-09-28).
--
-- Until now any signed-in user could call create_organization (docs/decisions/0024/0025):
-- the researcher/organization choice at sign-up only picked a landing page and was never
-- stored. So a researcher could create an organization, become its owner, and sit on both
-- sides of the platform -- and skip organization sign-up's work-email requirement.
--
-- users.account_type records the sign-up side. It is 'organization' only for an account
-- created through organization sign-up (services/auth.ts verifySignupCode sets it when
-- the verified challenge's intent is 'organization'); everything else is 'researcher'.
-- A BEFORE INSERT trigger on organizations enforces it for every write path, like
-- 202609250003's reports_block_suspended_program, instead of re-copying the large
-- create_organization body.
--
-- Backfill for existing accounts. Anyone who went through email-code sign-up keeps the
-- side they chose there (signup_verification_challenges.metadata.intent -- the rows are
-- kept after use). Accounts older than that flow (seeded, migrated) have no such row:
-- organization = a current organization member with no researcher footprint (no
-- program_researchers row, no report). A researcher who already created an organization
-- stays a researcher -- that organization is left as it is; only creating another is
-- refused.

do $$
begin
  create type public.account_type as enum ('researcher', 'organization');
exception when duplicate_object then null;
end
$$;

alter table public.users add column if not exists account_type public.account_type not null default 'researcher';

with signup_intent as (
  select distinct on (c.user_id) c.user_id, c.metadata ->> 'intent' as intent
  from public.signup_verification_challenges c
  order by c.user_id, c.created_at desc
)
update public.users u set account_type = 'organization'
where u.account_type = 'researcher'
  and (
    exists (select 1 from signup_intent s where s.user_id = u.id and s.intent = 'organization')
    or (
      not exists (select 1 from signup_intent s where s.user_id = u.id)
      and exists (select 1 from public.organization_members m where m.user_id = u.id and m.status <> 'removed')
      and not exists (select 1 from public.program_researchers pr where pr.user_id = u.id)
      and not exists (select 1 from public.reports r where r.researcher_id = u.id)
    )
  );

create or replace function private.require_organization_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.users u where u.id = new.created_by and u.account_type = 'organization') then
    raise exception 'FORBIDDEN: Only organization accounts can create an organization. Sign up for one with your work email.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_require_organization_account on public.organizations;
create trigger organizations_require_organization_account
  before insert on public.organizations
  for each row execute function private.require_organization_account();

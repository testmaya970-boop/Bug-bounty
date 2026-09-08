-- Initial identity, tenant, RBAC and audit foundation.
--
-- NATIVE-POSTGRES MIGRATION EDIT (see db/migrations/README.md): this file originated as
-- supabase/migrations/202608250001_initial_identity_rbac.sql, where identity lived in
-- Supabase Auth's own auth.users (GoTrue-managed) and public.users only held profile
-- data, FK'd to it. There is no auth.users on vanilla Postgres, so public.users is now
-- the root identity table itself: it gains its own id default, password_hash (argon2,
-- set by lib/auth/password.ts), and email_verified_at. The email column itself is added
-- later in this same file set (originally by 202608260001, still true here since that
-- migration also drops its auth.users triggers -- see that file's own edit note).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- See 000000000001_native_auth_shim.sql's identical grant on the public schema for why
-- this is needed at all (Supabase's platform grants schema USAGE implicitly; vanilla
-- Postgres does not) -- functions using extensions.digest/pgp_sym_* run as
-- SECURITY DEFINER authenticated/anon callers, so they need this to resolve those calls.
grant usage on schema extensions to anon, authenticated, service_role;

create type public.platform_role as enum ('researcher', 'organization_owner', 'program_manager', 'triager', 'platform_admin');
create type public.organization_member_role as enum ('owner', 'manager', 'member');

create table public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  password_hash text not null,
  email_verified_at timestamptz,
  platform_role public.platform_role not null default 'researcher',
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.researcher_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  biography text check (char_length(biography) <= 5000),
  avatar_path text,
  reputation_score integer not null default 0 check (reputation_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,63}$'),
  name text not null check (char_length(name) between 1 and 160),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.organization_member_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_id_idx on public.organization_members(user_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  entity_type text not null check (char_length(entity_type) between 3 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_organization_created_idx on public.audit_logs(organization_id, created_at desc);

alter table public.users enable row level security;
alter table public.researcher_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

create policy "users read own profile" on public.users for select to authenticated using (id = auth.uid());
create policy "profiles public read" on public.researcher_profiles for select to authenticated using (true);
create policy "profiles update own" on public.researcher_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members read own memberships" on public.organization_members for select to authenticated using (user_id = auth.uid());
create policy "organizations read if member" on public.organizations for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = auth.uid()));
-- Writes to organization membership, role, organizations and audit logs are service-only initially.
-- Service code must use authenticated claims plus explicit authorization; never browser-supplied roles.

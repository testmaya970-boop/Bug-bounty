-- Hai waitlist (Turn 6/phase-9-ia, item 15 of the 15-point nav map) -- an honest stub for
-- a co-pilot feature that is in design, not built: a real, persisted waitlist signup, no
-- fake chat interface pretending the feature exists. Same shape as public.researcher_feedback
-- (202609020003_settings_platform_expansion.sql): service_role-only table, one
-- SECURITY DEFINER insert RPC, no response workflow (disclosed, not implied).
--
-- One row per user (primary key on user_id, not a surrogate id) -- a second signup by the
-- same user is a no-op via `on conflict do nothing`, never a duplicate row or a thrown
-- error; the RPC still returns whether this call actually joined the list, so the UI can
-- say "you're on the list" either way without lying about whether this specific click did
-- the joining.

create table public.hai_waitlist_entries (
  user_id uuid primary key references public.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.hai_waitlist_entries enable row level security;
revoke all on public.hai_waitlist_entries from anon, authenticated;
grant select, insert on public.hai_waitlist_entries to service_role;

create or replace function public.join_hai_waitlist()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  inserted boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  insert into public.hai_waitlist_entries (user_id) values (actor)
    on conflict (user_id) do nothing;
  select found into inserted;
  return inserted;
end;
$$;
revoke all on function public.join_hai_waitlist() from public;
grant execute on function public.join_hai_waitlist() to authenticated;

create or replace function public.am_i_on_hai_waitlist()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;
  return exists (select 1 from public.hai_waitlist_entries where user_id = actor);
end;
$$;
revoke all on function public.am_i_on_hai_waitlist() from public;
grant execute on function public.am_i_on_hai_waitlist() to authenticated;

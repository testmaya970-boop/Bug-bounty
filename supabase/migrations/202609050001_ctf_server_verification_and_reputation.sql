-- Server-verified CTF flags, wired to real reputation (docs/decisions/0072). Flags move
-- server-side (hashed, never sent to the client) before a solve is ever allowed to
-- produce a reputation_ledger fact -- doing the reverse order would let a plaintext,
-- client-visible flag earn real reputation for free.

-- ---------------------------------------------------------------------------
-- 1. Real challenge + solve tables. Challenge content (title/prompt/hints/category) stays
--    in lib/mock/ctf.ts as static, already-good authored content -- only the flag and the
--    solve record move server-side.
-- ---------------------------------------------------------------------------

create table public.ctf_challenges (
  id text primary key,
  flag_hash text not null,
  points integer not null check (points > 0),
  created_at timestamptz not null default now()
);

alter table public.ctf_challenges enable row level security;
create policy "ctf challenges readable by any signed-in user" on public.ctf_challenges for select to authenticated using (true);
-- flag_hash is never exposed via a SELECT the client can run directly -- the table grant
-- below is intentionally column-scoped so `select *` from a client session cannot read it.
revoke all on public.ctf_challenges from anon, authenticated;
grant select (id, points, created_at) on public.ctf_challenges to authenticated;
grant select, insert, update, delete on public.ctf_challenges to service_role;

create table public.ctf_solves (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references public.users(id) on delete restrict,
  challenge_id text not null references public.ctf_challenges(id) on delete restrict,
  points_awarded integer not null,
  solved_at timestamptz not null default now(),
  unique (researcher_id, challenge_id)
);
create index ctf_solves_researcher_id_idx on public.ctf_solves(researcher_id);

alter table public.ctf_solves enable row level security;
create policy "ctf solves read by the owning researcher" on public.ctf_solves for select to authenticated using (researcher_id = auth.uid());
-- No update/delete grant to any role -- a solve, once recorded, is as immutable as a
-- reputation_ledger fact it is the direct provenance for.
grant select on public.ctf_solves to authenticated;
grant select, insert on public.ctf_solves to service_role;

-- ---------------------------------------------------------------------------
-- 2. Seed the 28 real challenges from lib/mock/ctf.ts -- id and points copied exactly;
--    flag_hash computed once, here, from each challenge's already-authored plaintext flag.
--    The plaintext is typed only in this file, to produce a hash, and is never stored
--    anywhere queryable after this migration runs.
-- ---------------------------------------------------------------------------

insert into public.ctf_challenges (id, flag_hash, points) values
  ('c-web-1', encode(digest('unpatched{c00k1e_tru5t_1ssue}', 'sha256'), 'hex'), 100),
  ('c-web-2', encode(digest('unpatched{r3fl3ct3d_xss_101}', 'sha256'), 'hex'), 100),
  ('c-web-3', encode(digest('unpatched{1d0r_invo1c3_l3ak}', 'sha256'), 'hex'), 250),
  ('c-web-4', encode(digest('unpatched{csrf_n0_t0k3n_n0_pr0bl3m}', 'sha256'), 'hex'), 250),
  ('c-web-5', encode(digest('unpatched{ssrf_m3tadata_r3ach}', 'sha256'), 'hex'), 250),
  ('c-web-6', encode(digest('unpatched{lo0se_c0mpar3_magic_hash}', 'sha256'), 'hex'), 500),
  ('c-web-7', encode(digest('unpatched{ssti_rc3_ach13v3d}', 'sha256'), 'hex'), 1000),
  ('c-crypto-1', encode(digest('unpatched{caesar_was_n0_cryptographer}', 'sha256'), 'hex'), 100),
  ('c-crypto-2', encode(digest('unpatched{x0r_k3y_r3us3_1s_fatal}', 'sha256'), 'hex'), 250),
  ('c-crypto-3', encode(digest('unpatched{n0nce_reuse_breaks_ctr}', 'sha256'), 'hex'), 250),
  ('c-crypto-4', encode(digest('unpatched{cub3_r00t_rsa_n0_padding}', 'sha256'), 'hex'), 500),
  ('c-crypto-5', encode(digest('unpatched{alg_none_is_never_none}', 'sha256'), 'hex'), 500),
  ('c-crypto-6', encode(digest('unpatched{hastad_broadcast_attack}', 'sha256'), 'hex'), 1000),
  ('c-re-1', encode(digest('unpatched{str1ngs_and_a_d1sassembler}', 'sha256'), 'hex'), 100),
  ('c-re-2', encode(digest('unpatched{junk_c0de_hid3s_n0thing}', 'sha256'), 'hex'), 250),
  ('c-re-3', encode(digest('unpatched{unpack3d_and_und3rst00d}', 'sha256'), 'hex'), 250),
  ('c-re-4', encode(digest('unpatched{custom_vm_bytec0de_solv3d}', 'sha256'), 'hex'), 500),
  ('c-re-5', encode(digest('unpatched{d3bugg3r_d3t3ct3d_and_d3f3at3d}', 'sha256'), 'hex'), 1000),
  ('c-pwn-1', encode(digest('unpatched{cl4ssic_st4ck_0v3rfl0w}', 'sha256'), 'hex'), 100),
  ('c-pwn-2', encode(digest('unpatched{r0p_ch41n_c0mpl3t3}', 'sha256'), 'hex'), 500),
  ('c-pwn-3', encode(digest('unpatched{uaf_dangling_p0int3r_pwn}', 'sha256'), 'hex'), 500),
  ('c-pwn-4', encode(digest('unpatched{printf_leaks_the_stack}', 'sha256'), 'hex'), 250),
  ('c-forensics-1', encode(digest('unpatched{app3nd3d_data_aft3r_e0i}', 'sha256'), 'hex'), 100),
  ('c-forensics-2', encode(digest('unpatched{f1l3_carving_r3c0v3ry}', 'sha256'), 'hex'), 250),
  ('c-forensics-3', encode(digest('unpatched{plaintext_liv3s_in_ram}', 'sha256'), 'hex'), 500),
  ('c-network-1', encode(digest('unpatched{pl41ntext_cr3ds_1n_pcap}', 'sha256'), 'hex'), 100),
  ('c-network-2', encode(digest('unpatched{dns_tunn3l_data_ex0}', 'sha256'), 'hex'), 250),
  ('c-network-3', encode(digest('unpatched{v3rsi0n_d0wngrad3_attack}', 'sha256'), 'hex'), 500);

-- ---------------------------------------------------------------------------
-- 3. Loosen reputation_ledger's provenance columns to nullable, replacing the composite-
--    FK guarantee with a check constraint that keeps report/bounty facts exactly as
--    strict as before while allowing a provenance-free CTF fact. See 0072 for the full
--    reasoning on why this is a real, deliberate loosening, not an oversight.
--
--    source_event_id is loosened too, for the identical reason: it exists to key
--    idempotency against a real outbox_events row for the report/bounty flow's
--    asynchronous, at-least-once delivery. A CTF solve has no outbox event at all --
--    submit_ctf_flag commits the solve and its reputation fact in one transaction, and
--    ctf_solves' own unique(researcher_id, challenge_id) constraint is that fact type's
--    real idempotency boundary, the same relationship source_event_id's uniqueness has
--    to the report-outcome flow. The unique constraint on source_event_id is loosened to
--    a partial index so multiple null values (multiple CTF facts) don't collide with each
--    other under the old plain-unique behavior.
-- ---------------------------------------------------------------------------

alter table public.reputation_ledger
  alter column organization_id drop not null,
  alter column program_id drop not null,
  alter column report_id drop not null,
  alter column source_event_id drop not null;

alter table public.reputation_ledger drop constraint reputation_ledger_report_id_program_id_organization_id_fkey;
alter table public.reputation_ledger drop constraint reputation_ledger_report_id_researcher_id_fkey;
alter table public.reputation_ledger drop constraint reputation_ledger_source_event_id_fkey;
alter table public.reputation_ledger drop constraint reputation_ledger_source_event_id_key;
create unique index reputation_ledger_source_event_id_key on public.reputation_ledger(source_event_id) where source_event_id is not null;

-- The FK to outbox_events is re-added, but only enforced when source_event_id is actually
-- populated -- a plain foreign key already permits null naturally (Postgres never checks
-- an FK column that is null), so this is just re-establishing the same reference, not a
-- conditional constraint.
alter table public.reputation_ledger add constraint reputation_ledger_source_event_id_fkey foreign key (source_event_id) references public.outbox_events(id) on delete restrict;

alter table public.reputation_ledger drop constraint reputation_ledger_fact_type_check;
alter table public.reputation_ledger add constraint reputation_ledger_fact_type_check
  check (fact_type in ('report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized', 'ctf_challenge_solved'));

alter table public.reputation_ledger add constraint reputation_ledger_provenance_shape_check check (
  (fact_type in ('report_resolved', 'report_duplicate', 'report_informative', 'report_not_applicable', 'report_rejected', 'bounty_finalized')
    and organization_id is not null and program_id is not null and report_id is not null and source_event_id is not null)
  or
  (fact_type = 'ctf_challenge_solved' and organization_id is null and program_id is null and report_id is null and source_event_id is null)
);

-- ---------------------------------------------------------------------------
-- 4. submit_ctf_flag: the sole path from a flag submission to a reputation fact. Hashes
--    the submission and compares server-side -- the plaintext flag is never read back out
--    of ctf_challenges by any client-reachable path (the table grant above is
--    column-scoped to exclude flag_hash). Idempotent on (researcher_id, challenge_id) via
--    the unique constraint on ctf_solves -- resubmitting an already-solved challenge's
--    correct flag returns already_solved=true, points_awarded=0, never a duplicate fact.
-- ---------------------------------------------------------------------------

create or replace function public.submit_ctf_flag(p_challenge_id text, p_flag text)
returns table (correct boolean, points_awarded integer, already_solved boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  challenge public.ctf_challenges;
  existing public.ctf_solves;
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  select * into challenge from public.ctf_challenges where id = p_challenge_id;
  if challenge.id is null then raise exception 'CHALLENGE_NOT_FOUND: unknown challenge' using errcode = 'P0002'; end if;

  select * into existing from public.ctf_solves where researcher_id = actor and challenge_id = p_challenge_id;
  if existing.id is not null then
    correct := true; points_awarded := 0; already_solved := true; return next; return;
  end if;

  if p_flag is null or encode(extensions.digest(trim(p_flag), 'sha256'), 'hex') <> challenge.flag_hash then
    correct := false; points_awarded := 0; already_solved := false; return next; return;
  end if;

  insert into public.ctf_solves (researcher_id, challenge_id, points_awarded)
  values (actor, p_challenge_id, challenge.points);

  insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, source_event_id, event_type, schema_version, occurred_at)
  values (actor, null, null, null, 'ctf_challenge_solved', null, 'ctf.solved', 1, now());

  correct := true; points_awarded := challenge.points; already_solved := false; return next;
end;
$$;

revoke all on function public.submit_ctf_flag(text, text) from public;
grant execute on function public.submit_ctf_flag(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. list_my_ctf_solves: self-only real solved-state read, replacing lib/ctf-progress.ts's
--    localStorage-based useCtfProgress().
-- ---------------------------------------------------------------------------

create or replace function public.list_my_ctf_solves()
returns table (challenge_id text, points_awarded integer, solved_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select challenge_id, points_awarded, solved_at from public.ctf_solves where researcher_id = auth.uid() order by solved_at desc;
$$;

revoke all on function public.list_my_ctf_solves() from public;
grant execute on function public.list_my_ctf_solves() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Score/leaderboard formula gains one new term: ctf_challenge_solved x 2, the smallest
--    weight in the formula -- a CTF solve is a real, now server-verified accomplishment,
--    but a practice exercise against a static, known-answer challenge is a categorically
--    weaker signal than an organization-confirmed real-world finding. Redefined (not
--    duplicated) -- same signatures, same grants as 202609040001.
-- ---------------------------------------------------------------------------

create or replace function public.get_researcher_reputation_score(p_researcher_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(
    case fact_type
      when 'report_resolved' then 25
      when 'bounty_finalized' then 10
      when 'report_rejected' then -5
      when 'ctf_challenge_solved' then 2
      else 0
    end
  ), 0)
  from public.reputation_ledger
  where researcher_id = p_researcher_id;
$$;

create or replace function public.get_public_leaderboard(p_limit integer default 50)
returns table (
  researcher_id uuid,
  display_name text,
  public_username text,
  score bigint,
  resolved_count bigint,
  bounty_finalized_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id,
    u.display_name,
    u.public_username,
    coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 when 'ctf_challenge_solved' then 2 else 0 end), 0) as score,
    count(*) filter (where r.fact_type = 'report_resolved') as resolved_count,
    count(*) filter (where r.fact_type = 'bounty_finalized') as bounty_finalized_count
  from public.reputation_ledger r
  join public.users u on u.id = r.researcher_id
  group by u.id, u.display_name, u.public_username
  order by score desc, resolved_count desc, u.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.get_my_leaderboard_position()
returns table (rank bigint, score bigint, total_researchers bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED: authentication required' using errcode = '28000'; end if;

  return query
  with ranked as (
    select
      r.researcher_id,
      coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 when 'ctf_challenge_solved' then 2 else 0 end), 0) as score,
      count(*) filter (where r.fact_type = 'report_resolved') as resolved_count,
      row_number() over (order by
        coalesce(sum(case r.fact_type when 'report_resolved' then 25 when 'bounty_finalized' then 10 when 'report_rejected' then -5 when 'ctf_challenge_solved' then 2 else 0 end), 0) desc,
        count(*) filter (where r.fact_type = 'report_resolved') desc,
        r.researcher_id asc
      ) as rank
    from public.reputation_ledger r
    group by r.researcher_id
  )
  select ranked.rank, ranked.score, (select count(*) from ranked) as total_researchers
  from ranked
  where ranked.researcher_id = actor;
end;
$$;

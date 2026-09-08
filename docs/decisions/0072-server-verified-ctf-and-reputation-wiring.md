# 0072 — Server-verified CTF flags, wired to real reputation

## Status

Accepted. Closes the "CTF doesn't connect to anything real" gap. This document
deliberately does two things together, in this order, because doing the second without
the first would create a real exploit: **(1) move flag verification server-side, so a
plaintext flag never reaches the browser, then (2) only after that's true, connect a
verified solve to a new, clearly separate `reputation_ledger` fact type.**

## Why order matters here

Before this change, `lib/mock/ctf.ts`'s `MockCtfChallenge.flag` ships in full to every
client that loads a challenge page, and `lib/ctf-progress.ts`'s `checkFlag()` compares
the submission against it in the browser. This was a reasonable, disclosed design when
CTF was a pure UI showcase with its own separate, mock `ctfPoints` vocabulary — 0016's
own reputation ledger was never at risk, because nothing CTF-related fed it. Connecting a
CTF solve to the real ledger changes that: a plaintext, client-visible flag would let
anyone earn real reputation points by reading the page's own network response or React
props, without ever solving anything. This is exactly the "gameable by researcher" failure
mode 0016's own six-question filter was built to reject. So this document does not wire
CTF to reputation using the existing client-side check — it replaces the check first.

## Schema: real challenges, hashed flags, a real solves table

Challenge *content* (title, prompt, hints, difficulty, category) stays exactly as
authored in `lib/mock/ctf.ts` — this is real, already-good static content, not something
this migration rewrites. What moves server-side is the **flag** and the **solve
record**.

```sql
create table public.ctf_challenges (
  id text primary key,                    -- matches lib/mock/ctf.ts's MockCtfChallenge.id, e.g. 'c-web-1'
  flag_hash text not null,                 -- sha256(trim(flag)), never the plaintext
  points integer not null check (points > 0),
  created_at timestamptz not null default now()
);
-- Public read of id/points only (never flag_hash) -- a client needs to know a challenge
-- exists and what it's worth, never what would satisfy it.

create table public.ctf_solves (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null references public.users(id) on delete restrict,
  challenge_id text not null references public.ctf_challenges(id) on delete restrict,
  points_awarded integer not null,
  solved_at timestamptz not null default now(),
  unique (researcher_id, challenge_id)      -- one solve per researcher per challenge, ever
);
-- RLS: a researcher reads only their own solves. No update/delete grant to anyone but
-- service_role -- a solve, once recorded, is as immutable as a reputation_ledger fact,
-- for the identical reason: it is the provenance a reputation fact will be derived from.
```

A one-time seeding migration populates `ctf_challenges` from the existing 28
`MOCK_CTF_CHALLENGES` entries' `id`/`points`, with `flag_hash` computed from each
challenge's already-authored `flag` value at migration-write time (`encode(digest(trim(flag),
'sha256'), 'hex')`) — the plaintext flags are typed into the migration file once, to
produce their hashes, and never stored anywhere queryable afterward.

## Server-side verification RPC

```sql
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

  if encode(digest(trim(p_flag), 'sha256'), 'hex') <> challenge.flag_hash then
    correct := false; points_awarded := 0; already_solved := false; return next; return;
  end if;

  insert into public.ctf_solves (researcher_id, challenge_id, points_awarded)
  values (actor, p_challenge_id, challenge.points);

  -- Record the reputation fact in the same transaction as the solve itself -- no outbox
  -- indirection needed here, unlike report outcomes: a CTF solve has no organization-side
  -- confirmation step to wait for, so there is no asynchronous event to durably queue.
  -- This is the one place this schema legitimately differs from 0016's report-outcome
  -- flow, and it's because the provenance question is different: a report outcome's
  -- source of truth is an organization's own action, recorded via outbox for at-least-once
  -- delivery guarantees across a real async boundary; a CTF solve's source of truth is
  -- this RPC's own successful hash comparison, which either commits in this same
  -- transaction or the whole insert (solve + fact) rolls back together.
  insert into public.reputation_ledger (researcher_id, organization_id, program_id, report_id, fact_type, source_event_id, event_type, schema_version, occurred_at)
  values (actor, null, null, null, 'ctf_challenge_solved', null, 'ctf.solved', 1, now());

  correct := true; points_awarded := challenge.points; already_solved := false; return next;
end;
$$;
```

**This requires a real schema change to `reputation_ledger` itself**, which 0016 built
around report/bounty provenance specifically (`organization_id`/`program_id`/`report_id`
are all `not null` with composite FKs into `reports`). A CTF solve has none of those —
there is no organization, program, or report behind it. Rather than force a fake
organization/program/report row to satisfy the not-null constraint (which would be
exactly the kind of fabricated-provenance pattern this schema's own FK discipline exists
to prevent), the real design makes these three columns nullable and drops the composite
FK constraints, replacing them with a check constraint that keeps report-outcome facts
exactly as strict as before:

```sql
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
alter table public.reputation_ledger add constraint reputation_ledger_source_event_id_fkey foreign key (source_event_id) references public.outbox_events(id) on delete restrict;

alter table public.reputation_ledger add constraint reputation_ledger_provenance_shape_check check (
  (fact_type in ('report_resolved','report_duplicate','report_informative','report_not_applicable','report_rejected','bounty_finalized')
    and organization_id is not null and program_id is not null and report_id is not null and source_event_id is not null)
  or
  (fact_type = 'ctf_challenge_solved' and organization_id is null and program_id is null and report_id is null and source_event_id is null)
);

alter table public.reputation_ledger drop constraint reputation_ledger_fact_type_check;
alter table public.reputation_ledger add constraint reputation_ledger_fact_type_check
  check (fact_type in ('report_resolved','report_duplicate','report_informative','report_not_applicable','report_rejected','bounty_finalized','ctf_challenge_solved'));
```

This is a real, structural loosening of 0016's original guarantee ("provenance cannot
disagree" via composite FK, and idempotency via a real outbox event) for the six report/
bounty fact types — the check constraint above is the replacement guarantee, verified by
test, not merely by convention. `source_event_id` is loosened for the identical reason:
a CTF solve has no outbox event at all (`submit_ctf_flag` commits the solve and its
reputation fact in one transaction, with no async boundary to bridge), and
`ctf_solves`' own `unique(researcher_id, challenge_id)` is that fact type's real
idempotency boundary — the same relationship `source_event_id`'s uniqueness has to the
report-outcome flow. Every existing report-outcome insert path (`record_reputation_fact`,
`record_bounty_finalized_reputation_fact`) is unaffected in practice (they always supply
all four fields), but the database no longer enforces it via FK/not-null for them alone —
the check constraint above is what still enforces it.

## Score formula change

`get_researcher_reputation_score`, `get_public_leaderboard`, and
`get_my_leaderboard_position` (0065) each add exactly one new term:
`ctf_challenge_solved × 2` — deliberately the smallest weight in the formula (well below
`report_resolved`'s 25 and `bounty_finalized`'s 10), because a CTF solve, however real and
now server-verified, is a practice exercise against a static, known-answer challenge —
not an organization-confirmed real-world finding. The formula should keep reflecting that
a resolved report on a live program is a categorically stronger signal than a CTF solve,
never let CTF volume overtake real research outcomes in the score.

## UI changes

`components/ctf/flag-submission-form.tsx` changes from a pure client-side comparison to a
real Server Action call (`submitCtfFlagAction`) — the same shape every other mutating
form in this codebase already uses. `lib/ctf-progress.ts`'s `checkFlag()` and its
`localStorage`-based `useCtfProgress()` are removed; solved-state is now a real,
per-researcher server read (`listMyCtfSolves()`), matching how every other "have I done
this" state in this app already works.

`lib/mock/ctf.ts` keeps every field except `flag` — the plaintext flag is deleted from
this file entirely once seeded into the migration, so there is no code path left that
could accidentally ship it to a client again.

## What does not change

Report/bounty reputation facts, `get_my_reputation_summary`, the append-only trigger, and
every existing RLS policy on `reputation_ledger` are unchanged in behavior — only the
column nullability and the two constraints described above. Badges (0071) are unaffected
unless a future document adds a CTF-specific badge family, which this one does not.

# 0016: Researcher reputation ledger foundation — facts, not a score

Date: 2026-08-29
Status: Accepted

## Context and the boundary this slice draws

Unpatched now has a complete report lifecycle (submission → triage → resolution/classification → bounty finalization), all built on the transactional outbox from 0015. None of it yet answers a question every serious vulnerability-disclosure platform eventually needs: *is this researcher trustworthy, and why?* This slice builds the durable substrate that question will eventually be answered from — an immutable ledger of objectively-attributable facts about a researcher's history — and deliberately stops there. **No score, ranking, badge, leaderboard, or formula is introduced.** The task is explicit that inventing `accepted = +100, duplicate = -25` before the platform has any experience with how researchers and organizations actually behave would encode a guess as infrastructure, and a wrong guess baked into a scoring formula is far harder to walk back than a missing feature.

The chain built: **researcher activity → attributable reputation events → immutable reputation ledger → derived trust signals (aggregation only)**. Score/ranking/badges/leaderboards/anti-Sybil enforcement/notifications/public profiles are explicitly deferred — named out of scope by the task, and none of them require this slice's schema to change when eventually built.

## Research: event sourcing, Sybil resistance, and how established platforms treat researcher quality

- **HackerOne's and Bugcrowd's own signal models** (reputation, signal, accuracy) are built from the disposition of individual reports over time — accepted/resolved reports raise standing, but a duplicate or informative report is explicitly *not* treated as a penalty the way a knowingly-false or abusive report is. This is the direct precedent for this slice's decision to record duplicate/informative/not_applicable/rejected as **neutral facts** (no positive or negative valence encoded anywhere in the schema) rather than guessing which way they should count.
- **Event sourcing / immutable ledgers** (the pattern behind ledger-style accounting systems and audit logs generally) establish that the append-only log is the source of truth, and any "current state" is a *projection* computed from it, never stored as the authoritative value. Adopted directly: this slice has no `reputation_score` column anywhere, and `get_my_reputation_summary()` is a live re-aggregation of the ledger, not a cached/stored total.
- **Corrections in an immutable ledger are always compensating entries, never mutation** — the accounting-ledger principle of "never edit a posted entry; post a reversing entry instead" is the direct precedent for `compensates_fact_id` (reserved on the schema, unpopulated by this slice — see "Corrections" below).
- **Sybil resistance and duplicate/false-positive reporting** are areas every serious program operator treats as unsolved-in-general — HackerOne's and Bugcrowd's own public policy documents acknowledge program-side signal (an organization's own historical acceptance rate) as a mitigating factor against a single bad-faith rejection, which is precisely why this slice's design goal is **provenance**, not a moderation system: every fact carries its originating organization/program/report, so a *future* trust model can weigh source quality, without this slice pretending to already solve that weighing.
- **Objective attributability** is the filter applied to every candidate event in this slice (see the taxonomy below): the six questions from the task (objectively attributable? final? correctable later? gameable by researcher? abusable by organization? belongs in reputation at all?) were applied to every candidate, not just the ones that made the cut — the exclusions are reasoned, not merely omitted.

## Core design principle: FACT, never INTERPRETATION

Report R123 → final status `resolved` → confirmed severity `high` → bounty finalized are **facts** — they already exist as authoritative state in `reports`/`report_bounty_decisions` before this slice does anything. "This should add +N reputation" would be an **interpretation** — a policy choice about how much a fact should matter, which nothing in this codebase or its research is yet positioned to make correctly. The schema makes the distinction structural, not a code-review convention: `reputation_ledger` has a `fact_type` category column and **no numeric value/score/points/weight column of any kind** — it is not possible to accidentally encode a scoring formula into this table, because there is no column to put it in.

## Reputation event taxonomy: what made the cut, and why

Every candidate from the task's own list was run through the six-question filter:

| Candidate | Objectively attributable? | Final? | Correctable later? | Gameable by researcher? | Abusable by org? | In reputation? |
|---|---|---|---|---|---|---|
| Report **resolved** | Yes — organization RPC call, not self-reported | Yes (0012: terminal, no reopen) | No mechanism exists today (documented, not invented) | No — researcher cannot self-resolve | Org could resolve prematurely, but that is an existing triage-authorization question, not new here | **Yes** — `report_resolved` |
| Report **rejected** | Yes | Yes (terminal) | Same as above | No | Yes, in principle (an org could reject in bad faith) — see "Organization bias" below | **Yes**, but neutral valence — `report_rejected` |
| Report **duplicate** | Yes | Yes (terminal) | Same as above | Low — researcher does not control who reports first | Yes, in principle | **Yes**, but neutral valence, with `duplicate_of_report_id` for provenance — `report_duplicate` |
| Report **informative** | Yes | Yes (terminal) | Same as above | No | Yes, in principle | **Yes**, but neutral valence — `report_informative` |
| Report **not_applicable** | Yes | Yes (terminal) | Same as above | No | Yes, in principle | **Yes**, but neutral valence — `report_not_applicable` |
| Confirmed **severity** | Yes, but only as an attribute of another fact, never standalone | N/A | N/A | Researchers cannot self-assign severity (0012: `set_report_severity` is org-only) | Yes, in principle | **Recorded as an attribute** (`confirmed_severity` column) on `report_resolved`/`bounty_finalized` rows, **never its own fact_type** |
| **Bounty finalized** | Yes — `report_bounty_decisions.state = 'finalized'`, an existing authoritative business outcome | Yes (0013: finalization is terminal) | No reopen mechanism exists today | No | Low — finalization already requires the org's own approval workflow | **Yes** — `bounty_finalized`, fact only, **never the amount** |
| Scope-valid **submission alone** | Submission itself is not yet an outcome — every report starts here | No — provisional | N/A | Trivially — a researcher could submit endlessly to accumulate "submission facts" for free | N/A | **No** — recording bare submission would reward volume over quality, the opposite of a trust signal |
| Provisional **triage states** (new/triaging/needs_information) | Not final — status can still change | No | N/A | N/A | N/A | **No** — the task is explicit that provisional states must never permanently affect reputation |
| Researcher **suspension/revocation** | It is an organization-membership decision (`program_researchers.status`), not a report outcome | Reversible today (an org can reinstate) | Yes, trivially, today | N/A | Highly — a single org's suspension decision could unfairly follow a researcher globally if globalized | **No** — out of scope for *this* slice: it is not a report-outcome fact, it is a membership-state fact with a different shape and a much sharper cross-organization-fairness problem; deliberately left for a future, separately-reasoned slice rather than folded in here as an afterthought |

Six fact types ship: `report_resolved`, `report_duplicate`, `report_informative`, `report_not_applicable`, `report_rejected`, `bounty_finalized`. Nothing else.

## Database schema

One new table, `reputation_ledger`:

- **Identity/provenance**: `id` (pk), `researcher_id` (FK `users`, `on delete restrict` — a researcher's history cannot be silently orphaned by a user deletion), `organization_id`, `program_id`, `report_id`, plus two composite foreign keys — `(report_id, program_id, organization_id) references reports(id, program_id, organization_id)` and `(report_id, researcher_id) references reports(id, researcher_id)` — that make it *structurally impossible* for a ledger row to disagree with the report it claims to be about (not just an application-level check).
- **The fact itself**: `fact_type` (the six-value check constraint above), `confirmed_severity` (nullable, an attribute carried from the report, never a standalone fact), `duplicate_of_report_id` (nullable FK to `reports`, populated if and only if `fact_type = 'report_duplicate'` — enforced by `reputation_ledger_duplicate_shape_check`).
- **Correction reservation**: `compensates_fact_id`, a nullable self-referencing FK, reserved but unpopulated by this slice (see "Corrections" below).
- **Idempotency boundary**: `source_event_id uuid not null unique references outbox_events(id)` — see "Idempotency" below.
- **Versioning/audit**: `event_type`, `schema_version`, `occurred_at`, `created_at`.

Indexes: `researcher_id`, `organization_id` — matching the two access patterns this slice actually has (a researcher's own history; an organization's own facts via RLS). No `fact_type` index yet — deliberately: with six fact types and no query in this slice filtering by `fact_type` alone at scale, an index here would be speculative. Added when a real query pattern (a future aggregation endpoint doing high-volume filtering) justifies it, not preemptively.

A pre-existing, unrelated artifact: `public.researcher_profiles.reputation_score` (from Phase 1's `202608250001_initial_identity_rbac.sql`) already exists in the schema and is referenced by **zero** application code (confirmed by a repo-wide grep). This slice does not touch it, does not read it, does not write it, and is explicitly **not** the mechanism it might have been intended for — it is dead schema from before this slice's design existed, documented here so a future engineer does not mistake it for part of this system.

## Ledger invariants (enforced in the database, not just TypeScript)

- **Append-only**: `private.reject_reputation_ledger_mutation()`, an unconditional-raise trigger function, attached via `BEFORE UPDATE`/`BEFORE DELETE` triggers. Verified live against real, existing rows via a direct, maximally-privileged `psql` connection — both a raw `UPDATE ... WHERE true` and a raw `DELETE FROM reputation_ledger` were rejected with the trigger's own error, not merely denied by a grant.
- **No duplicate reputation facts from the same source event**: `source_event_id unique`.
- **Server-derived researcher identity**: provenance fields are read from the locked `reports`/`report_bounty_decisions` row inside the RPC, never accepted as RPC parameters from the caller.
- **Provenance cannot disagree**: the two composite foreign keys above.
- **Cross-tenant references are impossible**: the composite FK ties `organization_id`/`program_id`/`report_id` together at the constraint level.
- **Client cannot assign a value, insert an arbitrary event, or mutate state**: no numeric column exists to assign; `authenticated`/`anon` have no `insert`/`update`/`delete` grant on the table at all, and both insertion RPCs are `revoke all ... from public, authenticated, anon` / `grant execute ... to service_role` only.

## Event → outbox → consumer flow

Unchanged pattern from 0015, reused, not reinvented. Six existing RPCs (`resolve_report`, `mark_duplicate`, `mark_informative`, `mark_not_applicable`, `reject_report`, `finalize_bounty`) are redefined — every prior line of logic preserved exactly — adding exactly one `insert into outbox_events` after each one's existing `audit_logs` insert, in the same transaction. `workers/outbox/handlers/reputation/report-outcome.ts` exports a single factory, `createReportOutcomeHandler(factType)`, registered five times (once per report-outcome event type) rather than five near-duplicate files, while the registry itself still dispatches on the fully explicit `event_type:schema_version` pair — never a generic handler. `workers/outbox/handlers/reputation/bounty-finalized-v1.ts` handles the sixth. Both handler files call the corresponding `record_*` RPC via the existing service-role-only outbox client and classify `PROVENANCE_MISMATCH`/`REPORT_NOT_FOUND`/`INVALID_FACT_TYPE` as permanent (dead-letter immediately) versus anything else as retryable — the same permanent/retryable split 0015 established.

**Atomicity is preserved exactly as 0015 established it**: the report/bounty mutation, its audit row, and its outbox row commit together in one transaction; the worker consumes the outbox row independently, later, and a worker failure never rolls back or blocks the original domain mutation. A report can be resolved, rejected, or have its bounty finalized with the reputation worker completely down — the event simply waits in `outbox_events` until the worker returns.

## Consumer idempotency

Two independent, live-proven guarantees:

1. **Sequential redelivery is safe**: both `record_reputation_fact` and `record_bounty_finalized_reputation_fact` check for an existing row by `source_event_id` first and return it unchanged if found — proven live by forcibly resetting an already-processed outbox row back to `pending` and redelivering it through the real worker; the ledger row count for that event stayed at exactly 1.
2. **Genuine concurrent delivery is also safe**, but this required a real fix, not just the check-then-insert pattern above. The check step is a plain `select`, not `select ... for update` — under true concurrency, two simultaneous calls with the identical `source_event_id` could both pass the "not found" check before either commits. The `source_event_id unique` constraint still guarantees only one *row* can ever exist, but without further handling, the losing call would surface a raw, unhandled Postgres `23505 unique_violation` to its caller instead of gracefully returning the winning row. **This was caught by live testing, not assumed away**: an initial concurrency test using two `Start-Job`-backed HTTP calls against a fresh, never-before-processed `source_event_id` returned identical, successful rows on both calls — but closer inspection showed both calls returned the *same* `created_at`, meaning `Start-Job`'s own spin-up overhead likely serialized the two calls at the database level rather than proving true simultaneity. Since the theoretical race is real regardless of whether PowerShell could force it to manifest, both RPCs were given a `begin ... exception when unique_violation then select existing ... end` block around the insert, so a genuine race loser now returns the same row the winner does instead of an error. Re-verified after the fix (fresh `supabase db reset`, full re-run of the setup/worker/RLS/concurrency scripts): identical passing behavior, now with the theoretical race actually closed rather than merely unobserved.

## Correction / compensation model

The domain has **no mechanism today** to reopen a resolved/rejected/duplicate/informative/not_applicable report or un-finalize a bounty (0012 and 0013 both deliberately made these terminal). Because of that, this slice does **not** invent a correction/reopen flow — doing so would be scope creep the task explicitly warns against. What it does instead: `compensates_fact_id` (a nullable, self-referencing FK) exists on the schema now, unpopulated by any code in this slice, as the reserved shape a future correction would use — *if* the domain ever grows an authorized correction mechanism, the reputation consumer would record the original fact **and** a new compensating fact referencing it via this column, never `UPDATE` the original row. No code path produces a populated `compensates_fact_id` today; this is intentionally an unused extension point, not a half-built feature.

## Organization / researcher privacy

A researcher's ledger rows retain their originating `organization_id`/`program_id`/`report_id` (required for the composite-FK provenance guarantee above), but the **only** read surfaces this slice ships are: (1) direct-table RLS-scoped access, restricted to the owning researcher or that specific report's own organization — never a stranger org, never a different researcher; and (2) `get_my_reputation_summary()`, a `security definer` RPC that re-derives the caller from `auth.uid()` (no parameter — structurally self-only) and returns only `(fact_type, count)` aggregates, never a raw row, never another organization's name, never a private report ID exposed outside the caller's own scope. No new privacy role was invented — the RLS policy reuses the exact `has_org_role`/`is_program_member` helpers every other table in this codebase already uses. Financial privacy: `bounty_finalized` never carries an amount or currency column anywhere on the ledger — verified by an automated test asserting the RPC body contains no `amount`/`currency` token.

## Organization bias / abuse

A single organization can still decide a specific report's outcome unfairly — that is an existing property of the triage/resolution authorization model (0009/0012), not something this slice can or should re-litigate. What this slice adds is **provenance, not moderation**: every fact permanently carries which organization/program produced it. A future trust model can therefore weigh an organization's own historical pattern (e.g., an organization that rejects nearly everything looks different from one with a normal acceptance distribution) without this slice pretending to already build that weighting, and — critically — without ever being able to erase the underlying event. An organization can produce a new fact about a researcher; it can never rewrite or delete one that already exists.

## RLS / security

`reputation_ledger` has RLS enabled with one policy, deliberately following this codebase's *normal* RLS pattern (owning researcher OR the report's own org via `has_org_role`/`is_program_member`) rather than 0015's *zero-policy* pattern — reasoned explicitly, because unlike `outbox_events` (which has no legitimate human reader at all), the reputation ledger has two: the researcher it is about, and the organization whose report produced it. Verified live across four distinct identities: the owning researcher (sees their own rows), a second, unrelated researcher (empty result, not an error — RLS filters rows, it does not reject the query), a cross-tenant organization owner (empty result), and anonymous (empty result; `get_my_reputation_summary()` rejects anonymous outright with `AUTH_REQUIRED`, since it requires a caller identity to aggregate against). Both insertion RPCs are `service_role`-only, confirmed live: an authenticated organization owner and an authenticated researcher both received `42501 permission denied for function ...` calling them directly.

## PostgreSQL and worker verification

All of the following were proven against a real, freshly-reset local Supabase Postgres instance — no mocked services for these paths:

1. Accepted-then-resolved report → `report_resolved` fact recorded.
2. Terminal rejected report → `report_rejected` fact recorded, no valence encoded.
3. Duplicate → `report_duplicate` fact recorded with `duplicate_of_report_id` populated.
4. Informative → `report_informative` fact recorded.
5. Not applicable → `report_not_applicable` fact recorded.
6. Bounty finalized → `bounty_finalized` fact recorded, confirmed no amount/currency on the row.
7. Non-terminal report → confirmed zero reputation facts exist for it.
8. Owning researcher → direct-table read of their own rows succeeds.
9. Duplicate outbox delivery (same event redelivered through the real worker) → ledger row count unchanged at 1.
10. Second, unrelated researcher → direct-table read returns empty.
11. Cross-tenant organization → direct-table read returns empty.
12. Direct client insertion into either RPC → denied with `42501`.
13. Direct ledger mutation (`UPDATE`/`DELETE`, even from a service-role `psql` connection) → rejected by the append-only trigger.
14. Malformed event payload → dead-lettered by the real worker, with a permanent-error message.
15. Unknown event type → dead-lettered.
16. Event version mismatch (`report.resolved:2`, no handler registered) → dead-lettered, naming the missing `type:version`.
17. Provenance mismatch (claiming `report_resolved` for a report that is not actually resolved) → dead-lettered with `PROVENANCE_MISMATCH`.
18. Genuinely concurrent duplicate processing (two simultaneous calls, identical never-before-seen `source_event_id`) → both calls return the same row; exactly one ledger row exists afterward — verified both before and after the `unique_violation` handling fix described above.

The real worker (`runBatch`, `workers/outbox/worker.ts`) was used for every worker-mediated test above, invoked directly via `tsx` against the live database — no second worker framework, no mocked handler registry.

## 10× assessment

- **Trustworthiness**: every fact is traceable to the exact domain mutation, report, and organization that produced it — a future decision can always be explained by pointing at the underlying, unerasable events.
- **Hardness-to-game**: every fact type requires an organization-side authoritative action; a researcher cannot manufacture a fact by any client-visible action (no client insertion path exists at all).
- **Fairness**: history is correctable in the future (via the reserved `compensates_fact_id` mechanism) without ever erasing the original evidence.
- **Cost**: reuses the existing Postgres instance and the existing outbox worker; zero new infrastructure.
- **Future-proofing**: the aggregation surface (`get_my_reputation_summary`) is a live re-computation, not a stored value — a future scoring algorithm can change its weighting of these same facts without any migration to the underlying history.
- **Scalability**: multiple workers already process outbox events concurrently (proven in 0015); this slice's handlers run through that same concurrent machinery unchanged.

## Deferred, explicitly

Leaderboards, rankings, badges, XP, a points marketplace, a social graph, endorsements/reviews, a public researcher profile, program recommendations, AI-driven reputation scoring, a complete anti-Sybil system, a moderation system, time decay, a final numeric reputation score or formula, and folding researcher suspension/revocation into this ledger — all named out of scope by the task, and none of them require this slice's schema or RPCs to change when eventually built.

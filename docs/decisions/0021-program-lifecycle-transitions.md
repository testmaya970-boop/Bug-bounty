# 0021: Program lifecycle transitions — five purpose-built RPCs, no generic status setter

Date: 2026-08-30
Status: Accepted

## Context

`0005-program-lifecycle.md` created every program directly at `draft` and deliberately shipped no transition mechanism, reasoning that "publishing a program to `review` or `active` is a meaningfully different, separate capability... building a transition RPC now would either be a no-op stub... or would have to invent the very rules DOMAIN.md defers." That deferral has now outlived its justification: every program that has ever existed in this system has been permanently stuck at `draft`, since no code path can move it anywhere else. This slice builds exactly the mechanism `0005` anticipated ("this enables next: a future slice can add `advance_program_status`-style transition RPC(s)... following the exact pattern `create_program` already establishes"), reusing the report-triage architecture (`0009`) verbatim rather than inventing a second one.

## The transition matrix

```text
draft   -> review
review  -> active
active  -> paused
paused  -> active
active  -> closed
paused  -> closed
```

Implemented as data (`private.program_status_transitions`), the identical pattern `private.report_status_transitions` (`0009`) already established — one place to verify against `DOMAIN.md`'s own lifecycle, not eight hand-written `IF` chains. `closed` has no outgoing row: it is terminal, mirroring `DOMAIN.md`'s own report-lifecycle precedent that a terminal outcome has no exit transition. No other edge exists — `draft -> active`, `review -> paused`, `closed -> anything`, and a self-loop on any status are all absent from the table and therefore rejected by construction, not by a hand-written exclusion list.

## Five RPCs, not a generic setter

`submit_program_for_review`, `activate_program`, `pause_program`, `resume_program`, `close_program` — each hardcodes its own target status in its own `UPDATE` statement, exactly as every report-triage transition RPC already does. There is no code path anywhere in this migration where a `program_status` value flows from a client parameter into a `SET status = ...` clause.

**A genuine wrinkle report-triage never had**: `activate_program` and `resume_program` both target `active`, from two different, non-interchangeable prior states with two different real-world meanings — a program's first go-live after review, versus recovering from a pause. The shared transition table alone cannot express "which specific RPC is the correct one for this specific prior state," since both `review -> active` and `paused -> active` are legitimately present in it (both are globally legal edges). Each of these two functions therefore additionally asserts its own expected prior status (`program.status <> 'review'` / `<> 'paused'`) before deferring to the shared table, so `activate_program` can never fire from `paused` and `resume_program` can never fire from `review`, even though the underlying edge each of them shares with the other is legal in the table. `close_program` has no such narrowing: closing means the identical real-world action regardless of whether the program was `active` or `paused`, so one function legitimately covers both source states.

## Authorization

Unchanged from `0004`: the exact two-path check every other program-management mutation in this schema already uses — organization Owner/Security Admin (`private.has_org_role`) or an explicit `program_members` row (`private.is_program_member`). No new role is introduced. Billing Admin, Program Manager (the *organization*-level role, distinct from the program-level `manager` role per `0004`), Triager, a researcher with program access, a stranger with no organization relationship, and a cross-tenant organization's own owner are all rejected identically — `FORBIDDEN`, never an existence leak, verified live against every one of those six identities.

## Concurrency

`private.lock_and_authorize_program_for_lifecycle` mirrors `private.lock_and_authorize_report_for_triage` (`0009`) exactly: `SELECT ... FOR UPDATE` locks the program row before authorizing and returning it, so two managers racing to transition the same program serialize on the row rather than both reading a stale `status` and both succeeding. Verified live two ways: (1) two genuinely simultaneous, *identical* `close_program` calls against the same active program resolved to exactly one success and one clean `INVALID_PROGRAM_TRANSITION` rejection, with exactly one new audit event; (2) a genuinely simultaneous `pause_program` + `close_program` pair (the task's own suggested conflict case) resolved deterministically but instructively — because `close_program` legitimately accepts a `paused` source, the row lock does not force these two *specific* calls to be mutually exclusive: whichever wins the lock first determines what the second one legally sees next, and both can coherently succeed in sequence (`active -> paused -> closed`) exactly as if issued one after another rather than concurrently. This is not a bug — it is the correct behavior of row-level serialization applied to two individually-legal operations that happen not to conflict in effect. The property the task actually cares about — no impossible/torn final state, no double-processing of the *same* transition — was proven by both tests; a real conflict (two identical concurrent calls) needed the first test to demonstrate "exactly one winner," since the second pair was never truly a conflict once both edges are considered.

## Idempotency

No new mechanism was introduced. Because the target status is hardcoded per function and validated against the current, just-locked `status`, calling `activate_program` twice fails the second time with `INVALID_PROGRAM_TRANSITION` (`program.status <> 'review'` is now true) before any write — the identical "idempotency via rejection" pattern `finalize_bounty` (`0013`) already established for an already-finalized decision. Zero audit events are written on a rejected call, since the audit insert happens only after the update succeeds.

## Audit

Every successful transition writes exactly one `audit_logs` row: `program.submitted_for_review`, `program.activated`, `program.paused`, `program.resumed`, `program.closed` — each recording `previous_status` in its metadata. Every rejected transition (illegal edge, wrong actor, wrong specific prior state for `activate_program`/`resume_program`) writes zero. Verified live for every branch in the full test matrix, not just spot-checked.

## RLS / direct mutation

No RLS policy was added or changed. `public.programs` already has no `INSERT`/`UPDATE`/`DELETE` policy at all (`0004`) — only these new `SECURITY DEFINER` functions, which bypass RLS internally like every other RPC in this schema, can ever write `programs.status`. Verified live: a direct authenticated-client `UPDATE public.programs SET status = 'active' ...` affects zero rows and leaves the row unchanged, confirmed by re-reading it afterward. This re-confirms, rather than newly discovers, `docs/security/phase-2-rpc-review.md`'s own "Disclosed observation... a schema-wide default-ACL grants `anon` full table privileges, neutralized entirely by RLS": Supabase's local project bootstrap sets a default ACL granting broad table privileges (`arwdDxtm`) to `anon`/`authenticated` on every `public` table regardless of each migration's own narrower `grant select ... to authenticated` statements. `\dp public.programs` shows the identical pattern that document's own `\z public.report_messages` check found. The actual, load-bearing protection against direct client mutation on `programs.status` is RLS policy absence (no `INSERT`/`UPDATE`/`DELETE`/`ALL` policy exists), not the table-level `GRANT` lines — consistent with, not a correction to, that document's existing conclusion.

## Interactions with existing functionality (deliberately unchanged)

- **Report submission**: `submit_report`'s existing `program.status in ('paused', 'closed')` block is untouched and was re-verified live at every one of the five statuses — submission remains allowed at `draft`/`review`/`active`, and is now, for the first time, actually reachable at `paused`/`closed` (previously unreachable dead code, since no program could ever become either).
- **Scope mutation**: `add_scope_entry`/`update_scope_entry`/`remove_scope_entry`'s existing `program.status = 'draft'` gate is untouched. A real, disclosed consequence: once a program leaves `draft`, its scope can never be edited again through any existing mechanism, since there is no transition back to `draft`. An organization must finalize scope before submitting for review. This is not a bug introduced by this slice — it is an existing property of the scope gate now made *reachable* for the first time — and no precondition (e.g., "scope must be non-empty before review") was added to `submit_program_for_review`, since neither `DOMAIN.md` nor this task's own transition matrix specifies one; inventing one would repeat the exact anti-pattern `0005` itself warned against.
- **Researcher invitation**: `invite_researcher_to_program`'s existing lack of lifecycle gating is untouched, per `0007`'s own reasoning (built before any transition existed, so gating on anything but every-program-is-draft would have made the capability unreachable). `DOMAIN.md` does not require lifecycle-gating researcher invitations, so this was left exactly as `0007` built it rather than silently changed as a side effect of this slice.
- **Triage, bounty**: untouched; neither reads nor is read by `programs.status` in any way this slice modifies.

## Deferred (explicitly, not by omission)

- A precondition on `submit_program_for_review` (e.g., requiring at least one active scope entry) — not specified by `DOMAIN.md` or this task, not invented here.
- Any UI surface for triggering a transition — this is a backend-only slice; the existing `ProgramStatusBadge` already renders whatever real status is stored, and was confirmed live to now show `active` for a program advanced through this slice's RPCs, with zero frontend code changed.
- Program deletion, and any lifecycle state beyond `DOMAIN.md`'s own five — unchanged from `0005`'s own deferral.

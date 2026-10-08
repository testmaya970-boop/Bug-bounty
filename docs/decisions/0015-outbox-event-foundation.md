# 0015: Transactional outbox + job execution foundation — a durable, Postgres-native event boundary, no queue/broker

Date: 2026-08-29
Status: Accepted

## Context and the boundary this slice draws

Every domain built so far (reports, triage, bounty, payments) is entirely synchronous: a mutation and everything it implies commit together in one Postgres transaction, or none of it does. That is correct and has been deliberately preserved everywhere — but it means nothing in Unpatched can yet trigger work that must happen *outside* that transaction (a notification, a scan, a real payment-provider call) without either blocking the request on an external call inside the transaction (fragile: a slow or down dependency now fails the domain mutation itself) or accepting an unsafe dual-write (the DB commits but the external call is silently never made, or vice versa). This slice builds the smallest durable mechanism that lets a future domain schedule such work safely: write a durable, transactional *fact* that something happened, and let an independent worker process react to that fact, with retries, on its own time.

This is infrastructure, not a product feature. No Reputation, Notifications, Analytics, Stripe/Razorpay, or Kafka/Redis/microservices are introduced. Exactly one existing RPC (`submit_report`) is instrumented as the reference integration.

## Research: transactional outbox, at-least-once delivery, and what "exactly-once" actually means

- **The transactional outbox pattern** solves the dual-write problem by making the "publish" step a write to the *same* database as the domain mutation, in the *same* transaction — never two independent systems that can only be made consistent with a distributed transaction coordinator neither side has. Adopted directly: `submit_report` inserts its `outbox_events` row in the same function invocation (therefore the same transaction) as its `reports` row and `audit_logs` row.
- **At-least-once delivery is the only honest guarantee** a database-backed queue can make: a worker can crash after performing a side effect but before recording completion, and the event will be redelivered. **Exactly-once execution is not claimed anywhere in this slice** — see "Idempotency" below for what is actually guaranteed instead.
- **Idempotent consumers**, not exactly-once delivery, are how real systems get an effectively-once *outcome*. Adopted: `outbox_event_receipts`, a `(consumer_name, event_id)`-keyed table a handler writes to (via `INSERT ... ON CONFLICT DO NOTHING`) before performing its side effect — a second delivery finds the row already there and skips the side effect, guaranteed by a primary key, not by application code remembering to check.
- **`FOR UPDATE SKIP LOCKED`** is the standard, well-documented Postgres primitive for a multi-consumer work queue: it lets N concurrent claimants each grab a disjoint set of rows without blocking on each other or requiring an external coordinator. Adopted directly inside `claim_outbox_events`.
- **Worker leasing with a timeout, reclaimed automatically on the next claim call**, is how a crashed worker's claimed-but-never-finished row becomes available again without a separate "reaper" process. Adopted — see "Worker claim/lease algorithm" below.
- **Poison messages are handled by bounded retries plus a genuine dead-letter state**, not infinite retries and not silent deletion. Adopted.
- **Webhook idempotency** (a provider redelivering the same webhook) is the identical problem or an idempotency-key mechanism the future provider integration will need; documented as a connection point, not built, since no real provider exists yet.

## Architecture

```text
Domain mutation (e.g. submit_report)
  → domain row insert/update
  → audit_logs insert (existing, unchanged)
  → outbox_events insert   ← same transaction, same function, same commit/rollback
COMMIT (or ROLLBACK — in which case none of the above exists, not just the domain row)
        ↓
Worker process (workers/outbox/run.ts, a standalone Node script, never part of the Next.js
app or bundle) polls claim_outbox_events()
        ↓
Handler registry (event_type:schema_version → handler function)
        ↓
Handler performs its side effect, guarded by outbox_event_receipts
        ↓
complete_outbox_event() records the outcome
```

## Event envelope

`outbox_events` columns *are* the envelope — no separate wrapper type. Minimum fields, chosen deliberately (not the task's own example shape copied blindly):

`id` (also the envelope's `event_id`), `event_type`, `schema_version`, `aggregate_type`, `aggregate_id`, `organization_id` (tenant isolation, always populated — every event in Unpatched is tenant-scoped), `payload` (jsonb), `occurred_at`, `available_at` (when it next becomes claimable — supports scheduled retry), `attempts`/`max_attempts`, `status`, `locked_at`/`locked_by` (the lease), `processed_at`, `last_error`, `created_at`/`updated_at`. No `schema_version`-less design was considered: a future `report.created` v2 must be a distinct, explicitly-versioned registry entry (`report.created:2`), never a silent reinterpretation of v1's payload shape — see `workers/outbox/registry.ts`.

## Database schema

Two tables. `outbox_events`: as above, plus a shape check constraint (`locked_at`/`locked_by` set if and only if `status = 'processing'`) and two partial indexes matching the claim query's own predicate (`status = 'pending'` on `available_at`; `status = 'processing'` on `locked_at`), plus an `(aggregate_type, aggregate_id)` index for debugging. `organization_id` has a real foreign key to `organizations`, but **`aggregate_id` deliberately has none** — it is polymorphic (which table it points into depends on `aggregate_type`), the identical, already-accepted tradeoff `audit_logs.entity_id` makes for the same reason. `outbox_event_receipts`: `(consumer_name, event_id)` primary key, `event_id` FK to `outbox_events` — the entire idempotency mechanism.

## State machine

Only four states, all reachable by this slice's own code — no state added because it "sounds useful":

```text
pending  --(claim)--> processing --(success)--> succeeded    (terminal)
                          |
                          +--(failure, attempts < max)--> pending (available_at = now()+backoff)
                          |
                          +--(failure, attempts >= max, OR permanent)--> dead_letter  (terminal)
```

There is no separate "failed" state distinct from "pending, will retry after backoff" — `attempts`/`last_error` already distinguish a fresh row from a retried one, and inventing a fifth state to say the same thing would be exactly the anti-pattern the task warns against. `dead_letter` is reached two ways: `complete_outbox_event(..., permanent: true)` (an error that can never succeed no matter how many retries — an unknown event type, a payload that fails validation) bypasses the attempts counter entirely; or `attempts >= max_attempts` on an ordinary retryable failure.

## Worker claim/lease algorithm

`claim_outbox_events(worker_id, batch_size, lease_seconds)`, called concurrently by any number of worker processes, does two things atomically in one function call:

1. Dead-letters any row that is `processing`, whose lease has expired (`locked_at` older than `lease_seconds`), **and** whose `attempts` already reached `max_attempts` — closing a real gap: without this, a worker that reliably crashes immediately after claiming a poison event could have it reclaimed and re-claimed forever, since lease-expiry reclaiming alone has no attempt limit of its own.
2. Claims up to `batch_size` rows matching *either* "genuinely pending and due" *or* "processing, but the lease looks abandoned," via `... FOR UPDATE SKIP LOCKED ... LIMIT batch_size`, then updates exactly those rows to `processing` with the caller's `worker_id` and an incremented `attempts`, returning them. `SKIP LOCKED` is what makes concurrent callers never contend for or double-claim the same row — proven live under two, then six, concurrent callers (see below).

No separate reaper/sweep process exists — the claim query's own predicate already recovers an abandoned lease on the very next call from any worker, anywhere.

## Retry/dead-letter behavior

Backoff is exponential and capped: `least(2^attempts, 300)` seconds, computed by a pure, deterministic `private.outbox_backoff_seconds` (no randomness, no external state, fully reproducible in a test). `complete_outbox_event` is the **only** path out of `processing`; it additionally requires the caller to still hold the lease it thinks it holds (`locked_by = worker_id`), rejecting with `LEASE_LOST` otherwise — a worker whose lease was already reclaimed by someone else (because its own lease had expired) can never silently overwrite the reclaiming worker's in-flight or already-completed work.

## Idempotency

Two distinct guarantees, at two distinct layers, matching the task's own framing exactly:

1. **Delivery is at-least-once, never exactly-once** — a crash between a handler's side effect and its `complete_outbox_event` call, or a lease-expiry reclaim, can and will redeliver the same event. This is not a bug to be engineered away; it is the honest limit of what a single database can guarantee about work that happens outside it.
2. **Consumer-side idempotency** closes the gap: the reference handler (`report.created:1`) writes a `(consumer_name, event_id)` row to `outbox_event_receipts` via `INSERT ... ON CONFLICT DO NOTHING` *before* performing its side effect, and skips the side effect entirely if no row was actually inserted (i.e., it already exists). Verified live: the identical event was processed twice end-to-end through the real worker code, and its one observable side effect (a log line standing in for a future real notification) occurred exactly once, while the outbox row itself was legitimately reprocessed both times (proving the *delivery* layer is honestly at-least-once, while the *consumer* layer is what makes the outcome idempotent).

## Audit vs. outbox

Never conflated. `audit_logs` answers "what happened, for forensic/business history," is unchanged by this slice, and is still written by `submit_report` exactly as before. `outbox_events` answers "something happened that another process may need to react to" and is read only by a worker process, never rendered to a human. `submit_report` writes both, in the same transaction, for two different readers — neither replaces the other, and no worker anywhere reads `audit_logs`.

## Security / RLS

Both tables have RLS enabled with **zero permissive policies** for `authenticated`/`anon` — not a narrow policy, an absence. Additionally, and more strongly than every other table in this codebase, `authenticated`/`anon` have **no base table grant at all** (`revoke all ... from authenticated, anon`), so a query from those roles fails with a real Postgres permission error before RLS is even evaluated — confirmed live (`42501 permission denied for table outbox_events`) for an anonymous request, an authenticated researcher, and a direct RPC call from an authenticated org owner. Only `service_role` — used exclusively by `workers/outbox/client.ts`'s standalone, non-Next.js Supabase client, mirroring `lib/evidence-store.ts`'s existing trust boundary for object storage — can reach either table or either RPC (`claim_outbox_events`/`complete_outbox_event`, both revoked from `public`/`authenticated`/`anon` and granted only to `service_role`). No generic `process_event(id)` is exposed to browser clients; the worker's execution mechanism is a standalone script (`workers/outbox/run.ts`), never a page, Server Action, or public RPC.

## Domain integration (the one reference path)

`submit_report` (`0008`) is redefined, not duplicated, adding exactly one insert: a `report.created` v1 outbox event, positioned after its existing `reports` insert and `audit_logs` insert, in the same function/transaction. No other existing RPC (bounty, payment) is touched — the payment domain in particular is explicitly left alone, per the task's own instruction, since proving the pattern does not require it. A rollback of the whole transaction (tested live via an explicit `BEGIN; ...; ROLLBACK;`) removes the report row and the outbox row together — neither survives without the other.

## 10× assessment

- **Cheaper**: runs entirely on the Postgres instance Unpatched already pays for; no Kafka, Redis, or managed queue service to provision, operate, or pay for separately.
- **Safer**: a crashed worker never loses an event (lease expiry makes it reclaimable) and never silently duplicates a side effect (the receipts table). A poison message reaches a genuine terminal `dead_letter` state instead of looping forever or vanishing.
- **Simpler**: the entire mechanism is inspectable with `SELECT * FROM outbox_events` — no separate broker UI, no separate operational surface. A new engineer can read the four-state diagram above and the two SQL functions and understand the whole system.
- **Scalable**: any number of worker processes can run `claim_outbox_events` concurrently with zero coordination between them; proven live with 6 concurrent workers against 120+ events with zero double-claims and zero lost events.
- **Reusable**: the next real consumer (payment provider webhooks, evidence/file scanning, researcher lifecycle notifications) is a new handler file plus one `registerHandler` call — the table, the two RPCs, and the claim/lease/retry/dead-letter machinery are already built and already proven.

## Deferred, explicitly

Real payment-provider webhook handling, malware-scanning workers, Notifications, Reputation, Analytics, a management UI/dashboard for the queue, reconciliation between "outbox says succeeded" and an external system's own record of the same fact, cross-region/multi-database outbox replication, and retrofitting every existing mutation (bounty, payments) to also emit outbox events — all named out of scope by the task, and none of them require this slice's schema or RPCs to change when they are eventually built.

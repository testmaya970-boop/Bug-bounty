// Live E2E exercise of workers/outbox/queue.ts (claimOutboxEvents/completeOutboxEvent)
// against the real native Postgres instance -- insert a real event, claim it, fail it
// retryably (verify backoff scheduling), reclaim once available again, then complete it
// successfully. Run with tsx (workers/outbox/db-pool.ts has no server-only guard, so a
// plain script import works, unlike lib/db/pool.ts).
import { randomUUID } from "node:crypto";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function withServiceRole(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
    await client.query("set local role service_role");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const { claimOutboxEvents, completeOutboxEvent, OutboxQueueError } = await import("../workers/outbox/queue.ts");

  const orgs = await withServiceRole((client) => client.query("select id from public.organizations limit 1").then((r) => r.rows));
  const org = orgs[0];
  assert(!!org, "setup: at least one real organization exists to satisfy the FK constraint");

  const aggregateId = randomUUID();
  const eventType = `live_test.event.${randomUUID().slice(0, 8)}`;
  const payload = { hello: "world", n: 42 };

  const inserted = await withServiceRole((client) =>
    client
      .query(
        "insert into public.outbox_events (event_type, schema_version, aggregate_type, aggregate_id, organization_id, payload) values ($1, 1, 'live_test', $2, $3, $4) returning id",
        [eventType, aggregateId, org.id, JSON.stringify(payload)],
      )
      .then((r) => r.rows[0]),
  );
  assert(!!inserted?.id, "setup: inserted a real pending outbox_events row");
  const eventId = inserted.id;

  // 1. Claim: a batch of 1, workerId "worker-a" -- must pick up our event, lock it, and
  // increment attempts to 1.
  const firstClaim = await claimOutboxEvents("worker-a", 50, 60);
  const claimed = firstClaim.find((e) => e.id === eventId);
  assert(!!claimed, "claim: claimOutboxEvents returns our newly-inserted pending event");
  assert(claimed?.status === "processing", "claim: claimed event status is 'processing'");
  assert(claimed?.lockedBy === "worker-a", "claim: locked_by is set to the claiming worker's id");
  assert(claimed?.attempts === 1, "claim: attempts incremented to 1 on claim");
  assert(claimed?.payload.hello === "world" && claimed?.payload.n === 42, "claim: payload round-trips exactly as inserted");
  assert(claimed?.eventType === eventType && claimed?.aggregateId === aggregateId, "claim: eventType/aggregateId preserved exactly");

  // 2. A second concurrent claim attempt must NOT see the same event (FOR UPDATE SKIP
  // LOCKED / already 'processing' with a live lease) -- ordering/no-double-claim.
  const secondClaimAttempt = await claimOutboxEvents("worker-b", 50, 60);
  assert(!secondClaimAttempt.some((e) => e.id === eventId), "ordering/locking: a second worker's claim does not also pick up the already-claimed event");

  // 3. Complete it as a retryable failure -- must NOT dead-letter (attempts=1 < max_attempts),
  // goes back to 'pending' with available_at pushed out by backoff (2^1 = 2s).
  const retried = await completeOutboxEvent(eventId, "worker-a", { success: false, error: "transient failure for live test" });
  assert(retried.status === "pending", "retry: a retryable failure with attempts remaining returns the event to 'pending', not dead_letter");
  assert(retried.lastError === "transient failure for live test", "retry: last_error is recorded exactly as given");
  assert(new Date(retried.availableAt).getTime() > Date.now(), "retry: available_at is pushed into the future by the real backoff calculation");

  // A worker completing an event it doesn't currently hold the lease on must be rejected
  // -- the event is already back to 'pending' (lock released), so this must fail with
  // EVENT_NOT_PROCESSING, not silently succeed.
  const staleCompleteError = await completeOutboxEvent(eventId, "worker-a", { success: true }).catch((e) => e);
  assert(staleCompleteError instanceof OutboxQueueError && staleCompleteError.code === "EVENT_NOT_PROCESSING", "lease safety: completing an already-released event is rejected with EVENT_NOT_PROCESSING");

  // 4. Must NOT be claimable again before its backoff window elapses.
  const tooEarlyClaim = await claimOutboxEvents("worker-c", 50, 60);
  assert(!tooEarlyClaim.some((e) => e.id === eventId), "retry backoff: the event is not claimable again before available_at");

  // 5. Wait out the real backoff window, then reclaim -- attempts increments to 2.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const secondClaim = await claimOutboxEvents("worker-d", 50, 60);
  const reclaimed = secondClaim.find((e) => e.id === eventId);
  assert(!!reclaimed, "retry backoff: the event becomes claimable again once available_at has passed");
  assert(reclaimed?.attempts === 2, "retry backoff: attempts incremented to 2 on the second claim");
  assert(reclaimed?.lockedBy === "worker-d", "retry backoff: the new claiming worker's id is recorded");

  // Only the current lease-holder may complete it -- worker-a (the stale, prior claimant)
  // must be rejected with LEASE_LOST, not allowed to finish someone else's claim.
  const leaseLostError = await completeOutboxEvent(eventId, "worker-a", { success: true }).catch((e) => e);
  assert(leaseLostError instanceof OutboxQueueError && leaseLostError.code === "LEASE_LOST", "lease safety: a non-owning worker completing this event is rejected with LEASE_LOST");

  // 6. Complete it successfully as the real current lease-holder.
  const succeeded = await completeOutboxEvent(eventId, "worker-d", { success: true });
  assert(succeeded.status === "succeeded", "complete: a successful completion sets status to 'succeeded'");
  assert(succeeded.lockedBy === null && succeeded.lockedAt === null, "complete: the lock is released on success");
  assert(succeeded.processedAt !== null, "complete: processed_at is set on success");

  // Cleanup: remove the test row entirely (do not leave live-test noise in the table).
  await withServiceRole((client) => client.query("delete from public.outbox_events where id = $1", [eventId]));

  await pool.end();
  console.log(`\n${failures === 0 ? "ALL LIVE OUTBOX TESTS PASSED" : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("LIVE TEST CRASHED:", e);
  process.exitCode = 1;
});

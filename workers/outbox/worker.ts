import { claimOutboxEvents, completeOutboxEvent } from "./queue";
import { getHandlers, PermanentHandlerError } from "./registry";
import type { OutboxEvent } from "@/types/outbox";

export type WorkerOptions = {
  workerId: string;
  batchSize?: number;
  leaseSeconds?: number;
};

/**
 * Processes exactly one claimed event: run every independently-registered consumer for
 * its `eventType:schemaVersion`, concurrently, then mark one overall outcome. An unknown
 * `eventType:schemaVersion` (zero registered handlers) is dead-lettered immediately
 * (§12: never guess, never execute anything from the payload itself) -- no handler
 * exists, so no amount of retrying could ever help.
 *
 * With multiple independent consumers, "one overall outcome" needs its own rule: the
 * event succeeds only if every consumer succeeds. If any consumer fails, the whole event
 * is retried (never just the failed consumer in isolation -- there is no per-consumer
 * retry bookkeeping, and every consumer is already required to be idempotent, so
 * re-running an already-succeeded consumer on retry is always safe) UNLESS every failure
 * was a `PermanentHandlerError`, in which case retrying could never help any of them and
 * the event dead-letters. A mix of one permanent and one retryable failure still retries
 * the whole event -- the retryable one might yet succeed, and the permanent one will
 * simply fail the same way again harmlessly (it already recorded why).
 */
/** A consumer that hangs (a stuck SMTP/HTTP call) must give up before the lease runs out,
 * or another worker reclaims the event and this one's completion is refused. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`handler timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function processEvent(event: OutboxEvent, workerId: string, handlerTimeoutMs = 45_000): Promise<OutboxEvent> {
  const handlers = getHandlers(event.eventType, event.schemaVersion);
  if (handlers.length === 0) {
    // Retryable, not permanent: during a rolling deploy an old worker can claim an event type
    // only the new code handles (seen live -- stale workers dead-lettered the new
    // organization.suspended events). Backoff gives a new worker the chance to pick it up;
    // a type nothing handles still dead-letters once max_attempts is reached.
    return completeOutboxEvent(event.id, workerId, {
      success: false,
      permanent: false,
      error: `no handler registered for ${event.eventType}:${event.schemaVersion}`,
    });
  }

  const results = await Promise.allSettled(handlers.map((handler) => withTimeout(handler(event), handlerTimeoutMs)));
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

  if (failures.length === 0) {
    return completeOutboxEvent(event.id, workerId, { success: true });
  }

  const permanent = failures.every((failure) => failure.reason instanceof PermanentHandlerError);
  const message = failures.map((failure) => (failure.reason instanceof Error ? failure.reason.message : String(failure.reason))).join(" | ");
  return completeOutboxEvent(event.id, workerId, { success: false, permanent, error: message });
}

/** Claims one batch and processes every event in it concurrently (each event is
 * independent -- there is no ordering requirement between different aggregates).
 * Returns the number of events claimed, so a caller can decide whether to poll again
 * immediately (more work is likely waiting) or back off (queue looked empty). */
export async function runBatch(options: WorkerOptions): Promise<number> {
  const leaseSeconds = options.leaseSeconds ?? 60;
  const events = await claimOutboxEvents(options.workerId, options.batchSize ?? 10, leaseSeconds);
  // One event's failure (e.g. LEASE_LOST after a reclaim) must not take the others -- or the
  // worker -- down with it; an unfinished event is simply reclaimed when its lease expires.
  const results = await Promise.allSettled(events.map((event) => processEvent(event, options.workerId, leaseSeconds * 750)));
  for (const result of results) {
    if (result.status === "rejected") console.error(`[outbox-worker] ${options.workerId} could not complete an event`, result.reason);
  }
  return events.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The long-running loop a standalone worker process runs. Never imported by application
 * code (`app/`, `actions/`, `services/`) -- only `run.ts`'s CLI entrypoint calls this. */
export async function runForever(options: WorkerOptions & { pollIntervalMs?: number; signal?: AbortSignal }): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  let failures = 0;
  while (!options.signal?.aborted) {
    try {
      const claimed = await runBatch(options);
      failures = 0;
      if (claimed === 0) await sleep(pollIntervalMs);
    } catch (error) {
      // The database blipped (restart, network, pool): back off and keep going instead of
      // exiting -- nothing restarts this process for us.
      failures += 1;
      const backoffMs = Math.min(pollIntervalMs * 2 ** failures, 60_000);
      console.error(`[outbox-worker] ${options.workerId} batch failed (attempt ${failures}), retrying in ${backoffMs}ms`, error);
      await sleep(backoffMs);
    }
  }
}

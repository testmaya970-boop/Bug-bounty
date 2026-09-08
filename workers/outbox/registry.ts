import type { OutboxEvent } from "@/types/outbox";

/** A retryable failure: transient (a dependency was briefly unavailable, a lock
 * contention). The worker records the error and lets the row return to `pending` with a
 * backoff delay -- the normal, expected path for a handler that can plausibly succeed
 * later. */
export class RetryableHandlerError extends Error {}

/** A failure that will NEVER succeed no matter how many times retried (malformed
 * payload, a referenced aggregate that no longer exists). The worker dead-letters the
 * event immediately, regardless of remaining attempts -- retrying it is pure waste. */
export class PermanentHandlerError extends Error {}

export type EventHandler = (event: OutboxEvent) => Promise<void>;

/**
 * Keyed by `${eventType}:${schemaVersion}`, never `eventType` alone -- a future
 * `report.created` v2 is a deliberately distinct registry entry with its own handler,
 * never a silent reinterpretation of v1's payload shape. An unknown key produces an empty
 * handler list (see `getHandlers` below), which the worker treats as a
 * `PermanentHandlerError` by construction: no code path can ever handle it, so retrying
 * is pointless and it is dead-lettered on the first attempt.
 *
 * Each key maps to a LIST of independent handlers, not one -- real event-driven systems
 * have multiple independent consumers per event (e.g. `report.resolved` already has a
 * reputation consumer from 0016; the notification consumer added in 0017 registers
 * against the exact same key, and neither knows the other exists). Every handler for a
 * key runs on every delivery of that event; this is exactly why every handler in this
 * codebase is required to be idempotent -- a retry caused by consumer B's failure must
 * safely re-invoke consumer A even though A already succeeded on a previous attempt.
 */
const REGISTRY = new Map<string, EventHandler[]>();

export function registerHandler(eventType: string, schemaVersion: number, handler: EventHandler): void {
  const key = `${eventType}:${schemaVersion}`;
  const existing = REGISTRY.get(key);
  if (existing) {
    existing.push(handler);
  } else {
    REGISTRY.set(key, [handler]);
  }
}

export function getHandlers(eventType: string, schemaVersion: number): EventHandler[] {
  return REGISTRY.get(`${eventType}:${schemaVersion}`) ?? [];
}

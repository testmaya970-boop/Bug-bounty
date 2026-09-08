import { withServiceRoleTransaction, callRpc } from "./db-pool";
import type { OutboxEvent } from "@/types/outbox";

type OutboxEventRow = {
  id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  organization_id: string;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  available_at: string;
  attempts: number;
  max_attempts: number;
  status: string;
  locked_at: string | null;
  locked_by: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export class OutboxQueueError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OutboxQueueError";
  }
}

function mapEventRow(row: OutboxEventRow): OutboxEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    organizationId: row.organization_id,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    availableAt: row.available_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    status: row.status as OutboxEvent["status"],
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    processedAt: row.processed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRpcError(error: { message: string }): never {
  const match = /^([A-Z_]+): (.+)$/.exec(error.message);
  if (match) throw new OutboxQueueError(match[2], match[1]);
  throw new OutboxQueueError(error.message, "UNKNOWN");
}

/** Atomically dead-letters any lease-expired, attempts-exhausted row, then claims up to
 * `batchSize` claimable rows via `FOR UPDATE SKIP LOCKED` -- safe under any number of
 * concurrent callers, never a double claim. */
export async function claimOutboxEvents(workerId: string, batchSize = 10, leaseSeconds = 60): Promise<OutboxEvent[]> {
  let rows: OutboxEventRow[];
  try {
    rows = await withServiceRoleTransaction((client) => callRpc<OutboxEventRow>(client, "public.claim_outbox_events", [workerId, batchSize, leaseSeconds]));
  } catch (error) {
    mapRpcError(error as { message: string });
  }
  return rows.map(mapEventRow);
}

/** The only path out of 'processing'. `permanent: true` skips the attempts/backoff
 * calculation entirely and dead-letters regardless of remaining attempts -- for a failure
 * that will never succeed no matter how many times retried (an unknown event type, a
 * payload that fails validation). */
export async function completeOutboxEvent(
  eventId: string,
  workerId: string,
  outcome: { success: true } | { success: false; permanent?: boolean; error: string },
): Promise<OutboxEvent> {
  let rows: OutboxEventRow[];
  try {
    rows = await withServiceRoleTransaction((client) =>
      callRpc<OutboxEventRow>(client, "public.complete_outbox_event", [
        eventId,
        workerId,
        outcome.success,
        outcome.success ? false : (outcome.permanent ?? false),
        outcome.success ? "" : outcome.error,
      ]),
    );
  } catch (error) {
    mapRpcError(error as { message: string });
  }
  return mapEventRow(rows[0]);
}

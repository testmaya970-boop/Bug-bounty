import { withServiceRoleTransaction } from "../db-pool";
import { PermanentHandlerError, RetryableHandlerError } from "../registry";
import type { OutboxEvent, ReportCreatedV1Payload } from "@/types/outbox";

/**
 * The reference consumer for this slice's one instrumented event, `report.created` v1.
 * It is deliberately NOT a real notification -- Notifications is out of scope for this
 * infrastructure slice (see docs/decisions/0015). Its only job is to prove, with a real
 * database-backed side effect, that:
 *   1. the same event delivered twice produces the side effect exactly once
 *      (`outbox_event_receipts`'s primary key is the actual guarantee, not application
 *      logic remembering to check), and
 *   2. a handler can defensively re-verify the event's own tenant claim before acting.
 * A real future consumer (e.g. "email the program's managers") would replace the single
 * `console.info` call below with an actual side effect, behind the identical idempotency
 * guard -- nothing else about this function would need to change.
 */
const CONSUMER_NAME = "report_created_reference_consumer";

function isReportCreatedV1Payload(payload: Record<string, unknown>): payload is ReportCreatedV1Payload {
  return (
    typeof payload.report_id === "string" &&
    typeof payload.program_id === "string" &&
    typeof payload.organization_id === "string" &&
    typeof payload.researcher_id === "string" &&
    typeof payload.title === "string" &&
    typeof payload.asset_type === "string" &&
    typeof payload.display_target === "string"
  );
}

export async function handleReportCreatedV1(event: OutboxEvent): Promise<void> {
  if (!isReportCreatedV1Payload(event.payload)) {
    throw new PermanentHandlerError("report.created v1 payload does not match the documented shape -- this will never succeed on retry.");
  }
  const payload = event.payload;

  // Two independent database round trips, exactly as the original Supabase-backed
  // version made two independent PostgREST requests (no shared transaction) -- preserved
  // here rather than folded into one withServiceRoleTransaction, so this migration
  // introduces no new atomicity between the report-lookup and the receipt-insert that
  // did not exist before.

  // Defense in depth: re-derive the report's actual organization from the reports table
  // itself, rather than trusting the event's own organization_id unconditionally. In
  // correct operation these can never disagree (both were written in the same
  // transaction) -- a mismatch means something is structurally wrong, not transient, so
  // it is a permanent failure, not a retry candidate.
  let report: { organization_id: string } | undefined;
  try {
    report = await withServiceRoleTransaction(async (client) => {
      const { rows } = await client.query<{ organization_id: string }>("select organization_id from public.reports where id = $1", [payload.report_id]);
      return rows[0];
    });
  } catch (error) {
    throw new RetryableHandlerError(error instanceof Error ? error.message : String(error));
  }
  if (!report) throw new PermanentHandlerError(`report ${payload.report_id} referenced by this event no longer exists.`);
  if (report.organization_id !== event.organizationId) {
    throw new PermanentHandlerError("event organization_id does not match the referenced report's own organization_id.");
  }

  // Idempotency: the insert's own primary key (consumer_name, event_id) is the real
  // guarantee, via `on conflict do nothing`. A second delivery of the identical event
  // reaches this exact point and inserts nothing, returning zero rows -- not "should be
  // rare", a database-enforced impossibility for this consumer to double-apply its side
  // effect.
  let receipts: { event_id: string }[];
  try {
    receipts = await withServiceRoleTransaction(async (client) => {
      const { rows } = await client.query<{ event_id: string }>(
        "insert into public.outbox_event_receipts (consumer_name, event_id) values ($1, $2) on conflict (consumer_name, event_id) do nothing returning event_id",
        [CONSUMER_NAME, event.id],
      );
      return rows;
    });
  } catch (error) {
    throw new RetryableHandlerError(error instanceof Error ? error.message : String(error));
  }
  if (receipts.length === 0) return; // Already processed by this consumer -- idempotent no-op.

  // Stand-in for a real future side effect (e.g. notifying the program's managers).
  // Never an actual email/webhook/external call -- this slice ships no Notifications.
  console.info(`[outbox:report_created_reference_consumer] would notify program managers of new report "${payload.title}" (report ${payload.report_id}, program ${payload.program_id})`);
}

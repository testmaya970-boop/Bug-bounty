import { withServiceRoleTransaction, callRpc } from "../../db-pool";
import { PermanentHandlerError, RetryableHandlerError } from "../../registry";
import type { OutboxEvent, ReportOutcomeV1Payload } from "@/types/outbox";
import type { ReputationFactType } from "@/types/reputation";

/**
 * A shared factory, not five near-duplicate files: every report-outcome fact type
 * shares an identical payload shape and an identical RPC call, differing only in which
 * `fact_type` string is claimed. `record_reputation_fact` independently re-verifies the
 * claim against the report's actual current status (see the migration) -- this handler
 * does not decide correctness, it only calls the one function that does. See
 * docs/decisions/0016-reputation-ledger-foundation.md.
 */
function isReportOutcomeV1Payload(payload: Record<string, unknown>): payload is ReportOutcomeV1Payload {
  return (
    typeof payload.report_id === "string" &&
    typeof payload.program_id === "string" &&
    typeof payload.organization_id === "string" &&
    typeof payload.researcher_id === "string"
  );
}

export function createReportOutcomeHandler(factType: ReputationFactType) {
  return async function handleReportOutcome(event: OutboxEvent): Promise<void> {
    if (!isReportOutcomeV1Payload(event.payload)) {
      throw new PermanentHandlerError(`${event.eventType} v${event.schemaVersion} payload does not match the documented shape -- this will never succeed on retry.`);
    }

    try {
      await withServiceRoleTransaction((client) => callRpc(client, "public.record_reputation_fact", [event.id, factType, event.payload.report_id, event.occurredAt]));
    } catch (error) {
      // PROVENANCE_MISMATCH/REPORT_NOT_FOUND can never succeed on retry -- the report's
      // terminal status is immutable once reached (0012), so if it does not match the
      // claimed fact type now, it never will. Anything else (a dropped connection, a
      // momentary lock wait) is retryable, the safe default.
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("PROVENANCE_MISMATCH") || message.startsWith("REPORT_NOT_FOUND") || message.startsWith("INVALID_FACT_TYPE")) {
        throw new PermanentHandlerError(message);
      }
      throw new RetryableHandlerError(message);
    }
  };
}

import { withServiceRoleTransaction, callRpc } from "../../db-pool";
import { PermanentHandlerError, RetryableHandlerError } from "../../registry";
import type { OutboxEvent, ReportOutcomeV1Payload } from "@/types/outbox";

/**
 * Records that a bounty was finalized -- never the amount. `record_bounty_finalized_
 * reputation_fact` re-derives provenance from `report_bounty_decisions` itself
 * (state='finalized'), never trusting this event's payload for anything beyond "which
 * report." See docs/decisions/0016-reputation-ledger-foundation.md.
 */
function isReportOutcomeV1Payload(payload: Record<string, unknown>): payload is ReportOutcomeV1Payload {
  return (
    typeof payload.report_id === "string" &&
    typeof payload.program_id === "string" &&
    typeof payload.organization_id === "string" &&
    typeof payload.researcher_id === "string"
  );
}

export async function handleBountyFinalizedV1(event: OutboxEvent): Promise<void> {
  if (!isReportOutcomeV1Payload(event.payload)) {
    throw new PermanentHandlerError("bounty.finalized v1 payload does not match the documented shape -- this will never succeed on retry.");
  }

  try {
    await withServiceRoleTransaction((client) =>
      callRpc(client, "public.record_bounty_finalized_reputation_fact", [event.id, event.payload.report_id, event.occurredAt]),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("PROVENANCE_MISMATCH") || message.startsWith("REPORT_NOT_FOUND")) {
      throw new PermanentHandlerError(message);
    }
    throw new RetryableHandlerError(message);
  }
}

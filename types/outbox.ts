/**
 * outbox_events answers "something happened that another process may need to react to."
 * It is not audit_logs ("what happened, for forensic/business history") and never
 * replaces it -- a mutation writes both, in the same transaction, for different readers.
 * See docs/decisions/0015-outbox-event-foundation.md.
 *
 * Only four states are reachable: `pending` (never yet processed, or will retry after
 * `availableAt`), `processing` (currently leased by a worker), `succeeded` (terminal),
 * `dead_letter` (terminal -- either attempts were exhausted or the failure was permanent).
 * There is no separate "failed" state distinct from `pending`; `attempts`/`lastError`
 * already distinguish a fresh row from one that failed and will retry.
 */
export type OutboxEventStatus = "pending" | "processing" | "succeeded" | "dead_letter";

/** The full row, as a worker sees it. Never exposed to a browser client -- no service in
 * `services/` reads this table; only `workers/outbox/*` does, via the service-role client. */
export type OutboxEvent = {
  id: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  organizationId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  availableAt: string;
  attempts: number;
  maxAttempts: number;
  status: OutboxEventStatus;
  lockedAt: string | null;
  lockedBy: string | null;
  processedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * `report.created` v1's exact payload shape -- the one reference event this slice emits
 * (from `submit_report`, in the same transaction as the report row). A future v2 would be
 * a distinct type and a distinct registry entry, never a silent reshaping of v1.
 */
export type ReportCreatedV1Payload = {
  report_id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  title: string;
  asset_type: string;
  display_target: string;
};

/**
 * Shared v1 payload shape for every report-outcome event this slice emits
 * (`report.resolved`, `report.duplicate`, `report.informative`, `report.not_applicable`,
 * `report.rejected`) and for `bounty.finalized` -- deliberately minimal. Neither
 * `duplicate_of_report_id` nor any bounty amount/currency is included: the reputation
 * consumer re-derives both from the authoritative source table itself
 * (`reports`/`report_bounty_decisions`) rather than trusting the event payload for
 * anything beyond "which report, which fact, when." See
 * docs/decisions/0016-reputation-ledger-foundation.md.
 */
export type ReportOutcomeV1Payload = {
  report_id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
};

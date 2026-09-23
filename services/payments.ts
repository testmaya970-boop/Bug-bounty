import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { activePaymentProvider } from "@/lib/payment-provider";
import type { PaymentAttempt, PaymentObligation } from "@/types/payment";

export { OrganizationServiceError };

type ObligationRow = {
  id: string;
  report_id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  bounty_decision_id: string;
  amount_minor_units: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type AttemptRow = {
  id: string;
  payment_obligation_id: string;
  attempt_number: number;
  provider: string;
  state: string;
  requested_amount_minor_units: number;
  currency: string;
  provider_reference_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function mapObligationRow(row: ObligationRow): PaymentObligation {
  return {
    id: row.id,
    reportId: row.report_id,
    bountyDecisionId: row.bounty_decision_id,
    amountMinorUnits: row.amount_minor_units,
    currency: row.currency,
    status: row.status as PaymentObligation["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttemptRow(row: AttemptRow): PaymentAttempt {
  return {
    id: row.id,
    paymentObligationId: row.payment_obligation_id,
    attemptNumber: row.attempt_number,
    provider: row.provider,
    state: row.state as PaymentAttempt["state"],
    requestedAmountMinorUnits: row.requested_amount_minor_units,
    currency: row.currency,
    providerReferenceId: row.provider_reference_id,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

/** A single report's payment obligation -- RLS decides visibility (the submitting
 * researcher's own aggregate status, org oversight, or a program manager). Null covers
 * "does not exist" and "exists but you have no access" identically. */
export async function getPaymentObligation(reportId: string): Promise<PaymentObligation | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<ObligationRow>("select * from public.payment_obligations where report_id = $1", [reportId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapObligationRow(rows[0]) : null;
}

export type MyPaymentObligation = PaymentObligation & { programName: string; organizationName: string; reportTitle: string };

/** "Rewards & Payments" (docs/decisions/0055) -- every row is a real payment_obligation
 * the researcher's own report earned; RLS already scopes this table to `researcher_id =
 * auth.uid()` (0014) for a plain select, no new RPC needed. No fabricated total, no
 * estimate -- exactly the real ledger. */
export async function listMyPaymentObligations(userId: string): Promise<MyPaymentObligation[]> {
  let obligations: ObligationRow[];
  let programName: Map<string, string>;
  let orgName: Map<string, string>;
  let reportTitle: Map<string, string>;
  try {
    ({ obligations, programName, orgName, reportTitle } = await withActorTransaction(userId, async (client) => {
      const { rows: obligations } = await client.query<ObligationRow>("select * from public.payment_obligations where researcher_id = $1 order by created_at desc", [userId]);
      if (obligations.length === 0) return { obligations, programName: new Map(), orgName: new Map(), reportTitle: new Map() };

      const programIds = [...new Set(obligations.map((o) => o.program_id))];
      const orgIds = [...new Set(obligations.map((o) => o.organization_id))];
      const reportIds = [...new Set(obligations.map((o) => o.report_id))];
      // Sequential, not Promise.all -- these three queries share the single client this
      // withActorTransaction callback was handed (unlike separate withActorTransaction
      // calls, which each get their own pool connection). A pg PoolClient can only run
      // one query at a time; firing these concurrently on it throws pg's own "client is
      // already executing a query" deprecation warning, confirmed live on a researcher's
      // Home load whenever they have at least one payment obligation.
      const { rows: programs } = await client.query<{ id: string; name: string }>("select id, name from public.programs where id = any($1)", [programIds]);
      const { rows: organizations } = await client.query<{ id: string; name: string }>("select id, name from public.organizations where id = any($1)", [orgIds]);
      const { rows: reports } = await client.query<{ id: string; title: string }>("select id, title from public.reports where id = any($1)", [reportIds]);
      return {
        obligations,
        programName: new Map(programs.map((p) => [p.id, p.name])),
        orgName: new Map(organizations.map((o) => [o.id, o.name])),
        reportTitle: new Map(reports.map((r) => [r.id, r.title])),
      };
    }));
  } catch (error) {
    mapError(error as { message: string });
  }

  return obligations.map((row) => ({
    ...mapObligationRow(row),
    programName: programName.get(row.program_id) ?? "Unknown program",
    organizationName: orgName.get(row.organization_id) ?? "Unknown organization",
    reportTitle: reportTitle.get(row.report_id) ?? "Untitled report",
  }));
}

/** Manager-facing only -- RLS grants no researcher a row of this table at all. */
export async function listPaymentAttempts(obligationId: string): Promise<PaymentAttempt[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<AttemptRow>("select * from public.payment_attempts where payment_obligation_id = $1 order by attempt_number desc", [obligationId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapAttemptRow);
}

export async function createPaymentObligation(reportId: string): Promise<PaymentObligation> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ObligationRow>(client, "public.create_payment_obligation", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapObligationRow(rows[0]);
}

/**
 * Calls the provider abstraction first (proving the domain never talks to a concrete SDK
 * directly), then records the attempt in the database -- the RPC is the only thing that
 * can ever mark an obligation 'processing', and it re-authorizes/re-locks independently
 * of this read, exactly like every other RPC in this codebase.
 */
export async function initiateManualPaymentAttempt(obligationId: string): Promise<PaymentAttempt> {
  const actor = await getCurrentUser();
  let obligationRows;
  try {
    obligationRows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<ObligationRow>("select * from public.payment_obligations where id = $1", [obligationId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  if (!obligationRows[0]) throw new OrganizationServiceError("Payment obligation not found", "OBLIGATION_NOT_FOUND");
  const obligation = mapObligationRow(obligationRows[0]);

  // Proves the abstraction is real: a future provider's createPayment could fail, time
  // out, or return a different outcome here, all before the database is ever touched.
  // The manual provider's response is not itself trusted as the database's state --
  // initiate_manual_payment_attempt independently hardcodes the same fixed outcome.
  await activePaymentProvider.createPayment({ idempotencyKey: obligationId, amountMinorUnits: obligation.amountMinorUnits, currency: obligation.currency });

  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<AttemptRow>(client, "public.initiate_manual_payment_attempt", [obligationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapAttemptRow(rows[0]);
}

export async function recordManualPaymentResult(
  attemptId: string,
  outcome: "succeeded" | "failed",
  options: { providerReferenceId?: string; failureCode?: string; failureMessage?: string } = {},
): Promise<PaymentAttempt> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<AttemptRow>(client, "public.record_manual_payment_result", [
        attemptId,
        outcome,
        options.providerReferenceId ?? "",
        options.failureCode ?? "",
        options.failureMessage ?? "",
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapAttemptRow(rows[0]);
}

export async function cancelPaymentObligation(obligationId: string, reason: string): Promise<PaymentObligation> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ObligationRow>(client, "public.cancel_payment_obligation", [obligationId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapObligationRow(rows[0]);
}

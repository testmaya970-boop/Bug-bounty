import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { loadPayoutRecipient, selectPayoutProvider } from "@/lib/payment-provider";
import { logIntegrationEvent } from "@/lib/integrations/common";
import type { PaymentAttempt, PaymentObligation } from "@/types/payment";

export { OrganizationServiceError };

type ObligationRow = {
  id: string;
  report_id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  bounty_decision_id: string;
  bonus_id?: string | null;
  amount_minor_units: number;
  platform_fee_minor_units: number;
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
    researcherId: row.researcher_id,
    bountyDecisionId: row.bounty_decision_id,
    bonusId: row.bonus_id ?? null,
    amountMinorUnits: row.amount_minor_units,
    platformFeeMinorUnits: row.platform_fee_minor_units,
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

/** A report's payment obligations, one per recipient (submitter and any collaborator with
 * a split; 202610060008), newest first -- cancelled ones included as history. RLS decides
 * visibility: a researcher sees only their own, org oversight and program managers all. */
export async function listReportPaymentObligations(reportId: string): Promise<PaymentObligation[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<ObligationRow>("select * from public.payment_obligations where report_id = $1 order by created_at desc, researcher_id", [reportId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapObligationRow);
}

/** What still blocks paying each recipient on a report: missing payout method, unverified
 * tax form, unverified KYC where the program requires it. Never the payout destination.
 * Finance roles see every recipient; a recipient sees only themself. */
export type { PayoutBlocker } from "@/lib/payout-blockers";
import type { PayoutBlocker } from "@/lib/payout-blockers";
export type PayoutReadiness = { researcherId: string; displayName: string; blockers: PayoutBlocker[] };

export async function getReportPayoutReadiness(reportId: string): Promise<PayoutReadiness[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ researcher_id: string; display_name: string; blockers: PayoutBlocker[] }>(client, "public.get_report_payout_readiness", [reportId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ researcherId: row.researcher_id, displayName: row.display_name, blockers: row.blockers ?? [] }));
}

/** The researcher's view: no platform fee -- that is the organization's charge (on top of
 * the bounty, 202609250010), so it is left out of the type rather than just not rendered. */
export type MyPaymentObligation = Omit<PaymentObligation, "platformFeeMinorUnits"> & { programName: string; organizationName: string; reportTitle: string };

/** "Rewards & Payments" (docs/decisions/0055) -- every row is a real payment_obligation
 * the researcher's own report earned; RLS already scopes this table to `researcher_id =
 * auth.uid()` (0014) for a plain select, no new RPC needed. No fabricated total, no
 * estimate -- exactly the real ledger. */
/** A bounty finalized on one of the researcher's own reports that has no payment yet
 * (they haven't confirmed the award, or the organization hasn't started paying). It is
 * real money owed, so it must show up even though no payment_obligations row exists. */
export type MyAwardAwaitingPayment = {
  reportId: string;
  reportTitle: string;
  programName: string;
  organizationId: string;
  programId: string;
  amountMinorUnits: number;
  currency: string;
  finalizedAt: string;
  confirmed: boolean;
};

// ponytail: awards on reports the researcher submitted; a collaborator's share appears once
// its payment exists. Read under RLS (decisions on their own reports are theirs to read).
export async function listMyAwardsAwaitingPayment(userId: string): Promise<MyAwardAwaitingPayment[]> {
  type Row = { report_id: string; title: string; program_name: string | null; organization_id: string; program_id: string; final_amount_minor_units: string; currency: string; finalized_at: string; confirmed: boolean };
  let rows: Row[];
  try {
    rows = await withActorTransaction(userId, async (client) =>
      (
        await client.query<Row>(
          `select d.report_id, r.title, p.name as program_name, r.organization_id, r.program_id, d.final_amount_minor_units, d.currency, d.finalized_at,
                  exists (select 1 from public.bounty_acceptances a where a.report_id = d.report_id and a.researcher_id = $1) as confirmed
             from public.report_bounty_decisions d
             join public.reports r on r.id = d.report_id
             left join public.programs p on p.id = r.program_id
            where r.researcher_id = $1 and d.state = 'finalized' and d.final_amount_minor_units > 0
              and not exists (select 1 from public.payment_obligations o where o.report_id = d.report_id and o.researcher_id = $1 and o.status <> 'cancelled')
            order by d.finalized_at desc`,
          [userId],
        )
      ).rows,
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({
    reportId: r.report_id,
    reportTitle: r.title,
    programName: r.program_name ?? "Program",
    organizationId: r.organization_id,
    programId: r.program_id,
    amountMinorUnits: Number(r.final_amount_minor_units),
    currency: r.currency,
    finalizedAt: new Date(r.finalized_at).toISOString(),
    confirmed: r.confirmed,
  }));
}

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

  return obligations.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose, see MyPaymentObligation
    const { platformFeeMinorUnits, ...obligation } = mapObligationRow(row);
    return {
      ...obligation,
      programName: programName.get(row.program_id) ?? "Unknown program",
    organizationName: orgName.get(row.organization_id) ?? "Unknown organization",
      reportTitle: reportTitle.get(row.report_id) ?? "Untitled report",
    };
  });
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

/** One obligation per recipient: collaborators by their split, the remainder to the submitter. */
export async function createPaymentObligations(reportId: string): Promise<PaymentObligation[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ObligationRow>(client, "public.create_payment_obligation", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapObligationRow);
}

/**
 * Records the attempt first -- the RPC re-authorizes, enforces the payout gate (payout
 * method, tax form, KYC, no open bounty dispute) and is the only thing that can mark an
 * obligation 'processing' -- then hands it to the provider keyed by the attempt id, so a
 * retried call can never pay twice. The manual provider only acknowledges; an operator
 * records the real outcome with recordManualPaymentResult. The full bounty is sent: the
 * platform fee is billed to the organization on top (db/migrations/202609250010).
 */
export async function initiateManualPaymentAttempt(obligationId: string): Promise<PaymentAttempt> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<AttemptRow>(client, "public.initiate_manual_payment_attempt", [obligationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const attempt = mapAttemptRow(rows[0]);
  const provider = selectPayoutProvider(attempt.currency);
  const payment = { idempotencyKey: attempt.id, amountMinorUnits: attempt.requestedAmountMinorUnits, currency: attempt.currency };
  if (provider.mode === "manual") {
    await provider.createPayment(payment);
    return attempt;
  }

  // A configured provider pays it. If the call itself errors, the attempt stays open for a
  // person to handle (the manual path) -- nothing is lost and nothing is paid twice, since a
  // retry reuses the same attempt id as the provider's idempotency key.
  let result;
  try {
    result = await provider.createPayment({ ...payment, recipient: await loadPayoutRecipient(attempt.id) });
  } catch (error) {
    await logIntegrationEvent("payments", provider.name, "call", "error", error instanceof Error ? error.message : String(error));
    return attempt;
  }
  await logIntegrationEvent("payments", provider.name, "call", result.outcome === "failed" ? "rejected" : "ok", result.failureMessage);
  const reference = result.providerReferenceId ?? `local-${attempt.id}`;
  const submitted = await withServiceRoleTransaction((client) => callRpc<AttemptRow>(client, "public.mark_payment_attempt_submitted", [attempt.id, provider.name, reference]));
  if (result.outcome !== "failed") return mapAttemptRow(submitted[0]);
  const failed = await withServiceRoleTransaction((client) =>
    callRpc<AttemptRow>(client, "public.record_provider_payment_result", [provider.name, reference, "failed", "provider_refused", result.failureMessage ?? null]),
  );
  return mapAttemptRow(failed[0]);
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

/** The organization's payment ledger for the Payments page -- owners, security admins, and
 * billing admins (list_payment_obligations_for_billing, 202609250012). Carries each
 * report's TITLE only: a billing admin never reads report contents. */
export type BillingLedgerRow = {
  obligationId: string;
  reportId: string;
  programId: string;
  programName: string;
  reportTitle: string;
  researcherName: string | null;
  amountMinorUnits: number;
  platformFeeMinorUnits: number;
  currency: string;
  status: PaymentObligation["status"];
  createdAt: string;
  updatedAt: string;
};

type BillingLedgerDbRow = {
  obligation_id: string;
  report_id: string;
  program_id: string;
  program_name: string;
  report_title: string;
  researcher_name: string | null;
  amount_minor_units: string;
  platform_fee_minor_units: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listPaymentLedgerForBilling(organizationId: string): Promise<BillingLedgerRow[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<BillingLedgerDbRow>(client, "public.list_payment_obligations_for_billing", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    obligationId: row.obligation_id,
    reportId: row.report_id,
    programId: row.program_id,
    programName: row.program_name,
    reportTitle: row.report_title,
    researcherName: row.researcher_name,
    amountMinorUnits: Number(row.amount_minor_units),
    platformFeeMinorUnits: Number(row.platform_fee_minor_units),
    currency: row.currency,
    status: row.status as PaymentObligation["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

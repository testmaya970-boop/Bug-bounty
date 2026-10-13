import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// The organization's prepaid balance (db/migrations/202610140004): it adds funds, every award
// commits bounty + fee against them, and Unpatched pays the researcher.

export type OrganizationBalance = { currency: string; deposited: number; pendingDeposits: number; committed: number; paid: number; available: number };
export type DepositMethod = "upi" | "imps" | "neft" | "rtgs" | "wire" | "ach";
export type OrganizationDeposit = {
  id: string;
  currency: string;
  amountMinorUnits: number;
  method: DepositMethod;
  payerReference: string;
  status: "pending" | "confirmed" | "rejected";
  reviewNote: string | null;
  createdAt: string;
};

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getOrganizationBalances(organizationId: string): Promise<OrganizationBalance[]> {
  type Row = { currency: string; deposited: string; pending_deposits: string; committed: string; paid: string; available: string };
  const rows = await asActor((client) => callRpc<Row>(client, "public.get_organization_balances", [organizationId]));
  return rows.map((r) => ({
    currency: r.currency,
    deposited: Number(r.deposited),
    pendingDeposits: Number(r.pending_deposits),
    committed: Number(r.committed),
    paid: Number(r.paid),
    available: Number(r.available),
  }));
}

/** Read under RLS: finance roles of the organization only. */
export async function listOrganizationDeposits(organizationId: string): Promise<OrganizationDeposit[]> {
  type Row = { id: string; currency: string; amount_minor_units: string; method: DepositMethod; payer_reference: string; status: OrganizationDeposit["status"]; review_note: string | null; created_at: string };
  const result = await asActor((client) =>
    client.query<Row>(
      "select id, currency, amount_minor_units, method, payer_reference, status, review_note, created_at from public.organization_deposits where organization_id = $1 order by created_at desc limit 50",
      [organizationId],
    ),
  );
  return result.rows.map((r) => ({
    id: r.id,
    currency: r.currency,
    amountMinorUnits: Number(r.amount_minor_units),
    method: r.method,
    payerReference: r.payer_reference,
    status: r.status,
    reviewNote: r.review_note,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function requestOrganizationDeposit(input: { organizationId: string; currency: string; amountMinorUnits: number; method: DepositMethod; payerReference: string }): Promise<void> {
  await asActor((client) => callRpc(client, "public.request_organization_deposit", [input.organizationId, input.currency, input.amountMinorUnits, input.method, input.payerReference]));
}

export type PendingDeposit = { id: string; organizationId: string; organizationName: string; currency: string; amountMinorUnits: number; method: DepositMethod; payerReference: string; createdAt: string };

export async function listPendingDepositsForAdmin(): Promise<PendingDeposit[]> {
  type Row = { id: string; organization_id: string; organization_name: string; currency: string; amount_minor_units: string; method: DepositMethod; payer_reference: string; created_at: string };
  const rows = await asActor((client) => callRpc<Row>(client, "public.list_pending_deposits_for_admin"));
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    currency: r.currency,
    amountMinorUnits: Number(r.amount_minor_units),
    method: r.method,
    payerReference: r.payer_reference,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function reviewOrganizationDeposit(depositId: string, outcome: "confirmed" | "rejected", note: string): Promise<void> {
  await asActor((client) => callRpc(client, "public.review_organization_deposit", [depositId, outcome, note]));
}

/** Manual payouts waiting for Unpatched to send them, with the recipient's decrypted details
 * (platform admins only -- the function refuses anyone else). */
export type ManualPayout = {
  attemptId: string;
  organizationId: string;
  organizationName: string;
  programId: string;
  reportId: string;
  amountMinorUnits: number;
  currency: string;
  startedAt: string;
  researcherName: string;
  method: "bank_transfer" | "paypal" | null;
  bankHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  paypalEmail: string | null;
};

export async function listManualPayoutsForAdmin(): Promise<ManualPayout[]> {
  type Row = {
    attempt_id: string;
    organization_id: string;
    organization_name: string;
    program_id: string;
    report_id: string;
    amount_minor_units: string;
    currency: string;
    started_at: string;
    researcher_name: string;
    method: ManualPayout["method"];
    bank_holder: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    paypal_email: string | null;
  };
  const rows = await asActor((client) => callRpc<Row>(client, "public.list_manual_payouts_for_admin"));
  return rows.map((r) => ({
    attemptId: r.attempt_id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    programId: r.program_id,
    reportId: r.report_id,
    amountMinorUnits: Number(r.amount_minor_units),
    currency: r.currency,
    startedAt: new Date(r.started_at).toISOString(),
    researcherName: r.researcher_name,
    method: r.method,
    bankHolder: r.bank_holder,
    bankAccountNumber: r.bank_account_number,
    bankIfsc: r.bank_ifsc,
    paypalEmail: r.paypal_email,
  }));
}

/** Where an organization sends money: Unpatched's own receiving accounts, from server config
 * only. A currency with nothing configured has no instructions (the UI says so). */
export type FundingInstructions = { currency: "INR" | "USD"; methods: DepositMethod[]; fields: { label: string; value: string }[] };

export function getFundingInstructions(env: NodeJS.ProcessEnv = process.env): FundingInstructions[] {
  const pick = (pairs: [string, string | undefined][]) => pairs.filter((p): p is [string, string] => Boolean(p[1]?.trim())).map(([label, value]) => ({ label, value: value.trim() }));
  const inr = pick([
    ["Account name", env.FUNDING_INR_ACCOUNT_NAME],
    ["Account number", env.FUNDING_INR_ACCOUNT_NUMBER],
    ["IFSC", env.FUNDING_INR_IFSC],
    ["UPI ID", env.FUNDING_INR_UPI_ID],
  ]);
  const usd = pick([
    ["Account name", env.FUNDING_USD_ACCOUNT_NAME],
    ["Bank", env.FUNDING_USD_BANK_NAME],
    ["Account number", env.FUNDING_USD_ACCOUNT_NUMBER],
    ["Routing (ABA)", env.FUNDING_USD_ROUTING],
    ["SWIFT", env.FUNDING_USD_SWIFT],
  ]);
  return [
    { currency: "INR", methods: ["upi", "imps", "neft", "rtgs"], fields: inr },
    { currency: "USD", methods: ["wire", "ach"], fields: usd },
  ];
}

/** Printed in the transfer's remarks so a deposit can be matched to its organization. */
export function fundingReference(organizationId: string): string {
  return `UNP-${organizationId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Awards whose report has an open or escalated dispute -- the only place an award the
 * researcher accepted can still be cancelled, by a platform admin (202610140007). */
export type DisputedObligation = {
  obligationId: string;
  organizationId: string;
  organizationName: string;
  programId: string;
  reportId: string;
  reportTitle: string;
  researcherName: string;
  amountMinorUnits: number;
  platformFeeMinorUnits: number;
  currency: string;
  mediationStatus: "open" | "escalated";
};

export async function listDisputedObligationsForAdmin(): Promise<DisputedObligation[]> {
  type Row = {
    obligation_id: string;
    organization_id: string;
    organization_name: string;
    program_id: string;
    report_id: string;
    report_title: string;
    researcher_name: string;
    amount_minor_units: string;
    platform_fee_minor_units: string;
    currency: string;
    mediation_status: DisputedObligation["mediationStatus"];
  };
  const rows = await asActor((client) => callRpc<Row>(client, "public.list_disputed_obligations_for_admin"));
  return rows.map((r) => ({
    obligationId: r.obligation_id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    programId: r.program_id,
    reportId: r.report_id,
    reportTitle: r.report_title,
    researcherName: r.researcher_name,
    amountMinorUnits: Number(r.amount_minor_units),
    platformFeeMinorUnits: Number(r.platform_fee_minor_units),
    currency: r.currency,
    mediationStatus: r.mediation_status,
  }));
}

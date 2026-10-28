import "server-only";
import { randomUUID } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { logIntegrationEvent, sandboxAllowed } from "@/lib/integrations/common";
import { GATEWAY_CURRENCY, cardSurchargeBps, chargedWithSurcharge, selectGatewayProvider, type CardCurrency, type CheckoutGateway } from "@/lib/integrations/card";

// The organization's prepaid balance (db/migrations/202610140004): it adds funds, every award
// commits bounty + fee against them, and Unpatched pays the researcher.

export type OrganizationBalance = { currency: string; deposited: number; pendingDeposits: number; committed: number; paid: number; available: number };
export type DepositMethod = "upi" | "imps" | "neft" | "rtgs" | "wire" | "ach" | "card";
export type OrganizationDeposit = {
  id: string;
  currency: string;
  amountMinorUnits: number;
  method: DepositMethod;
  payerReference: string;
  status: "pending" | "confirmed" | "rejected" | "failed";
  reviewNote: string | null;
  /** What the payer was charged (amount + processing fee) for an online payment. */
  chargedMinorUnits: number | null;
  /** Card deposits only: who took the card (sandbox | razorpay | stripe | paypal). */
  provider: string | null;
  /** The gateway the organization chose (stripe | paypal | razorpay), even when the sandbox stood in. */
  gateway: CheckoutGateway | null;
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
  type Row = { id: string; currency: string; amount_minor_units: string; method: DepositMethod; payer_reference: string; status: OrganizationDeposit["status"]; review_note: string | null; provider: string | null; gateway: CheckoutGateway | null; charged_minor_units: string | null; created_at: string };
  const result = await asActor((client) =>
    client.query<Row>(
      "select id, currency, amount_minor_units, method, payer_reference, status, review_note, provider, gateway, charged_minor_units, created_at from public.organization_deposits where organization_id = $1 order by created_at desc limit 50",
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
    chargedMinorUnits: r.charged_minor_units === null ? null : Number(r.charged_minor_units),
    provider: r.provider,
    gateway: r.gateway,
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
/** Methods reported by hand after a bank transfer; card deposits confirm themselves. */
export type TransferMethod = Exclude<DepositMethod, "card">;
export type FundingInstructions = { currency: "INR" | "USD"; methods: TransferMethod[]; fields: { label: string; value: string }[] };

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

// Card funding (202610150002) ------------------------------------------------------------

/** Records a pending card deposit, then asks the provider for its hosted checkout and returns
 * where to send the browser. Only the provider's signed webhook (or the sandbox page) confirms. */
export async function startCardDeposit(input: { organizationId: string; gateway: CheckoutGateway; amountMinorUnits: number }): Promise<{ url: string; reference: string }> {
  const currency = GATEWAY_CURRENCY[input.gateway];
  const provider = selectGatewayProvider(input.gateway);
  if (!provider) throw new OrganizationServiceError("That payment method isn't connected yet. Choose another one.", "NOT_AVAILABLE");
  const charged = chargedWithSurcharge(input.amountMinorUnits, cardSurchargeBps());
  const reference = `card_${randomUUID().replace(/-/g, "")}`;
  await asActor((client) => callRpc(client, "public.start_card_deposit", [input.organizationId, currency, input.amountMinorUnits, charged, provider.name, reference, input.gateway]));
  // Where the gateway sends the payer back: a page on Unpatched that reads the deposit's real
  // status. Only the gateway's signed webhook confirms the money.
  const base = `${getNativeEnv().APP_ORIGIN}/organizations/${input.organizationId}/payments`;
  const returnUrl = `${base}/add-funds/return?ref=${reference}`;
  try {
    const checkout = await provider.createCheckout({
      reference,
      chargedMinorUnits: charged,
      currency,
      description: "Unpatched balance top-up",
      returnUrl,
      cancelUrl: `${returnUrl}&cancelled=1`,
      sandboxUrl: `${base}/card-sandbox?ref=${reference}`,
    });
    await logIntegrationEvent("cards", provider.name, "call", "ok");
    return { url: checkout.url, reference };
  } catch (error) {
    // Nothing was charged: close the deposit so it doesn't sit as "pending" forever.
    await logIntegrationEvent("cards", provider.name, "call", "error", error instanceof Error ? error.message : String(error));
    await completeCardDeposit(reference, "failed", "The payment provider could not start the payment");
    throw new OrganizationServiceError("The payment provider couldn't start the payment. Try again, or choose another method.", "PROVIDER_ERROR");
  }
}

/** Service role. Call only with a verdict already proven real (a verified webhook signature, or
 * the sandbox page after it checked the caller can see the deposit). */
export async function completeCardDeposit(reference: string, outcome: "confirmed" | "failed", detail?: string): Promise<void> {
  await withServiceRoleTransaction((client) => callRpc(client, "public.complete_card_deposit", [reference, outcome, detail ?? null]));
}

export type GatewayOption = { gateway: CheckoutGateway; currency: CardCurrency; available: boolean; mode: "sandbox" | "live" | null; surchargeBps: number };

export function checkoutGatewayOptions(): GatewayOption[] {
  const surchargeBps = cardSurchargeBps();
  return (["stripe", "paypal", "razorpay"] as const).map((gateway) => {
    const provider = selectGatewayProvider(gateway);
    return { gateway, currency: GATEWAY_CURRENCY[gateway], available: provider !== null, mode: provider?.mode ?? null, surchargeBps };
  });
}

// Program budgets and low-balance alerts -----------------------------------------------

export type ProgramBudget = { programId: string; programName: string; programStatus: string; currency: CardCurrency | null; capMinorUnits: number | null; usedMinorUnits: number | null };

export async function listProgramBudgets(organizationId: string): Promise<ProgramBudget[]> {
  type Row = { program_id: string; program_name: string; program_status: string; currency: CardCurrency | null; cap_minor_units: string | null; used_minor_units: string | null };
  const rows = await asActor((client) => callRpc<Row>(client, "public.list_program_budgets", [organizationId]));
  const num = (v: string | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({ programId: r.program_id, programName: r.program_name, programStatus: r.program_status, currency: r.currency, capMinorUnits: num(r.cap_minor_units), usedMinorUnits: num(r.used_minor_units) }));
}

export async function setProgramBudget(programId: string, currency: CardCurrency, capMinorUnits: number | null): Promise<void> {
  await asActor((client) => callRpc(client, "public.set_program_budget", [programId, currency, capMinorUnits]));
}

export type BalanceAlert = { currency: CardCurrency; thresholdMinorUnits: number; alerted: boolean };

/** Read under RLS: finance roles only. */
export async function listBalanceAlerts(organizationId: string): Promise<BalanceAlert[]> {
  const result = await asActor((client) =>
    client.query<{ currency: CardCurrency; threshold_minor_units: string; alerted: boolean }>(
      "select currency, threshold_minor_units, alerted from public.organization_balance_alerts where organization_id = $1 order by currency",
      [organizationId],
    ),
  );
  return result.rows.map((r) => ({ currency: r.currency, thresholdMinorUnits: Number(r.threshold_minor_units), alerted: r.alerted }));
}

export async function setBalanceAlert(organizationId: string, currency: CardCurrency, thresholdMinorUnits: number | null): Promise<void> {
  await asActor((client) => callRpc(client, "public.set_balance_alert", [organizationId, currency, thresholdMinorUnits]));
}

// Billing profile and GST invoices -----------------------------------------------------

export type BillingProfile = { legalName: string; gstin: string | null; addressLine: string; city: string; postalCode: string; country: string; stateCode: string | null };

export async function getBillingProfile(organizationId: string): Promise<BillingProfile | null> {
  type Row = { legal_name: string; gstin: string | null; address_line: string; city: string; postal_code: string; country: string; state_code: string | null };
  const result = await asActor((client) =>
    client.query<Row>("select legal_name, gstin, address_line, city, postal_code, country, state_code from public.organization_billing_profiles where organization_id = $1", [organizationId]),
  );
  const r = result.rows[0];
  return r ? { legalName: r.legal_name, gstin: r.gstin, addressLine: r.address_line, city: r.city, postalCode: r.postal_code, country: r.country, stateCode: r.state_code } : null;
}

export async function upsertBillingProfile(organizationId: string, p: BillingProfile): Promise<void> {
  await asActor((client) => callRpc(client, "public.upsert_billing_profile", [organizationId, p.legalName, p.gstin, p.addressLine, p.city, p.postalCode, p.country, p.stateCode]));
}

export type InvoiceParty = { name: string; sac?: string | null; gstin?: string | null; address?: string; address_line?: string; city?: string; postal_code?: string; country?: string; state_code?: string | null };
export type InvoiceSummary = { id: string; organizationId: string; organizationName: string; number: string; currency: string; periodStart: string; periodEnd: string; issuedAt: string; totalMinorUnits: number };
export type InvoiceLine = { description: string; bountyMinorUnits: number; feeMinorUnits: number; paidAt: string };
export type Invoice = InvoiceSummary & {
  seller: InvoiceParty;
  buyer: InvoiceParty;
  subtotalMinorUnits: number;
  cgstMinorUnits: number;
  sgstMinorUnits: number;
  igstMinorUnits: number;
  taxNote: string;
  lines: InvoiceLine[];
};

type InvoiceRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  number: string;
  currency: string;
  period_start: Date | string;
  period_end: Date | string;
  issued_at: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  subtotal_minor_units: string;
  cgst_minor_units: string;
  sgst_minor_units: string;
  igst_minor_units: string;
  total_minor_units: string;
  tax_note: string;
};

const INVOICE_SELECT = `select i.*, i.period_start::text as period_start, i.period_end::text as period_end, o.name as organization_name
  from public.invoices i join public.organizations o on o.id = i.organization_id`;

const toSummary = (r: InvoiceRow): InvoiceSummary => ({
  id: r.id,
  organizationId: r.organization_id,
  organizationName: r.organization_name,
  number: r.number,
  currency: r.currency,
  periodStart: String(r.period_start),
  periodEnd: String(r.period_end),
  issuedAt: new Date(r.issued_at).toISOString(),
  totalMinorUnits: Number(r.total_minor_units),
});

/** Read under RLS: the organization's finance roles, or platform admins (organizationId null = all). */
export async function listInvoices(organizationId: string | null, limit = 50): Promise<InvoiceSummary[]> {
  const result = await asActor((client) => client.query<InvoiceRow>(`${INVOICE_SELECT} where ($1::uuid is null or i.organization_id = $1) order by i.issued_at desc, i.number desc limit $2`, [organizationId, limit]));
  return result.rows.map(toSummary);
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  return asActor(async (client) => {
    const r = (await client.query<InvoiceRow>(`${INVOICE_SELECT} where i.id = $1`, [invoiceId])).rows[0];
    if (!r) return null;
    const lines = await client.query<{ description: string; bounty_minor_units: string; fee_minor_units: string; paid_at: string }>(
      "select description, bounty_minor_units, fee_minor_units, paid_at from public.invoice_lines where invoice_id = $1 order by paid_at",
      [invoiceId],
    );
    return {
      ...toSummary(r),
      seller: r.seller,
      buyer: r.buyer,
      subtotalMinorUnits: Number(r.subtotal_minor_units),
      cgstMinorUnits: Number(r.cgst_minor_units),
      sgstMinorUnits: Number(r.sgst_minor_units),
      igstMinorUnits: Number(r.igst_minor_units),
      taxNote: r.tax_note,
      lines: lines.rows.map((l) => ({ description: l.description, bountyMinorUnits: Number(l.bounty_minor_units), feeMinorUnits: Number(l.fee_minor_units), paidAt: new Date(l.paid_at).toISOString() })),
    };
  });
}

/** The issuing entity, from server configuration only. In a sandbox an unconfigured seller is
 * an obviously fake placeholder, so a test invoice can never pass for a real one. */
export function invoiceSeller(env: NodeJS.ProcessEnv = process.env): (InvoiceParty & { state_code: string }) | null {
  const name = env.INVOICE_SELLER_NAME?.trim();
  const state = env.INVOICE_SELLER_STATE_CODE?.trim();
  // The service accounting code is a tax decision (confirm with a CA), so it is configuration,
  // frozen into each invoice at issue time like the rest of the seller block.
  const sac = env.INVOICE_SAC_CODE?.trim() || null;
  if (name && state) return { name, gstin: env.INVOICE_SELLER_GSTIN?.trim() || null, address: env.INVOICE_SELLER_ADDRESS?.trim() || "", state_code: state, sac };
  return sandboxAllowed(env) ? { name: "Unpatched SANDBOX (not a tax invoice)", gstin: null, address: "Sandbox environment", state_code: "29" } : null;
}

/** Platform admins: issue every outstanding invoice for one calendar month ("YYYY-MM"). */
export async function issueInvoicesForMonth(month: string): Promise<number> {
  const seller = invoiceSeller();
  if (!seller) throw new OrganizationServiceError("Set INVOICE_SELLER_NAME and INVOICE_SELLER_STATE_CODE (and the GSTIN and address) before issuing invoices.", "SELLER_NOT_CONFIGURED");
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
  const rows = await asActor((client) => callRpc(client, "public.issue_invoices_for_period", [start, end, JSON.stringify(seller)]));
  return rows.length;
}

/** obligation id -> the invoice that bills its platform fee, for the Payments ledger's
 * per-payment Invoice link. Read under RLS (finance roles). */
export async function listInvoiceRefsByObligation(organizationId: string): Promise<Record<string, { invoiceId: string; number: string }>> {
  const result = await asActor((client) =>
    client.query<{ obligation_id: string; invoice_id: string; number: string }>(
      "select l.obligation_id, i.id as invoice_id, i.number from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where i.organization_id = $1",
      [organizationId],
    ),
  );
  return Object.fromEntries(result.rows.map((r) => [r.obligation_id, { invoiceId: r.invoice_id, number: r.number }]));
}

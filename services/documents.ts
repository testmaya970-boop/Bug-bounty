import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { sandboxAllowed } from "@/lib/integrations/common";

// Billing documents (organizations) and earnings documents (researchers), all read from
// immutable records: invoices and notes, the wallet ledger, payouts and the tax withheld on
// them (db/migrations/202610220040). Nothing here computes money the database didn't record.

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------- credit / debit notes
export type InvoiceNote = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  organizationId: string;
  kind: "credit" | "debit";
  number: string;
  currency: string;
  reason: string;
  subtotalMinorUnits: number;
  cgstMinorUnits: number;
  sgstMinorUnits: number;
  igstMinorUnits: number;
  totalMinorUnits: number;
  issuedAt: string;
};
type NoteRow = {
  id: string; invoice_id: string; invoice_number: string; organization_id: string; kind: "credit" | "debit"; number: string; currency: string; reason: string;
  subtotal_minor_units: string; cgst_minor_units: string; sgst_minor_units: string; igst_minor_units: string; total_minor_units: string; issued_at: string;
};
const toNote = (r: NoteRow): InvoiceNote => ({
  id: r.id, invoiceId: r.invoice_id, invoiceNumber: r.invoice_number, organizationId: r.organization_id, kind: r.kind, number: r.number, currency: r.currency, reason: r.reason,
  subtotalMinorUnits: Number(r.subtotal_minor_units), cgstMinorUnits: Number(r.cgst_minor_units), sgstMinorUnits: Number(r.sgst_minor_units),
  igstMinorUnits: Number(r.igst_minor_units), totalMinorUnits: Number(r.total_minor_units), issuedAt: new Date(r.issued_at).toISOString(),
});
const NOTE_SELECT = "select n.*, i.number as invoice_number from public.invoice_notes n join public.invoices i on i.id = n.invoice_id";

/** Read under RLS: the organization's finance roles, or platform admins. */
export async function listInvoiceNotes(organizationId: string): Promise<InvoiceNote[]> {
  const result = await asActor((client) => client.query<NoteRow>(`${NOTE_SELECT} where n.organization_id = $1 order by n.issued_at desc`, [organizationId]));
  return result.rows.map(toNote);
}

export async function getInvoiceNote(noteId: string): Promise<InvoiceNote | null> {
  const result = await asActor((client) => client.query<NoteRow>(`${NOTE_SELECT} where n.id = $1`, [noteId]));
  return result.rows[0] ? toNote(result.rows[0]) : null;
}

/** Platform admins: a credit note (bills less) or debit note (bills more) against an invoice. */
export async function issueInvoiceNote(input: { invoiceId: string; kind: "credit" | "debit"; subtotalMinorUnits: number; reason: string }): Promise<InvoiceNote> {
  return asActor(async (client) => {
    const [row] = await callRpc<{ id: string }>(client, "public.issue_invoice_note", [input.invoiceId, input.kind, input.subtotalMinorUnits, input.reason]);
    const note = await client.query<NoteRow>(`${NOTE_SELECT} where n.id = $1`, [row.id]);
    return toNote(note.rows[0]);
  });
}

// ---------------------------------------------------------------- statements
export type LedgerKind = "opening" | "deposit" | "award" | "fee" | "release";
export type LedgerEntry = { occurredAt: string; kind: LedgerKind; description: string; reference: string | null; amountMinorUnits: number; balanceMinorUnits: number };
export type WalletStatement = { currency: string; from: string; to: string; opening: number; closing: number; entries: LedgerEntry[]; totals: Record<Exclude<LedgerKind, "opening">, number> };

/** Every balance movement in [from, to] with a running balance, plus per-kind totals. */
export async function getWalletStatement(organizationId: string, currency: string, from: string, to: string): Promise<WalletStatement> {
  type Row = { occurred_at: string; kind: LedgerKind; description: string; reference: string | null; amount_minor_units: string };
  const rows = await asActor((client) => callRpc<Row>(client, "public.get_organization_wallet_ledger", [organizationId, currency, from, to]));
  const opening = Number(rows[0]?.amount_minor_units ?? 0);
  const totals = { deposit: 0, award: 0, fee: 0, release: 0 };
  let balance = opening;
  const entries = rows.slice(1).map((r) => {
    const amount = Number(r.amount_minor_units);
    balance += amount;
    totals[r.kind as keyof typeof totals] += amount;
    return { occurredAt: new Date(r.occurred_at).toISOString(), kind: r.kind, description: r.description, reference: r.reference, amountMinorUnits: amount, balanceMinorUnits: balance };
  });
  return { currency, from, to, opening, closing: balance, entries, totals };
}

export type BountyHistoryRow = {
  obligationId: string; awardedAt: string; paidAt: string | null; status: string; programName: string | null; reportId: string; reportTitle: string | null;
  researcherName: string | null; severity: string | null; currency: string; bountyMinorUnits: number; feeMinorUnits: number; invoiceNumber: string | null;
};
export async function getBountyHistory(organizationId: string, from: string, to: string): Promise<BountyHistoryRow[]> {
  type Row = {
    obligation_id: string; awarded_at: string; paid_at: string | null; status: string; program_name: string | null; report_id: string; report_title: string | null;
    researcher_name: string | null; severity: string | null; currency: string; bounty_minor_units: string; fee_minor_units: string; invoice_number: string | null;
  };
  const rows = await asActor((client) => callRpc<Row>(client, "public.list_organization_bounty_history", [organizationId, from, to]));
  return rows.map((r) => ({
    obligationId: r.obligation_id, awardedAt: iso(r.awarded_at)!, paidAt: iso(r.paid_at), status: r.status, programName: r.program_name, reportId: r.report_id,
    reportTitle: r.report_title, researcherName: r.researcher_name, severity: r.severity, currency: r.currency,
    bountyMinorUnits: Number(r.bounty_minor_units), feeMinorUnits: Number(r.fee_minor_units), invoiceNumber: r.invoice_number,
  }));
}

// ---------------------------------------------------------------- researcher earnings
export type TaxRegime = "in_194j" | "in_206aa" | "us_1099" | "us_backup" | "none";
export type Payout = {
  obligationId: string; paidAt: string; provider: string; providerReference: string | null; organizationName: string | null; programName: string | null; reportTitle: string | null;
  currency: string; grossMinorUnits: number; withheldMinorUnits: number; netMinorUnits: number; regime: TaxRegime; rateBps: number; legalBasis: string; country: string | null;
};
export async function listMyPayouts(from: string | null = null, to: string | null = null): Promise<Payout[]> {
  type Row = {
    obligation_id: string; paid_at: string; provider: string; provider_reference: string | null; organization_name: string | null; program_name: string | null; report_title: string | null;
    currency: string; gross_minor_units: string; withheld_minor_units: string; net_minor_units: string; regime: TaxRegime; rate_bps: number; legal_basis: string; country: string | null;
  };
  const rows = await asActor((client) => callRpc<Row>(client, "public.list_my_payouts", [from, to]));
  return rows.map((r) => ({
    obligationId: r.obligation_id, paidAt: new Date(r.paid_at).toISOString(), provider: r.provider, providerReference: r.provider_reference, organizationName: r.organization_name,
    programName: r.program_name, reportTitle: r.report_title, currency: r.currency, grossMinorUnits: Number(r.gross_minor_units), withheldMinorUnits: Number(r.withheld_minor_units),
    netMinorUnits: Number(r.net_minor_units), regime: r.regime, rateBps: r.rate_bps, legalBasis: r.legal_basis, country: r.country,
  }));
}

export type TaxIdentity = {
  displayName: string; email: string | null; country: string | null; panMasked: string | null; panStatus: string | null; taxFormType: string | null; tinLast4: string | null;
  taxFormStatus: string | null; nextRegime: TaxRegime; nextRateBps: number; nextLegalBasis: string;
};
export async function getMyTaxIdentity(): Promise<TaxIdentity | null> {
  type Row = {
    display_name: string; email: string | null; tax_residence_country: string | null; pan_masked: string | null; pan_status: string | null; tax_form_type: string | null;
    tin_last4: string | null; tax_form_status: string | null; next_regime: TaxRegime; next_rate_bps: number; next_legal_basis: string;
  };
  const [r] = await asActor((client) => callRpc<Row>(client, "public.get_my_tax_identity", []));
  return r
    ? {
        displayName: r.display_name, email: r.email, country: r.tax_residence_country, panMasked: r.pan_masked, panStatus: r.pan_status, taxFormType: r.tax_form_type,
        tinLast4: r.tin_last4, taxFormStatus: r.tax_form_status, nextRegime: r.next_regime ?? "none", nextRateBps: r.next_rate_bps ?? 0, nextLegalBasis: r.next_legal_basis ?? "",
      }
    : null;
}

export async function setMyTaxResidence(country: string | null): Promise<void> {
  await asActor((client) => callRpc(client, "public.set_my_tax_residence", [country]));
}

/** The deductor on a tax certificate: Unpatched's entity, from server configuration only. In
 * a sandbox an unconfigured payer prints as an obvious placeholder, so a test certificate can
 * never pass for a statutory one. */
export type TaxPayer = { name: string; address: string; tan: string | null; pan: string | null; ein: string | null; sandbox: boolean };
export function taxPayer(env: NodeJS.ProcessEnv = process.env): TaxPayer | null {
  const name = env.TAX_PAYER_NAME?.trim() || env.INVOICE_SELLER_NAME?.trim();
  if (name) {
    return { name, address: env.TAX_PAYER_ADDRESS?.trim() || env.INVOICE_SELLER_ADDRESS?.trim() || "", tan: env.TAX_PAYER_TAN?.trim() || null, pan: env.TAX_PAYER_PAN?.trim() || null, ein: env.TAX_PAYER_EIN?.trim() || null, sandbox: false };
  }
  return sandboxAllowed(env) ? { name: "Unpatched SANDBOX (not a statutory document)", address: "Sandbox environment", tan: null, pan: null, ein: null, sandbox: true } : null;
}

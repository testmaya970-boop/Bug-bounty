"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import {
  completeCardDeposit,
  issueInvoicesForMonth,
  listOrganizationDeposits,
  requestOrganizationDeposit,
  reviewOrganizationDeposit,
  setBalanceAlert,
  setProgramBudget,
  startCardDeposit,
  upsertBillingProfile,
} from "@/services/billing";
import { sandboxAllowed } from "@/lib/integrations/common";
import { selectGatewayProvider } from "@/lib/integrations/card";
import { parseDecimalToMinorUnits } from "@/lib/money";

export type ActionResult = { ok: true } | { ok: false; code: string; message: string };

async function run(promise: Promise<unknown>): Promise<ActionResult> {
  try {
    await promise;
    return { ok: true };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const depositSchema = z.object({
  organizationId: z.string().uuid(),
  currency: z.enum(["INR", "USD"]),
  amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 50000 or 50000.00."),
  method: z.enum(["upi", "imps", "neft", "rtgs", "wire", "ach"]),
  payerReference: z.string().trim().min(4, "Enter the transfer reference your bank gave you.").max(64, "Use 64 characters or fewer."),
});

export async function requestDepositAction(input: z.infer<typeof depositSchema>): Promise<ActionResult> {
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const amountMinorUnits = parseDecimalToMinorUnits(parsed.data.amount) ?? 0;
  if (amountMinorUnits <= 0) return { ok: false, code: "INVALID_INPUT", message: "Enter an amount above zero." };
  const result = await run(requestOrganizationDeposit({ ...parsed.data, amountMinorUnits }));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/payments`);
  return result;
}

const reviewSchema = z.object({
  depositId: z.string().uuid(),
  outcome: z.enum(["confirmed", "rejected"]),
  note: z.string().trim().max(500, "Use 500 characters or fewer."),
});

export async function reviewDepositAction(input: z.infer<typeof reviewSchema>): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const result = await run(reviewOrganizationDeposit(parsed.data.depositId, parsed.data.outcome, parsed.data.note));
  if (result.ok) revalidatePath("/platform/payouts");
  return result;
}

const amountField = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 50000 or 50000.00.");
const optionalAmount = z.union([z.literal(""), amountField]);
const currencyField = z.enum(["INR", "USD"]);
const invalid = (error: z.ZodError): ActionResult => ({ ok: false, code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Check the form and try again." });
/** "" clears the setting; otherwise a positive amount. */
const toOptionalMinor = (value: string) => (value === "" ? null : parseDecimalToMinorUnits(value));

const cardSchema = z.object({ organizationId: z.string().uuid(), gateway: z.enum(["stripe", "paypal", "razorpay"]), amount: amountField });

export async function startCardDepositAction(input: z.infer<typeof cardSchema>): Promise<{ ok: true; url: string } | Extract<ActionResult, { ok: false }>> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error) as Extract<ActionResult, { ok: false }>;
  const amountMinorUnits = parseDecimalToMinorUnits(parsed.data.amount) ?? 0;
  if (amountMinorUnits <= 0) return { ok: false, code: "INVALID_INPUT", message: "Enter an amount above zero." };
  try {
    const { url } = await startCardDeposit({ organizationId: parsed.data.organizationId, gateway: parsed.data.gateway, amountMinorUnits });
    return { ok: true, url };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const sandboxSchema = z.object({ organizationId: z.string().uuid(), reference: z.string().regex(/^card_[0-9a-f]{32}$/), outcome: z.enum(["confirmed", "failed"]), method: z.enum(["UPI", "Card", "Net banking", "ACH", "PayPal"]).optional() });

/** The sandbox checkout's Approve / Decline. Sandbox only, and only for a deposit the caller
 * can already read under RLS (a finance role of that organization). */
export async function completeSandboxCardAction(input: z.infer<typeof sandboxSchema>): Promise<ActionResult> {
  const parsed = sandboxSchema.safeParse(input);
  if (!parsed.success || !sandboxAllowed()) return { ok: false, code: "NOT_AVAILABLE", message: "The card sandbox isn't available here." };
  // Never let this page settle a real provider's payment: only a sandbox deposit qualifies.
  const deposit = (await listOrganizationDeposits(parsed.data.organizationId)).find((d) => d.method === "card" && d.provider === "sandbox" && d.payerReference === parsed.data.reference);
  if (!deposit || !deposit.gateway || selectGatewayProvider(deposit.gateway)?.name !== "sandbox") return { ok: false, code: "NOT_FOUND", message: "That card payment wasn't found." };
  // Like a real gateway: the method chosen on the checkout page and the provider's own payment id.
  const paymentId = `pay_${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
  const result = await run(completeCardDeposit(parsed.data.reference, parsed.data.outcome, parsed.data.outcome === "failed" ? "Payment declined" : `Paid by ${parsed.data.method ?? "Card"} · ${paymentId}`));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/payments`);
  return result;
}

const budgetSchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid(), currency: currencyField, cap: optionalAmount });

export async function setProgramBudgetAction(input: z.infer<typeof budgetSchema>): Promise<ActionResult> {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const cap = toOptionalMinor(parsed.data.cap);
  if (cap !== null && cap <= 0) return { ok: false, code: "INVALID_INPUT", message: "Enter a budget above zero, or leave it empty for no limit." };
  const result = await run(setProgramBudget(parsed.data.programId, parsed.data.currency, cap));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/payments`);
  return result;
}

const alertSchema = z.object({ organizationId: z.string().uuid(), currency: currencyField, threshold: optionalAmount });

export async function setBalanceAlertAction(input: z.infer<typeof alertSchema>): Promise<ActionResult> {
  const parsed = alertSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const threshold = toOptionalMinor(parsed.data.threshold);
  if (threshold !== null && threshold <= 0) return { ok: false, code: "INVALID_INPUT", message: "Enter an amount above zero, or leave it empty to turn the alert off." };
  const result = await run(setBalanceAlert(parsed.data.organizationId, parsed.data.currency, threshold));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/payments`);
  return result;
}

const profileSchema = z.object({
  organizationId: z.string().uuid(),
  legalName: z.string().trim().min(2, "Enter the registered business name.").max(200),
  gstin: z.string().trim().toUpperCase().max(15),
  addressLine: z.string().trim().min(3, "Enter the billing address.").max(300),
  city: z.string().trim().min(2, "Enter the city.").max(100),
  postalCode: z.string().trim().min(3, "Enter the postal code.").max(12),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code, like IN or US."),
  stateCode: z.string().trim().max(2),
});

export async function upsertBillingProfileAction(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { organizationId, gstin, stateCode, ...rest } = parsed.data;
  const result = await run(upsertBillingProfile(organizationId, { ...rest, gstin: gstin || null, stateCode: stateCode || null }));
  if (result.ok) revalidatePath(`/organizations/${organizationId}/payments`);
  return result;
}

const issueSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month.") });

export async function issueInvoicesAction(input: z.infer<typeof issueSchema>): Promise<{ ok: true; issued: number } | Extract<ActionResult, { ok: false }>> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error) as Extract<ActionResult, { ok: false }>;
  try {
    const issued = await issueInvoicesForMonth(parsed.data.month);
    revalidatePath("/platform/payouts");
    return { ok: true, issued };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

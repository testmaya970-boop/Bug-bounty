"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { requestOrganizationDeposit, reviewOrganizationDeposit } from "@/services/billing";
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

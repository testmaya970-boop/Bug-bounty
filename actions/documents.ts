"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { issueInvoiceNote, setMyTaxResidence } from "@/services/documents";
import { parseDecimalToMinorUnits } from "@/lib/money";

export type ActionResult = { ok: true; message?: string } | { ok: false; code: string; message: string };

async function run(promise: Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    await promise;
    return { ok: true, message };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const residenceSchema = z.object({ country: z.union([z.literal(""), z.string().regex(/^[A-Z]{2}$/)]) });

/** Researchers: the tax residence that decides what is withheld from their next payout. */
export async function setTaxResidenceAction(input: z.infer<typeof residenceSchema>): Promise<ActionResult> {
  const parsed = residenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Choose a country." };
  const result = await run(setMyTaxResidence(parsed.data.country || null), "Tax residence saved. It applies from your next payout.");
  if (result.ok) revalidatePath("/bounties/documents");
  return result;
}

const noteSchema = z.object({
  invoiceId: z.string().uuid(),
  kind: z.enum(["credit", "debit"]),
  amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 500 or 500.00."),
  reason: z.string().trim().min(5, "Say why the note is issued (5 characters or more).").max(500, "Use 500 characters or fewer."),
});

/** Platform admins: a credit or debit note against an issued invoice. */
export async function issueInvoiceNoteAction(input: z.infer<typeof noteSchema>): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const subtotalMinorUnits = parseDecimalToMinorUnits(parsed.data.amount) ?? 0;
  if (subtotalMinorUnits <= 0) return { ok: false, code: "INVALID_INPUT", message: "Enter an amount above zero." };
  try {
    const note = await issueInvoiceNote({ invoiceId: parsed.data.invoiceId, kind: parsed.data.kind, subtotalMinorUnits, reason: parsed.data.reason });
    revalidatePath("/platform/payouts");
    return { ok: true, message: `Issued ${note.number}.` };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

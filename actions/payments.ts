"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { cancelPaymentObligation, createPaymentObligation, initiateManualPaymentAttempt, recordManualPaymentResult } from "@/services/payments";
import type { PaymentAttempt, PaymentObligation } from "@/types/payment";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

function invalidInput(message = "Check the form and try again."): ActionResult<never> {
  return { ok: false, code: "INVALID_INPUT", message };
}

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

function revalidateReportPaths(organizationId: string, programId: string, reportId: string) {
  revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
  revalidatePath(`/organizations/${organizationId}/programs/${programId}/reports/${reportId}`);
  revalidatePath("/reports");
}

const reportActionBase = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema });

export async function createPaymentObligationAction(input: z.infer<typeof reportActionBase>): Promise<ActionResult<PaymentObligation>> {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(createPaymentObligation(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const obligationActionBase = reportActionBase.extend({ obligationId: uuidSchema });

export async function initiateManualPaymentAttemptAction(input: z.infer<typeof obligationActionBase>): Promise<ActionResult<PaymentAttempt>> {
  const parsed = obligationActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(initiateManualPaymentAttempt(parsed.data.obligationId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const recordResultSchema = reportActionBase.extend({
  attemptId: uuidSchema,
  outcome: z.enum(["succeeded", "failed"]),
  providerReferenceId: z.string().trim().max(200, "Use 200 characters or fewer.").optional(),
  failureCode: z.string().trim().max(100, "Use 100 characters or fewer.").optional(),
  failureMessage: z.string().trim().max(500, "Use 500 characters or fewer.").optional(),
});

export async function recordManualPaymentResultAction(input: z.infer<typeof recordResultSchema>): Promise<ActionResult<PaymentAttempt>> {
  const parsed = recordResultSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  if (parsed.data.outcome === "failed" && !parsed.data.failureCode) return invalidInput("A failure code is required when recording a failed payment.");
  const result = await toResult(
    recordManualPaymentResult(parsed.data.attemptId, parsed.data.outcome, {
      providerReferenceId: parsed.data.providerReferenceId,
      failureCode: parsed.data.failureCode,
      failureMessage: parsed.data.failureMessage,
    }),
  );
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const cancelSchema = obligationActionBase.extend({
  reason: z.string().trim().min(1, "Explain why this payment obligation is being cancelled.").max(2000, "Use 2000 characters or fewer."),
});

export async function cancelPaymentObligationAction(input: z.infer<typeof cancelSchema>): Promise<ActionResult<PaymentObligation>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(cancelPaymentObligation(parsed.data.obligationId, parsed.data.reason));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

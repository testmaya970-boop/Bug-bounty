"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { acceptBounty, adjustBounty, calculateBountyRecommendation, checkAwardFunding, createBountyPolicyVersion, finalizeBounty, type AwardFunding } from "@/services/bounty";
import type { BountyPolicy, ReportBountyDecision } from "@/types/bounty";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();
// The prepaid balance (202610140004) holds INR and USD only; a bounty in any other currency
// could never be paid.
const currencySchema = z.enum(["USD", "INR"], { message: "Choose USD or INR." });
const amountSchema = z.number().int().nonnegative();
const rangeSchema = z.object({ min: amountSchema, max: amountSchema }).refine((range) => range.min <= range.max, { message: "Minimum cannot exceed maximum." });

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

const createPolicySchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  currency: currencySchema,
  ranges: z
    .object({ none: rangeSchema, low: rangeSchema, medium: rangeSchema, high: rangeSchema, critical: rangeSchema })
    .refine((r) => r.critical.max > 0, { message: "A bounty table must pay something: set at least the Critical maximum above zero." }),
});

export async function createBountyPolicyVersionAction(input: z.infer<typeof createPolicySchema>): Promise<ActionResult<BountyPolicy>> {
  const parsed = createPolicySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(createBountyPolicyVersion(parsed.data.programId, parsed.data.currency, parsed.data.ranges));
  if (result.ok) {
    revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  }
  return result;
}

const reportActionBase = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema });

export async function calculateBountyRecommendationAction(input: z.infer<typeof reportActionBase>): Promise<ActionResult<ReportBountyDecision>> {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(calculateBountyRecommendation(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const finalizeSchema = reportActionBase.extend({ amountMinorUnits: amountSchema, note: z.string().trim().max(2000, "Use 2000 characters or fewer.") });

export async function finalizeBountyAction(input: z.infer<typeof finalizeSchema>): Promise<ActionResult<ReportBountyDecision>> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(finalizeBounty(parsed.data.reportId, parsed.data.amountMinorUnits, parsed.data.note));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const fundingSchema = reportActionBase.extend({ amountMinorUnits: amountSchema });

/** The finalize dialog's preview of what finalizing will check (budget left, balance covers). */
export async function checkAwardFundingAction(input: z.infer<typeof fundingSchema>): Promise<ActionResult<AwardFunding>> {
  const parsed = fundingSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  return toResult(checkAwardFunding(parsed.data.reportId, parsed.data.amountMinorUnits));
}

const adjustSchema = reportActionBase.extend({
  newAmountMinorUnits: amountSchema,
  reason: z.string().trim().min(1, "Explain why this bounty is being adjusted.").max(2000, "Use 2000 characters or fewer."),
});

export async function adjustBountyAction(input: z.infer<typeof adjustSchema>): Promise<ActionResult<ReportBountyDecision>> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(adjustBounty(parsed.data.reportId, parsed.data.newAmountMinorUnits, parsed.data.reason));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

/** The submitting researcher confirms the current award (accept_bounty re-checks ownership). */
export async function acceptBountyAction(input: z.infer<typeof reportActionBase>): Promise<ActionResult<void>> {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(acceptBounty(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

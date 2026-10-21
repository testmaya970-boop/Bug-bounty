"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { liftSubmissionRestriction, pauseResearcherSubmissions } from "@/services/submission-signal";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getCurrentUser } from "@/lib/auth/current-user";

// Authorization lives in the database (each RPC checks private.is_platform_admin()); these
// actions only validate input and require a session so anonymous calls fail fast.

const pauseSchema = z.object({
  email: z.string().trim().email("Select a researcher with an email address."),
  days: z.coerce.number().int().min(1, "Choose between 1 and 90 days.").max(90, "Choose between 1 and 90 days."),
  reason: z.string().trim().min(1, "Tell the researcher why.").max(500, "Use 500 characters or fewer."),
});

type Result = { ok: true } | { ok: false; message: string };

async function run(fn: () => Promise<void>): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: "Your session has expired. Sign in again to continue." };
  try {
    await fn();
    revalidatePath("/platform/researchers");
    return { ok: true };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function pauseResearcherSubmissionsAction(input: { email: string; days: number; reason: string }): Promise<Result> {
  const parsed = pauseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return run(() => pauseResearcherSubmissions(parsed.data.email, parsed.data.days, parsed.data.reason));
}

export async function liftSubmissionRestrictionAction(input: { restrictionId: string }): Promise<Result> {
  const parsed = z.object({ restrictionId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That restriction could not be found." };
  return run(() => liftSubmissionRestriction(parsed.data.restrictionId));
}

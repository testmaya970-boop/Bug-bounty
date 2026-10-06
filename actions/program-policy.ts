"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { publishProgramPolicy } from "@/services/program-policy";
import type { ProgramPolicy } from "@/types/program-policy";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const optionalTarget = (max: number, unit: string) => z.number().int().min(1, `Use at least 1 ${unit}.`).max(max, `Use ${max} ${unit} or fewer.`).nullable();

const publishSchema = z
  .object({
    organizationId: z.string().uuid(),
    programId: z.string().uuid(),
    rulesOfEngagement: z.string().trim().min(1, "Write the rules of engagement.").max(20000, "Use 20000 characters or fewer."),
    safeHarbor: z.boolean(),
    disclosureMode: z.enum(["coordinated", "full", "none"]),
    disclosureDays: z.number().int().min(0).max(365, "Use 365 days or fewer.").nullable(),
    firstResponseTargetHours: optionalTarget(720, "hours"),
    triageTargetHours: optionalTarget(2160, "hours"),
    resolutionTargetDays: optionalTarget(365, "days"),
    changeNote: z.string().trim().max(1000, "Use 1000 characters or fewer.").optional(),
  })
  .refine((v) => v.disclosureMode !== "coordinated" || v.disclosureDays !== null, { message: "Coordinated disclosure needs a number of days." });

/** Publishes a new policy version; publish_program_policy re-checks the caller manages this
 * program and keeps every earlier version. */
export async function publishProgramPolicyAction(input: z.infer<typeof publishSchema>): Promise<ActionResult<ProgramPolicy>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const { organizationId, programId, ...policy } = parsed.data;
  try {
    const data = await publishProgramPolicy(programId, policy);
    revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
    revalidatePath(`/organizations/${organizationId}/programs/${programId}/reports/new`);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteMyReportTemplate, upsertMyReportTemplate, type ReportTemplate } from "@/services/report-templates";
import { OrganizationServiceError } from "@/services/researcher-profiles";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const weaknessTypeEnum = z.enum([
  "cross_site_scripting", "sql_injection", "ssrf", "idor", "broken_authentication", "broken_access_control",
  "csrf", "remote_code_execution", "information_disclosure", "insecure_deserialization", "security_misconfiguration",
  "injection_other", "business_logic", "denial_of_service", "cryptographic_failure", "other",
]);

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name this template.").max(100),
  weaknessType: weaknessTypeEnum.optional(),
  descriptionTemplate: z.string().trim().max(10000).optional(),
  impactTemplate: z.string().trim().max(5000).optional(),
});

export async function upsertMyReportTemplateAction(input: z.infer<typeof upsertSchema>): Promise<ActionResult<ReportTemplate>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    const template = await upsertMyReportTemplate(parsed.data);
    revalidatePath("/settings/report-templates");
    return { ok: true, data: template };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteMyReportTemplateAction(input: z.infer<typeof deleteSchema>): Promise<ActionResult<void>> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };

  try {
    await deleteMyReportTemplate(parsed.data.id);
    revalidatePath("/settings/report-templates");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

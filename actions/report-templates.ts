"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteMyReportTemplate, upsertMyReportTemplate, type ReportTemplate } from "@/services/report-templates";
import { OrganizationServiceError } from "@/services/researcher-profiles";
import { WEAKNESS_TYPE_ORDER } from "../lib/report-weakness-labels";
import type { ReportWeaknessType } from "../types/report";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

// The taxonomy has one source of truth (lib/report-weakness-labels.ts).
const weaknessTypeEnum = z.enum(WEAKNESS_TYPE_ORDER as [ReportWeaknessType, ...ReportWeaknessType[]]);

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

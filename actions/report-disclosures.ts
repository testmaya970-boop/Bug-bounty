"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { approveReportDisclosure, declineReportDisclosure, requestReportDisclosure, unpublishReportDisclosure, updateReportDisclosureDraft } from "@/services/report-disclosures";
import { OrganizationServiceError } from "@/services/rpc-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const reportIdSchema = z.object({ reportId: z.string().uuid() });

const draftSchema = z.object({
  reportId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the public write-up a title.").max(200, "Use 200 characters or fewer."),
  summary: z.string().trim().max(20000, "Use 20000 characters or fewer."),
});

export async function requestReportDisclosureAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<Awaited<ReturnType<typeof requestReportDisclosure>>>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  try {
    const disclosure = await requestReportDisclosure(parsed.data.reportId, parsed.data.title, parsed.data.summary);
    return { ok: true, data: disclosure };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function approveReportDisclosureAction(input: z.infer<typeof reportIdSchema>): Promise<ActionResult<Awaited<ReturnType<typeof approveReportDisclosure>>>> {
  const parsed = reportIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the request and try again." };

  try {
    const disclosure = await approveReportDisclosure(parsed.data.reportId);
    return { ok: true, data: disclosure };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const declineSchema = z.object({ reportId: z.string().uuid(), reason: z.string().trim().max(2000).optional() });

export async function declineReportDisclosureAction(input: z.infer<typeof declineSchema>): Promise<ActionResult<Awaited<ReturnType<typeof declineReportDisclosure>>>> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the request and try again." };

  try {
    const disclosure = await declineReportDisclosure(parsed.data.reportId, parsed.data.reason);
    return { ok: true, data: disclosure };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Redact/edit the pending public write-up (update_report_disclosure_draft re-checks who). */
export async function updateReportDisclosureDraftAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<Awaited<ReturnType<typeof updateReportDisclosureDraft>>>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the write-up and try again." };
  try {
    return { ok: true, data: await updateReportDisclosureDraft(parsed.data.reportId, parsed.data.title, parsed.data.summary) };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const unpublishSchema = z.object({ reportId: z.string().uuid(), reason: z.string().trim().min(1, "Explain why it is being taken down.").max(2000) });

export async function unpublishReportDisclosureAction(input: z.infer<typeof unpublishSchema>): Promise<ActionResult<Awaited<ReturnType<typeof unpublishReportDisclosure>>>> {
  const parsed = unpublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };
  try {
    const data = await unpublishReportDisclosure(parsed.data.reportId, parsed.data.reason);
    revalidatePath("/disclosures");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

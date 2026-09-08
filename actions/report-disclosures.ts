"use server";

import { z } from "zod";
import { approveReportDisclosure, declineReportDisclosure, requestReportDisclosure } from "@/services/report-disclosures";
import { OrganizationServiceError } from "@/services/rpc-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const reportIdSchema = z.object({ reportId: z.string().uuid() });

export async function requestReportDisclosureAction(input: z.infer<typeof reportIdSchema>): Promise<ActionResult<Awaited<ReturnType<typeof requestReportDisclosure>>>> {
  const parsed = reportIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the request and try again." };

  try {
    const disclosure = await requestReportDisclosure(parsed.data.reportId);
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

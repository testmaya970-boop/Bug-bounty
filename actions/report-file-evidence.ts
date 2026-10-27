"use server";

import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getEvidenceDownloadUrl } from "@/services/report-file-evidence";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();
const reportActionBase = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema });

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


// Files are uploaded through actions/evidence-uploads.ts (direct, verified uploads).
const downloadSchema = reportActionBase.extend({ evidenceId: uuidSchema });

export async function getEvidenceDownloadUrlAction(input: z.infer<typeof downloadSchema>): Promise<ActionResult<{ url: string }>> {
  const parsed = downloadSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(getEvidenceDownloadUrl(parsed.data.evidenceId));
  if (!result.ok) return result;
  if (!result.data) return { ok: false, code: "NOT_FOUND", message: "This evidence is not available." };
  return { ok: true, data: { url: result.data } };
}

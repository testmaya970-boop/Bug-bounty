"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError } from "@/services/rpc-error";
import { completeEvidenceUpload, removeEvidenceUpload, startEvidenceUpload, type StagedUpload } from "@/services/evidence-uploads";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const uuid = z.string().uuid();
const startSchema = z.object({
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("draft"), draftId: uuid }),
    z.object({ kind: z.literal("report"), organizationId: uuid, programId: uuid, reportId: uuid, visibility: z.enum(["researcher_visible", "internal"]).nullable() }),
  ]),
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

async function run<T>(work: (actorId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again; your report is still here." };
  try {
    return { ok: true, data: await work(user.id) };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Step 1: authorize and record the upload; returns a short-lived signed URL for exactly this file. */
export async function startEvidenceUploadAction(input: z.infer<typeof startSchema>): Promise<ActionResult<{ upload: StagedUpload; url: string; contentType: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "That file can't be uploaded." };
  const { target, filename, sizeBytes } = parsed.data;
  return run((actorId) =>
    startEvidenceUpload(actorId, target.kind === "draft" ? target : { kind: "report", reportId: target.reportId, visibility: target.visibility }, filename, sizeBytes),
  );
}

const completeSchema = z.object({
  uploadId: uuid,
  report: z.object({ organizationId: uuid, programId: uuid, reportId: uuid }).optional(),
});

/** Step 3: verify what arrived in storage (size, file signature, hash); a report upload is attached. */
export async function completeEvidenceUploadAction(input: z.infer<typeof completeSchema>): Promise<ActionResult<{ upload: StagedUpload; evidenceId: string | null }>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "That upload can't be completed." };
  const result = await run((actorId) => completeEvidenceUpload(actorId, parsed.data.uploadId));
  if (result.ok && parsed.data.report) {
    const { organizationId, programId, reportId } = parsed.data.report;
    revalidatePath(`/organizations/${organizationId}/programs/${programId}/reports/${reportId}`);
    revalidatePath(`/reports/${reportId}`);
  }
  return result;
}

/** Removes a staged (not yet attached) file and its bytes. */
export async function removeEvidenceUploadAction(input: { uploadId: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ uploadId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "That file can't be removed." };
  return run(async (actorId) => {
    await removeEvidenceUpload(actorId, parsed.data.uploadId);
    return null;
  });
}

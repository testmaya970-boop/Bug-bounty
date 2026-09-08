"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { addOrganizationFileEvidence, addResearcherFileEvidence, getEvidenceDownloadUrl } from "@/services/report-file-evidence";
import type { ReportEvidence } from "@/types/report";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();
const reportActionBase = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema });
const visibilitySchema = z.enum(["researcher_visible", "internal"]);

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

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function uploadResearcherFileEvidenceAction(input: {
  organizationId: string;
  programId: string;
  reportId: string;
  file: File;
}): Promise<ActionResult<ReportEvidence>> {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (!(input.file instanceof File) || input.file.size === 0) return invalidInput("Choose a file to upload.");

  const bytes = await fileToBytes(input.file);
  const result = await toResult(addResearcherFileEvidence(parsed.data.reportId, { filename: input.file.name, contentType: input.file.type, bytes }));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const uploadOrganizationSchema = reportActionBase.extend({ visibility: visibilitySchema });

export async function uploadOrganizationFileEvidenceAction(input: {
  organizationId: string;
  programId: string;
  reportId: string;
  file: File;
  visibility: "researcher_visible" | "internal";
}): Promise<ActionResult<ReportEvidence>> {
  const parsed = uploadOrganizationSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (!(input.file instanceof File) || input.file.size === 0) return invalidInput("Choose a file to upload.");

  const bytes = await fileToBytes(input.file);
  const result = await toResult(addOrganizationFileEvidence(parsed.data.reportId, { filename: input.file.name, contentType: input.file.type, bytes }, parsed.data.visibility));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const downloadSchema = reportActionBase.extend({ evidenceId: uuidSchema });

export async function getEvidenceDownloadUrlAction(input: z.infer<typeof downloadSchema>): Promise<ActionResult<{ url: string }>> {
  const parsed = downloadSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(getEvidenceDownloadUrl(parsed.data.evidenceId));
  if (!result.ok) return result;
  if (!result.data) return { ok: false, code: "NOT_FOUND", message: "This evidence is not available." };
  return { ok: true, data: { url: result.data } };
}

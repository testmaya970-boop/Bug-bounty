"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getProgramAccessFileDownloadUrl, removeProgramAccessFile, uploadProgramAccessFile } from "@/services/program-access-file";
import type { ProgramAccessFile } from "@/services/program-access-file";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();
const programActionBase = z.object({ organizationId: uuidSchema, programId: uuidSchema });

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

function revalidateProgramPage(organizationId: string, programId: string) {
  revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
}

export async function uploadProgramAccessFileAction(input: { organizationId: string; programId: string; file: File }): Promise<ActionResult<ProgramAccessFile>> {
  const parsed = programActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  if (!(input.file instanceof File) || input.file.size === 0) return invalidInput("Choose a file to upload.");

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const result = await toResult(uploadProgramAccessFile(parsed.data.programId, { filename: input.file.name, contentType: input.file.type, bytes }));
  if (result.ok) revalidateProgramPage(parsed.data.organizationId, parsed.data.programId);
  return result;
}

export async function removeProgramAccessFileAction(input: { organizationId: string; programId: string }): Promise<ActionResult<null>> {
  const parsed = programActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(removeProgramAccessFile(parsed.data.programId).then(() => null));
  if (result.ok) revalidateProgramPage(parsed.data.organizationId, parsed.data.programId);
  return result;
}

export async function getProgramAccessFileDownloadUrlAction(input: { organizationId: string; programId: string }): Promise<ActionResult<{ url: string }>> {
  const parsed = programActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(getProgramAccessFileDownloadUrl(parsed.data.programId));
  if (!result.ok) return result;
  if (!result.data) return { ok: false, code: "NOT_FOUND", message: "This file is not available." };
  return { ok: true, data: { url: result.data } };
}

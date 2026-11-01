"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decideProgramAccessRequest, requestProgramAccess, setProgramJoinMode, suggestDuplicateReports, withdrawProgramAccessRequest, type DuplicateSuggestion } from "@/services/program-access";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getCurrentUser } from "@/lib/auth/current-user";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; message: string };
const uuid = z.string().uuid();

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  if (!(await getCurrentUser())) return { ok: false, message: "Your session has expired. Sign in again to continue." };
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
}

const programPath = (o: string, p: string) => `/organizations/${o}/programs/${p}`;

export async function requestProgramAccessAction(input: { organizationId: string; programId: string; note: string }) {
  const parsed = z.object({ organizationId: uuid, programId: uuid, note: z.string().trim().max(1000, "Use 1000 characters or fewer.") }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return run(() => requestProgramAccess(parsed.data.programId, parsed.data.note), [programPath(parsed.data.organizationId, parsed.data.programId)]);
}

export async function withdrawProgramAccessRequestAction(input: { organizationId: string; programId: string; requestId: string }) {
  const parsed = z.object({ organizationId: uuid, programId: uuid, requestId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "That request could not be found." };
  return run(() => withdrawProgramAccessRequest(parsed.data.requestId), [programPath(parsed.data.organizationId, parsed.data.programId)]);
}

export async function decideProgramAccessRequestAction(input: { organizationId: string; programId: string; requestId: string; approve: boolean; note: string }) {
  const parsed = z.object({ organizationId: uuid, programId: uuid, requestId: uuid, approve: z.boolean(), note: z.string().trim().max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Check the form and try again." };
  return run(() => decideProgramAccessRequest(parsed.data.requestId, parsed.data.approve, parsed.data.note), [programPath(parsed.data.organizationId, parsed.data.programId)]);
}

export async function setProgramJoinModeAction(input: { organizationId: string; programId: string; joinMode: "open" | "request" }) {
  const parsed = z.object({ organizationId: uuid, programId: uuid, joinMode: z.enum(["open", "request"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Check the form and try again." };
  return run(() => setProgramJoinMode(parsed.data.programId, parsed.data.joinMode), [programPath(parsed.data.organizationId, parsed.data.programId)]);
}

export async function suggestDuplicateReportsAction(input: { reportId: string }): Promise<Result<DuplicateSuggestion[]>> {
  const parsed = z.object({ reportId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That report could not be found." };
  return run(() => suggestDuplicateReports(parsed.data.reportId));
}

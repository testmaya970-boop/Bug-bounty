"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { addScopeEntry, removeScopeEntry, updateScopeEntry } from "@/services/scope";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

// Deliberately shallow -- length/presence only. Real validation and canonicalization is
// the database's job (private.canonicalize_scope_target), never duplicated here. See
// docs/decisions/0006-scope-asset-model.md.
const assetTypeSchema = z.enum(["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"]);
const scopeStateSchema = z.enum(["in_scope", "out_of_scope"]);
const uuidSchema = z.string().uuid();

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

const addSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  assetType: assetTypeSchema,
  targetInput: z.string().trim().min(1, "Enter a target.").max(2048, "Use 2048 characters or fewer."),
  scopeState: scopeStateSchema,
  description: z.string().trim().max(500, "Use 500 characters or fewer.").optional(),
});

export async function addScopeEntryAction(input: z.infer<typeof addSchema>) {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(addScopeEntry(parsed.data.programId, parsed.data.assetType, parsed.data.targetInput, parsed.data.scopeState, parsed.data.description));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  return result;
}

const updateSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  entryId: uuidSchema,
  scopeState: scopeStateSchema,
  description: z.string().trim().max(500, "Use 500 characters or fewer.").optional(),
});

export async function updateScopeEntryAction(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(updateScopeEntry(parsed.data.entryId, parsed.data.scopeState, parsed.data.description));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  return result;
}

const removeSchema = z.object({ organizationId: uuidSchema, programId: uuidSchema, entryId: uuidSchema });

export async function removeScopeEntryAction(input: z.infer<typeof removeSchema>) {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(removeScopeEntry(parsed.data.entryId));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  return result;
}

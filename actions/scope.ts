"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { addScopeEntry, listOrganizationAssets, removeScopeEntry, reviewScopeEntry, updateScopeEntry } from "@/services/scope";
import { linkReportToScopeEntry } from "@/services/reports";
import type { AssetInventoryItem } from "@/types/scope";
import type { Page } from "@/types/pagination";

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

function revalidateScopePaths(organizationId: string, programId: string) {
  revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
  revalidatePath(`/organizations/${organizationId}/assets`);
}

export async function addScopeEntryAction(input: z.infer<typeof addSchema>) {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(addScopeEntry(parsed.data.programId, parsed.data.assetType, parsed.data.targetInput, parsed.data.scopeState, parsed.data.description));
  if (result.ok) revalidateScopePaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const updateSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  entryId: uuidSchema,
  scopeState: scopeStateSchema,
  description: z.string().trim().max(500, "Use 500 characters or fewer.").optional(),
  // Both optional -- omitting both leaves the target untouched. See
  // db/migrations/202609090009_editable_scope_target.sql.
  assetType: assetTypeSchema.optional(),
  targetInput: z.string().trim().min(1, "Enter a target.").max(2048, "Use 2048 characters or fewer.").optional(),
});

export async function updateScopeEntryAction(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(updateScopeEntry(parsed.data.entryId, parsed.data.scopeState, parsed.data.description, parsed.data.assetType, parsed.data.targetInput));
  if (result.ok) revalidateScopePaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const removeSchema = z.object({ organizationId: uuidSchema, programId: uuidSchema, entryId: uuidSchema });

export async function removeScopeEntryAction(input: z.infer<typeof removeSchema>) {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(removeScopeEntry(parsed.data.entryId));
  if (result.ok) revalidateScopePaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const listOrganizationScopeEntriesSchema = z.object({
  organizationId: uuidSchema,
  cursor: z.string().optional(),
  programId: uuidSchema.optional(),
  assetType: assetTypeSchema.optional(),
});

/** The asset inventory page's "load more". */
export async function listOrganizationAssetsPageAction(input: {
  organizationId: string;
  cursor?: string;
  programId?: string;
  assetType?: z.infer<typeof assetTypeSchema>;
  includeRetired?: boolean;
}): Promise<ActionResult<Page<AssetInventoryItem>>> {
  const parsed = listOrganizationScopeEntriesSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  return toResult(listOrganizationAssets(parsed.data.organizationId, parsed.data.cursor, { programId: parsed.data.programId, assetType: parsed.data.assetType, includeRetired: input.includeRetired === true }));
}

const linkReportAssetSchema = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema, scopeEntryId: uuidSchema });

/** The inbox's link picker for an unlinked report -- see services/reports.ts's
 * linkReportToScopeEntry for the real authorization/validation (manager-only, entry must
 * belong to the same program, matches the exact "why this can be null" case
 * db/migrations/202608270001_report_foundation.sql's own comment documents). */
export async function linkReportToScopeEntryAction(input: z.infer<typeof linkReportAssetSchema>) {
  const parsed = linkReportAssetSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(linkReportToScopeEntry(parsed.data.reportId, parsed.data.scopeEntryId));
  if (result.ok) {
    revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}/inbox`);
    revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}/reports/${parsed.data.reportId}`);
  }
  return result;
}

const reviewSchema = z.object({ entryId: uuidSchema, decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500, "Use 500 characters or fewer.") });

/** Platform staff decide whether an organization owns a non-domain asset (review_scope_entry re-checks). */
export async function reviewScopeEntryAction(input: z.input<typeof reviewSchema>): Promise<ActionResult<null>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(reviewScopeEntry(parsed.data.entryId, parsed.data.decision, parsed.data.note).then(() => null));
  if (result.ok) revalidatePath("/platform/scope-review");
  return result;
}

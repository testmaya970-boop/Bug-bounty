"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import {
  closeProgram,
  createProgram,
  deleteDraftProgram,
  joinPublicProgram,
  listPublicPrograms,
  pauseProgram,
  resumeProgram,
  setProgramFocusAreas,
  setProgramKycRequirement,
  setProgramVisibility,
  submitProgramForReview,
  updateProgramAccessInstructions,
  updateProgramDescription,
} from "@/services/programs";
import type { EngagementType, ProgramSummary, ProgramType, PublicProgramSummary } from "@/types/program";
import type { Page } from "@/types/pagination";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

// engagementType, like programType, is accepted ONLY at creation -- there is no
// set/update action for either anywhere in this file, matching create_program's own
// immutable-after-creation design (db/migrations/202609070002_engagement_type.sql).
// A client cannot mutate an engagement's type post-creation because no server code path
// exists that would let it, not merely because no UI control is shown for it.
const createProgramSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter a program name.").max(160, "Use 160 characters or fewer."),
  idempotencyKey: z.string().uuid().optional(),
  programType: z.enum(["bounty", "vdp"]).optional(),
  engagementType: z.enum(["bug_bounty", "response", "pentest", "code_audit", "challenge", "campaign", "spot_check"]).optional(),
});

export async function createProgramAction(
  input: { organizationId: string; name: string; idempotencyKey?: string; programType?: ProgramType; engagementType?: EngagementType },
): Promise<ActionResult<Awaited<ReturnType<typeof createProgram>>>> {
  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    const program = await createProgram(parsed.data.organizationId, parsed.data.name, parsed.data.idempotencyKey, parsed.data.programType, parsed.data.engagementType);
    revalidatePath(`/organizations/${parsed.data.organizationId}/programs`);
    return { ok: true, data: program };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

// --- Lifecycle transitions (see docs/decisions/0021-program-lifecycle-transitions.md) --
// One action per RPC, no generic "set status" action -- matches actions/reports.ts's own
// triage actions. organizationId is accepted only to build the two paths that need
// revalidation; the RPC itself re-derives and re-authorizes the program's real
// organization server-side, so a client-supplied mismatch here has no security
// consequence -- it would only misdirect which paths get revalidated, not which program
// gets mutated.

const lifecycleActionSchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid() });

function revalidateProgramPaths(organizationId: string, programId: string) {
  revalidatePath(`/organizations/${organizationId}/programs`);
  revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
}

async function toLifecycleResult(promise: Promise<ProgramSummary>): Promise<ActionResult<ProgramSummary>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function submitProgramForReviewAction(input: { organizationId: string; programId: string }): Promise<ActionResult<ProgramSummary>> {
  const parsed = lifecycleActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(submitProgramForReview(parsed.data.programId));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

export async function pauseProgramAction(input: { organizationId: string; programId: string }): Promise<ActionResult<ProgramSummary>> {
  const parsed = lifecycleActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(pauseProgram(parsed.data.programId));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

export async function resumeProgramAction(input: { organizationId: string; programId: string }): Promise<ActionResult<ProgramSummary>> {
  const parsed = lifecycleActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(resumeProgram(parsed.data.programId));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

export async function closeProgramAction(input: { organizationId: string; programId: string }): Promise<ActionResult<ProgramSummary>> {
  const parsed = lifecycleActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(closeProgram(parsed.data.programId));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

/** Draft-only hard delete (see db/migrations/202609090008_delete_draft_program.sql) --
 * the one lifecycle action that removes a program's row rather than transitioning its
 * status, so it returns void instead of the usual ProgramSummary. Only the org-wide
 * Engagements list is revalidated on success -- the program's own detail page no longer
 * exists to revalidate. */
export async function deleteDraftProgramAction(input: { organizationId: string; programId: string }): Promise<ActionResult<void>> {
  const parsed = lifecycleActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  try {
    await deleteDraftProgram(parsed.data.programId);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  revalidatePath(`/organizations/${parsed.data.organizationId}/programs`);
  return { ok: true, data: undefined };
}

// --- Public program discovery (see docs/decisions/0041-public-program-discovery-vertical-slice.md) --

const setVisibilitySchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid(), visibility: z.enum(["private", "public"]) });

export async function setProgramVisibilityAction(input: { organizationId: string; programId: string; visibility: "private" | "public" }): Promise<ActionResult<ProgramSummary>> {
  const parsed = setVisibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(setProgramVisibility(parsed.data.programId, parsed.data.visibility));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const setKycRequirementSchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid(), requiresKyc: z.boolean() });

export async function setProgramKycRequirementAction(input: { organizationId: string; programId: string; requiresKyc: boolean }): Promise<ActionResult<ProgramSummary>> {
  const parsed = setKycRequirementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(setProgramKycRequirement(parsed.data.programId, parsed.data.requiresKyc));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const updateDescriptionSchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid(), description: z.string().max(5000, "Use 5000 characters or fewer.") });

export async function updateProgramDescriptionAction(input: { organizationId: string; programId: string; description: string }): Promise<ActionResult<ProgramSummary>> {
  const parsed = updateDescriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const result = await toLifecycleResult(updateProgramDescription(parsed.data.programId, parsed.data.description));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const updateAccessInstructionsSchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid(), accessInstructions: z.string().max(5000, "Use 5000 characters or fewer.") });

export async function updateProgramAccessInstructionsAction(input: { organizationId: string; programId: string; accessInstructions: string }): Promise<ActionResult<string | null>> {
  const parsed = updateAccessInstructionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  try {
    const data = await updateProgramAccessInstructions(parsed.data.programId, parsed.data.accessInstructions);
    revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const focusAreaEnum = z.enum(["web_applications", "mobile_applications", "apis", "networks", "databases", "cloud_infrastructure", "desktop_applications", "iot_hardware", "other"]);
const setFocusAreasSchema = z.object({ organizationId: z.string().uuid(), programId: z.string().uuid(), focusAreas: z.array(focusAreaEnum) });

/** See services/programs.ts's setProgramFocusAreas -- tags what list_recommended_programs
 * matches against a researcher's own declared interests. */
export async function setProgramFocusAreasAction(input: { organizationId: string; programId: string; focusAreas: string[] }): Promise<ActionResult<ProgramSummary>> {
  const parsed = setFocusAreasSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  const result = await toLifecycleResult(setProgramFocusAreas(parsed.data.programId, parsed.data.focusAreas));
  if (result.ok) revalidateProgramPaths(parsed.data.organizationId, parsed.data.programId);
  return result;
}

const joinPublicProgramSchema = z.object({ programId: z.string().uuid() });

/** The one anonymous-facing-flow mutation this slice adds -- see services/programs.ts's
 * joinPublicProgram. Only ever creates the membership row submit_report already checks
 * for; never a new submission path. */
const listPublicProgramsPageSchema = z.object({
  search: z.string().max(160).optional(),
  status: z.enum(["active", "paused"]).optional(),
  focusArea: focusAreaEnum.optional(),
  cursor: z.string().optional(),
});

/** Backs the anonymous public program registry's "Load more" -- reachable by anonymous
 * visitors too (a Server Action is callable without a session; the underlying RPC is
 * itself anon-granted, see docs/decisions/0042). The first page renders server-side from
 * the page component directly; this is only ever invoked for subsequent pages. */
export async function listPublicProgramsPageAction(input: { search?: string; status?: "active" | "paused"; focusArea?: string; cursor?: string }): Promise<ActionResult<Page<PublicProgramSummary>>> {
  const parsed = listPublicProgramsPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check your search and try again." };
  try {
    const page = await listPublicPrograms({ search: parsed.data.search, status: parsed.data.status, focusArea: parsed.data.focusArea }, parsed.data.cursor);
    return { ok: true, data: page };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function joinPublicProgramAction(input: { programId: string }): Promise<ActionResult<null>> {
  const parsed = joinPublicProgramSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  try {
    await joinPublicProgram(parsed.data.programId);
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

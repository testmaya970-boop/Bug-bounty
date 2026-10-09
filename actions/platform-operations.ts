"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import {
  approveProgramLaunch,
  deleteResearcherPlatformWide,
  findOrganizationIdBySlug,
  findUserIdByUsername,
  isPlatformAdmin,
  rejectProgramLaunch,
  reinstateOrganization,
  reinstateProgram,
  reinstateResearcherPlatformWide,
  reactivateAccountPlatformWide,
  searchAccountsForAdmin,
  searchOrganizationsForAdmin,
  type AdminAccountMatch,
  type AdminOrganizationMatch,
  replayDeadLetteredOutboxEvent,
  suspendOrganization,
  suspendProgram,
  suspendResearcherPlatformWide,
} from "@/services/platform-operations";
import { resolveEscalatedMediation, resolveEscalatedRetest } from "@/services/reports";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRequestLogging } from "@/lib/request-context";

const replaySchema = z.object({
  eventId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/** Authorization is enforced by the database (replay_dead_lettered_outbox_event's own
 * private.is_platform_admin() check) -- this action does not duplicate that check, only
 * requires a session so an anonymous request fails fast with a clear message instead of
 * a raw RPC error. */
export async function replayDeadLetteredOutboxEventAction(input: { eventId: string; reason?: string }) {
  const parsed = replaySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    await withRequestLogging("platform.outbox_event.replay", { actorId: user.id }, () => replayDeadLetteredOutboxEvent(parsed.data.eventId, parsed.data.reason));
    revalidatePath("/platform/needs-recovery");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const resolveEscalatedMediationSchema = z.object({
  mediationId: z.string().uuid(),
  outcome: z.enum(["resolved", "declined"]),
  resolutionNotes: z.string().trim().min(1, "Explain the resolution.").max(3000, "Use 3000 characters or fewer."),
});

/** Authorization is enforced by the database (resolve_escalated_report_mediation's own
 * private.is_platform_admin() check) -- same pattern as replayDeadLetteredOutboxEventAction
 * above: this action only requires a session, never duplicates the real authority check. */
export async function resolveEscalatedMediationAction(input: { mediationId: string; outcome: "resolved" | "declined"; resolutionNotes: string }) {
  const parsed = resolveEscalatedMediationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    await withRequestLogging("platform.mediation.resolve", { actorId: user.id }, () => resolveEscalatedMediation(parsed.data.mediationId, parsed.data.outcome, parsed.data.resolutionNotes));
    revalidatePath("/platform/mediations");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const resolveEscalatedRetestSchema = z.object({
  retestId: z.string().uuid(),
  outcome: z.enum(["confirmed_fixed", "still_vulnerable"]),
  decisionNotes: z.string().trim().min(1, "Explain the decision.").max(2000, "Use 2000 characters or fewer."),
});

/** Authorization is enforced by the database (resolve_escalated_report_retest's own
 * private.is_platform_admin() check) -- same pattern as resolveEscalatedMediationAction
 * above: this action only requires a session, never duplicates the real authority check. */
export async function resolveEscalatedRetestAction(input: { retestId: string; outcome: "confirmed_fixed" | "still_vulnerable"; decisionNotes: string }) {
  const parsed = resolveEscalatedRetestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    await withRequestLogging("platform.retest.resolve", { actorId: user.id }, () => resolveEscalatedRetest(parsed.data.retestId, parsed.data.outcome, parsed.data.decisionNotes));
    revalidatePath("/platform/retests");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

// --- Program-launch review gate (see db/migrations/202609050013_program_launch_review_gate.sql) ---

const approveProgramLaunchSchema = z.object({ programId: z.string().uuid() });

/** Authorization is enforced by the database (activate_program's own private.is_platform_admin()
 * check) -- this action only requires a session, same pattern as every other action in this
 * file. */
export async function approveProgramLaunchAction(input: { programId: string }) {
  const parsed = approveProgramLaunchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    const program = await withRequestLogging("platform.program_launch.approve", { actorId: user.id }, () => approveProgramLaunch(parsed.data.programId));
    revalidatePath("/platform/programs");
    // The org's own program page was confirmed live to keep showing "In review" after a
    // real, successful approval (the RPC genuinely writes status='active') -- this path
    // was simply never revalidated, only /platform/programs was. Same fix on reject below.
    revalidatePath(`/organizations/${program.organizationId}/programs/${parsed.data.programId}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const rejectProgramLaunchSchema = z.object({
  programId: z.string().uuid(),
  reason: z.string().trim().min(1, "Explain why this program launch was rejected.").max(2000, "Use 2000 characters or fewer."),
});

/** Authorization is enforced by the database (reject_program_launch's own
 * private.is_platform_admin() check) -- same pattern as approveProgramLaunchAction above. */
export async function rejectProgramLaunchAction(input: { programId: string; reason: string }) {
  const parsed = rejectProgramLaunchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    const { organizationId } = await withRequestLogging("platform.program_launch.reject", { actorId: user.id }, () => rejectProgramLaunch(parsed.data.programId, parsed.data.reason));
    revalidatePath("/platform/programs");
    revalidatePath(`/organizations/${organizationId}/programs/${parsed.data.programId}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

// --- Cross-program researcher suspension (see db/migrations/202609050014_researcher_platform_suspension.sql) ---

// Matches create_user's own username charset exactly (db/migrations/
// 202608260001_organization_membership_lifecycle.sql: requested path `^[a-z0-9_]{3,32}$`,
// and its auto-derived fallback format also inserts underscores) -- the previous
// hyphens-only regex rejected every username this system can actually produce, so no real
// account could ever be suspended or deleted through these forms. Found live via Playwright
// verification of the delete form below.
// Matches users.username's own check (^[a-zA-Z0-9_]{3,32}$) -- this used to be
// lowercase-only, so an account with a capital in its username could never be suspended or
// deleted from the admin forms.
const USERNAME_REGEX = /^[a-zA-Z0-9_]{1,32}$/;

const suspendResearcherSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .max(32, "Use 32 characters or fewer.")
    .regex(USERNAME_REGEX, "Use letters, numbers, and underscores only."),
  reason: z.string().trim().min(1, "Explain why this account is being suspended.").max(2000, "Use 2000 characters or fewer."),
});

/**
 * This action, unlike every other one in this file, does duplicate a form of the
 * authorization check (an explicit isPlatformAdmin() call) before resolving the username --
 * because that resolution itself (findUserIdByUsername) uses the service-role client to
 * bypass RLS (see that function's own comment for why no RLS-scoped path exists for this
 * lookup), so this action must independently confirm real platform-admin authority before
 * ever calling it, rather than relying solely on suspend_researcher_platform_wide's own
 * database-side check the way every sibling action here otherwise does.
 */
export async function suspendResearcherAction(input: { username: string; reason: string }) {
  const parsed = suspendResearcherSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const [user, admin] = await Promise.all([getCurrentUser(), isPlatformAdmin()]);
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };
  if (!admin) return { ok: false as const, code: "FORBIDDEN", message: "Platform admin authority required." };

  try {
    return await withRequestLogging("platform.researcher.suspend", { actorId: user.id }, async () => {
      const target = await findUserIdByUsername(parsed.data.username);
      if (!target) return { ok: false as const, code: "USER_NOT_FOUND", message: "No account with that username was found." };
      await suspendResearcherPlatformWide(target.id, parsed.data.reason);
      revalidatePath("/platform/researchers");
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const reinstateResearcherSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1, "Explain why this account is being reinstated.").max(2000, "Use 2000 characters or fewer."),
});

/** Authorization is enforced by the database (reinstate_researcher_platform_wide's own
 * private.is_platform_admin() check) -- unlike suspendResearcherAction above, this action
 * takes a real user id directly (the row is already listed, from
 * list_suspended_researchers_for_admin, so no username lookup is needed), so it needs no
 * extra admin check of its own. */
export async function reinstateResearcherAction(input: { userId: string; reason: string }) {
  const parsed = reinstateResearcherSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    await withRequestLogging("platform.researcher.reinstate", { actorId: user.id }, () => reinstateResearcherPlatformWide(parsed.data.userId, parsed.data.reason));
    revalidatePath("/platform/researchers");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const deleteResearcherSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .max(32, "Use 32 characters or fewer.")
    .regex(USERNAME_REGEX, "Use letters, numbers, and underscores only."),
  reason: z.string().trim().min(1, "Explain why this account is being deleted.").max(2000, "Use 2000 characters or fewer."),
});

/** Same shape as suspendResearcherAction above: findUserIdByUsername uses the service-role
 * client, so this action independently confirms isPlatformAdmin() before ever calling it. */
export async function deleteResearcherAction(input: { username: string; reason: string }) {
  const parsed = deleteResearcherSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const [user, admin] = await Promise.all([getCurrentUser(), isPlatformAdmin()]);
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };
  if (!admin) return { ok: false as const, code: "FORBIDDEN", message: "Platform admin authority required." };

  try {
    return await withRequestLogging("platform.researcher.delete", { actorId: user.id }, async () => {
      const target = await findUserIdByUsername(parsed.data.username);
      if (!target) return { ok: false as const, code: "USER_NOT_FOUND", message: "No account with that username was found." };
      await deleteResearcherPlatformWide(target.id, parsed.data.reason);
      revalidatePath("/platform/researchers");
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const searchSchema = z.object({ query: z.string().trim().max(100), onlyDeactivated: z.boolean().optional() });

/** Feeds the admin forms' search dropdown. Authorization lives in the database
 * (search_accounts_for_admin checks private.is_platform_admin()). */
export async function searchAccountsAction(input: { query: string; onlyDeactivated?: boolean }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "Check the search and try again." };
  try {
    return { ok: true as const, data: (await searchAccountsForAdmin(parsed.data.query, parsed.data.onlyDeactivated ?? false)) as AdminAccountMatch[] };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

/** Feeds the organization suspend form's search dropdown; authorization lives in the
 * database (search_organizations_for_admin checks private.is_platform_admin()). */
export async function searchOrganizationsAction(input: { query: string }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "Check the search and try again." };
  try {
    return { ok: true as const, data: (await searchOrganizationsForAdmin(parsed.data.query)) as AdminOrganizationMatch[] };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const reactivateAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the account's email address."),
  reason: z.string().trim().min(1, "Explain why this account is being reactivated.").max(2000, "Use 2000 characters or fewer."),
});

/** Authorization and the email lookup both happen inside the database
 * (reactivate_account_platform_wide checks private.is_platform_admin() itself), so -- like
 * reinstateResearcherAction -- no service-role lookup or extra admin check is needed here. */
export async function reactivateAccountAction(input: { email: string; reason: string }) {
  const parsed = reactivateAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    await withRequestLogging("platform.account.reactivate", { actorId: user.id }, () => reactivateAccountPlatformWide(parsed.data.email, parsed.data.reason));
    revalidatePath("/platform/researchers");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

// --- Org-status control (see db/migrations/202609050016_organization_status_control.sql
// and 202609050017_organization_operability_gate.sql) ---

const suspendOrganizationSchema = z.object({
  slug: z.string().trim().min(1, "Enter an organization slug.").max(100, "Use 100 characters or fewer."),
  reason: z.string().trim().min(1, "Explain why this organization is being suspended.").max(2000, "Use 2000 characters or fewer."),
});

/** Same shape as suspendResearcherAction above: findOrganizationIdBySlug uses the
 * service-role client, so this action independently confirms isPlatformAdmin() before ever
 * calling it, rather than relying solely on suspend_organization's own database-side check. */
export async function suspendOrganizationAction(input: { slug: string; reason: string }) {
  const parsed = suspendOrganizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const [user, admin] = await Promise.all([getCurrentUser(), isPlatformAdmin()]);
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };
  if (!admin) return { ok: false as const, code: "FORBIDDEN", message: "Platform admin authority required." };

  try {
    return await withRequestLogging("platform.organization.suspend", { actorId: user.id }, async () => {
      const target = await findOrganizationIdBySlug(parsed.data.slug);
      if (!target) return { ok: false as const, code: "ORGANIZATION_NOT_FOUND", message: "No organization with that slug was found." };
      await suspendOrganization(target.id, parsed.data.reason);
      revalidatePath("/platform/organizations");
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const reinstateOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  reason: z.string().trim().min(1, "Explain why this organization is being reinstated.").max(2000, "Use 2000 characters or fewer."),
});

/** Authorization is enforced by the database (reinstate_organization's own
 * private.is_platform_admin() check) -- takes a real organization id directly (the row is
 * already listed, from list_suspended_organizations_for_admin), so it needs no extra admin
 * check of its own, same as reinstateResearcherAction above. */
export async function reinstateOrganizationAction(input: { organizationId: string; reason: string }) {
  const parsed = reinstateOrganizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    await withRequestLogging("platform.organization.reinstate", { actorId: user.id }, () => reinstateOrganization(parsed.data.organizationId, parsed.data.reason));
    revalidatePath("/platform/organizations");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

const programSuspensionSchema = z.object({
  programId: z.string().uuid(),
  reason: z.string().trim().min(1, "Explain the reason.").max(2000, "Use 2000 characters or fewer."),
});

/** Authorization is enforced by the database (suspend_program / reinstate_program's own
 * private.is_platform_admin() check) -- the program id comes from the already-listed
 * directory row, so no lookup step is needed (unlike suspend-by-slug above). */
export async function suspendProgramAction(input: { programId: string; reason: string }) {
  return runProgramSuspensionChange("platform.program.suspend", input, suspendProgram);
}

export async function reinstateProgramAction(input: { programId: string; reason: string }) {
  return runProgramSuspensionChange("platform.program.reinstate", input, reinstateProgram);
}

async function runProgramSuspensionChange(
  logName: string,
  input: { programId: string; reason: string },
  change: (programId: string, reason: string) => Promise<{ organizationId: string }>,
) {
  const parsed = programSuspensionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the request and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  try {
    const { organizationId } = await withRequestLogging(logName, { actorId: user.id }, () => change(parsed.data.programId, parsed.data.reason));
    revalidatePath("/platform/all-programs");
    revalidatePath(`/organizations/${organizationId}/programs/${parsed.data.programId}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

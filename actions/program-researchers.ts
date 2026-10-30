"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  OrganizationServiceError,
  acceptProgramInvitation as acceptProgramInvitationService,
  acceptProgramInvitationById as acceptProgramInvitationByIdService,
  cancelProgramInvitation as cancelProgramInvitationService,
  inviteResearcherByUsername as inviteResearcherByUsernameService,
  reinstateResearcher as reinstateResearcherService,
  revokeResearcher as revokeResearcherService,
  suspendResearcher as suspendResearcherService,
} from "@/services/program-researchers";
import { invitationUrl, sendInvitationEmail } from "@/lib/invitation-email";
import { getProgram } from "@/services/programs";
import { listCurrentUserOrganizations } from "@/services/organizations";
import { getCurrentUser } from "@/lib/auth/current-user";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const uuidSchema = z.string().uuid();

function invalidInput(message = "This request could not be understood."): ActionResult<never> {
  return { ok: false, code: "INVALID_INPUT", message };
}

// Researchers are invited by @username only (2026-10-30): the invite-by-email action was
// removed, since an organization never sees a researcher's email.

// The invitation row is written by the database; the email is sent here, directly (an
// invitation has no report, so it doesn't fit the outbox's report-shaped notifications). The
// send result is returned with the link: a bounced email used to be reported as sent
// (invitation audit, 21 Oct).
async function sendProgramInvitation(p: { organizationId: string; programId: string; message?: string; to: string; token: string; invitationId: string }): Promise<{ inviteUrl: string; emailSent: boolean }> {
  revalidatePath(`/organizations/${p.organizationId}/programs/${p.programId}`);
  const user = await getCurrentUser();
  const [program, organizations] = await Promise.all([getProgram(p.programId), user ? listCurrentUserOrganizations(user.id) : Promise.resolve([])]);
  const programName = program?.name ?? "a program";
  const org = organizations.find((o) => o.id === p.organizationId)?.name ?? "An organization";
  const inviteUrl = invitationUrl(`/program-invitations/${p.token}`);
  const emailSent = await sendInvitationEmail({
    to: p.to,
    subject: `${org} invited you to research ${programName} on Unpatched`,
    text: [
      `${org} invited you to submit security research to its private program "${programName}" on Unpatched.`,
      p.message ? `\nMessage from ${org}: ${p.message}` : "",
      `\nAccept the invitation: ${inviteUrl}`,
      "\nThis link expires in 7 days. If you don't have an Unpatched account yet, the link lets you create a researcher account with this email address, then accept.",
    ].join("\n"),
    idempotencyKey: p.invitationId,
  });
  return { inviteUrl, emailSent };
}

const usernameInviteSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  username: z.string().trim().regex(/^@?[A-Za-z0-9_.-]{2,40}$/, "Enter a researcher's username, like @jordan-ellis."),
  message: z.string().trim().max(500).optional(),
});

/** Invite by @username (202610230006). The researcher's email is looked up and used here, on the
 * server, to send the invitation; it is never returned to the organization. */
export async function inviteResearcherByUsernameToProgram(input: z.infer<typeof usernameInviteSchema>): Promise<ActionResult<{ inviteUrl: string; emailSent: boolean }>> {
  const parsed = usernameInviteSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(inviteResearcherByUsernameService(parsed.data));
  if (!result.ok) return result;
  return { ok: true, data: await sendProgramInvitation({ ...parsed.data, to: result.data.recipientEmail, token: result.data.token, invitationId: result.data.invitation.id }) };
}

// organizationId/programId are optional -- present when a manager cancels from the
// Program Control Center (used only to revalidate that page), absent when a researcher
// declines their own invitation from /programs, where they have no organization-page
// access to revalidate in the first place.
const cancelInvitationSchema = z.object({ organizationId: uuidSchema.optional(), programId: uuidSchema.optional(), invitationId: uuidSchema });

// Also the invitee's own decline path (services/program-researchers.ts's
// cancelProgramInvitation allows either a program manager or the invitee themselves,
// gated by the same email-match check acceptance uses).
export async function cancelProgramInvitationAction(input: z.infer<typeof cancelInvitationSchema>) {
  const parsed = cancelInvitationSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(cancelProgramInvitationService(parsed.data.invitationId));
  if (result.ok) {
    if (parsed.data.organizationId && parsed.data.programId) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
    revalidatePath("/programs");
  }
  return result;
}

export async function acceptProgramInvitationAction(token: string) {
  const parsed = z.string().min(20).safeParse(token);
  if (!parsed.success) return invalidInput("This invitation link is not valid.");
  const result = await toResult(acceptProgramInvitationService(parsed.data));
  if (result.ok) {
    revalidatePath(`/organizations/${result.data.organizationId}/programs/${result.data.programId}`);
    revalidatePath("/programs");
  }
  return result;
}

/** Accepts an invitation surfaced in the signed-in researcher's own pending-invitations list (no raw token needed). */
export async function acceptProgramInvitationByIdAction(invitationId: string) {
  const parsed = uuidSchema.safeParse(invitationId);
  if (!parsed.success) return invalidInput();
  const result = await toResult(acceptProgramInvitationByIdService(parsed.data));
  if (result.ok) {
    revalidatePath(`/organizations/${result.data.organizationId}/programs/${result.data.programId}`);
    revalidatePath("/programs");
  }
  return result;
}

const targetResearcherSchema = z.object({ organizationId: uuidSchema, programId: uuidSchema, targetUserId: uuidSchema });

export async function suspendResearcherAction(input: z.infer<typeof targetResearcherSchema>) {
  const parsed = targetResearcherSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(suspendResearcherService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  return result;
}

export async function reinstateResearcherAction(input: z.infer<typeof targetResearcherSchema>) {
  const parsed = targetResearcherSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(reinstateResearcherService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  return result;
}

export async function revokeResearcherAction(input: z.infer<typeof targetResearcherSchema>) {
  const parsed = targetResearcherSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(revokeResearcherService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
  return result;
}

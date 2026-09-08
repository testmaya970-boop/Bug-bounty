"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  OrganizationServiceError,
  acceptProgramInvitation as acceptProgramInvitationService,
  acceptProgramInvitationById as acceptProgramInvitationByIdService,
  cancelProgramInvitation as cancelProgramInvitationService,
  inviteResearcher as inviteResearcherService,
  reinstateResearcher as reinstateResearcherService,
  revokeResearcher as revokeResearcherService,
  suspendResearcher as suspendResearcherService,
} from "@/services/program-researchers";
import { activeEmailProvider } from "@/lib/email-provider";

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

const inviteSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  email: z.string().trim().toLowerCase().email(),
  message: z.string().trim().max(500).optional(),
});

export async function inviteResearcherToProgram(input: z.infer<typeof inviteSchema>) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(inviteResearcherService(parsed.data));
  if (result.ok) {
    revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
    // invite_researcher_to_program only writes a program_invitations row -- it never sends
    // anything to the invitee. A researcher who already has an Unpatched account with this
    // email will pick it up via list_my_pending_program_invitations on /programs, but a
    // net-new email has no other way to discover the invitation exists. This is a real,
    // direct email send (not routed through the outbox/notifications tables -- those are
    // shaped around a real reports row, which does not exist yet for an invitation, and
    // widening that schema is a larger change than this fix warrants). Best-effort: a
    // failed send never fails the invitation itself, which already succeeded and is real
    // regardless of whether this email arrives.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const acceptUrl = `${appUrl}/program-invitations/${result.data.token}`;
    try {
      await activeEmailProvider.send({
        to: parsed.data.email,
        subject: "You've been invited to research a program on Unpatched",
        text: `You've been invited to submit security research to a program on Unpatched.${parsed.data.message ? `\n\nMessage from the organization: ${parsed.data.message}` : ""}\n\nAccept the invitation: ${acceptUrl}\n\nThis link expires in 7 days. If you don't already have an Unpatched account, you can create one with this email address before or after accepting.`,
        idempotencyKey: result.data.invitation.id,
      });
    } catch {
      // Best-effort delivery -- the invitation row itself is already real and committed;
      // never surface an email-send failure as if the invitation failed.
    }
  }
  return result;
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

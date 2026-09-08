"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  OrganizationServiceError,
  acceptInvitation as acceptInvitationService,
  acceptInvitationById as acceptInvitationByIdService,
  cancelInvitation as cancelInvitationService,
  changeMemberRole as changeMemberRoleService,
  inviteMember as inviteMemberService,
  reactivateMember as reactivateMemberService,
  removeMember as removeMemberService,
  suspendMember as suspendMemberService,
} from "@/services/organization-members";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const roleSchema = z.enum(["owner", "security_admin", "program_manager", "triager", "billing_admin"]);
const uuidSchema = z.string().uuid();

function invalidInput(message = "This request could not be understood."): ActionResult<never> {
  return { ok: false, code: "INVALID_INPUT", message };
}

const inviteSchema = z.object({
  organizationId: uuidSchema,
  email: z.string().trim().toLowerCase().email(),
  role: roleSchema,
  message: z.string().trim().max(500).optional(),
});

export async function inviteOrganizationMember(input: z.infer<typeof inviteSchema>) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(inviteMemberService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
  return result;
}

const resendSchema = inviteSchema.extend({ invitationId: uuidSchema });

export async function resendOrganizationInvitation(input: z.infer<typeof resendSchema>) {
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  // A "resend" is a revoke of the stale link plus a fresh invitation, not a new server
  // capability: both steps re-run the same authorization check independently.
  const cancelResult = await toResult(cancelInvitationService(parsed.data.invitationId));
  if (!cancelResult.ok) return cancelResult;
  const inviteResult = await toResult(inviteMemberService(parsed.data));
  if (inviteResult.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
  return inviteResult;
}

const cancelInvitationSchema = z.object({ organizationId: uuidSchema, invitationId: uuidSchema });

// Also the invitee's own decline path (services/organization-members.ts's
// cancelInvitation allows either an org admin or the invitee themselves, gated by the
// same email-match check as acceptance) -- revalidate both surfaces since either kind of
// caller could be looking at either page.
export async function cancelOrganizationInvitation(input: z.infer<typeof cancelInvitationSchema>) {
  const parsed = cancelInvitationSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(cancelInvitationService(parsed.data.invitationId));
  if (result.ok) {
    revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
    revalidatePath("/organizations");
  }
  return result;
}

export async function acceptOrganizationInvitation(token: string) {
  const parsed = z.string().min(20).safeParse(token);
  if (!parsed.success) return invalidInput("This invitation link is not valid.");
  const result = await toResult(acceptInvitationService(parsed.data));
  if (result.ok) {
    revalidatePath(`/organizations/${result.data.organizationId}/members`);
    revalidatePath("/organizations");
  }
  return result;
}

/** Accepts an invitation surfaced in the signed-in user's own pending-invitations list (no raw token needed). */
export async function acceptOrganizationInvitationById(invitationId: string) {
  const parsed = uuidSchema.safeParse(invitationId);
  if (!parsed.success) return invalidInput();
  const result = await toResult(acceptInvitationByIdService(parsed.data));
  if (result.ok) {
    revalidatePath(`/organizations/${result.data.organizationId}/members`);
    revalidatePath("/organizations");
  }
  return result;
}

const targetMemberSchema = z.object({ organizationId: uuidSchema, targetUserId: uuidSchema });

export async function suspendOrganizationMember(input: z.infer<typeof targetMemberSchema>) {
  const parsed = targetMemberSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(suspendMemberService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
  return result;
}

export async function reactivateOrganizationMember(input: z.infer<typeof targetMemberSchema>) {
  const parsed = targetMemberSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(reactivateMemberService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
  return result;
}

export async function removeOrganizationMember(input: z.infer<typeof targetMemberSchema>) {
  const parsed = targetMemberSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(removeMemberService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
  return result;
}

const changeRoleSchema = z.object({ organizationId: uuidSchema, targetUserId: uuidSchema, newRole: roleSchema });

export async function changeOrganizationMemberRole(input: z.infer<typeof changeRoleSchema>) {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(changeMemberRoleService(parsed.data));
  if (result.ok) revalidatePath(`/organizations/${parsed.data.organizationId}/members`);
  return result;
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { z } from "zod";
import {
  OrganizationServiceError,
  beginMfaEnrollment,
  beginTotpEnrollment,
  clearMyBackupCodes,
  confirmMfaEnrollment,
  generateMyBackupCodes,
  redeemBackupCode,
  requestMfaVerificationCode,
  revokeAllOtherSessions,
  revokeMySession,
  unenrollMfaFactor,
  verifyMfaCode,
  type MfaEnrollment,
  type TotpEnrollment,
} from "@/services/mfa";
import { AuthServiceError, requireCurrentPassword } from "@/services/account";
import { isSafeRedirect } from "@/lib/auth/safe-redirect";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function beginMfaEnrollmentAction(): Promise<ActionResult<MfaEnrollment>> {
  try {
    const data = await beginMfaEnrollment();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function beginTotpEnrollmentAction(): Promise<ActionResult<TotpEnrollment>> {
  try {
    const data = await beginTotpEnrollment();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const confirmSchema = z.object({ factorId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });

export async function confirmMfaEnrollmentAction(input: z.infer<typeof confirmSchema>): Promise<ActionResult<void>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  try {
    await confirmMfaEnrollment(parsed.data.factorId, parsed.data.code);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function generateBackupCodesAction(): Promise<ActionResult<string[]>> {
  try {
    const codes = await generateMyBackupCodes();
    revalidatePath("/settings");
    return { ok: true, data: codes };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

// Removing two-factor takes the account password as well as the MFA'd session: a stolen
// session alone must not be able to strip the second factor (and it was a one-click action).
const unenrollSchema = z.object({ factorId: z.string().uuid(), currentPassword: z.string().min(1, "Enter your current password.") });

export async function unenrollMfaFactorAction(input: z.infer<typeof unenrollSchema>): Promise<ActionResult<void>> {
  const parsed = unenrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  try {
    await requireCurrentPassword(parsed.data.currentPassword);
    await unenrollMfaFactor();
    await clearMyBackupCodes();
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError || error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function requestMfaVerificationCodeAction(): Promise<ActionResult<void>> {
  try {
    await requestMfaVerificationCode();
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const verifyGateSchema = z.object({ factorId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."), redirectTo: z.string().optional() });

/** The sign-in-time gate action -- on success, redirects to the destination the user was
 * originally headed to (or a safe default), the same pattern signInAction already uses. */
export async function verifyMfaGateAction(input: z.infer<typeof verifyGateSchema>): Promise<ActionResult<void>> {
  const parsed = verifyGateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  try {
    await verifyMfaCode(parsed.data.factorId, parsed.data.code);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  redirect((isSafeRedirect(parsed.data.redirectTo) ? parsed.data.redirectTo : "/") as Route);
}

const redeemSchema = z.object({ code: z.string().trim().min(1, "Enter a backup code."), redirectTo: z.string().optional() });

export async function redeemBackupCodeGateAction(input: z.infer<typeof redeemSchema>): Promise<ActionResult<void>> {
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter a backup code." };
  try {
    await redeemBackupCode(parsed.data.code);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  redirect((isSafeRedirect(parsed.data.redirectTo) ? parsed.data.redirectTo : "/") as Route);
}

const sessionIdSchema = z.object({ sessionId: z.string().uuid() });

export async function revokeMySessionAction(input: z.infer<typeof sessionIdSchema>): Promise<ActionResult<void>> {
  const parsed = sessionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  try {
    await revokeMySession(parsed.data.sessionId);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function revokeAllOtherSessionsAction(): Promise<ActionResult<number>> {
  try {
    const count = await revokeAllOtherSessions();
    revalidatePath("/settings");
    return { ok: true, data: count };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

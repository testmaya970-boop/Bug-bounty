"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { z } from "zod";
import {
  OrganizationServiceError,
  beginMfaEnrollment,
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
} from "@/services/mfa";
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

const confirmSchema = z.object({ factorId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code we emailed you.") });

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

const factorIdSchema = z.object({ factorId: z.string().uuid() });

export async function unenrollMfaFactorAction(input: z.infer<typeof factorIdSchema>): Promise<ActionResult<void>> {
  const parsed = factorIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };
  try {
    await unenrollMfaFactor();
    await clearMyBackupCodes();
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
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

const verifyGateSchema = z.object({ factorId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code we emailed you."), redirectTo: z.string().optional() });

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

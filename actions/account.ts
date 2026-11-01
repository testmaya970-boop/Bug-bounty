"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { passwordProblem } from "@/lib/auth/password-policy";
import { isBusinessEmail } from "@/lib/auth/business-email";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthServiceError, changeMyEmail, changeMyPassword, deactivateMyAccount } from "@/services/account";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const currentPassword = z.string().min(1, "Enter your current password.");
const passwordSchema = z.object({ currentPassword, password: z.string().superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }) });

export async function changeMyPasswordAction(input: z.infer<typeof passwordSchema>): Promise<ActionResult<void>> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await changeMyPassword(parsed.data.currentPassword, parsed.data.password);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const emailSchema = z.object({ currentPassword, email: z.string().trim().toLowerCase().email("Enter a valid email address.") });

/** Changes the address immediately after re-checking the current password -- see
 * services/account.ts's changeMyEmail comment for the deferred double-confirmation. */
export async function changeMyEmailAction(input: z.infer<typeof emailSchema>): Promise<ActionResult<void>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  // An organization account signed up with a work email; it can't switch to a personal or
  // temporary one afterwards.
  if ((await getCurrentUser())?.accountType === "organization" && !isBusinessEmail(parsed.data.email)) {
    return { ok: false, code: "PERSONAL_EMAIL", message: "Organization accounts need a work email address, not a personal or temporary one." };
  }

  try {
    await changeMyEmail(parsed.data.currentPassword, parsed.data.email);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Real and immediate -- see services/account.ts. There is no confirmation step here
 * beyond whatever the calling UI itself requires before submitting. */
export async function deactivateMyAccountAction(): Promise<ActionResult<void>> {
  try {
    await deactivateMyAccount();
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  redirect("/account-deactivated" as Route);
}

"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { AuthServiceError, changeMyEmail, changeMyPassword, deactivateMyAccount } from "@/services/account";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const passwordSchema = z.object({ password: z.string().min(12, "Use at least 12 characters -- longer is the single strongest thing a password can be.") });

export async function changeMyPasswordAction(input: z.infer<typeof passwordSchema>): Promise<ActionResult<void>> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await changeMyPassword(parsed.data.password);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") });

/** Starts Supabase's own real double-confirmation flow -- see services/account.ts's own
 * comment. The address does not change until both the old and new email confirm it. */
export async function changeMyEmailAction(input: z.infer<typeof emailSchema>): Promise<ActionResult<void>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  try {
    await changeMyEmail(parsed.data.email);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof AuthServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Real and immediate -- see services/account.ts. There is no confirmation step here
 * beyond whatever the calling UI itself requires before submitting. */
export async function deactivateMyAccountAction(): Promise<void> {
  await deactivateMyAccount();
  redirect("/account-deactivated" as Route);
}

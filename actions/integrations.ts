"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { checkPhoneCode, completeSandboxIdentityVerification, completeSandboxPayout, startIdentityVerification, startPhoneVerification } from "@/services/integrations";
import { isPlatformAdmin } from "@/services/platform-operations";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const invalid = { ok: false as const, code: "INVALID_INPUT", message: "Check the form and try again." };

/** Returns the provider's hosted URL; the browser navigates there. */
export async function startIdentityVerificationAction(input: { region: string }): Promise<ActionResult<{ url: string }>> {
  const parsed = z.object({ region: z.enum(["IN", "GLOBAL"]) }).safeParse(input);
  if (!parsed.success) return invalid;
  return toResult(startIdentityVerification(parsed.data.region).then((url) => ({ url })));
}

export async function completeSandboxIdentityAction(input: { reference: string; outcome: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ reference: z.string().min(1).max(200), outcome: z.enum(["approved", "declined"]) }).safeParse(input);
  if (!parsed.success) return invalid;
  const result = await toResult(completeSandboxIdentityVerification(parsed.data.reference, parsed.data.outcome).then(() => null));
  if (result.ok) revalidatePath("/settings/identity");
  return result;
}

export async function startPhoneVerificationAction(input: { countryCode: string; number: string }): Promise<ActionResult<{ sandboxCode?: string }>> {
  const parsed = z.object({ countryCode: z.string().trim().max(5), number: z.string().trim().max(20) }).safeParse(input);
  if (!parsed.success) return invalid;
  return toResult(startPhoneVerification(parsed.data.countryCode, parsed.data.number));
}

export async function checkPhoneCodeAction(input: { code: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ code: z.string().trim().max(10) }).safeParse(input);
  if (!parsed.success) return invalid;
  const result = await toResult(checkPhoneCode(parsed.data.code).then(() => null));
  if (result.ok) revalidatePath("/settings/identity");
  return result;
}

export async function completeSandboxPayoutAction(input: { reference: string; outcome: string }): Promise<ActionResult<null>> {
  if (!(await isPlatformAdmin())) return { ok: false, code: "FORBIDDEN", message: "Platform admins only." };
  const parsed = z.object({ reference: z.string().startsWith("sbx_po_").max(200), outcome: z.enum(["succeeded", "failed"]) }).safeParse(input);
  if (!parsed.success) return invalid;
  const result = await toResult(completeSandboxPayout(parsed.data.reference, parsed.data.outcome).then(() => null));
  if (result.ok) revalidatePath("/platform/integrations");
  return result;
}

"use server";

import { revalidatePath } from "next/cache";
import { OrganizationServiceError } from "@/services/rpc-error";
import { createMyEmailAlias } from "@/services/email-alias";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** ensure_my_email_alias re-checks the caller is a researcher; idempotent. */
export async function createMyEmailAliasAction(): Promise<ActionResult<string>> {
  try {
    const address = await createMyEmailAlias();
    revalidatePath("/settings/email-alias");
    return { ok: true, data: address };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: "UNAVAILABLE", message: "Email aliases aren't available right now." };
  }
}

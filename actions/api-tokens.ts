"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createMyApiToken, revokeMyApiToken } from "@/services/api-tokens";
import { OrganizationServiceError } from "@/services/researcher-profiles";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const createSchema = z.object({ name: z.string().trim().min(1, "Name this token.").max(80) });

export async function createMyApiTokenAction(input: z.infer<typeof createSchema>): Promise<ActionResult<{ token: string; id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Name this token." };

  try {
    const created = await createMyApiToken(parsed.data.name);
    // Still revalidated for the next real navigation/reload -- the calling component
    // updates its own local state immediately, this is only about keeping the cached
    // Server Component payload correct afterward, never the thing the UI waits on.
    revalidatePath("/settings/api-tokens");
    return { ok: true, data: created };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const revokeSchema = z.object({ id: z.string().uuid() });

export async function revokeMyApiTokenAction(input: z.infer<typeof revokeSchema>): Promise<ActionResult<void>> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Check the form and try again." };

  try {
    await revokeMyApiToken(parsed.data.id);
    revalidatePath("/settings/api-tokens");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

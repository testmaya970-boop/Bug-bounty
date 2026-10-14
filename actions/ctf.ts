"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { submitCtfFlag, type SubmitCtfFlagResult } from "@/services/ctf";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const submitFlagSchema = z.object({ challengeId: z.string().min(1), flag: z.string().min(1, "Enter a flag before submitting.").max(500, "Flags are at most 500 characters.") });

/** See docs/decisions/0072 -- the flag is verified server-side; this action never touches
 * a plaintext flag or a stored comparison value beyond passing the submission through. */
export async function submitCtfFlagAction(input: z.infer<typeof submitFlagSchema>): Promise<ActionResult<SubmitCtfFlagResult>> {
  const parsed = submitFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter a flag before submitting." };

  try {
    const result = await submitCtfFlag(parsed.data.challengeId, parsed.data.flag);
    if (result.correct) {
      revalidatePath("/ctf");
      revalidatePath("/researchers");
    }
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

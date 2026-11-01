"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { deleteMyCtfWriteup, publishCtfWriteup, submitCtfFlag, takeCtfHint, type SubmitCtfFlagResult } from "@/services/ctf";

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

function failure(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
  throw error;
}

const hintSchema = z.object({ challengeId: z.string().min(1).max(100), position: z.number().int().min(1).max(3) });

/** Takes a hint; the database records it and lowers what a later solve awards. */
export async function takeCtfHintAction(input: z.infer<typeof hintSchema>): Promise<ActionResult<{ position: number; cost: number; body: string }>> {
  const parsed = hintSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "That hint does not exist." };
  try {
    return { ok: true, data: await takeCtfHint(parsed.data.challengeId, parsed.data.position) };
  } catch (error) {
    return failure(error);
  }
}

// Length and plain-text rules are enforced by publish_ctf_writeup; this only bounds the payload.
const writeupSchema = z.object({ challengeId: z.string().min(1).max(100), body: z.string().max(4000, "Keep it under 2000 characters.") });

export async function publishCtfWriteupAction(input: z.infer<typeof writeupSchema>): Promise<ActionResult<null>> {
  const parsed = writeupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check your write-up." };
  try {
    await publishCtfWriteup(parsed.data.challengeId, parsed.data.body);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCtfWriteupAction(input: { challengeId: string }): Promise<ActionResult<null>> {
  if (typeof input?.challengeId !== "string" || !input.challengeId) return { ok: false, code: "INVALID_INPUT", message: "Unknown challenge." };
  try {
    await deleteMyCtfWriteup(input.challengeId);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

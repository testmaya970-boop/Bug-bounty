"use server";

import { z } from "zod";
import { submitMyFeedback } from "@/services/feedback";
import { OrganizationServiceError } from "@/services/researcher-profiles";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const feedbackSchema = z.object({ message: z.string().trim().min(1, "Enter your feedback.").max(4000) });

export async function submitMyFeedbackAction(input: z.infer<typeof feedbackSchema>): Promise<ActionResult<void>> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Enter your feedback." };

  try {
    await submitMyFeedback(parsed.data.message);
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

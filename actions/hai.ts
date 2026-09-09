"use server";

import { OrganizationServiceError, joinHaiWaitlist } from "@/services/hai";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function joinHaiWaitlistAction(): Promise<ActionResult<boolean>> {
  return toResult(joinHaiWaitlist());
}

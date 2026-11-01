"use server";

import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getMyReputationLedger } from "@/services/reputation";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { ReputationLedgerEntry } from "@/types/reputation";
import type { Page } from "@/types/pagination";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const listReputationLedgerSchema = z.object({ cursor: z.string().optional() });

export async function listReputationLedgerPageAction(input: { cursor?: string }): Promise<ActionResult<Page<ReputationLedgerEntry>>> {
  const parsed = listReputationLedgerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "Check the form and try again." };

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  return toResult(getMyReputationLedger(user.id, parsed.data.cursor));
}

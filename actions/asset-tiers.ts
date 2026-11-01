"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setAssetTier, setProgramBountyTiers } from "@/services/asset-tiers";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getCurrentUser } from "@/lib/auth/current-user";

type Result = { ok: true } | { ok: false; message: string };
const uuid = z.string().uuid();

async function run(fn: () => Promise<void>, path: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: "Your session has expired. Sign in again to continue." };
  try {
    await fn();
    revalidatePath(path);
    return { ok: true };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function setAssetTierAction(input: { organizationId: string; assetId: string; tier: number }): Promise<Result> {
  const parsed = z.object({ organizationId: uuid, assetId: uuid, tier: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose tier 1, 2 or 3." };
  return run(() => setAssetTier(parsed.data.assetId, parsed.data.tier), `/organizations/${parsed.data.organizationId}/assets`);
}

export async function setProgramBountyTiersAction(input: { organizationId: string; programId: string; tier2Percent: number; tier3Percent: number }): Promise<Result> {
  const pct = z.number().int().min(1, "Use 1 to 100 percent.").max(100, "Use 1 to 100 percent.");
  const parsed = z.object({ organizationId: uuid, programId: uuid, tier2Percent: pct, tier3Percent: pct }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return run(() => setProgramBountyTiers(parsed.data.programId, parsed.data.tier2Percent, parsed.data.tier3Percent), `/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { cancelBonus, decideBonus, proposeBonus } from "@/services/bonuses";
import { parseDecimalToMinorUnits } from "@/lib/money";

type Result = { ok: true } | { ok: false; message: string };
const id = z.string().uuid();

async function run(paths: string[], work: () => Promise<void>): Promise<Result> {
  try {
    await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  for (const p of paths) revalidatePath(p, "layout");
  return { ok: true };
}

const proposeSchema = z.object({
  organizationId: id,
  reportId: id,
  amount: z.string().trim().min(1, "Enter an amount."),
  reason: z.enum(["exceptional_quality", "retest", "campaign", "other"]),
  note: z.string().trim().min(5, "Tell the researcher what the bonus is for.").max(1000),
  idempotencyKey: id,
});

export async function proposeBonusAction(input: z.input<typeof proposeSchema>): Promise<Result> {
  const p = proposeSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
  const minor = parseDecimalToMinorUnits(p.data.amount);
  if (!minor || minor <= 0) return { ok: false, message: "Enter an amount above zero." };
  return run([`/organizations/${p.data.organizationId}`], () => proposeBonus(p.data.reportId, minor, p.data.reason, p.data.note, p.data.idempotencyKey));
}

export async function decideBonusAction(organizationId: string, bonusId: string, approve: boolean, note: string): Promise<Result> {
  const p = z.object({ organizationId: id, bonusId: id, note: z.string().trim().max(1000) }).safeParse({ organizationId, bonusId, note });
  if (!p.success) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}`, "/bounties"], () => decideBonus(bonusId, approve, p.data.note));
}

export async function cancelBonusAction(organizationId: string, bonusId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success || !id.safeParse(bonusId).success) return { ok: false, message: "Check the request and try again." };
  return run([`/organizations/${organizationId}`], () => cancelBonus(bonusId));
}

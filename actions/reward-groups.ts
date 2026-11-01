"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import {
  applyRewardGroupTemplate,
  archiveRewardGroup,
  createRewardGroup,
  deleteRewardGroup,
  duplicateRewardGroup,
  reorderRewardGroups,
  setAssetRewardGroup,
  setDefaultRewardGroup,
  updateRewardGroup,
} from "@/services/reward-groups";

type Result = { ok: true } | { ok: false; message: string };
const id = z.string().uuid();

async function run(organizationId: string, work: () => Promise<unknown>): Promise<Result> {
  try {
    await work();
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/organizations/${organizationId}`, "layout");
  return { ok: true };
}
const bad = (message = "Check the request and try again."): Result => ({ ok: false, message });

const amount = z.number().int().min(0).max(1_000_000_000);
const groupSchema = z.object({
  name: z.string().trim().min(1, "Name the group.").max(80),
  description: z.string().trim().max(500),
  color: z.enum(["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"]),
  icon: z.enum(["shield", "server", "key", "globe", "device-mobile", "credit-card", "bank", "cpu", "code", "archive", "heartbeat", "buildings", "storefront", "robot", "lock", "database"]),
  currency: z.enum(["INR", "USD"]),
  bounties: z
    .array(z.object({ severity: z.enum(["critical", "high", "medium", "low", "none"]), min: amount, max: amount }))
    .max(5)
    .refine((b) => b.every((x) => x.max >= x.min), "Each \"up to\" amount must be at least its \"from\" amount."),
});

export async function saveRewardGroupAction(organizationId: string, groupId: string | null, input: z.input<typeof groupSchema>): Promise<Result> {
  if (!id.safeParse(organizationId).success || (groupId !== null && !id.safeParse(groupId).success)) return bad();
  const p = groupSchema.safeParse(input);
  if (!p.success) return bad(p.error.issues[0]?.message);
  return run(organizationId, () => (groupId ? updateRewardGroup(groupId, p.data) : createRewardGroup(organizationId, p.data)));
}

export async function duplicateRewardGroupAction(organizationId: string, groupId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success || !id.safeParse(groupId).success) return bad();
  return run(organizationId, () => duplicateRewardGroup(groupId));
}

export async function reorderRewardGroupsAction(organizationId: string, groupIds: string[]): Promise<Result> {
  const p = z.object({ organizationId: id, groupIds: z.array(id).max(500) }).safeParse({ organizationId, groupIds });
  if (!p.success) return bad();
  return run(organizationId, () => reorderRewardGroups(organizationId, p.data.groupIds));
}

export async function setDefaultRewardGroupAction(organizationId: string, groupId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success || !id.safeParse(groupId).success) return bad();
  return run(organizationId, () => setDefaultRewardGroup(groupId));
}

export async function archiveRewardGroupAction(organizationId: string, groupId: string, archive: boolean): Promise<Result> {
  if (!id.safeParse(organizationId).success || !id.safeParse(groupId).success) return bad();
  return run(organizationId, () => archiveRewardGroup(groupId, archive));
}

export async function deleteRewardGroupAction(organizationId: string, groupId: string): Promise<Result> {
  if (!id.safeParse(organizationId).success || !id.safeParse(groupId).success) return bad();
  return run(organizationId, () => deleteRewardGroup(groupId));
}

export async function applyRewardGroupTemplateAction(organizationId: string, template: string, currency: string): Promise<Result> {
  const p = z.object({ organizationId: id, template: z.enum(["saas", "banking", "ai", "ecommerce", "healthcare", "government"]), currency: z.enum(["INR", "USD"]) }).safeParse({ organizationId, template, currency });
  if (!p.success) return bad("Choose a template and currency.");
  return run(organizationId, () => applyRewardGroupTemplate(organizationId, p.data.template, p.data.currency));
}

export async function setAssetRewardGroupAction(organizationId: string, assetId: string, groupId: string): Promise<Result> {
  if (![organizationId, assetId, groupId].every((v) => id.safeParse(v).success)) return bad();
  return run(organizationId, () => setAssetRewardGroup(assetId, groupId));
}

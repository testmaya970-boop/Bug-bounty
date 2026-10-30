import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { RewardGroup, RewardSeverity, RewardRange, RewardSuggestion } from "@/types/reward-groups";

// Reward groups (202610300001). Every rule -- who manages them, archiving, defaults, templates,
// how a bounty uses them -- is in the database functions; this file calls them.

async function rpc<T extends Record<string, unknown>>(name: string, args: unknown[] = []): Promise<T[]> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, (client) => callRpc<T>(client, name, args));
  } catch (error) {
    mapError(error as { message: string });
  }
}

type GroupRow = {
  id: string; name: string; description: string | null; color: RewardGroup["color"]; icon: RewardGroup["icon"]; currency: "INR" | "USD";
  sort_order: number; is_default: boolean; archived_at: Date | null; asset_count: string; bounties: Record<string, { min: string; max: string }>; can_manage: boolean;
};

export async function listRewardGroups(organizationId: string): Promise<{ groups: RewardGroup[]; canManage: boolean }> {
  const rows = await rpc<GroupRow>("public.list_reward_groups", [organizationId]);
  return {
    canManage: rows[0]?.can_manage ?? (await canManageRewardGroups(organizationId)),
    groups: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      icon: r.icon,
      currency: r.currency,
      sortOrder: r.sort_order,
      isDefault: r.is_default,
      archived: r.archived_at !== null,
      assetCount: Number(r.asset_count),
      bounties: Object.fromEntries(Object.entries(r.bounties).map(([k, v]) => [k, { min: Number(v.min), max: Number(v.max) }])) as Partial<Record<RewardSeverity, RewardRange>>,
    })),
  };
}

/** With no groups yet, list_reward_groups returns no row to carry can_manage. */
async function canManageRewardGroups(organizationId: string): Promise<boolean> {
  const actor = await getCurrentUser();
  if (!actor) return false;
  const rows = await withActorTransaction(actor.id, (c) =>
    c.query<{ ok: boolean }>("select exists (select 1 from public.organization_members where organization_id = $1 and user_id = $2 and status = 'active' and role in ('owner', 'security_admin')) as ok", [organizationId, actor.id]),
  );
  return rows.rows[0]?.ok ?? false;
}

export async function listAssetRewardGroups(organizationId: string): Promise<{ byAsset: Record<string, string | null>; canEdit: boolean }> {
  const rows = await rpc<{ asset_id: string; reward_group_id: string | null; can_edit: boolean }>("public.list_asset_reward_groups", [organizationId]);
  return { byAsset: Object.fromEntries(rows.map((r) => [r.asset_id, r.reward_group_id])), canEdit: rows[0]?.can_edit ?? false };
}

export type GroupInput = { name: string; description: string; color: string; icon: string; currency: "INR" | "USD"; bounties: { severity: RewardSeverity; min: number; max: number }[] };
const bountyJson = (b: GroupInput["bounties"]) => JSON.stringify(b.map((x) => ({ severity: x.severity, min: x.min, max: x.max })));

export async function createRewardGroup(organizationId: string, g: GroupInput): Promise<void> {
  await rpc("public.create_reward_group", [organizationId, g.name, g.description, g.color, g.icon, g.currency, bountyJson(g.bounties)]);
}
export async function updateRewardGroup(groupId: string, g: GroupInput): Promise<void> {
  await rpc("public.update_reward_group", [groupId, g.name, g.description, g.color, g.icon, g.currency, bountyJson(g.bounties)]);
}
export async function duplicateRewardGroup(groupId: string): Promise<void> {
  await rpc("public.duplicate_reward_group", [groupId]);
}
export async function reorderRewardGroups(organizationId: string, groupIds: string[]): Promise<void> {
  await rpc("public.reorder_reward_groups", [organizationId, groupIds]);
}
export async function setDefaultRewardGroup(groupId: string): Promise<void> {
  await rpc("public.set_default_reward_group", [groupId]);
}
export async function archiveRewardGroup(groupId: string, archive: boolean): Promise<void> {
  await rpc("public.archive_reward_group", [groupId, archive]);
}
export async function deleteRewardGroup(groupId: string): Promise<void> {
  await rpc("public.delete_reward_group", [groupId]);
}
export async function applyRewardGroupTemplate(organizationId: string, template: string, currency: "INR" | "USD"): Promise<number> {
  const rows = await rpc<{ apply_reward_group_template: number }>("public.apply_reward_group_template", [organizationId, template, currency]);
  return rows[0]?.apply_reward_group_template ?? 0;
}
export async function setAssetRewardGroup(assetId: string, groupId: string): Promise<void> {
  await rpc("public.set_asset_reward_group", [assetId, groupId]);
}

export async function getReportRewardSuggestion(reportId: string): Promise<RewardSuggestion | null> {
  const rows = await rpc<{ asset_label: string | null; reward_group_id: string | null; reward_group_name: string | null; reward_group_color: RewardGroup["color"] | null; severity: RewardSeverity | null; source: RewardSuggestion["source"]; currency: string | null; min_amount_minor_units: string | null; max_amount_minor_units: string | null }>(
    "public.get_report_reward_suggestion",
    [reportId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    assetLabel: r.asset_label,
    groupId: r.reward_group_id,
    groupName: r.reward_group_name,
    groupColor: r.reward_group_color,
    severity: r.severity,
    source: r.source,
    currency: r.currency,
    min: r.min_amount_minor_units === null ? null : Number(r.min_amount_minor_units),
    max: r.max_amount_minor_units === null ? null : Number(r.max_amount_minor_units),
  };
}

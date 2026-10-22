import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// Asset tiers and a program's tier percentages (202610220006/0008). Tier 1 = most critical.

export type AssetTier = 1 | 2 | 3;

async function rpcRows<T extends Record<string, unknown>>(name: string, args: unknown[]): Promise<T[]> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, (client) => callRpc<T>(client, name, args));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listAssetTiers(organizationId: string): Promise<{ tiers: Record<string, AssetTier>; canEdit: boolean }> {
  const rows = await rpcRows<{ asset_id: string; tier: number; can_edit: boolean }>("public.list_asset_tiers", [organizationId]);
  return { tiers: Object.fromEntries(rows.map((r) => [r.asset_id, r.tier as AssetTier])), canEdit: rows[0]?.can_edit ?? false };
}

export async function setAssetTier(assetId: string, tier: AssetTier): Promise<void> {
  await rpcRows("public.set_asset_tier", [assetId, tier]);
}

export async function setProgramBountyTiers(programId: string, tier2Percent: number, tier3Percent: number): Promise<void> {
  await rpcRows("public.set_program_bounty_tiers", [programId, tier2Percent, tier3Percent]);
}

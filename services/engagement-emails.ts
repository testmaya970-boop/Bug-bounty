import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// "A new program matches what you hunt" emails to inactive researchers (202610210005/0006).
// Platform admins only; every RPC re-checks that in the database.

export type EngagementEmailSettings = { enabled: boolean; inactiveAfterDays: number; minDaysBetween: number; updatedAt: string };
export type EngagementEmailStats = { notified30d: number; emailed30d: number; optedOut: number; lastSentAt: string | null };

type SettingsRow = { enabled: boolean; inactive_after_days: number; min_days_between: number; updated_at: Date };
const toSettings = (r: SettingsRow): EngagementEmailSettings => ({ enabled: r.enabled, inactiveAfterDays: r.inactive_after_days, minDaysBetween: r.min_days_between, updatedAt: new Date(r.updated_at).toISOString() });

async function asActor<T>(fn: (client: Parameters<Parameters<typeof withActorTransaction>[1]>[0]) => Promise<T>): Promise<T> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getEngagementEmailSettings(): Promise<EngagementEmailSettings> {
  const rows = await asActor((client) => callRpc<SettingsRow>(client, "public.get_engagement_email_settings"));
  return toSettings(rows[0]);
}

export async function getEngagementEmailStats(): Promise<EngagementEmailStats> {
  type Row = { notified_30d: number; emailed_30d: number; opted_out: number; last_sent_at: Date | null };
  const rows = await asActor((client) => callRpc<Row>(client, "public.get_engagement_email_stats"));
  const r = rows[0];
  return { notified30d: r.notified_30d, emailed30d: r.emailed_30d, optedOut: r.opted_out, lastSentAt: r.last_sent_at ? new Date(r.last_sent_at).toISOString() : null };
}

export async function updateEngagementEmailSettings(enabled: boolean, inactiveAfterDays: number, minDaysBetween: number): Promise<EngagementEmailSettings> {
  const rows = await asActor((client) => callRpc<SettingsRow>(client, "public.update_engagement_email_settings", [enabled, inactiveAfterDays, minDaysBetween]));
  return toSettings(rows[0]);
}

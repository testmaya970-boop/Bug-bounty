import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// Submission signal and limits (db/migrations/202610210001_submission_signal.sql). The database
// enforces every rule on insert; this file only reads standing and wraps the admin RPCs.

export type SubmissionTier = "new" | "standard" | "trusted" | "limited";

export type SubmissionStanding = {
  tier: SubmissionTier;
  /** Average outcome of the last 30 closed reports, -1 to 1. */
  signal: number;
  closedCount: number;
  validCount: number;
  invalidCount: number;
  dailyCap: number;
  usedToday: number;
  restrictedUntil: string | null;
  restrictionReason: string | null;
};

export type SubmissionRestriction = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  reason: string;
  source: "automatic" | "platform_admin";
  restrictedUntil: string;
  createdAt: string;
  tier: SubmissionTier;
  signal: number;
  invalidCount: number;
  closedCount: number;
};

type StandingRow = { tier: SubmissionTier; signal: string; closed_count: number; valid_count: number; invalid_count: number; daily_cap: number; used_today: number; restricted_until: Date | null; restriction_reason: string | null };

export async function getMySubmissionStanding(): Promise<SubmissionStanding | null> {
  const actor = await getCurrentUser();
  if (!actor) return null;
  let rows: StandingRow[];
  try {
    rows = await withActorTransaction(actor.id, (client) => callRpc<StandingRow>(client, "public.get_my_submission_standing"));
  } catch (error) {
    mapError(error as { message: string });
  }
  const r = rows[0];
  if (!r) return null;
  return {
    tier: r.tier,
    signal: Number(r.signal),
    closedCount: r.closed_count,
    validCount: r.valid_count,
    invalidCount: r.invalid_count,
    dailyCap: r.daily_cap,
    usedToday: r.used_today,
    restrictedUntil: r.restricted_until ? new Date(r.restricted_until).toISOString() : null,
    restrictionReason: r.restriction_reason,
  };
}

export async function listSubmissionRestrictionsForAdmin(): Promise<SubmissionRestriction[]> {
  const actor = await getCurrentUser();
  type Row = { id: string; user_id: string; username: string; display_name: string; email: string | null; reason: string; source: SubmissionRestriction["source"]; restricted_until: Date; created_at: Date; tier: SubmissionTier; signal: string; invalid_count: number; closed_count: number };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.list_submission_restrictions_for_admin", [100]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    email: r.email,
    reason: r.reason,
    source: r.source,
    restrictedUntil: new Date(r.restricted_until).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    tier: r.tier,
    signal: Number(r.signal),
    invalidCount: r.invalid_count,
    closedCount: r.closed_count,
  }));
}

export async function pauseResearcherSubmissions(email: string, days: number, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.pause_researcher_submissions", [email, days, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function liftSubmissionRestriction(restrictionId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.lift_submission_restriction", [restrictionId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Whether the signed-in researcher has a verified identity, required to submit (202610230008). */
export async function isMyIdentityVerified(): Promise<boolean> {
  const actor = await getCurrentUser();
  if (!actor) return false;
  try {
    const rows = await withActorTransaction(actor.id, (client) => callRpc<{ am_i_identity_verified: boolean }>(client, "public.am_i_identity_verified"));
    return rows[0]?.am_i_identity_verified === true;
  } catch (error) {
    mapError(error as { message: string });
  }
}

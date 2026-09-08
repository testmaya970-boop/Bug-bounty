import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";

export { OrganizationServiceError };

export type CtfSolve = { challengeId: string; pointsAwarded: number; solvedAt: string };
export type SubmitCtfFlagResult = { correct: boolean; pointsAwarded: number; alreadySolved: boolean };

/**
 * Server-verified flag submission (docs/decisions/0072) -- the plaintext flag is never
 * stored anywhere queryable; submit_ctf_flag compares a hash server-side and, on a first
 * correct submission, records a real ctf_solves row plus a `ctf_challenge_solved`
 * reputation_ledger fact in the same transaction. Resubmitting an already-solved
 * challenge's correct flag returns `alreadySolved: true` with zero additional points --
 * never a duplicate fact.
 */
export async function submitCtfFlag(challengeId: string, flag: string): Promise<SubmitCtfFlagResult> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ correct: boolean; points_awarded: number; already_solved: boolean }>(client, "public.submit_ctf_flag", [challengeId, flag]),
    );
    const row = rows[0];
    return { correct: row?.correct ?? false, pointsAwarded: row?.points_awarded ?? 0, alreadySolved: row?.already_solved ?? false };
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** The researcher's own real, server-persisted solved-state -- replaces
 * lib/ctf-progress.ts's localStorage-based tracking (see 0072). */
export async function listMyCtfSolves(): Promise<CtfSolve[]> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ challenge_id: string; points_awarded: number; solved_at: string }>(client, "public.list_my_ctf_solves"),
    );
    return rows.map((row) => ({ challengeId: row.challenge_id, pointsAwarded: row.points_awarded, solvedAt: row.solved_at }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** The bearer-token API's CTF-solves read -- see list_ctf_solves_for_actor
 * (202609050008), SECURITY INVOKER + service_role-only for the same reason every other
 * "for actor" sibling in this codebase is: a bearer-token request has no cookie session
 * for auth.uid() to resolve. Never call with a client-supplied actorId. */
export async function listCtfSolvesForActor(actorId: string): Promise<CtfSolve[]> {
  try {
    const rows = await withServiceRoleTransaction((client) =>
      callRpc<{ challenge_id: string; points_awarded: number; solved_at: string }>(client, "public.list_ctf_solves_for_actor", [actorId]),
    );
    return rows.map((row) => ({ challengeId: row.challenge_id, pointsAwarded: row.points_awarded, solvedAt: row.solved_at }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

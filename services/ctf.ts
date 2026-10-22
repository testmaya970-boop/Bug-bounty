import "server-only";
import { withActorTransaction, withPublicTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
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

/** A real row of the CTF leaderboard (get_ctf_leaderboard over ctf_solves). */
export type CtfLeaderboardRow = { rank: number; researcherId: string; name: string; username: string | null; ctfPoints: number; challengesSolved: number; level: CtfLevel };
export type CtfLevel = "Distinguished" | "Expert" | "Specialist" | "Practitioner" | "Apprentice";

/** Level by standing among everyone ranked: top 10% Distinguished, and so on down. */
export function ctfLevelFor(rank: number, total: number): CtfLevel {
  const pct = (total - rank + 1) / total;
  if (pct > 0.9) return "Distinguished";
  if (pct > 0.7) return "Expert";
  if (pct > 0.45) return "Specialist";
  if (pct > 0.2) return "Practitioner";
  return "Apprentice";
}

export async function getCtfLeaderboard(limit = 100): Promise<CtfLeaderboardRow[]> {
  const actor = await getCurrentUser();
  type Row = { rank: string; researcher_id: string; display_name: string; public_username: string | null; points: string; challenges_solved: string };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.get_ctf_leaderboard", [limit]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({
    rank: Number(r.rank),
    researcherId: r.researcher_id,
    name: r.display_name,
    username: r.public_username,
    ctfPoints: Number(r.points),
    challengesSolved: Number(r.challenges_solved),
    level: ctfLevelFor(Number(r.rank), rows.length),
  }));
}

/** Real solves per challenge id. A challenge nobody has solved is absent (read it as 0). */
export async function getCtfSolveCounts(): Promise<Map<string, number>> {
  const actor = await getCurrentUser();
  let rows: { challenge_id: string; solves: string }[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ challenge_id: string; solves: string }>(client, "public.get_ctf_solve_counts"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return new Map(rows.map((r) => [r.challenge_id, Number(r.solves)]));
}

/** A challenge's hints: cost for every hint, text only for hints the caller has taken
 * (list_ctf_hints -- the text never leaves the database before take_ctf_hint). */
export type CtfHint = { position: number; cost: number; taken: boolean; body: string | null };

export async function listCtfHints(challengeId: string): Promise<CtfHint[]> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ hint_position: number; cost: number; taken: boolean; body: string | null }>(client, "public.list_ctf_hints", [challengeId]),
    );
    return rows.map((r) => ({ position: r.hint_position, cost: r.cost, taken: r.taken, body: r.body }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Takes a hint (idempotent). Its cost is subtracted from a later solve's points. */
export async function takeCtfHint(challengeId: string, position: number): Promise<{ position: number; cost: number; body: string }> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ hint_position: number; cost: number; body: string }>(client, "public.take_ctf_hint", [challengeId, position]),
    );
    return { position: rows[0].hint_position, cost: rows[0].cost, body: rows[0].body };
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** The official write-up plus solvers' own -- get_ctf_writeups refuses anyone who has not
 * solved the challenge, so callers only ask once the page knows the caller solved it. */
export type CtfWriteup = { id: string | null; official: boolean; author: string; body: string; publishedAt: string | null; mine: boolean };

export async function getCtfWriteups(challengeId: string): Promise<CtfWriteup[]> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ writeup_id: string | null; is_official: boolean; author_name: string; body: string; published_at: string | null; is_mine: boolean }>(client, "public.get_ctf_writeups", [challengeId]),
    );
    return rows.map((r) => ({ id: r.writeup_id, official: r.is_official, author: r.author_name, body: r.body, publishedAt: r.published_at, mine: r.is_mine }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function publishCtfWriteup(challengeId: string, body: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.publish_ctf_writeup", [challengeId, body]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function deleteMyCtfWriteup(challengeId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.delete_my_ctf_writeup", [challengeId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Stored track badges (get_researcher_ctf_badges): self, or an opted-in public profile. */
export type CtfTrackBadge = { trackId: string; label: string; awardedAt: string };

export async function getResearcherCtfBadges(researcherId: string): Promise<CtfTrackBadge[]> {
  const actor = await getCurrentUser();
  try {
    const rows = await withPublicTransaction(actor?.id ?? null, (client) =>
      callRpc<{ track_id: string; label: string; awarded_at: string }>(client, "public.get_researcher_ctf_badges", [researcherId]),
    );
    return rows.map((r) => ({ trackId: r.track_id, label: r.label, awardedAt: r.awarded_at }));
  } catch (error) {
    mapError(error as { message: string });
  }
}

import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type {
  CtfEventSummary,
  CtfEventDetail,
  CtfEventEffectiveStatus,
  CtfEventLeaderboardRow,
  CtfEventAdminSummary,
  CtfEventAdminDetail,
  CtfEventStatus,
} from "@/types/ctf-event";

export { OrganizationServiceError };

// All reads/writes go through the SECURITY DEFINER RPCs in
// db/migrations/202609290001_ctf_events.sql. Verification of a flag inside an event still
// runs through submit_ctf_flag (services/ctf.ts) unchanged -- this module never re-implements
// it; the RPC records event attribution itself.

type EventRow = { id: string; slug: string; name: string; description: string; starts_at: string; ends_at: string; effective_status: string; challenge_count: string | number };

export async function listCtfEvents(): Promise<CtfEventSummary[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<EventRow>(client, "public.list_ctf_events"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    effectiveStatus: row.effective_status as CtfEventEffectiveStatus,
    challengeCount: Number(row.challenge_count),
  }));
}

type EventDetailRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  effective_status: string;
  challenge_id: string;
  points: number;
  solved_in_event: boolean;
};

/** Assembles the one-event-many-challenge-rows RPC result into a single event object.
 * Returns null when the slug is unknown or the event is a draft (RPC returns no rows). */
export async function getCtfEventBySlug(slug: string): Promise<CtfEventDetail | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<EventDetailRow>(client, "public.get_ctf_event_by_slug", [slug]));
  } catch (error) {
    mapError(error as { message: string });
  }
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    id: first.id,
    slug: first.slug,
    name: first.name,
    description: first.description,
    startsAt: first.starts_at,
    endsAt: first.ends_at,
    effectiveStatus: first.effective_status as CtfEventEffectiveStatus,
    challenges: rows.map((row) => ({ challengeId: row.challenge_id, points: row.points, solvedInEvent: row.solved_in_event })),
  };
}

type LeaderboardRow = { rank: string | number; researcher_id: string; display_name: string; public_username: string | null; event_points: string | number; challenges_solved: string | number; last_solved_at: string };

export async function getCtfEventLeaderboard(eventId: string, limit = 100): Promise<CtfEventLeaderboardRow[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<LeaderboardRow>(client, "public.get_ctf_event_leaderboard", [eventId, limit]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    rank: Number(row.rank),
    researcherId: row.researcher_id,
    displayName: row.display_name,
    publicUsername: row.public_username,
    eventPoints: Number(row.event_points),
    challengesSolved: Number(row.challenges_solved),
    lastSolvedAt: row.last_solved_at,
  }));
}

// --- platform-admin ---

type AdminEventRow = { id: string; slug: string; name: string; starts_at: string; ends_at: string; status: string; effective_status: string; challenge_count: string | number; solver_count: string | number };

export async function listCtfEventsForAdmin(): Promise<CtfEventAdminSummary[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<AdminEventRow>(client, "public.list_ctf_events_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as CtfEventStatus,
    effectiveStatus: row.effective_status as CtfEventEffectiveStatus,
    challengeCount: Number(row.challenge_count),
    solverCount: Number(row.solver_count),
  }));
}

type AdminDetailRow = { id: string; slug: string; name: string; description: string; starts_at: string; ends_at: string; status: string; challenge_ids: string[] };

export async function getCtfEventForAdmin(eventId: string): Promise<CtfEventAdminDetail | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<AdminDetailRow>(client, "public.get_ctf_event_for_admin", [eventId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as CtfEventStatus,
    challengeIds: row.challenge_ids ?? [],
  };
}

export async function createCtfEvent(input: { slug: string; name: string; description: string; startsAt: string; endsAt: string; status: CtfEventStatus }): Promise<{ id: string; slug: string }> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ id: string; slug: string }>(client, "public.create_ctf_event", [input.slug, input.name, input.description, input.startsAt, input.endsAt, input.status]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { id: rows[0].id, slug: rows[0].slug };
}

export async function updateCtfEvent(input: { eventId: string; name: string; description: string; startsAt: string; endsAt: string; status: CtfEventStatus }): Promise<{ id: string; slug: string }> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ id: string; slug: string }>(client, "public.update_ctf_event", [input.eventId, input.name, input.description, input.startsAt, input.endsAt, input.status]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { id: rows[0].id, slug: rows[0].slug };
}

export async function setCtfEventChallenges(eventId: string, challengeIds: string[]): Promise<number> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ set_ctf_event_challenges: number }>(client, "public.set_ctf_event_challenges", [eventId, challengeIds]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.set_ctf_event_challenges ?? 0;
}

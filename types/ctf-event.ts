// Shared CTF-event types (db/migrations/202609290001_ctf_events.sql, docs/decisions/0080).
// `status` is the admin's stored intent; `effectiveStatus` is the clock-derived state the
// UI shows (draft | upcoming | active | ended).

export type CtfEventStatus = "draft" | "scheduled" | "active" | "ended";
export type CtfEventEffectiveStatus = "draft" | "upcoming" | "active" | "ended";

/** A published event in the list (list_ctf_events). */
export type CtfEventSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  effectiveStatus: CtfEventEffectiveStatus;
  challengeCount: number;
};

/** One challenge inside an event, with the caller's own solved-in-this-event state. */
export type CtfEventChallenge = {
  challengeId: string;
  points: number;
  solvedInEvent: boolean;
};

/** An event with its challenge set (get_ctf_event_by_slug), assembled from the RPC's rows. */
export type CtfEventDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  effectiveStatus: CtfEventEffectiveStatus;
  challenges: CtfEventChallenge[];
};

/** One ranked row on an event's real leaderboard (get_ctf_event_leaderboard). */
export type CtfEventLeaderboardRow = {
  rank: number;
  researcherId: string;
  displayName: string;
  publicUsername: string | null;
  eventPoints: number;
  challengesSolved: number;
  lastSolvedAt: string;
};

/** Admin list row (list_ctf_events_for_admin) -- includes drafts. */
export type CtfEventAdminSummary = {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: CtfEventStatus;
  effectiveStatus: CtfEventEffectiveStatus;
  challengeCount: number;
  solverCount: number;
};

/** Admin edit-screen config (get_ctf_event_for_admin). */
export type CtfEventAdminDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: CtfEventStatus;
  challengeIds: string[];
};

import "server-only";
import type { QueryResultRow } from "pg";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// Request to join (202610220002/0005) and duplicate suggestions. Every rule is in the database.

export type JoinMode = "open" | "request";
export type ProgramJoinInfo = {
  joinMode: JoinMode;
  minSignal: number | null;
  minValidReports: number | null;
  myRequest: { id: string; status: "pending" | "declined"; at: string; decisionNote: string | null } | null;
};
export type AccessRequest = { id: string; userId: string; displayName: string; username: string; note: string | null; createdAt: string; signal: number; validCount: number; closedCount: number; tier: string };
export type DuplicateSuggestion = { id: string; title: string; displayTarget: string; status: string; submittedAt: string | null; similarity: number; sameTarget: boolean };

async function rpc<T extends QueryResultRow = QueryResultRow>(name: string, args: unknown[] = []): Promise<T[]> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, (client) => callRpc<T>(client, name, args));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getProgramJoinInfo(programId: string): Promise<ProgramJoinInfo | null> {
  type Row = { join_mode: JoinMode; min_signal: string | null; min_valid_reports: number | null; my_request_id: string | null; my_request_status: "pending" | "declined" | null; my_request_at: Date | null; my_decision_note: string | null };
  const r = (await rpc<Row>("public.get_program_join_info", [programId]))[0];
  if (!r) return null;
  return {
    joinMode: r.join_mode,
    minSignal: r.min_signal == null ? null : Number(r.min_signal),
    minValidReports: r.min_valid_reports,
    myRequest: r.my_request_id && r.my_request_status ? { id: r.my_request_id, status: r.my_request_status, at: new Date(r.my_request_at as Date).toISOString(), decisionNote: r.my_decision_note } : null,
  };
}

export async function requestProgramAccess(programId: string, note: string): Promise<void> {
  await rpc("public.request_program_access", [programId, note]);
}

export async function withdrawProgramAccessRequest(requestId: string): Promise<void> {
  await rpc("public.withdraw_program_access_request", [requestId]);
}

export async function listProgramAccessRequests(programId: string): Promise<AccessRequest[]> {
  type Row = { id: string; user_id: string; display_name: string; username: string; note: string | null; created_at: Date; signal: string; valid_count: number; closed_count: number; tier: string };
  return (await rpc<Row>("public.list_program_access_requests", [programId])).map((r) => ({
    id: r.id, userId: r.user_id, displayName: r.display_name, username: r.username, note: r.note, createdAt: new Date(r.created_at).toISOString(),
    signal: Number(r.signal), validCount: r.valid_count, closedCount: r.closed_count, tier: r.tier,
  }));
}

export async function decideProgramAccessRequest(requestId: string, approve: boolean, note: string): Promise<void> {
  await rpc("public.decide_program_access_request", [requestId, approve, note]);
}

export async function setProgramJoinMode(programId: string, joinMode: JoinMode): Promise<void> {
  await rpc("public.set_program_join_mode", [programId, joinMode]);
}

export async function suggestDuplicateReports(reportId: string): Promise<DuplicateSuggestion[]> {
  type Row = { id: string; title: string; display_target: string; status: string; submitted_at: Date | null; similarity: number; same_target: boolean };
  return (await rpc<Row>("public.suggest_duplicate_reports", [reportId, 8])).map((r) => ({
    id: r.id, title: r.title, displayTarget: r.display_target, status: r.status, submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
    similarity: Number(r.similarity), sameTarget: r.same_target,
  }));
}

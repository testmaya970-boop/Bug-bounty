import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

// Post-award bonuses (202610290003). Approval, limits, splits and funding are enforced by the
// database functions; this file only calls them and reads under RLS.

export type Bonus = { id: string; reportId: string; reportTitle: string | null; programName: string | null; amountMinorUnits: number; currency: string; reason: "exceptional_quality" | "retest" | "campaign" | "other"; note: string; status: "proposed" | "approved" | "rejected" | "cancelled"; proposedBy: string; proposedByName: string | null; proposedAt: string; decisionNote: string | null; decidedAt: string | null };

type Row = { id: string; report_id: string; title: string | null; program_name: string | null; amount_minor_units: string; currency: string; reason: Bonus["reason"]; note: string; status: Bonus["status"]; proposed_by: string; proposer: string | null; proposed_at: string; decision_note: string | null; decided_at: string | null };

const map = (r: Row): Bonus => ({ id: r.id, reportId: r.report_id, reportTitle: r.title, programName: r.program_name, amountMinorUnits: Number(r.amount_minor_units), currency: r.currency, reason: r.reason, note: r.note, status: r.status, proposedBy: r.proposed_by, proposedByName: r.proposer, proposedAt: new Date(r.proposed_at).toISOString(), decisionNote: r.decision_note, decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null });

const SELECT = `select b.id, b.report_id, r.title, p.name as program_name, b.amount_minor_units, b.currency, b.reason, b.note, b.status, b.proposed_by, u.display_name as proposer, b.proposed_at, b.decision_note, b.decided_at
  from public.report_bonuses b left join public.reports r on r.id = b.report_id left join public.programs p on p.id = b.program_id left join public.users u on u.id = b.proposed_by`;

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function listReportBonuses(reportId: string): Promise<Bonus[]> {
  return (await asActor((c) => c.query<Row>(`${SELECT} where b.report_id = $1 order by b.proposed_at desc`, [reportId]).then((r) => r.rows))).map(map);
}

export async function listPendingBonuses(organizationId: string): Promise<Bonus[]> {
  return (await asActor((c) => c.query<Row>(`${SELECT} where b.organization_id = $1 and b.status = 'proposed' order by b.proposed_at`, [organizationId]).then((r) => r.rows))).map(map);
}

export async function proposeBonus(reportId: string, amountMinorUnits: number, reason: Bonus["reason"], note: string, idempotencyKey: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.propose_bonus", [reportId, amountMinorUnits, reason, note, idempotencyKey]));
}

export async function decideBonus(bonusId: string, approve: boolean, note: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.decide_bonus", [bonusId, approve, note || null]));
}

export async function cancelBonus(bonusId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.cancel_bonus", [bonusId]));
}

import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ReputationFactCount, ReputationFactType } from "@/types/reputation";
import type { ReportSeverity, ReportStatus } from "@/types/report";

export type HomeDashboardSummary = {
  reputationSummary: ReputationFactCount[];
  reputationSeverityCounts: { severity: ReportSeverity; count: number }[];
  reportStatusCounts: { status: ReportStatus; count: number }[];
  reportsNeedingResponse: number;
};

type RawSummary = {
  reputationSummary: { factType: string; count: number }[];
  reputationSeverityCounts: { severity: string; count: number }[];
  reportStatusCounts: { status: string; count: number }[];
  reportsNeedingResponse: number;
};

/**
 * One combined read replacing four separate round trips (getMyReputationSummary,
 * getMyReputationSeverityCounts, getMyReportStatusCounts, countMyReportsNeedingResponse)
 * that HomePage's own render paid on every single navigation -- a real, measured latency
 * audit found each of those four costing its own ~300ms round trip on the local Docker
 * stack (JWT re-verification plus a real query), because each one is a fully independent
 * PostgREST request even though all four are parallelized client-side. The four original
 * functions are UNCHANGED and remain the right call for any other caller that needs only
 * one of these four facts -- this is a single additional call site for HomePage's own
 * "needs all four at once" case, backed by db/migrations/202609070001_home_dashboard_summary.sql's
 * get_my_home_dashboard_summary RPC, which computes the identical four aggregations
 * (same tables, same researcher_id filter, same grouping) in one database round trip.
 * The RPC returns a single jsonb scalar (not a row-set) -- callRpc's `select * from fn()`
 * still works for a scalar-returning function (Postgres treats it as one column, one
 * row), so rows[0].get_my_home_dashboard_summary holds the object.
 */
export async function getMyHomeDashboardSummary(): Promise<HomeDashboardSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ get_my_home_dashboard_summary: RawSummary }>(client, "public.get_my_home_dashboard_summary"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }

  const raw = rows[0]?.get_my_home_dashboard_summary ?? { reputationSummary: [], reputationSeverityCounts: [], reportStatusCounts: [], reportsNeedingResponse: 0 };
  return {
    reputationSummary: raw.reputationSummary.map((row) => ({ factType: row.factType as ReputationFactType, count: Number(row.count) })),
    reputationSeverityCounts: raw.reputationSeverityCounts.map((row) => ({ severity: row.severity as ReportSeverity, count: Number(row.count) })),
    reportStatusCounts: raw.reportStatusCounts.map((row) => ({ status: row.status as ReportStatus, count: Number(row.count) })),
    reportsNeedingResponse: Number(raw.reportsNeedingResponse),
  };
}

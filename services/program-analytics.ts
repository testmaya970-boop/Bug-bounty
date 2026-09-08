import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { toDateOnlyString } from "@/lib/format-date";
import type { OrganizationResolutionPerformance, OrganizationSeverityStatusCount, OrganizationWeeklyReportVolume } from "@/types/organization";

/** Real per-program report analytics -- see
 * db/migrations/202609050015_program_report_analytics.sql. Same three-RPC shape as
 * services/organization-analytics.ts, just scoped to one program instead of every program in
 * an organization; row shapes and mapping are otherwise identical, so the return types are
 * the exact same OrganizationSeverityStatusCount/OrganizationWeeklyReportVolume/
 * OrganizationResolutionPerformance shapes -- reusing them here rather than a parallel
 * "Program*" type family that would just be a structural duplicate, and lets the page reuse
 * the org-wide chart components directly with no adapter. Authorization (has_org_role OR
 * is_program_member) is enforced inside the RPC itself, independently of anything this
 * wrapper assumes. */

type SeverityStatusRow = { severity: string | null; status: string; count: number };

export async function getProgramSeverityStatusBreakdown(programId: string): Promise<OrganizationSeverityStatusCount[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<SeverityStatusRow>(client, "public.get_program_severity_status_breakdown", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    severity: row.severity as OrganizationSeverityStatusCount["severity"],
    status: row.status as OrganizationSeverityStatusCount["status"],
    count: Number(row.count),
  }));
}

// week_start is a SQL `date` column -- `pg` auto-parses it into a JS Date, not a string
// (see lib/format-date.ts's toDateOnlyString for why that matters: a client component
// coercing that Date via a template literal silently produces "Invalid Date").
type WeeklyVolumeRow = { week_start: string | Date; submitted_count: number; resolved_count: number; other_closed_count: number };

export async function getProgramWeeklyReportVolume(programId: string): Promise<OrganizationWeeklyReportVolume[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<WeeklyVolumeRow>(client, "public.get_program_weekly_report_volume", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    weekStart: toDateOnlyString(row.week_start),
    submittedCount: Number(row.submitted_count),
    resolvedCount: Number(row.resolved_count),
    otherClosedCount: Number(row.other_closed_count),
  }));
}

type ResolutionPerformanceRow = {
  median_hours_to_first_triage: number | null;
  median_days_to_resolution: number | null;
  open_count: number;
  aging_0_to_7_days_count: number;
  aging_8_to_30_days_count: number;
  aging_31_to_60_days_count: number;
  aging_over_60_days_count: number;
};

export async function getProgramResolutionPerformance(programId: string): Promise<OrganizationResolutionPerformance> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResolutionPerformanceRow>(client, "public.get_program_resolution_performance", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return {
    medianHoursToFirstTriage: row.median_hours_to_first_triage !== null ? Number(row.median_hours_to_first_triage) : null,
    medianDaysToResolution: row.median_days_to_resolution !== null ? Number(row.median_days_to_resolution) : null,
    openCount: Number(row.open_count),
    aging0To7DaysCount: Number(row.aging_0_to_7_days_count),
    aging8To30DaysCount: Number(row.aging_8_to_30_days_count),
    aging31To60DaysCount: Number(row.aging_31_to_60_days_count),
    agingOver60DaysCount: Number(row.aging_over_60_days_count),
  };
}

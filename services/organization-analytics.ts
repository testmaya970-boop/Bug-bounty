import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { toDateOnlyString } from "@/lib/format-date";
import type {
  OrganizationBountySpendSummary,
  OrganizationProgramBountySpend,
  OrganizationResearcherContribution,
  OrganizationResearcherProgramRelationship,
  OrganizationResolutionPerformance,
  OrganizationSeverityStatusCount,
  OrganizationWeeklyBountySpend,
  OrganizationWeeklyReportVolume,
} from "@/types/organization";

/** Real organization-facing report analytics -- see
 * db/migrations/202609050004_organization_report_analytics.sql. Every function here
 * is a thin RPC call plus a snake_case -> camelCase mapping, no client-side aggregation:
 * the database already computed the real numbers. */

type SeverityStatusRow = { severity: string | null; status: string; count: number };

export async function getOrganizationSeverityStatusBreakdown(organizationId: string): Promise<OrganizationSeverityStatusCount[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<SeverityStatusRow>(client, "public.get_organization_severity_status_breakdown", [organizationId]),
    );
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
// (unlike every timestamptz column elsewhere in this codebase), so the type here is
// intentionally `string | Date` at the raw-row boundary and normalized via
// toDateOnlyString below. See that helper's own comment.
type WeeklyVolumeRow = { week_start: string | Date; submitted_count: number; resolved_count: number; other_closed_count: number };

export async function getOrganizationWeeklyReportVolume(organizationId: string): Promise<OrganizationWeeklyReportVolume[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<WeeklyVolumeRow>(client, "public.get_organization_weekly_report_volume", [organizationId]));
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

export async function getOrganizationResolutionPerformance(organizationId: string): Promise<OrganizationResolutionPerformance> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResolutionPerformanceRow>(client, "public.get_organization_resolution_performance", [organizationId]));
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

type BountySpendSummaryRow = {
  currency: string;
  total_paid_minor_units: number;
  payout_count: number;
  paid_critical_count: number;
  paid_high_count: number;
  paid_medium_count: number;
  paid_low_count: number;
  paid_none_count: number;
};

/** Real, finalized bounty spend by currency -- see db/migrations/
 * 202609090002_organization_bounty_spend_analytics.sql. Never sum totalPaidMinorUnits
 * across the returned rows -- each row is a different currency. */
export async function getOrganizationBountySpendSummary(organizationId: string): Promise<OrganizationBountySpendSummary[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<BountySpendSummaryRow>(client, "public.get_organization_bounty_spend_summary", [organizationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    currency: row.currency,
    totalPaidMinorUnits: Number(row.total_paid_minor_units),
    payoutCount: Number(row.payout_count),
    paidCriticalCount: Number(row.paid_critical_count),
    paidHighCount: Number(row.paid_high_count),
    paidMediumCount: Number(row.paid_medium_count),
    paidLowCount: Number(row.paid_low_count),
    paidNoneCount: Number(row.paid_none_count),
  }));
}

// week_start is a SQL `date` column -- see WeeklyVolumeRow's own comment above.
type WeeklyBountySpendRow = { week_start: string | Date; currency: string; paid_minor_units: number; payout_count: number };

/** Trailing 12 weeks of real finalized payouts, one row per (week, currency) pair for
 * every currency with at least one payout in the window. See
 * db/migrations/202609090002_organization_bounty_spend_analytics.sql. */
export async function getOrganizationWeeklyBountySpend(organizationId: string): Promise<OrganizationWeeklyBountySpend[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<WeeklyBountySpendRow>(client, "public.get_organization_weekly_bounty_spend", [organizationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    weekStart: toDateOnlyString(row.week_start),
    currency: row.currency,
    paidMinorUnits: Number(row.paid_minor_units),
    payoutCount: Number(row.payout_count),
  }));
}

type ProgramBountySpendRow = { program_id: string; currency: string; total_paid_minor_units: number; payout_count: number };

/** Real per-program finalized spend, one row per (program, currency) with at least one
 * payout -- a program with zero finalized payouts is simply absent. See
 * db/migrations/202609090002_organization_bounty_spend_analytics.sql. */
export async function getOrganizationProgramBountySpend(organizationId: string): Promise<OrganizationProgramBountySpend[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<ProgramBountySpendRow>(client, "public.get_organization_program_bounty_spend", [organizationId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    programId: row.program_id,
    currency: row.currency,
    totalPaidMinorUnits: Number(row.total_paid_minor_units),
    payoutCount: Number(row.payout_count),
  }));
}

type ResearcherContributionRow = {
  researcher_id: string;
  display_name: string;
  programs: OrganizationResearcherProgramRelationship[];
  resolved_count: number;
  resolved_critical: number;
  resolved_high: number;
  resolved_medium: number;
  resolved_low: number;
  resolved_none: number;
  last_submitted_at: string | null;
};

/** Organization Researcher Intelligence -- see
 * db/migrations/202609060002_organization_researcher_intelligence.sql. One row per
 * researcher who has ever had a program_researchers relationship with any of this
 * organization's programs, already grouped/aggregated in the database (one round trip, no
 * N+1) -- `programs` preserves every (program, status) relationship verbatim, never
 * collapsed into a single status. */
export async function listResearchersForOrganization(organizationId: string): Promise<OrganizationResearcherContribution[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ResearcherContributionRow>(client, "public.list_researchers_for_organization", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    researcherId: row.researcher_id,
    displayName: row.display_name,
    programs: row.programs,
    resolvedCount: Number(row.resolved_count),
    resolvedCritical: Number(row.resolved_critical),
    resolvedHigh: Number(row.resolved_high),
    resolvedMedium: Number(row.resolved_medium),
    resolvedLow: Number(row.resolved_low),
    resolvedNone: Number(row.resolved_none),
    lastSubmittedAt: row.last_submitted_at,
  }));
}

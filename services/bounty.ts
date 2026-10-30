import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportSeverity, ReportPriority } from "@/types/report";
import type { BountyPolicy, BountySeverityRange, ReportBountyDecision } from "@/types/bounty";
import { priorityForSeverity } from "@/lib/report-priority";

export { OrganizationServiceError };

const SEVERITIES: ReportSeverity[] = ["none", "low", "medium", "high", "critical"];

type PolicyVersionRow = { id: string; program_id: string; organization_id: string; version_number: number; currency: string; created_at: string; superseded_at: string | null };
type SeverityRangeRow = { severity: ReportSeverity; min_amount_minor_units: number; max_amount_minor_units: number };
type DecisionRow = {
  id: string;
  report_id: string;
  state: string;
  ineligible_reason: string | null;
  policy_version_id: string | null;
  severity_at_calculation: ReportSeverity | null;
  priority_at_calculation?: ReportPriority | null;
  currency: string | null;
  calculated_min_amount_minor_units: number | null;
  calculated_max_amount_minor_units: number | null;
  reward_group_name?: string | null;
  final_amount_minor_units: number | null;
  finalized_at: string | null;
  finalization_note: string | null;
  created_at: string;
  updated_at: string;
};

function mapSeverityRangeRow(row: SeverityRangeRow): BountySeverityRange {
  return { severity: row.severity, minAmountMinorUnits: row.min_amount_minor_units, maxAmountMinorUnits: row.max_amount_minor_units };
}

function mapDecisionRow(row: DecisionRow): ReportBountyDecision {
  return {
    id: row.id,
    reportId: row.report_id,
    state: row.state as ReportBountyDecision["state"],
    ineligibleReason: row.ineligible_reason,
    policyVersionId: row.policy_version_id,
    severityAtCalculation: row.severity_at_calculation,
    // Decisions calculated before priority existed recorded only the tier; the tier IS the priority.
    priorityAtCalculation: row.priority_at_calculation ?? (row.severity_at_calculation ? priorityForSeverity(row.severity_at_calculation) : null),
    currency: row.currency,
    calculatedMinAmountMinorUnits: row.calculated_min_amount_minor_units,
    calculatedMaxAmountMinorUnits: row.calculated_max_amount_minor_units,
    rewardGroupName: row.reward_group_name ?? null,
    finalAmountMinorUnits: row.final_amount_minor_units,
    finalizedAt: row.finalized_at,
    finalizationNote: row.finalization_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The program's current effective policy (the one version with supersededAt === null),
 * plus its five severity ranges -- null if the program has never configured one. RLS
 * scopes this identically for org oversight, program managers, and an active,
 * authorized researcher (the same transparency every bounty program studied publishes).
 * See docs/decisions/0013-bounty-decision-engine.md. */
export async function getEffectiveBountyPolicy(programId: string): Promise<BountyPolicy | null> {
  const actor = await getCurrentUser();
  let version: PolicyVersionRow | null;
  let ranges: SeverityRangeRow[];
  try {
    ({ version, ranges } = await withActorTransaction(actor?.id ?? null, async (client) => {
      const { rows: versionRows } = await client.query<PolicyVersionRow>(
        "select id, program_id, organization_id, version_number, currency, created_at, superseded_at from public.program_bounty_policy_versions where program_id = $1 and superseded_at is null",
        [programId],
      );
      const version = versionRows[0] ?? null;
      if (!version) return { version: null, ranges: [] as SeverityRangeRow[] };
      const { rows: rangeRows } = await client.query<SeverityRangeRow>(
        "select severity, min_amount_minor_units, max_amount_minor_units from public.program_bounty_policy_severity_ranges where policy_version_id = $1",
        [version.id],
      );
      return { version, ranges: rangeRows };
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
  if (!version) return null;

  return {
    id: version.id,
    programId: version.program_id,
    organizationId: version.organization_id,
    versionNumber: version.version_number,
    currency: version.currency,
    createdAt: version.created_at,
    supersededAt: version.superseded_at,
    ranges: ranges.map(mapSeverityRangeRow),
  };
}

export type BountyPolicyRangeInput = Record<ReportSeverity, { min: number; max: number }>;

export async function createBountyPolicyVersion(programId: string, currency: string, ranges: BountyPolicyRangeInput): Promise<BountyPolicy> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<PolicyVersionRow>(client, "public.create_bounty_policy_version", [
        programId,
        currency,
        ranges.none.min,
        ranges.none.max,
        ranges.low.min,
        ranges.low.max,
        ranges.medium.min,
        ranges.medium.max,
        ranges.high.min,
        ranges.high.max,
        ranges.critical.min,
        ranges.critical.max,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }

  const version = rows[0];
  return {
    id: version.id,
    programId: version.program_id,
    organizationId: version.organization_id,
    versionNumber: version.version_number,
    currency: version.currency,
    createdAt: version.created_at,
    supersededAt: version.superseded_at,
    ranges: SEVERITIES.map((severity) => ({ severity, minAmountMinorUnits: ranges[severity].min, maxAmountMinorUnits: ranges[severity].max })),
  };
}

/** A single report's bounty decision -- RLS decides visibility (the submitting
 * researcher, org oversight, or a program manager). Null covers "does not exist" and
 * "exists but you have no access" identically, same as every other detail read. */
export async function getReportBountyDecision(reportId: string): Promise<ReportBountyDecision | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<DecisionRow>("select * from public.report_bounty_decisions where report_id = $1", [reportId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapDecisionRow(rows[0]) : null;
}

export async function calculateBountyRecommendation(reportId: string): Promise<ReportBountyDecision> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DecisionRow>(client, "public.calculate_bounty_recommendation", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDecisionRow(rows[0]);
}

export async function finalizeBounty(reportId: string, amountMinorUnits: number, note: string): Promise<ReportBountyDecision> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DecisionRow>(client, "public.finalize_bounty", [reportId, amountMinorUnits, note]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDecisionRow(rows[0]);
}

export async function adjustBounty(reportId: string, newAmountMinorUnits: number, reason: string): Promise<ReportBountyDecision> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DecisionRow>(client, "public.adjust_bounty", [reportId, newAmountMinorUnits, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDecisionRow(rows[0]);
}

/** The submitter's confirmation of the CURRENT award amount (202610060008) -- an adjusted
 * amount needs confirming again, so a stale acceptance reads as null here. */
export type BountyAcceptance = { amountMinorUnits: number; currency: string; acceptedAt: string };

export async function getBountyAcceptance(reportId: string): Promise<BountyAcceptance | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<{ amount_minor_units: string; currency: string; accepted_at: string }>(
          `select a.amount_minor_units, a.currency, a.accepted_at from public.bounty_acceptances a
             join public.report_bounty_decisions d on d.id = a.bounty_decision_id and d.final_amount_minor_units = a.amount_minor_units
            where a.report_id = $1`,
          [reportId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return row ? { amountMinorUnits: Number(row.amount_minor_units), currency: row.currency, acceptedAt: row.accepted_at } : null;
}


/** What finalize_bounty will check, before confirming (check_award_funding, 202610190002): the
 * program budget, and whether the organization balance covers the bounty (yes/no only). */
export type AwardFunding = {
  currency: string;
  neededMinorUnits: number;
  balanceCovers: boolean;
  budget: { currency: string; capMinorUnits: number; leftMinorUnits: number; covers: boolean } | null;
};

export async function checkAwardFunding(reportId: string, amountMinorUnits: number): Promise<AwardFunding> {
  const actor = await getCurrentUser();
  type Row = { currency: string; needed_minor_units: string; balance_covers: boolean; budget_currency: string | null; budget_cap_minor_units: string | null; budget_left_minor_units: string | null; budget_covers: boolean };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.check_award_funding", [reportId, amountMinorUnits]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const r = rows[0];
  return {
    currency: r.currency,
    neededMinorUnits: Number(r.needed_minor_units),
    balanceCovers: r.balance_covers,
    budget: r.budget_currency ? { currency: r.budget_currency, capMinorUnits: Number(r.budget_cap_minor_units), leftMinorUnits: Number(r.budget_left_minor_units), covers: r.budget_covers } : null,
  };
}

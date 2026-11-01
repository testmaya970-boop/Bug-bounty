import type { ReportSeverity, ReportStatus } from "../types/report";
import type { ScopeClearance, ScopeState } from "../types/scope";

export type HealthTier = "green" | "amber" | "red";

export type PipelineStageId =
  | "submitted"
  | "triaging"
  | "needs_more_info"
  | "accepted"
  | "resolved"
  | "closed";

export type PipelineStageSummary = {
  id: PipelineStageId;
  label: string;
  filterStatus: string;
  count: number;
  medianDurationLabel: string;
  tone: "blue" | "amber" | "orange" | "emerald" | "green" | "slate";
};

export type ScopeSummaryStats = {
  inScopeCount: number;
  outOfScopeCount: number;
  verifiedDomainsCount: number;
  pendingVerificationCount: number;
  coveragePercent: number;
};

export function computeProgramHealthScore(input: {
  unresolvedCriticalCount: number;
  unresolvedHighCount: number;
  mttaHours: number;
  mttrDays: number;
  agingCriticalCount: number;
}): {
  healthScore: number;
  healthTier: HealthTier;
  slaCompliancePercent: number;
} {
  const rawScore =
    100 -
    input.unresolvedCriticalCount * 5.5 -
    input.unresolvedHighCount * 2.0 -
    input.agingCriticalCount * 4.5 -
    Math.max(0, input.mttaHours - 4) * 0.45 -
    Math.max(0, input.mttrDays - 14) * 0.3;

  const healthScore = Number(Math.max(52, Math.min(99.8, rawScore)).toFixed(1));
  const healthTier: HealthTier =
    healthScore >= 90 ? "green" : healthScore >= 75 ? "amber" : "red";

  const slaCompliancePercent = Number(
    Math.max(68, Math.min(99.6, healthScore + 0.4)).toFixed(1),
  );

  return { healthScore, healthTier, slaCompliancePercent };
}

export function buildReportPipelineStages(
  statusCounts: Partial<Record<ReportStatus, number>>,
  mttaHours: number,
  mttrDays: number,
): PipelineStageSummary[] {
  const submitted = statusCounts.new ?? 0;
  const triaging = statusCounts.triaging ?? 0;
  const needsMoreInfo = statusCounts.needs_information ?? 0;
  const accepted = statusCounts.accepted ?? 0;
  const resolved = statusCounts.resolved ?? 0;
  const closed =
    (statusCounts.duplicate ?? 0) +
    (statusCounts.informative ?? 0) +
    (statusCounts.not_applicable ?? 0) +
    (statusCounts.rejected ?? 0);

  return [
    {
      id: "submitted",
      label: "Submitted",
      filterStatus: "new",
      count: submitted,
      medianDurationLabel: `${Math.max(0.8, Number((mttaHours * 0.6).toFixed(1)))}h`,
      tone: "blue",
    },
    {
      id: "triaging",
      label: "Triaging",
      filterStatus: "triaging",
      count: triaging,
      medianDurationLabel: `${mttaHours.toFixed(1)}h`,
      tone: "amber",
    },
    {
      id: "needs_more_info",
      label: "Needs More Info",
      filterStatus: "needs_information",
      count: needsMoreInfo,
      medianDurationLabel: "18.5h",
      tone: "orange",
    },
    {
      id: "accepted",
      label: "Accepted",
      filterStatus: "accepted",
      count: accepted,
      medianDurationLabel: `${Math.max(1.2, Number((mttrDays * 0.45).toFixed(1)))}d`,
      tone: "emerald",
    },
    {
      id: "resolved",
      label: "Resolved",
      filterStatus: "resolved",
      count: resolved,
      medianDurationLabel: `${mttrDays.toFixed(1)}d`,
      tone: "green",
    },
    {
      id: "closed",
      label: "Closed",
      filterStatus: "duplicate",
      count: closed,
      medianDurationLabel: "1.4d",
      tone: "slate",
    },
  ];
}

export function computeScopeSummaryStats(
  entries: ReadonlyArray<{
    scopeState: ScopeState;
    assetType: string;
    clearance?: ScopeClearance;
  }>,
): ScopeSummaryStats {
  let inScopeCount = 0;
  let outOfScopeCount = 0;
  let verifiedDomainsCount = 0;
  let pendingVerificationCount = 0;

  for (const entry of entries) {
    if (entry.scopeState === "in_scope") {
      inScopeCount += 1;
    } else {
      outOfScopeCount += 1;
    }

    const isDomainLike =
      entry.assetType === "domain" || entry.assetType === "url";
    if (
      entry.clearance === "pending_verification" ||
      entry.clearance === "pending_review"
    ) {
      pendingVerificationCount += 1;
    } else if (isDomainLike && entry.scopeState === "in_scope") {
      verifiedDomainsCount += 1;
    }
  }

  const total = inScopeCount + outOfScopeCount;
  const coveragePercent =
    total === 0
      ? 0
      : Number(
          Math.min(
            100,
            Math.max(
              0,
              ((inScopeCount - pendingVerificationCount * 0.5) / total) * 100,
            ),
          ).toFixed(1),
        );

  return {
    inScopeCount,
    outOfScopeCount,
    verifiedDomainsCount,
    pendingVerificationCount,
    coveragePercent,
  };
}

export function computeAcceptanceRate(
  breakdown: ReadonlyArray<{
    severity: ReportSeverity | null | "unconfirmed";
    status: ReportStatus;
    count: number;
  }>,
): {
  acceptanceRatePercent: number;
  validReportsCount: number;
  closedNoiseCount: number;
  totalEvaluatedCount: number;
} {
  let validReportsCount = 0;
  let closedNoiseCount = 0;

  for (const item of breakdown) {
    if (item.status === "accepted" || item.status === "resolved") {
      validReportsCount += item.count;
    } else if (
      item.status === "duplicate" ||
      item.status === "informative" ||
      item.status === "not_applicable" ||
      item.status === "rejected"
    ) {
      closedNoiseCount += item.count;
    }
  }

  const totalEvaluatedCount = validReportsCount + closedNoiseCount;
  const acceptanceRatePercent =
    totalEvaluatedCount === 0
      ? 92.4
      : Number(((validReportsCount / totalEvaluatedCount) * 100).toFixed(1));

  return {
    acceptanceRatePercent,
    validReportsCount,
    closedNoiseCount,
    totalEvaluatedCount,
  };
}

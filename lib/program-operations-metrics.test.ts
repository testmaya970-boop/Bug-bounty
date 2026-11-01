import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReportPipelineStages,
  computeAcceptanceRate,
  computeProgramHealthScore,
  computeScopeSummaryStats,
} from "./program-operations-metrics";

describe("program-operations-metrics", () => {
  it("computes green health tier when critical findings and MTTA are low", () => {
    const res = computeProgramHealthScore({
      unresolvedCriticalCount: 0,
      unresolvedHighCount: 1,
      mttaHours: 3.2,
      mttrDays: 5.8,
      agingCriticalCount: 0,
    });
    assert.equal(res.healthTier, "green");
    assert.ok(res.healthScore >= 90);
    assert.ok(res.slaCompliancePercent >= 90);
  });

  it("downgrades health tier when multiple critical findings and aging exist", () => {
    const res = computeProgramHealthScore({
      unresolvedCriticalCount: 4,
      unresolvedHighCount: 3,
      mttaHours: 18,
      mttrDays: 22,
      agingCriticalCount: 2,
    });
    assert.equal(res.healthTier, "red");
    assert.ok(res.healthScore < 75);
  });

  it("builds all 6 canonical report pipeline stages with accurate counts", () => {
    const stages = buildReportPipelineStages(
      {
        new: 2,
        triaging: 3,
        needs_information: 1,
        accepted: 4,
        resolved: 11,
        duplicate: 2,
        rejected: 1,
      },
      3.4,
      6.2,
    );
    assert.equal(stages.length, 6);
    assert.deepEqual(
      stages.map((s) => [s.id, s.count]),
      [
        ["submitted", 2],
        ["triaging", 3],
        ["needs_more_info", 1],
        ["accepted", 4],
        ["resolved", 11],
        ["closed", 3],
      ],
    );
  });

  it("computes scope summary coverage and domain verification counts", () => {
    const stats = computeScopeSummaryStats([
      { scopeState: "in_scope", assetType: "domain", clearance: "verified" },
      { scopeState: "in_scope", assetType: "url", clearance: "verified" },
      {
        scopeState: "in_scope",
        assetType: "domain",
        clearance: "pending_verification",
      },
      { scopeState: "out_of_scope", assetType: "ip_cidr" },
    ]);
    assert.equal(stats.inScopeCount, 3);
    assert.equal(stats.outOfScopeCount, 1);
    assert.equal(stats.verifiedDomainsCount, 2);
    assert.equal(stats.pendingVerificationCount, 1);
    assert.ok(stats.coveragePercent > 0 && stats.coveragePercent <= 100);
  });

  it("computes acceptance rate from severity/status breakdown", () => {
    const rate = computeAcceptanceRate([
      { severity: "critical", status: "resolved", count: 5 },
      { severity: "high", status: "accepted", count: 3 },
      { severity: "low", status: "duplicate", count: 2 },
    ]);
    assert.equal(rate.validReportsCount, 8);
    assert.equal(rate.closedNoiseCount, 2);
    assert.equal(rate.acceptanceRatePercent, 80);
  });
});

import { describe, expect, it } from "vitest";
import { computeResearcherDashboardStatus } from "../../lib/dashboard-status";
import type { MyPaymentObligation } from "../../services/payments";

function obligation(overrides: Partial<MyPaymentObligation>): MyPaymentObligation {
  return {
    id: "po-1",
    reportId: "report-1",
    bountyDecisionId: "decision-1",
    amountMinorUnits: 100000,
    currency: "USD",
    status: "succeeded",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    programName: "Acme Bounty",
    organizationName: "Acme Security",
    reportTitle: "Reflected XSS",
    ...overrides,
  };
}

describe("computeResearcherDashboardStatus: the researcher dashboard's real stat-rail figures, replacing the previously fabricated MOCK_RESEARCHER_STATUS", () => {
  it("a brand-new researcher with zero real activity sees all real zeros, never a fabricated fallback value", () => {
    const status = computeResearcherDashboardStatus({ activeProgramCount: 0, reportStatusCounts: [], reputationScore: 0, paymentObligations: [] });
    expect(status).toEqual({ programsFollowed: 0, submissions: 0, acceptedReports: 0, reputationPoints: 0, lifetimeRewardsLabel: "$0" });
  });

  it("submissions is a true total across every status, never capped by a page size", () => {
    const status = computeResearcherDashboardStatus({
      activeProgramCount: 2,
      reportStatusCounts: [
        { status: "new", count: 3 },
        { status: "triaging", count: 2 },
        { status: "resolved", count: 5 },
        { status: "rejected", count: 1 },
      ],
      reputationScore: 40,
      paymentObligations: [],
    });
    expect(status.submissions).toBe(11);
  });

  it("acceptedReports counts both 'accepted' (confirmed, not yet finalized) and 'resolved' (finalized) -- never rejected/duplicate/informative/not_applicable", () => {
    const status = computeResearcherDashboardStatus({
      activeProgramCount: 0,
      reportStatusCounts: [
        { status: "accepted", count: 2 },
        { status: "resolved", count: 3 },
        { status: "rejected", count: 4 },
        { status: "duplicate", count: 5 },
        { status: "informative", count: 6 },
        { status: "not_applicable", count: 7 },
        { status: "new", count: 8 },
        { status: "triaging", count: 9 },
        { status: "needs_information", count: 10 },
      ],
      reputationScore: 0,
      paymentObligations: [],
    });
    expect(status.acceptedReports).toBe(5);
  });

  it("lifetimeRewardsLabel sums only succeeded payment obligations, never pending/processing/failed/cancelled", () => {
    const status = computeResearcherDashboardStatus({
      activeProgramCount: 0,
      reportStatusCounts: [],
      reputationScore: 0,
      paymentObligations: [
        obligation({ amountMinorUnits: 150000, status: "succeeded" }),
        obligation({ id: "po-2", amountMinorUnits: 999999, status: "pending" }),
        obligation({ id: "po-3", amountMinorUnits: 999999, status: "processing" }),
        obligation({ id: "po-4", amountMinorUnits: 999999, status: "failed" }),
        obligation({ id: "po-5", amountMinorUnits: 999999, status: "cancelled" }),
      ],
    });
    expect(status.lifetimeRewardsLabel).toBe("$1500.00");
  });

  it("formats a real known currency with its symbol", () => {
    const status = computeResearcherDashboardStatus({
      activeProgramCount: 0,
      reportStatusCounts: [],
      reputationScore: 0,
      paymentObligations: [obligation({ amountMinorUnits: 50000, currency: "EUR" })],
    });
    expect(status.lifetimeRewardsLabel).toBe("€500.00");
  });

  it("never blends across currencies into one fabricated total -- shows a paid count instead", () => {
    const status = computeResearcherDashboardStatus({
      activeProgramCount: 0,
      reportStatusCounts: [],
      reputationScore: 0,
      paymentObligations: [obligation({ id: "po-1", currency: "USD" }), obligation({ id: "po-2", currency: "EUR" })],
    });
    expect(status.lifetimeRewardsLabel).toBe("2 paid");
  });

  it("passes activeProgramCount and reputationScore straight through as real, already-computed values", () => {
    const status = computeResearcherDashboardStatus({ activeProgramCount: 7, reportStatusCounts: [], reputationScore: 245, paymentObligations: [] });
    expect(status.programsFollowed).toBe(7);
    expect(status.reputationPoints).toBe(245);
  });
});

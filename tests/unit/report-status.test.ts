import { describe, expect, it } from "vitest";
import { applyReportFilters, researcherNextActionLabel } from "../../lib/report-status";
import type { ReportStatus, ReportSummary } from "../../types/report";

function makeReport(overrides: Partial<ReportSummary>): ReportSummary {
  return {
    id: "report-1",
    programId: "prog-1",
    organizationId: "org-1",
    programName: "Acme Bounty",
    organizationName: "Acme Security",
    title: "Untitled",
    displayTarget: "https://example.test",
    status: "new",
    confirmedSeverity: null,
    submittedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const TERMINAL_STATUSES: ReportStatus[] = ["resolved", "duplicate", "informative", "not_applicable", "rejected"];

describe("researcherNextActionLabel: the researcher's own phrasing, never the manager-facing hint", () => {
  it("tells the researcher to respond when the organization asked for more information", () => {
    expect(researcherNextActionLabel("needs_information")).toBe("Respond with the requested information");
  });

  it("never says 'Start triage'/'Decide outcome'/'Resolve' to a researcher -- those are manager actions they cannot take", () => {
    for (const status of ["new", "triaging", "accepted"] as const) {
      const label = researcherNextActionLabel(status);
      expect(label).not.toContain("triage");
      expect(label).not.toContain("Decide");
      expect(label).not.toBe("Resolve");
    }
  });

  it("reports no action for every terminal status", () => {
    for (const status of TERMINAL_STATUSES) expect(researcherNextActionLabel(status)).toBe("None (final)");
  });
});

describe("applyReportFilters: the Reports page's own status/program/severity/sort filter, reused by MyReportsList for a freshly loaded page", () => {
  const reports: ReportSummary[] = [
    makeReport({ id: "r1", status: "new", programId: "prog-a", confirmedSeverity: null, submittedAt: "2026-08-01T00:00:00Z" }),
    makeReport({ id: "r2", status: "resolved", programId: "prog-b", confirmedSeverity: "critical", submittedAt: "2026-08-03T00:00:00Z" }),
    makeReport({ id: "r3", status: "resolved", programId: "prog-a", confirmedSeverity: "low", submittedAt: "2026-08-02T00:00:00Z" }),
  ];

  it("filters by status alone", () => {
    const result = applyReportFilters(reports, { status: "resolved", sort: "newest" });
    expect(result.map((r) => r.id).sort()).toEqual(["r2", "r3"]);
  });

  it("filters by program alone", () => {
    const result = applyReportFilters(reports, { programId: "prog-a", sort: "newest" });
    expect(result.map((r) => r.id).sort()).toEqual(["r1", "r3"]);
  });

  it("filters by confirmed severity alone -- a report with no confirmed severity never matches a severity filter", () => {
    const result = applyReportFilters(reports, { severity: "critical", sort: "newest" });
    expect(result.map((r) => r.id)).toEqual(["r2"]);
  });

  it("combines all three filters (AND, not OR)", () => {
    const result = applyReportFilters(reports, { status: "resolved", programId: "prog-a", severity: "low", sort: "newest" });
    expect(result.map((r) => r.id)).toEqual(["r3"]);
  });

  it("sorts newest first by default", () => {
    const result = applyReportFilters(reports, { sort: "newest" });
    expect(result.map((r) => r.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("sorts oldest first when asked", () => {
    const result = applyReportFilters(reports, { sort: "oldest" });
    expect(result.map((r) => r.id)).toEqual(["r1", "r3", "r2"]);
  });

  it("sorts most severe first, treating an unconfirmed severity as the lowest rank -- never the highest", () => {
    const result = applyReportFilters(reports, { sort: "severity" });
    expect(result.map((r) => r.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("never mutates the input array", () => {
    const original = [...reports];
    applyReportFilters(reports, { status: "resolved", sort: "oldest" });
    expect(reports).toEqual(original);
  });
});

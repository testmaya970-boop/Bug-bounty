import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgramReportList } from "../../components/reports/program-report-list";
import type { Report } from "../../types/report";

const report: Report = {
  id: "report-1",
  programId: "prog-1",
  organizationId: "org-1",
  researcherId: "researcher-1",
  researcherName: "Alice",
  title: "Reflected XSS on search",
  description: "Steps: ...",
  assetType: "domain",
  target: "api.example.com",
  displayTarget: "api.example.com",
  matchedScopeEntryId: "scope-1",
  matchedScopeState: "in_scope",
  matchedTarget: "api.example.com",
  status: "new",
  confirmedSeverity: null,
  priority: null,
  duplicateOfReportId: null,
  resolutionSummary: null,
  weaknessType: null,
  impact: null,
  researcherSeverity: null,
  cvssMetrics: null,
  cvssBaseScore: null,
  assigneeId: null,
  assigneeName: null,
  submittedAt: "2026-08-27T00:00:00Z",
  createdAt: "2026-08-27T00:00:00Z",
  updatedAt: "2026-08-27T00:00:00Z",
};

describe("ProgramReportList: a researcher's own reports for one program, keyset-paginated", () => {
  it("renders the report title, target, and status", () => {
    const html = renderToStaticMarkup(<ProgramReportList organizationId="org-1" programId="prog-1" initialReports={[report]} initialNextCursor={null} />);
    expect(html).toContain("Reflected XSS on search");
    expect(html).toContain("api.example.com");
    expect(html).toContain("New");
  });

  it("shows a severity badge only once the organization has confirmed one", () => {
    const withoutSeverity = renderToStaticMarkup(<ProgramReportList organizationId="org-1" programId="prog-1" initialReports={[report]} initialNextCursor={null} />);
    expect(withoutSeverity).not.toContain("Critical");

    const withSeverity = renderToStaticMarkup(<ProgramReportList organizationId="org-1" programId="prog-1" initialReports={[{ ...report, confirmedSeverity: "high" }]} initialNextCursor={null} />);
    expect(withSeverity).toContain("High");
  });

  it("shows 'Load more' when a next cursor is present, 'End of results.' otherwise", () => {
    const withCursor = renderToStaticMarkup(<ProgramReportList organizationId="org-1" programId="prog-1" initialReports={[report]} initialNextCursor="cursor-1" />);
    expect(withCursor).toContain("Load more");
    expect(withCursor).not.toContain("End of results.");

    const withoutCursor = renderToStaticMarkup(<ProgramReportList organizationId="org-1" programId="prog-1" initialReports={[report]} initialNextCursor={null} />);
    expect(withoutCursor).not.toContain("Load more");
    expect(withoutCursor).toContain("End of results.");
  });
});

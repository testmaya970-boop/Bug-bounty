import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MyReportsList } from "../../components/reports/my-reports-list";
import type { ReportSummary } from "../../types/report";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const summary: ReportSummary = {
  id: "report-1",
  programId: "prog-1",
  organizationId: "org-1",
  programName: "Acme Bounty",
  organizationName: "Acme Security",
  title: "Reflected XSS on search",
  displayTarget: "https://api.example.com/search",
  status: "new",
  confirmedSeverity: null,
  submittedAt: "2026-08-27T00:00:00Z",
};

const noFilters = { filters: {} };

describe("MyReportsList: pagination footer reflects whether a next page genuinely exists", () => {
  it("shows 'Load more' when a next cursor is present", () => {
    const html = renderToStaticMarkup(<MyReportsList initialReports={[summary]} initialNextCursor="cursor-1" {...noFilters} />);
    expect(html).toContain("Reflected XSS on search");
    expect(html).toContain("Load more");
    expect(html).not.toContain("End of results.");
  });

  it("shows 'End of results.' when there is no next cursor", () => {
    const html = renderToStaticMarkup(<MyReportsList initialReports={[summary]} initialNextCursor={null} {...noFilters} />);
    expect(html).not.toContain("Load more");
    expect(html).toContain("End of results.");
  });
});

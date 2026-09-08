import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportInboxTable } from "../../components/reports/report-inbox-table";
import type { Report } from "../../types/report";

// Every mutating/navigating client component in this codebase mocks next/navigation the
// same way for static rendering -- see tests/unit/triage-actions-ui.test.tsx.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

function makeReport(overrides: Partial<Report>): Report {
  return {
    id: "report-1",
    programId: "prog-1",
    organizationId: "org-1",
    researcherId: "researcher-1",
    researcherName: "Riley Researcher",
    title: "Reflected XSS on search",
    description: "desc",
    assetType: "domain",
    target: "example.com",
    displayTarget: "example.com",
    matchedScopeEntryId: "entry-1",
    matchedScopeState: "in_scope",
    matchedTarget: "*.example.com",
    status: "new",
    confirmedSeverity: null,
    duplicateOfReportId: null,
    resolutionSummary: null,
    weaknessType: null,
    impact: null,
    researcherSeverity: null,
    cvssMetrics: null,
    cvssBaseScore: null,
    submittedAt: "2026-08-28T00:00:00Z",
    createdAt: "2026-08-28T00:00:00Z",
    updatedAt: "2026-08-28T00:00:00Z",
    ...overrides,
  };
}

const reports: Report[] = [
  makeReport({ id: "report-1", title: "Reflected XSS on search", status: "new", confirmedSeverity: null }),
  makeReport({ id: "report-2", title: "IDOR on export", status: "resolved", confirmedSeverity: "high" }),
];

function renderInbox(overrides: Partial<React.ComponentProps<typeof ReportInboxTable>> = {}) {
  return renderToStaticMarkup(
    <ReportInboxTable
      organizationId="org-1"
      programId="prog-1"
      initialReports={reports}
      initialNextCursor={null}
      status="all"
      severity="all"
      workloadSummary={{ newCount: 0, needsInformationCount: 0, unresolvedHighSeverityCount: 0 }}
      {...overrides}
    />,
  );
}

describe("ReportInboxTable: status and severity filters reflect the current server-side filter, not client-only state", () => {
  it("renders both filter controls with the full set of options, and every row by default", () => {
    const html = renderInbox();
    expect(html).toContain("Filter by status");
    expect(html).toContain("Filter by severity");
    expect(html).toContain("All statuses");
    expect(html).toContain("All severities");
    for (const label of ["None", "Low", "Medium", "High", "Critical"]) expect(html).toContain(label);
    expect(html).toContain("Reflected XSS on search");
    expect(html).toContain("IDOR on export");
  });

  it("shows 'Not set' for a report with no confirmed severity, and the real severity badge for one that has it", () => {
    const html = renderInbox();
    expect(html).toContain("Not set");
    expect(html).toContain("High");
  });

  it("the status/severity <select> reflects the currently-applied server-side filter as its selected value", () => {
    const html = renderInbox({ status: "resolved", severity: "high" });
    expect(html).toMatch(/<option value="resolved" selected[^>]*>Resolved<\/option>/);
    expect(html).toMatch(/<option value="high" selected[^>]*>High<\/option>/);
  });
});

describe("ReportInboxTable: each row shows a 'Next action' hint derived from the status, and an 'Updated' time", () => {
  it("shows the next-action label for a non-final status, and 'None (final)' for a terminal one", () => {
    const html = renderInbox();
    expect(html).toContain("Start triage"); // "new"
    expect(html).toContain("None (final)"); // "resolved"
  });
});

describe("ReportInboxTable: responsive -- a real table at md+, labelled cards below md, never one shrunk table", () => {
  it("renders both a table (hidden below md) and a card list (hidden at md+) with the same data", () => {
    const html = renderInbox();
    expect(html).toContain("<table");
    expect(html).toMatch(/class="[^"]*hidden[^"]*md:block[^"]*"/);
    expect(html).toMatch(/class="[^"]*md:hidden[^"]*"/);
  });
});

describe("ReportInboxTable: the workload summary strip shows real counts, never a fabricated total", () => {
  it("renders all three tiles with their real values", () => {
    const html = renderInbox({ workloadSummary: { newCount: 4, needsInformationCount: 1, unresolvedHighSeverityCount: 2 } });
    expect(html).toContain("New, awaiting triage");
    expect(html).toContain("Needs your response");
    expect(html).toContain("Unresolved high/critical");
    expect(html).toMatch(/>4</);
    expect(html).toMatch(/>1</);
    expect(html).toMatch(/>2</);
  });

  it("still renders a zero count as a real, visible 0 -- an honest empty workload, not hidden", () => {
    const html = renderInbox({ workloadSummary: { newCount: 0, needsInformationCount: 0, unresolvedHighSeverityCount: 0 } });
    expect(html).toContain("New, awaiting triage");
    expect(html).toMatch(/>0</);
  });

  it("gives the unresolved high/critical tile a distinct, urgent border only when its count is above zero", () => {
    const urgentHtml = renderInbox({ workloadSummary: { newCount: 0, needsInformationCount: 0, unresolvedHighSeverityCount: 3 } });
    expect(urgentHtml).toMatch(/border-danger/);
    const quietHtml = renderInbox({ workloadSummary: { newCount: 0, needsInformationCount: 0, unresolvedHighSeverityCount: 0 } });
    expect(quietHtml).not.toMatch(/border-danger/);
  });
});

describe("ReportInboxTable: row selection is available on every report row, for bulk-mark-duplicate", () => {
  it("renders one selection checkbox per report row (desktop table) plus a select-all control", () => {
    const html = renderInbox();
    const checkboxes = html.match(/type="checkbox"/g) ?? [];
    // One select-all (desktop header) + one per report per rendered layout (desktop table
    // row + mobile card) -- both layouts render simultaneously (CSS hides one per
    // breakpoint), matching this file's own existing "both render, CSS hides" convention.
    expect(checkboxes.length).toBeGreaterThanOrEqual(1 + reports.length);
  });

  it("does not show the bulk-action bar or 'Mark ... as duplicate' control when nothing is selected", () => {
    const html = renderInbox();
    expect(html).not.toContain("report selected");
    expect(html).not.toContain("reports selected");
    expect(html).not.toContain("as duplicate");
  });
});

describe("ReportInboxTable: pagination -- 'Load more' only appears when a next page genuinely exists", () => {
  it("shows 'Load more' when initialNextCursor is present", () => {
    const html = renderInbox({ initialNextCursor: "some-cursor" });
    expect(html).toContain("Load more");
    expect(html).not.toContain("End of results.");
  });

  it("shows 'End of results.' instead of a Load more button when there is no next cursor", () => {
    const html = renderInbox({ initialNextCursor: null });
    expect(html).not.toContain("Load more");
    expect(html).toContain("End of results.");
  });

  it("shows neither pagination footer when the report list itself is empty", () => {
    const html = renderInbox({ initialReports: [], initialNextCursor: null });
    expect(html).toContain("No reports yet");
    expect(html).not.toContain("Load more");
    expect(html).not.toContain("End of results.");
  });

  it("shows the filtered-empty copy (not the genuinely-empty copy) when a filter is active", () => {
    const html = renderInbox({ initialReports: [], initialNextCursor: null, status: "resolved" });
    expect(html).toContain("No matching reports");
  });
});

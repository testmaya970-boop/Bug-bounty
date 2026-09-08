import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SeverityControl, TriageActionPanel, deriveDuplicateCandidates } from "../../components/reports/triage-actions";
import { TriageStatusRailProvider } from "../../components/reports/triage-status-rail";
import { REPORT_STATUS_TRANSITIONS } from "../../lib/report-status";
import type { ReportSeverity, ReportStatus } from "../../types/report";

// Every triage action calls useRouter().refresh() on success, same reason as every other
// mutating client component in this codebase -- must be mocked for static rendering.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const REF = { organizationId: "org-1", programId: "prog-1", reportId: "report-1" };

// Every triage action/severity component reads/writes the optimistic status rail via
// useTriageStatus, so it must be rendered inside the same provider the real report page
// wraps them in -- see components/reports/triage-status-rail.tsx.
function withStatusRail(status: ReportStatus, severity: ReportSeverity | null, node: React.ReactNode) {
  return (
    <TriageStatusRailProvider initialStatus={status} initialSeverity={severity}>
      {node}
    </TriageStatusRailProvider>
  );
}

describe("TriageActionPanel: renders exactly the buttons the current status's allowed transitions permit", () => {
  it("status 'new' offers every first-triage action, but not Resolve (not a legal transition from new)", () => {
    const html = renderToStaticMarkup(withStatusRail("new", null, <TriageActionPanel {...REF} status="new" allowedNext={REPORT_STATUS_TRANSITIONS.new} />));
    expect(html).toContain("Start triage");
    expect(html).toContain("Request information");
    expect(html).toContain("Accept");
    expect(html).toContain("Mark duplicate");
    expect(html).toContain("Mark informative");
    expect(html).toContain("Mark not applicable");
    expect(html).toContain("Reject");
    expect(html).not.toContain("Resolve");
  });

  it("status 'accepted' offers only Resolve and Request information, not the terminal-classification actions", () => {
    const html = renderToStaticMarkup(withStatusRail("accepted", null, <TriageActionPanel {...REF} status="accepted" allowedNext={REPORT_STATUS_TRANSITIONS.accepted} />));
    expect(html).toContain("Resolve");
    expect(html).toContain("Request information");
    expect(html).not.toContain("Mark duplicate");
    expect(html).not.toContain("Mark informative");
    expect(html).not.toContain("Reject");
    expect(html).not.toContain("Start triage");
  });

  it("a terminal status (resolved) shows no action buttons at all, just an explanatory message", () => {
    const html = renderToStaticMarkup(withStatusRail("resolved", null, <TriageActionPanel {...REF} status="resolved" allowedNext={REPORT_STATUS_TRANSITIONS.resolved} />));
    expect(html).toContain("terminal state");
    expect(html).not.toContain("<button");
  });

  it("status 'needs_information' still renders every legally-available transition button -- nothing is disabled or hidden, only visually demoted (opacity-60), since the rail's own 'Next action' label already says 'Awaiting researcher' and a full-strength action row would contradict it", () => {
    const html = renderToStaticMarkup(withStatusRail("needs_information", null, <TriageActionPanel {...REF} status="needs_information" allowedNext={REPORT_STATUS_TRANSITIONS.needs_information} />));
    expect(html).toContain("Start triage");
    expect(html).toContain("Accept");
    expect(html).toContain("Mark duplicate");
    expect(html).toContain("Mark informative");
    expect(html).toContain("Mark not applicable");
    expect(html).toContain("Reject");
    expect(html).toMatch(/class="[^"]*opacity-60[^"]*"/);
  });

  it("status 'new' (a genuinely actionable status) never gets the needs_information dimming", () => {
    const html = renderToStaticMarkup(withStatusRail("new", null, <TriageActionPanel {...REF} status="new" allowedNext={REPORT_STATUS_TRANSITIONS.new} />));
    expect(html).not.toMatch(/opacity-60/);
  });
});

describe("SeverityControl", () => {
  it("renders a labeled severity select with every DOMAIN.md severity level as an option when not locked", () => {
    const html = renderToStaticMarkup(withStatusRail("new", null, <SeverityControl {...REF} currentSeverity={null} locked={false} />));
    expect(html).toContain("Confirmed severity");
    for (const severity of ["None", "Low", "Medium", "High", "Critical"]) {
      expect(html).toContain(severity);
    }
    expect(html).toContain("<select");
  });

  it("renders a plain read-only value, never an editable control, once locked (docs/decisions/0012)", () => {
    const html = renderToStaticMarkup(withStatusRail("resolved", "high", <SeverityControl {...REF} currentSeverity="high" locked={true} />));
    expect(html).toContain("High");
    expect(html).toContain("fixed now that a final decision has been made");
    expect(html).not.toContain("<select");
  });
});

describe("deriveDuplicateCandidates: a report can never be a duplicate of itself, and 'Mark duplicate' must offer real reports to pick, not require typing a raw UUID", () => {
  const REPORTS = [
    { id: "report-1", title: "Reflected XSS", displayTarget: "https://api.example.com/search" },
    { id: "report-2", title: "SQL injection", displayTarget: "https://api.example.com/login" },
    { id: "report-3", title: "Rate limit missing", displayTarget: "https://api.example.com/reset" },
  ];

  it("excludes the current report from its own candidate list", () => {
    const candidates = deriveDuplicateCandidates(REPORTS, "report-2");
    expect(candidates.map((c) => c.id)).toEqual(["report-1", "report-3"]);
  });

  it("returns every field a picker needs to render a real, identifiable option -- id, title, and target", () => {
    const candidates = deriveDuplicateCandidates(REPORTS, "report-3");
    expect(candidates[0]).toEqual({ id: "report-1", title: "Reflected XSS", displayTarget: "https://api.example.com/search" });
  });

  it("returns an empty list, not an error, when the current report is the only one in the program", () => {
    expect(deriveDuplicateCandidates([REPORTS[0]], "report-1")).toEqual([]);
  });

  it("returns every other report unmodified when the current report id matches none of them", () => {
    expect(deriveDuplicateCandidates(REPORTS, "report-not-in-this-list")).toHaveLength(3);
  });
});

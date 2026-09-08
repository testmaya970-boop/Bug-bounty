import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { classifyFailure, CreateReportForm } from "../../components/reports/create-report-form";
import { ReportSummaryCard } from "../../components/reports/report-summary-card";
import { StatusBadge } from "../../components/ui/badge";
import type { ReportStatus, ReportSummary } from "../../types/report";

// CreateReportForm calls useRouter() unconditionally, same reason as every other
// dialog/form in this codebase that navigates on success -- must be mocked for static
// rendering.
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

describe("CreateReportForm", () => {
  it("shows the real program name and every required field, never a placeholder", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" />);
    expect(html).toContain("Acme Bounty");
    expect(html).toContain("Target type");
    expect(html).toContain("Target");
    expect(html).toContain("Title");
    expect(html).toContain("Description");
    expect(html).toContain("Submit report");
  });

  it("shows a persistent target-format reminder for the default asset type (domain), not just a placeholder that disappears once typed", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" />);
    expect(html).toContain("A bare hostname -- not a URL, port, or path.");
  });

  it("shows the weakness type, severity assessment, and a separate Impact field alongside Reproduction (see docs/decisions/0047)", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" />);
    expect(html).toContain("Weakness type");
    expect(html).toContain("Your severity assessment");
    expect(html).toContain("Reproduction");
    expect(html).toContain("Impact");
    expect(html).toContain("Cross-Site Scripting (XSS)");
    expect(html).toContain("Not set"); // the real "no severity chosen" option, not a missing one
  });
});

describe("classifyFailure: every submit_report error code maps to a calm, specific, safe state", () => {
  it("RATE_LIMITED shows the exact calm, generic sentence, never the raw server message", () => {
    const result = classifyFailure("RATE_LIMITED", "too many reports submitted recently, try again later");
    expect(result.banner).toBe("Too many requests. Try again shortly.");
  });

  it("TARGET_NOT_ELIGIBLE (out of scope) attaches to the Target field, not a generic banner", () => {
    const result = classifyFailure("TARGET_NOT_ELIGIBLE", "This target is not currently eligible for this program.");
    expect(result.targetError).toBe("This target is not currently inside the program's scope.");
    expect(result.banner).toBeUndefined();
  });

  it("FORBIDDEN (not an authorized researcher) shows a safe, specific sentence", () => {
    const result = classifyFailure("FORBIDDEN", "actor is not an authorized researcher for this program");
    expect(result.banner).toContain("not currently an authorized, active researcher");
  });

  it("PROGRAM_NOT_FOUND and SUBMISSIONS_CLOSED both map to the same 'program unavailable' framing", () => {
    expect(classifyFailure("PROGRAM_NOT_FOUND", "program not found").banner).toBe("This program is not currently accepting reports.");
    expect(classifyFailure("SUBMISSIONS_CLOSED", "this program is not currently accepting reports").banner).toBe("This program is not currently accepting reports.");
  });

  it("INVALID_TITLE/INVALID_DESCRIPTION attach to their own field, using the server's own (already-safe) message", () => {
    expect(classifyFailure("INVALID_TITLE", "Use 200 characters or fewer.").titleError).toBe("Use 200 characters or fewer.");
    expect(classifyFailure("INVALID_DESCRIPTION", "Enter a description.").descriptionError).toBe("Enter a description.");
  });

  it("INVALID_WEAKNESS_TYPE/INVALID_IMPACT attach to their own field too", () => {
    expect(classifyFailure("INVALID_WEAKNESS_TYPE", "irrelevant server text").weaknessTypeError).toBe("Select the type of weakness you found.");
    expect(classifyFailure("INVALID_IMPACT", "Describe the impact of this finding.").impactError).toBe("Describe the impact of this finding.");
  });

  it("an unrecognized code falls back to a safe, generic sentence, never a raw message", () => {
    const result = classifyFailure("UNKNOWN", 'new row for relation "reports" violates check constraint');
    expect(result.banner).toBe("The request could not be completed. Try again in a moment.");
    expect(JSON.stringify(result)).not.toContain("constraint");
  });
});

describe("CreateReportForm: wires field-level errors and the banner correctly (no error state by default)", () => {
  it("renders no error text when there is no failure yet", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" />);
    expect(html).not.toContain("role=\"alert\"");
  });
});

describe("CreateReportForm: evidence and attachments are staged in the same form, not a separate step", () => {
  it("offers both a text/code/url/log composer and a file field before the report is ever submitted", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" />);
    expect(html).toContain("Evidence");
    expect(html).toContain("Attachments");
    expect(html).toContain("Add evidence");
    expect(html).toContain("Add attachment");
    expect(html).toContain('type="file"');
  });

  it("starts with no staged evidence or attachment rows -- nothing to remove yet", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" />);
    expect(html).not.toContain("Remove");
  });
});

describe("ReportSummaryCard", () => {
  it("shows the real title, program, organization, target, and status -- not a placeholder", () => {
    const html = renderToStaticMarkup(<ReportSummaryCard report={summary} />);
    expect(html).toContain("Reflected XSS on search");
    expect(html).toContain("Acme Bounty");
    expect(html).toContain("Acme Security");
    expect(html).toContain("https://api.example.com/search");
  });

  it("links to the real nested report URL using the returned organizationId", () => {
    const html = renderToStaticMarkup(<ReportSummaryCard report={summary} />);
    expect(html).toContain(`/organizations/${summary.organizationId}/programs/${summary.programId}/reports/${summary.id}`);
  });
});

describe("StatusBadge (report status)", () => {
  it("renders a distinct, human-readable, non-color-only label for every DOMAIN.md lifecycle state", () => {
    const expected: Record<ReportStatus, string> = {
      new: "New",
      triaging: "Triaging",
      needs_information: "Needs Information",
      accepted: "Accepted",
      resolved: "Resolved",
      duplicate: "Duplicate",
      informative: "Informative",
      not_applicable: "Not Applicable",
      rejected: "Rejected",
    };
    for (const [status, label] of Object.entries(expected)) {
      const html = renderToStaticMarkup(<StatusBadge status={status as keyof typeof expected} />);
      expect(html).toContain(label);
    }
  });
});

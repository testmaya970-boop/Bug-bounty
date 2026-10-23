import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { classifyFailure, CreateReportForm } from "../../components/reports/create-report-form";
import { IssueList } from "../../components/reports/issue-list";
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

  it("offers real in-scope targets for the default asset type (domain) as datalist suggestions, not a hard-enforced picker", () => {
    const html = renderToStaticMarkup(
      <CreateReportForm
        organizationId="org-1"
        programId="prog-1"
        programName="Acme Bounty"
        inScopeTargets={[
          { assetType: "domain", displayTarget: "api.example.com" },
          { assetType: "url", displayTarget: "https://example.com/admin" },
        ]}
      />,
    );
    expect(html).toContain('list="in-scope-targets"');
    expect(html).toContain("api.example.com");
    // The URL-type target must not leak into the domain datalist -- only the
    // currently-selected asset type's own entries are offered.
    expect(html).not.toContain("https://example.com/admin");
  });

  it("renders no datalist at all when there are no in-scope targets for the current asset type", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" inScopeTargets={[]} />);
    expect(html).not.toContain("in-scope-targets");
  });
});

describe("classifyFailure: every submit_report error code maps to a calm, specific, safe state", () => {
  it("RATE_LIMITED shows the exact calm, generic sentence, never the raw server message", () => {
    const result = classifyFailure("RATE_LIMITED", "too many reports submitted recently, try again later");
    expect(result.banner).toBe("Too many requests. Try again shortly.");
  });

  it("anti-abuse refusals (paused, daily limit, near-duplicate) show the database's own explanation", () => {
    for (const [code, message] of [
      ["SUBMISSIONS_PAUSED", "You can submit reports again on 28 Oct 2026 10:00 UTC. Your last 5 reports were closed as not applicable."],
      ["DAILY_LIMIT", "You have used all 5 reports for today (new researcher). Valid reports raise your limit."],
      ["NEAR_DUPLICATE", "You sent an almost identical report to this program on 21 Oct 2026. Add new details to that report instead."],
    ]) {
      expect(classifyFailure(code, message).banner).toBe(message);
    }
  });

  it("TARGET_NOT_ELIGIBLE (out of scope) attaches to the Target field, not a generic banner", () => {
    const result = classifyFailure("TARGET_NOT_ELIGIBLE", "This target is not currently eligible for this program.");
    expect(result.targetError).toBe("This target is not currently inside the program's scope.");
    expect(result.banner).toBeUndefined();
  });

  it("INVALID_TARGET (malformed target, e.g. a URL's query string on a domain entry) surfaces canonicalize_scope_target's own already-specific message on the Target field, never the generic fallback -- confirmed live as a real gap via a real submission's own server log (errorCode: INVALID_TARGET, no case existed for it)", () => {
    const result = classifyFailure("INVALID_TARGET", "Enter a bare hostname, e.g. api.example.com or *.example.com -- not a URL, port, or path.");
    expect(result.targetError).toBe("Enter a bare hostname, e.g. api.example.com or *.example.com -- not a URL, port, or path.");
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

  it("KYC_REQUIRED surfaces the server's own already-specific message, never the generic fallback -- confirmed live as a real gap: this was the one submit_report code this switch had no case for, so a researcher without verified KYC on a KYC-required program saw 'The request could not be completed' with no indication of what was actually wrong", () => {
    const result = classifyFailure("KYC_REQUIRED", "this program requires identity verification before you can submit reports");
    expect(result.banner).toBe("this program requires identity verification before you can submit reports");
    expect(result.banner).not.toBe("The request could not be completed. Try again in a moment.");
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

describe("IssueList (my reports)", () => {
  it("shows the real title, program, organization, target, and status -- not a placeholder", () => {
    const html = renderToStaticMarkup(<IssueList reports={[{ ...summary, at: summary.submittedAt, atLabel: "submitted", context: `${summary.programName} · ${summary.organizationName}` }]} />);
    expect(html).toContain("Reflected XSS on search");
    expect(html).toContain("Acme Bounty");
    expect(html).toContain("Acme Security");
    expect(html).toContain("https://api.example.com/search");
  });

  it("links to the real nested report URL using the returned organizationId", () => {
    const html = renderToStaticMarkup(<IssueList reports={[{ ...summary, at: summary.submittedAt, atLabel: "submitted", context: `${summary.programName} · ${summary.organizationName}` }]} />);
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

describe("validateReport: every missing required field is reported at once, before submitting", () => {
  const complete = { target: "app.example.com", title: "XSS", weaknessType: "xss", description: "steps", impact: "session theft", policyRequired: true, policyAccepted: true };

  it("returns nothing for a complete report", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport(complete)).toEqual({});
  });

  it("flags every empty field together, treating whitespace as empty", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    const errors = validateReport({ target: " ", title: "", weaknessType: "", description: "\n", impact: "", policyRequired: true, policyAccepted: false });
    expect(Object.keys(errors).sort()).toEqual(["descriptionError", "impactError", "policyError", "targetError", "titleError", "weaknessTypeError"]);
  });

  it("only asks for the policy when the program has one", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport({ ...complete, policyRequired: false, policyAccepted: false })).toEqual({});
  });

  it("maps a stale policy version to the policy field, not the generic banner", () => {
    expect(classifyFailure("POLICY_NOT_ACKNOWLEDGED", "x").policyError).toBeTruthy();
    expect(classifyFailure("INVALID_INPUT", "Enter a target.").banner).toBe("Enter a target.");
  });
});

describe("unadded evidence and files block submission instead of being silently dropped", () => {
  const complete = { target: "app.example.com", title: "XSS", weaknessType: "xss", description: "steps", impact: "session theft", policyRequired: false, policyAccepted: false };

  it("flags a chosen-but-not-added file and typed-but-not-added evidence", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    const errors = validateReport({ ...complete, unaddedFileName: "poc.png", unaddedEvidence: "curl ..." });
    expect(errors.attachmentError).toContain("poc.png");
    expect(errors.evidenceError).toBeTruthy();
    expect(validateReport({ ...complete, unaddedFileName: null, unaddedEvidence: "  " })).toEqual({});
  });

  it("fileProblem mirrors the server's upload checks", async () => {
    const { fileProblem } = await import("../../components/reports/report-evidence");
    expect(fileProblem(new File([], "empty.png"))).toBe("The selected file is empty.");
    expect(fileProblem(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png"))).toBe("File must be 10 MB or smaller.");
    expect(fileProblem(new File(["x"], `${"a".repeat(252)}.png`))).toBe("File name must be 255 characters or fewer.");
    expect(fileProblem(new File(["x"], "ok.png"))).toBeNull();
  });
});

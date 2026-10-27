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

const limits = { maxFileBytes: 50 * 1024 * 1024, maxFiles: 20 };
const entries = [
  { id: "e-1", assetType: "domain" as const, target: "api.example.com", displayTarget: "api.example.com" },
  { id: "e-2", assetType: "domain" as const, target: "*.example.com", displayTarget: "*.example.com" },
  { id: "e-3", assetType: "url" as const, target: "https://example.com/admin", displayTarget: "https://example.com/admin" },
];

describe("CreateReportForm", () => {
  it("shows the real program name and every required field, never a placeholder", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={entries} limits={limits} />);
    expect(html).toContain("Acme Bounty");
    expect(html).toContain("Asset");
    expect(html).toContain("Title");
    expect(html).toContain("Description");
    expect(html).toContain("Submit report");
    expect(html).toContain("Save as draft");
  });

  it("offers only the program's in-scope assets in a dropdown grouped by type, not free text", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={entries} limits={limits} />);
    expect(html).toContain('<option value="e-1">api.example.com</option>');
    expect(html).toContain('<option value="e-2">*.example.com</option>');
    expect(html).toContain('label="URL"');
    expect(html).not.toContain('list="in-scope-targets"');
  });

  it("explains the empty state and disables submit when the program has no in-scope assets", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={[]} limits={limits} />);
    expect(html).toContain("no in-scope assets you can report against");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("shows the vulnerability category, severity assessment, CVSS, and a separate Impact field", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={entries} limits={limits} />);
    expect(html).toContain("Vulnerability category");
    expect(html).toContain("Your severity assessment");
    expect(html).toContain("CVSS score");
    expect(html).toContain("Build a 4.0 vector");
    expect(html).toContain("Impact");
    expect(html).toContain("Cross-Site Scripting (XSS)");
    expect(html).toContain("Insecure File Upload");
    expect(html).toContain("API Security");
    expect(html).toContain(">Info<"); // stored "none" reads Info
  });

  it("restores a saved draft's fields and its staged files", () => {
    const html = renderToStaticMarkup(
      <CreateReportForm
        organizationId="org-1"
        programId="prog-1"
        programName="Acme Bounty"
        scopeEntries={entries}
        limits={limits}
        initialDraft={{
          id: "d-1",
          version: 3,
          savedAt: "2026-10-26T10:00:00Z",
          fields: { scopeEntryId: "e-1", title: "Saved title", target: "api.example.com" },
          uploads: [{ id: "u-1", filename: "poc.mp4", sizeBytes: 2048, contentType: "video/mp4", status: "ready", createdAt: "2026-10-26T10:00:00Z" }],
        }}
      />,
    );
    expect(html).toContain('value="Saved title"');
    expect(html).toContain("poc.mp4");
    expect(html).toContain("Draft saved");
    expect(html).toContain("Delete draft");
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
    // The server's own sentence: it distinguishes out-of-scope from not-covered-by-the-picked-asset.
    expect(result.targetError).toBe("This target is not currently eligible for this program.");
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
    expect(classifyFailure("INVALID_WEAKNESS_TYPE", "irrelevant server text").weaknessTypeError).toBe("Select a vulnerability category.");
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
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={entries} limits={{ maxFileBytes: 50 * 1024 * 1024, maxFiles: 20 }} />);
    expect(html).not.toContain("role=\"alert\"");
  });
});

describe("CreateReportForm: evidence and attachments are staged in the same form, not a separate step", () => {
  it("offers a text evidence composer and a multi-file picker restricted to the accepted formats, with the limits shown", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={entries} limits={limits} />);
    expect(html).toContain("Add evidence");
    expect(html).toContain("Add files");
    expect(html).toContain('type="file"');
    expect(html).toContain("multiple");
    expect(html).toContain('accept=".png,.jpg,.jpeg,.webp,.mp4,.webm,.pdf,.txt,.log,.csv,.json,.har"');
    expect(html).toContain("Up to 20 files, 50 MB each: PNG, JPG, WebP, MP4, WebM, PDF, TXT, LOG, CSV, JSON, HAR.");
  });

  it("starts with no staged evidence or attachment rows -- nothing to remove yet", () => {
    const html = renderToStaticMarkup(<CreateReportForm organizationId="org-1" programId="prog-1" programName="Acme Bounty" scopeEntries={entries} limits={limits} />);
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
  const complete = { scopeEntryId: "e-1", target: "app.example.com", needsSpecificTarget: false, title: "XSS", weaknessType: "xss", description: "steps", impact: "session theft", policyRequired: true, policyAccepted: true };

  it("returns nothing for a complete report", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport(complete)).toEqual({});
  });

  it("flags every empty field together, treating whitespace as empty", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    const errors = validateReport({ ...complete, scopeEntryId: "", title: "", weaknessType: "", description: "\n", impact: "", policyAccepted: false });
    expect(Object.keys(errors).sort()).toEqual(["descriptionError", "impactError", "policyError", "targetError", "titleError", "weaknessTypeError"]);
  });

  it("asks for the exact host or URL inside a wildcard / range / prefix asset", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport({ ...complete, needsSpecificTarget: true, target: " " }).targetError).toMatch(/exact target/);
    expect(validateReport({ ...complete, needsSpecificTarget: true, target: "a.example.com" })).toEqual({});
  });

  it("refuses an invalid CVSS vector before sending, and accepts 4.0 and 3.1", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport({ ...complete, cvssVector: "CVSS:4.0/AV:N" }).cvssError).toBeTruthy();
    expect(validateReport({ ...complete, cvssVector: "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N" })).toEqual({});
    expect(validateReport({ ...complete, cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" })).toEqual({});
  });

  it("only asks for the policy when the program has one", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport({ ...complete, policyRequired: false, policyAccepted: false })).toEqual({});
  });

  it("maps server codes to the right field", () => {
    expect(classifyFailure("POLICY_NOT_ACKNOWLEDGED", "x").policyError).toBeTruthy();
    expect(classifyFailure("INVALID_INPUT", "Enter a target.").banner).toBe("Enter a target.");
    expect(classifyFailure("TARGET_NOT_ELIGIBLE", "This target is not covered by the asset you selected.").targetError).toBe("This target is not covered by the asset you selected.");
    expect(classifyFailure("INVALID_CVSS", "bad vector").cvssError).toBe("bad vector");
    expect(classifyFailure("UPLOAD_NOT_READY", "wait").attachmentError).toBe("wait");
  });
});

describe("unadded evidence and unfinished uploads block submission instead of being silently dropped", () => {
  const complete = { scopeEntryId: "e-1", target: "app.example.com", needsSpecificTarget: false, title: "XSS", weaknessType: "xss", description: "steps", impact: "session theft", policyRequired: false, policyAccepted: false };

  it("flags typed-but-not-added evidence, uploads still in flight, and failed uploads", async () => {
    const { validateReport } = await import("../../components/reports/create-report-form");
    expect(validateReport({ ...complete, unaddedEvidence: "curl ..." }).evidenceError).toBeTruthy();
    expect(validateReport({ ...complete, uploadsInFlight: 1 }).attachmentError).toMatch(/finish uploading/);
    expect(validateReport({ ...complete, uploadsFailed: 1 }).attachmentError).toMatch(/failed/);
    expect(validateReport({ ...complete, unaddedEvidence: "  ", uploadsInFlight: 0, uploadsFailed: 0 })).toEqual({});
  });
});

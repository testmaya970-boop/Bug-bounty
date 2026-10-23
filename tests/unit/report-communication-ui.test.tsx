import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportCommunication } from "../../components/reports/report-communication";
import { ReportComposer } from "../../components/reports/report-composer";
import { ReportEvidenceSection } from "../../components/reports/report-evidence";
import type { ReportEvidence, ReportMessage } from "../../types/report";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const REF = { organizationId: "org-1", programId: "prog-1", reportId: "report-1" };

const researcherMessage: ReportMessage = {
  id: "msg-1",
  reportId: "report-1",
  authorId: "researcher-1",
  authorName: "Riley Researcher",
  authorContext: "researcher",
  visibility: "researcher_visible",
  body: "Here is the PoC video.",
  createdAt: "2026-08-27T00:00:00Z",
};

const internalMessage: ReportMessage = {
  id: "msg-2",
  reportId: "report-1",
  authorId: "manager-1",
  authorName: "Morgan Manager",
  authorContext: "organization",
  visibility: "internal",
  body: "Possible duplicate of report X, confirming before we tell the researcher.",
  createdAt: "2026-08-27T01:00:00Z",
};

describe("ReportCommunication: visibility is a structural separation, never a mixed feed with a badge", () => {
  it("shows researcher-visible messages to everyone, and never shows the internal group at all when showInternal is false", () => {
    const html = renderToStaticMarkup(<ReportCommunication messages={[researcherMessage, internalMessage]} showInternal={false} />);
    expect(html).toContain("Here is the PoC video.");
    expect(html).not.toContain("Possible duplicate of report X");
    expect(html).not.toContain("Internal only");
  });

  it("shows both groups, clearly labeled, when showInternal is true (the organization viewer)", () => {
    const html = renderToStaticMarkup(<ReportCommunication messages={[researcherMessage, internalMessage]} showInternal={true} />);
    expect(html).toContain("Here is the PoC video.");
    expect(html).toContain("Possible duplicate of report X");
    expect(html).toContain("Visible to researcher");
    expect(html).toContain("Internal only: not visible to the researcher");
  });

  it("labels each message with its author's name and researcher/organization context -- never anonymous", () => {
    const html = renderToStaticMarkup(<ReportCommunication messages={[researcherMessage]} showInternal={false} />);
    expect(html).toContain("Riley Researcher");
    expect(html).toContain("Researcher");
  });
});


const NO_FILE_FIELDS = { objectKey: null, originalFilename: null, contentType: null, sizeBytes: null, sha256: null };

const researcherEvidence: ReportEvidence = {
  id: "ev-1",
  reportId: "report-1",
  authorId: "researcher-1",
  authorName: "Riley Researcher",
  authorContext: "researcher",
  visibility: "researcher_visible",
  evidenceType: "log",
  content: "GET /admin HTTP/1.1\n200 OK",
  createdAt: "2026-08-27T00:00:00Z",
  ...NO_FILE_FIELDS,
};

const internalEvidence: ReportEvidence = {
  id: "ev-2",
  reportId: "report-1",
  authorId: "manager-1",
  authorName: "Morgan Manager",
  authorContext: "organization",
  visibility: "internal",
  evidenceType: "text",
  content: "Internal repro notes not ready to share yet.",
  createdAt: "2026-08-27T01:00:00Z",
  ...NO_FILE_FIELDS,
};

const fileEvidence: ReportEvidence = {
  id: "ev-3",
  reportId: "report-1",
  authorId: "researcher-1",
  authorName: "Riley Researcher",
  authorContext: "researcher",
  visibility: "researcher_visible",
  evidenceType: "file",
  content: null,
  objectKey: "evidence/11111111-1111-1111-1111-111111111111",
  originalFilename: "screenshot.png",
  contentType: "image/png",
  sizeBytes: 245_000,
  sha256: "a".repeat(64),
  createdAt: "2026-08-27T02:00:00Z",
};

describe("ReportEvidenceSection: same structural visibility separation as communication", () => {
  it("never shows internal evidence to a researcher viewer", () => {
    const html = renderToStaticMarkup(<ReportEvidenceSection evidence={[researcherEvidence, internalEvidence]} showInternal={false} {...REF} />);
    expect(html).toContain("GET /admin HTTP/1.1");
    expect(html).not.toContain("Internal repro notes");
  });

  it("preserves whitespace and renders content in monospace for log/code evidence", () => {
    const html = renderToStaticMarkup(<ReportEvidenceSection evidence={[researcherEvidence]} showInternal={false} {...REF} />);
    expect(html).toContain("<pre");
    expect(html).toContain("font-mono");
  });

  it("renders a file evidence item as a filename/size/type card with a Download control -- never inline content, never a fake upload button", () => {
    const html = renderToStaticMarkup(<ReportEvidenceSection evidence={[fileEvidence]} showInternal={false} {...REF} />);
    expect(html).toContain("screenshot.png");
    expect(html).toContain("image/png");
    expect(html).toContain("239.3 KB");
    expect(html).toContain("Download");
    expect(html).not.toContain("<pre");
  });
});


describe("Report composer (one form: comment, attachments, one visibility)", () => {
  it("a researcher gets a comment box and attachments, never a visibility choice", () => {
    const html = renderToStaticMarkup(<ReportComposer {...REF} side="researcher" />);
    expect(html).toContain("Add a comment for the organization");
    expect(html).toContain("Attach files");
    expect(html).not.toContain("Internal note");
    expect(html).not.toContain("<select");
  });

  it("the organization gets exactly one visibility choice for the comment and its files", () => {
    const html = renderToStaticMarkup(<ReportComposer {...REF} side="organization" />);
    expect(html.match(/<select/g)?.length).toBe(1);
    expect(html).toContain("Internal note (team only)");
    expect(html).toContain("Visible to the researcher");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrganizationMessageComposer, ReportCommunication, ResearcherMessageComposer } from "../../components/reports/report-communication";
import {
  OrganizationEvidenceComposer,
  OrganizationFileEvidenceComposer,
  ReportEvidenceSection,
  ResearcherEvidenceComposer,
  ResearcherFileEvidenceComposer,
} from "../../components/reports/report-evidence";
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

describe("Message composers", () => {
  it("ResearcherMessageComposer has no visibility control -- a researcher can never choose internal", () => {
    const html = renderToStaticMarkup(<ResearcherMessageComposer {...REF} />);
    expect(html).toContain("Message to the organization");
    expect(html).not.toContain("Internal only");
    expect(html).not.toContain("<select");
  });

  it("OrganizationMessageComposer offers a visibility choice", () => {
    const html = renderToStaticMarkup(<OrganizationMessageComposer {...REF} />);
    expect(html).toContain("Visible to");
    expect(html).toContain("Internal only");
    expect(html).toContain("Researcher and organization");
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

describe("Evidence composers", () => {
  it("ResearcherEvidenceComposer offers every textual DOMAIN.md evidence type but no visibility control", () => {
    const html = renderToStaticMarkup(<ResearcherEvidenceComposer {...REF} />);
    for (const label of ["Text", "Code", "URL", "Log"]) expect(html).toContain(label);
    expect(html).not.toContain("Visible to");
  });

  it("OrganizationEvidenceComposer offers both type and visibility", () => {
    const html = renderToStaticMarkup(<OrganizationEvidenceComposer {...REF} />);
    expect(html).toContain("Visible to");
    expect(html).toContain("Internal only");
  });

  it("ResearcherFileEvidenceComposer offers a real file input, a size hint, and no visibility control", () => {
    const html = renderToStaticMarkup(<ResearcherFileEvidenceComposer {...REF} />);
    expect(html).toMatch(/type="file"/);
    expect(html).toContain("Up to 10 MB");
    expect(html).not.toContain("Visible to");
  });

  it("OrganizationFileEvidenceComposer offers a file input and a visibility choice", () => {
    const html = renderToStaticMarkup(<OrganizationFileEvidenceComposer {...REF} />);
    expect(html).toMatch(/type="file"/);
    expect(html).toContain("Visible to");
    expect(html).toContain("Internal only");
  });
});

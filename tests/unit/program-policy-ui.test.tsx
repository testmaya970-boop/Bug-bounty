import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgramPolicySummary, ReportSlaPanel } from "../../components/programs/program-policy";
import type { ProgramPolicy } from "../../types/program-policy";

const POLICY: ProgramPolicy = {
  id: "policy-1",
  programId: "program-1",
  versionNumber: 3,
  rulesOfEngagement: "No denial of service.",
  safeHarbor: true,
  disclosureMode: "coordinated",
  disclosureDays: 90,
  firstResponseTargetHours: 72,
  triageTargetHours: 168,
  resolutionTargetDays: 90,
  changeNote: null,
  publishedAt: "2026-10-01T00:00:00Z",
};

describe("ProgramPolicySummary", () => {
  it("shows the version, safe harbor link, disclosure terms, targets and rules", () => {
    const html = renderToStaticMarkup(<ProgramPolicySummary policy={POLICY} />);
    expect(html).toContain("Published");
    expect(html).not.toContain("Policy v3");
    expect(html).toContain('href="/safe-harbor"');
    expect(html).toContain("Coordinated disclosure · 90 days after resolution");
    expect(html).toContain("First response within 3 days");
    expect(html).toContain("Triage within 7 days");
    expect(html).toContain("Resolution within 90 days");
    expect(html).toContain("No denial of service.");
  });

  it("says plainly when a program has no safe harbor or no policy", () => {
    expect(renderToStaticMarkup(<ProgramPolicySummary policy={{ ...POLICY, safeHarbor: false, disclosureMode: "none", disclosureDays: null }} />)).toMatch(/No safe harbor commitment[\s\S]*No public disclosure/);
    expect(renderToStaticMarkup(<ProgramPolicySummary policy={null} />)).toContain("hasn&#x27;t published a policy");
  });

  it("omits targets the program didn't set", () => {
    const html = renderToStaticMarkup(<ProgramPolicySummary policy={{ ...POLICY, firstResponseTargetHours: null, triageTargetHours: null, resolutionTargetDays: null }} />);
    expect(html).not.toContain("within");
  });
});

describe("ReportSlaPanel", () => {
  it("labels each target due, met, met late or overdue", () => {
    const html = renderToStaticMarkup(
      <ReportSlaPanel
        sla={{
          policyVersionNumber: 3,
          firstResponse: { dueAt: "2026-10-02T00:00:00Z", metAt: "2026-10-01T10:00:00Z", breached: false },
          triage: { dueAt: "2026-10-03T00:00:00Z", metAt: "2026-10-04T00:00:00Z", breached: true },
          resolution: { dueAt: "2026-12-30T00:00:00Z", metAt: null, breached: false },
        }}
      />,
    );
    expect(html).toContain("Targets from the program policy");
    expect(html).not.toContain("policy v3");
    expect(html).toMatch(/First response[\s\S]*>Met</);
    expect(html).toMatch(/Triage[\s\S]*Met late/);
    expect(html).toMatch(/Resolution[\s\S]*>Due</);
    expect(renderToStaticMarkup(<ReportSlaPanel sla={{ policyVersionNumber: 1, firstResponse: { dueAt: "2026-10-02T00:00:00Z", metAt: null, breached: true }, triage: null, resolution: null }} />)).toContain("Overdue");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BountyPolicySection, CreateBountyPolicyDialog } from "../../components/programs/bounty-policy";
import { AdjustBountyDialog, BountyDecisionSection, CalculateBountyButton, FinalizeBountyDialog } from "../../components/reports/bounty-decision";
import type { BountyPolicy } from "../../types/bounty";
import type { ReportBountyDecision } from "../../types/bounty";

// Every dialog in this slice calls useRouter().refresh() on success, same reason as every
// other mutating client component in this codebase -- must be mocked for static rendering.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const REF = { organizationId: "org-1", programId: "prog-1", reportId: "report-1" };

const POLICY: BountyPolicy = {
  id: "policy-1",
  programId: "prog-1",
  organizationId: "org-1",
  versionNumber: 1,
  currency: "USD",
  createdAt: "2026-08-28T00:00:00Z",
  supersededAt: null,
  ranges: [
    { severity: "none", minAmountMinorUnits: 0, maxAmountMinorUnits: 0 },
    { severity: "low", minAmountMinorUnits: 0, maxAmountMinorUnits: 5000 },
    { severity: "medium", minAmountMinorUnits: 5000, maxAmountMinorUnits: 25000 },
    { severity: "high", minAmountMinorUnits: 25000, maxAmountMinorUnits: 100000 },
    { severity: "critical", minAmountMinorUnits: 100000, maxAmountMinorUnits: 500000 },
  ],
};

describe("BountyPolicySection", () => {
  it("states honestly that no policy exists rather than fabricating one", () => {
    const html = renderToStaticMarkup(<BountyPolicySection policy={null} />);
    expect(html).toContain("has not configured a bounty policy");
    expect(html).not.toContain("<table");
  });

  it("renders every severity tier's min/max as decimal currency, not raw minor units", () => {
    const html = renderToStaticMarkup(<BountyPolicySection policy={POLICY} />);
    expect(html).toContain("Paid in");
    expect(html).not.toContain("Version 1");
    expect(html).toContain("USD");
    expect(html).toContain("250.00");
    expect(html).toContain("1000.00");
    expect(html).not.toContain("25000");
  });
});

describe("CreateBountyPolicyDialog defaults to closed and only shows its trigger", () => {
  it("offers to configure a policy when none exists yet", () => {
    const html = renderToStaticMarkup(<CreateBountyPolicyDialog organizationId="org-1" programId="prog-1" currentPolicy={null} />);
    expect(html).toContain("Configure bounty policy");
    expect(html).not.toContain("Publish policy");
  });

  it("offers to publish a new version, distinctly, when a policy already exists", () => {
    const html = renderToStaticMarkup(<CreateBountyPolicyDialog organizationId="org-1" programId="prog-1" currentPolicy={POLICY} />);
    expect(html).toContain("Publish new policy version");
    expect(html).not.toContain("This replaces version");
  });
});

describe("BountyDecisionSection: separates eligibility, the calculated range, and the final decision", () => {
  it("shows 'not evaluated yet' with a Calculate button when no decision exists and the actor can triage", () => {
    const html = renderToStaticMarkup(
      <BountyDecisionSection decision={null} canCalculate={true} reportIsFinal={true} canFinalize={false} {...REF} />,
    );
    expect(html).toContain("not been evaluated yet");
    expect(html).toContain("Calculate bounty");
  });

  it("explains instead of offering Calculate while the report can still change status (the RPC would reject it)", () => {
    const html = renderToStaticMarkup(<BountyDecisionSection decision={null} canCalculate={true} reportIsFinal={false} canFinalize={false} {...REF} />);
    expect(html).not.toContain("Calculate bounty");
    expect(html).toContain("once this report reaches a final decision");
  });

  it("hides the Calculate button entirely when the actor cannot triage, rather than disabling it", () => {
    const html = renderToStaticMarkup(<BountyDecisionSection decision={null} canCalculate={false} reportIsFinal={true} canFinalize={false} {...REF} />);
    expect(html).not.toContain("Calculate bounty");
  });

  it("shows only the ineligibility reason for an ineligible decision, no calculate/finalize controls", () => {
    const decision: ReportBountyDecision = {
      id: "d-1",
      reportId: "report-1",
      state: "ineligible",
      ineligibleReason: "This report's classification is not eligible for a bounty.",
      policyVersionId: null,
      severityAtCalculation: null,
      priorityAtCalculation: null,
      currency: null,
      calculatedMinAmountMinorUnits: null,
      calculatedMaxAmountMinorUnits: null,
      finalAmountMinorUnits: null,
      finalizedAt: null,
      finalizationNote: null,
      createdAt: "2026-08-28T00:00:00Z",
      updatedAt: "2026-08-28T00:00:00Z",
    };
    const html = renderToStaticMarkup(<BountyDecisionSection decision={decision} canCalculate={true} reportIsFinal={true} canFinalize={true} {...REF} />);
    expect(html).toContain("Not bounty-eligible");
    expect(html).not.toContain("Finalize bounty");
    expect(html).not.toContain("Calculate bounty");
  });

  it("shows the calculated range as a recommendation, plus Recalculate, and Finalize only when authorized", () => {
    const decision: ReportBountyDecision = {
      id: "d-1",
      reportId: "report-1",
      state: "calculated",
      ineligibleReason: null,
      policyVersionId: "policy-1",
      severityAtCalculation: "high",
      priorityAtCalculation: "p1",
      currency: "USD",
      calculatedMinAmountMinorUnits: 25000,
      calculatedMaxAmountMinorUnits: 100000,
      finalAmountMinorUnits: null,
      finalizedAt: null,
      finalizationNote: null,
      createdAt: "2026-08-28T00:00:00Z",
      updatedAt: "2026-08-28T00:00:00Z",
    };
    const authorized = renderToStaticMarkup(<BountyDecisionSection decision={decision} canCalculate={true} reportIsFinal={true} canFinalize={true} {...REF} />);
    expect(authorized).toContain("250.00");
    expect(authorized).toContain("1000.00");
    expect(authorized).toContain("recommendation, not a final decision");
    expect(authorized).toContain("Recalculate bounty");
    expect(authorized).toContain("Finalize bounty");

    const unauthorized = renderToStaticMarkup(<BountyDecisionSection decision={decision} canCalculate={false} reportIsFinal={true} canFinalize={false} {...REF} />);
    expect(unauthorized).not.toContain("Recalculate bounty");
    expect(unauthorized).not.toContain("Finalize bounty");
  });

  it("shows the final amount and an Adjust control only when authorized, never a Finalize/Calculate control once finalized", () => {
    const decision: ReportBountyDecision = {
      id: "d-1",
      reportId: "report-1",
      state: "finalized",
      ineligibleReason: null,
      policyVersionId: "policy-1",
      severityAtCalculation: "high",
      priorityAtCalculation: "p1",
      currency: "USD",
      calculatedMinAmountMinorUnits: 25000,
      calculatedMaxAmountMinorUnits: 100000,
      finalAmountMinorUnits: 60000,
      finalizedAt: "2026-08-28T01:00:00Z",
      finalizationNote: "Great find",
      createdAt: "2026-08-28T00:00:00Z",
      updatedAt: "2026-08-28T01:00:00Z",
    };
    const authorized = renderToStaticMarkup(<BountyDecisionSection decision={decision} canCalculate={true} reportIsFinal={true} canFinalize={true} {...REF} />);
    expect(authorized).toContain("Final bounty");
    expect(authorized).toContain("600.00");
    expect(authorized).toContain("Great find");
    expect(authorized).toContain("Adjust bounty");
    expect(authorized).not.toContain("Finalize bounty");
    expect(authorized).not.toContain("Calculate bounty");

    const unauthorized = renderToStaticMarkup(<BountyDecisionSection decision={decision} canCalculate={false} reportIsFinal={true} canFinalize={false} {...REF} />);
    expect(unauthorized).not.toContain("Adjust bounty");
  });
});

describe("dialogs default to closed and only show their trigger, never the confirmation copy up front", () => {
  it("CalculateBountyButton relabels to Recalculate when a decision already exists", () => {
    const html = renderToStaticMarkup(<CalculateBountyButton {...REF} relabelAsRecalculate={true} />);
    expect(html).toContain("Recalculate bounty");
    expect(html).not.toContain(">Calculate bounty<");
  });

  it("FinalizeBountyDialog", () => {
    const html = renderToStaticMarkup(<FinalizeBountyDialog {...REF} currency="USD" />);
    expect(html).toContain("Finalize bounty");
    expect(html).not.toContain("Confirm finalization");
    expect(html).not.toContain("Once finalized, only an explicit adjustment");
  });

  it("AdjustBountyDialog", () => {
    const html = renderToStaticMarkup(<AdjustBountyDialog {...REF} currency="USD" currentAmountMinorUnits={60000} />);
    expect(html).toContain("Adjust bounty");
    expect(html).not.toContain("Confirm adjustment");
  });
});

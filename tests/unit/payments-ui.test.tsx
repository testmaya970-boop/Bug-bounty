import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CancelPaymentObligationDialog,
  CreatePaymentObligationButton,
  InitiateManualPayoutButton,
  PaymentStatusSection,
  RecordPaymentResultDialog,
} from "../../components/reports/payment-status";
import type { PaymentAttempt, PaymentObligation } from "../../types/payment";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const REF = { organizationId: "org-1", programId: "prog-1", reportId: "report-1" };

const PENDING_OBLIGATION: PaymentObligation = {
  id: "obligation-1",
  reportId: "report-1",
  researcherId: "researcher-1",
  bountyDecisionId: "decision-1",
  amountMinorUnits: 60000,
  platformFeeMinorUnits: 12000,
  currency: "USD",
  status: "pending",
  createdAt: "2026-08-29T00:00:00Z",
  updatedAt: "2026-08-29T00:00:00Z",
};

const ATTEMPT: PaymentAttempt = {
  id: "attempt-1",
  paymentObligationId: "obligation-1",
  attemptNumber: 1,
  provider: "manual",
  state: "requires_operator_action",
  requestedAmountMinorUnits: 60000,
  currency: "USD",
  providerReferenceId: null,
  failureCode: null,
  failureMessage: null,
  startedAt: "2026-08-29T00:00:00Z",
  completedAt: null,
  createdAt: "2026-08-29T00:00:00Z",
};

describe("PaymentStatusSection: separates 'no obligation yet' from every real status, and never shows attempt-level detail", () => {
  it("shows 'no payment obligation' with a Create button when authorized and none exists", () => {
    const html = renderToStaticMarkup(
      <PaymentStatusSection obligations={[]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(html).toContain("No payment obligation has been created yet");
    expect(html).toContain("Create payment obligation");
  });

  it("hides the Create button entirely for an unauthorized viewer (e.g. the researcher)", () => {
    const html = renderToStaticMarkup(
      <PaymentStatusSection obligations={[]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={false} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(html).not.toContain("Create payment obligation");
  });

  it("pending: shows the safe status label and, when authorized, Initiate/Cancel controls", () => {
    const authorized = renderToStaticMarkup(
      <PaymentStatusSection obligations={[PENDING_OBLIGATION]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(authorized).toContain("Payment pending");
    expect(authorized).toContain("600.00");
    expect(authorized).toContain("Pay researcher");
    expect(authorized).toContain("Cancel award");
    // The fee is billed to the organization ON TOP (202609250010): PENDING_OBLIGATION is a
    // 600.00 bounty with a 120.00 fee, so the org's total due is 720.00 -- and nothing is
    // deducted from the researcher (no 480.00 anywhere).
    expect(authorized).toContain("Paid to the researcher in full");
    expect(authorized).toContain("120.00");
    expect(authorized).toContain("720.00");
    expect(authorized).not.toContain("480.00");

    const researcher = renderToStaticMarkup(
      <PaymentStatusSection obligations={[PENDING_OBLIGATION]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={false} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(researcher).toContain("Payment pending");
    expect(researcher).toContain("600.00");
    // The researcher never sees the organization's fee, or a reduced amount.
    expect(researcher).not.toMatch(/fee/i);
    expect(researcher).not.toContain("480.00");
    expect(researcher).not.toContain("720.00");
    expect(researcher).not.toContain("Pay researcher");
    expect(researcher).not.toContain("Cancel award");
  });

  it("processing: the organization is told Unpatched is sending it -- it never records the result itself", () => {
    const processing: PaymentObligation = { ...PENDING_OBLIGATION, status: "processing" };
    const authorized = renderToStaticMarkup(<PaymentStatusSection obligations={[processing]} latestAttempts={{ [processing.id]: ATTEMPT }} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(authorized).toContain("Payment processing");
    expect(authorized).toContain("Unpatched is sending this payout.");
    expect(authorized).not.toContain("Record payout result");

    const noAttemptYet = renderToStaticMarkup(<PaymentStatusSection obligations={[processing]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(noAttemptYet).not.toContain("Record payout result");
  });

  it("failed: relabels the payout control to Retry, and still offers cancellation", () => {
    const failed: PaymentObligation = { ...PENDING_OBLIGATION, status: "failed" };
    const html = renderToStaticMarkup(<PaymentStatusSection obligations={[failed]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(html).toContain("Payment failed");
    expect(html).toContain("Retry payout");
    expect(html).toContain("Cancel award");
  });

  it("succeeded is terminal; a fully cancelled bounty can be re-issued", () => {
    const succeeded: PaymentObligation = { ...PENDING_OBLIGATION, status: "succeeded" };
    const succeededHtml = renderToStaticMarkup(<PaymentStatusSection obligations={[succeeded]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(succeededHtml).toContain("Payment completed");
    expect(succeededHtml).not.toContain("<button");

    const cancelled: PaymentObligation = { ...PENDING_OBLIGATION, status: "cancelled" };
    const cancelledHtml = renderToStaticMarkup(<PaymentStatusSection obligations={[cancelled]} latestAttempts={{}} readiness={[]} acceptance={null} isOwnReport={false} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(cancelledHtml).toContain("Every payment obligation for this bounty was cancelled");
    expect(cancelledHtml).toContain("Create payment obligation");
  });
});

describe("dialogs default to closed and only show their trigger, never the confirmation copy up front", () => {
  it("CreatePaymentObligationButton", () => {
    const html = renderToStaticMarkup(<CreatePaymentObligationButton {...REF} currency="USD" amountMinorUnits={60000} />);
    expect(html).toContain("Create payment obligation");
    expect(html).not.toContain("It does not itself move any money");
  });

  it("InitiateManualPayoutButton", () => {
    const html = renderToStaticMarkup(<InitiateManualPayoutButton {...REF} obligationId="obligation-1" currency="USD" amountMinorUnits={60000} platformFeeMinorUnits={12000} isRetry={false} />);
    expect(html).toContain("Pay researcher");
    expect(html).not.toContain("Unpatched does not transfer funds itself");
  });

  it("RecordPaymentResultDialog", () => {
    const html = renderToStaticMarkup(<RecordPaymentResultDialog {...REF} attemptId={ATTEMPT.id} />);
    expect(html).toContain("Record payout result");
    expect(html).not.toContain("Failure code");
  });

  it("CancelPaymentObligationDialog is styled as a destructive action", () => {
    const html = renderToStaticMarkup(<CancelPaymentObligationDialog {...REF} obligationId="obligation-1" />);
    expect(html).toContain("bg-danger");
  });
});

describe("PaymentStatusSection: payout gate, recipients and the researcher's confirmation", () => {
  const RAE = { researcherId: "researcher-1", displayName: "Rae Kestrel", blockers: [] as ("payout_method_missing" | "tax_form_not_verified" | "kyc_not_verified")[] };

  it("names each recipient and disables payout for a blocked one, saying what is missing", () => {
    const collaborator: PaymentObligation = { ...PENDING_OBLIGATION, id: "obligation-2", researcherId: "collab-1", amountMinorUnits: 15000, platformFeeMinorUnits: 3000 };
    const html = renderToStaticMarkup(
      <PaymentStatusSection
        obligations={[PENDING_OBLIGATION, collaborator]}
        latestAttempts={{}}
        readiness={[RAE, { researcherId: "collab-1", displayName: "Ivo Marsh", blockers: ["tax_form_not_verified"] }]}
        acceptance={null}
        isOwnReport={false}
        canManage={true}
        bountyCurrency="USD"
        bountyAmountMinorUnits={75000}
        {...REF}
      />,
    );
    expect(html).toContain("Rae Kestrel");
    expect(html).toContain("Ivo Marsh");
    expect(html).toContain("Tax form not yet verified");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Pay researcher/);
  });

  it("the researcher sees their own blockers with a link to fix them, and can confirm the award", () => {
    const html = renderToStaticMarkup(
      <PaymentStatusSection
        obligations={[PENDING_OBLIGATION]}
        latestAttempts={{}}
        readiness={[{ ...RAE, blockers: ["payout_method_missing"] }]}
        acceptance={null}
        isOwnReport={true}
        canManage={false}
        bountyCurrency="USD"
        bountyAmountMinorUnits={60000}
        {...REF}
      />,
    );
    expect(html).toContain("No payout method on file");
    expect(html).toContain("/settings/payments");
    expect(html).toContain("Confirm award");
  });

  it("once confirmed, says so and offers no confirm button", () => {
    const html = renderToStaticMarkup(
      <PaymentStatusSection
        obligations={[]}
        latestAttempts={{}}
        readiness={[RAE]}
        acceptance={{ amountMinorUnits: 60000, currency: "USD", acceptedAt: "2026-10-01T00:00:00Z" }}
        isOwnReport={true}
        canManage={false}
        bountyCurrency="USD"
        bountyAmountMinorUnits={60000}
        {...REF}
      />,
    );
    expect(html).toContain("You confirmed this award");
    expect(html).not.toContain("Confirm award</button>");
  });
});

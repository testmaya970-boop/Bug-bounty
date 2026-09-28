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
      <PaymentStatusSection obligation={null} latestAttempt={null} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(html).toContain("No payment obligation has been created yet");
    expect(html).toContain("Create payment obligation");
  });

  it("hides the Create button entirely for an unauthorized viewer (e.g. the researcher)", () => {
    const html = renderToStaticMarkup(
      <PaymentStatusSection obligation={null} latestAttempt={null} canManage={false} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(html).not.toContain("Create payment obligation");
  });

  it("pending: shows the safe status label and, when authorized, Initiate/Cancel controls", () => {
    const authorized = renderToStaticMarkup(
      <PaymentStatusSection obligation={PENDING_OBLIGATION} latestAttempt={null} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(authorized).toContain("Payment pending");
    expect(authorized).toContain("600.00");
    expect(authorized).toContain("Initiate manual payout");
    expect(authorized).toContain("Cancel payment obligation");
    // The fee is billed to the organization ON TOP (202609250010): PENDING_OBLIGATION is a
    // 600.00 bounty with a 120.00 fee, so the org's total due is 720.00 -- and nothing is
    // deducted from the researcher (no 480.00 anywhere).
    expect(authorized).toContain("Paid to the researcher in full");
    expect(authorized).toContain("120.00");
    expect(authorized).toContain("720.00");
    expect(authorized).not.toContain("480.00");

    const researcher = renderToStaticMarkup(
      <PaymentStatusSection obligation={PENDING_OBLIGATION} latestAttempt={null} canManage={false} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />,
    );
    expect(researcher).toContain("Payment pending");
    expect(researcher).toContain("600.00");
    // The researcher never sees the organization's fee, or a reduced amount.
    expect(researcher).not.toMatch(/fee/i);
    expect(researcher).not.toContain("480.00");
    expect(researcher).not.toContain("720.00");
    expect(researcher).not.toContain("Initiate manual payout");
    expect(researcher).not.toContain("Cancel payment obligation");
  });

  it("processing: shows a Record payout result control only when authorized and a latest attempt is known", () => {
    const processing: PaymentObligation = { ...PENDING_OBLIGATION, status: "processing" };
    const authorized = renderToStaticMarkup(<PaymentStatusSection obligation={processing} latestAttempt={ATTEMPT} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(authorized).toContain("Payment processing");
    expect(authorized).toContain("Record payout result");

    const noAttemptYet = renderToStaticMarkup(<PaymentStatusSection obligation={processing} latestAttempt={null} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(noAttemptYet).not.toContain("Record payout result");
  });

  it("failed: relabels the payout control to Retry, and still offers cancellation", () => {
    const failed: PaymentObligation = { ...PENDING_OBLIGATION, status: "failed" };
    const html = renderToStaticMarkup(<PaymentStatusSection obligation={failed} latestAttempt={null} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(html).toContain("Payment failed");
    expect(html).toContain("Retry payout");
    expect(html).toContain("Cancel payment obligation");
  });

  it("succeeded and cancelled are fully terminal -- no action controls at all, even for an authorized viewer", () => {
    const succeeded: PaymentObligation = { ...PENDING_OBLIGATION, status: "succeeded" };
    const succeededHtml = renderToStaticMarkup(<PaymentStatusSection obligation={succeeded} latestAttempt={null} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(succeededHtml).toContain("Payment completed");
    expect(succeededHtml).not.toContain("<button");

    const cancelled: PaymentObligation = { ...PENDING_OBLIGATION, status: "cancelled" };
    const cancelledHtml = renderToStaticMarkup(<PaymentStatusSection obligation={cancelled} latestAttempt={null} canManage={true} bountyCurrency="USD" bountyAmountMinorUnits={60000} {...REF} />);
    expect(cancelledHtml).toContain("Payment cancelled");
    expect(cancelledHtml).not.toContain("<button");
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
    expect(html).toContain("Initiate manual payout");
    expect(html).not.toContain("Unpatched does not transfer funds itself");
  });

  it("RecordPaymentResultDialog", () => {
    const html = renderToStaticMarkup(<RecordPaymentResultDialog {...REF} attempt={ATTEMPT} />);
    expect(html).toContain("Record payout result");
    expect(html).not.toContain("Failure code");
  });

  it("CancelPaymentObligationDialog is styled as a destructive action", () => {
    const html = renderToStaticMarkup(<CancelPaymentObligationDialog {...REF} obligationId="obligation-1" />);
    expect(html).toContain("bg-danger");
  });
});

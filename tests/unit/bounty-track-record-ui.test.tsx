import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BountyTrackRecord } from "../../components/payments/bounty-track-record";
import type { MyPaymentObligation } from "../../services/payments";

// The platform fee is billed to the organization on top of the bounty
// (db/migrations/202609250010) -- the researcher receives the full bounty and never sees a
// fee. MyPaymentObligation doesn't even carry one.
function obligation(overrides: Partial<MyPaymentObligation>): MyPaymentObligation {
  return {
    id: "po-1",
    reportId: "report-1",
    researcherId: "researcher-1",
    bountyDecisionId: "decision-1",
    amountMinorUnits: 100000,
    currency: "USD",
    status: "succeeded",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    programName: "Acme Bounty",
    organizationName: "Acme Security",
    reportTitle: "Reflected XSS",
    ...overrides,
  };
}

describe("BountyTrackRecord: the researcher sees the full bounty, never a platform fee", () => {
  it("per-row: the full bounty amount, with no fee or net wording", () => {
    const html = renderToStaticMarkup(<BountyTrackRecord obligations={[obligation({ amountMinorUnits: 100000 })]} />);
    expect(html).toContain("1000.00");
    expect(html).not.toMatch(/fee/i);
    expect(html).not.toMatch(/net of/i);
  });

  it("summary totals sum the full bounty amounts", () => {
    const html = renderToStaticMarkup(
      <BountyTrackRecord
        obligations={[
          obligation({ id: "po-1", amountMinorUnits: 100000, status: "succeeded" }),
          obligation({ id: "po-2", amountMinorUnits: 50000, status: "succeeded" }),
          obligation({ id: "po-3", amountMinorUnits: 25000, status: "pending" }),
        ]}
      />,
    );
    expect(html).toContain("Total paid (USD)");
    expect(html).toContain("1500.00");
    expect(html).toContain("Pending (USD)");
    expect(html).toContain("250.00");
  });
});

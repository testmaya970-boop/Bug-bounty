import { describe, expect, it } from "vitest";
import { describeAuditChange } from "../../lib/audit-change";

describe("audit change detail", () => {
  it("turns previous/new pairs into before → after and keeps only what changed", () => {
    expect(
      describeAuditChange({ new_target: "a.example", program_id: "x", new_asset_type: "domain", new_scope_state: "out_of_scope", previous_target: "a.example", previous_asset_type: "domain", previous_scope_state: "in_scope" }),
    ).toEqual(["Scope state: in scope → out of scope"]);
  });

  it("lists self-describing fields and formats money; never ids", () => {
    expect(describeAuditChange({ target: "api.example", asset_type: "domain", program_id: "p1" })).toEqual(["Target: api.example", "Asset type: domain"]);
    expect(describeAuditChange({ amount_minor_units: 150000, currency: "USD", report_id: "r" })).toEqual(["Amount: USD 1500.00"]);
    expect(describeAuditChange({})).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { cvssBand, cvssSeverityMismatch } from "../../lib/cvss";

describe("lib/cvss", () => {
  it("uses FIRST.org's CVSS v3.1 bands at their exact edges", () => {
    expect([0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map(cvssBand)).toEqual(["none", "low", "low", "medium", "medium", "high", "high", "critical", "critical"]);
  });

  it("reports a mismatch only when both a severity and a score exist and they disagree", () => {
    expect(cvssSeverityMismatch("critical", 3.1)).toBe("low");
    expect(cvssSeverityMismatch("high", 7.5)).toBeNull();
    expect(cvssSeverityMismatch(null, 9.8)).toBeNull();
    expect(cvssSeverityMismatch("high", null)).toBeNull();
  });
});

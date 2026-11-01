import { describe, expect, it } from "vitest";
import { buildCvss4Vector, cvss4Band, cvss4Score, parseCvss4Vector } from "../../lib/cvss4";

// Reference values from FIRST's CVSS v4.0 calculator.
describe("CVSS 4.0", () => {
  it("scores reference vectors", () => {
    expect(cvss4Score("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBe(9.3);
    expect(cvss4Score("CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBe(8.5);
    expect(cvss4Score("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N")).toBe(0);
  });

  it("refuses malformed or incomplete vectors instead of guessing", () => {
    expect(cvss4Score("CVSS:4.0/AV:X")).toBeNull();
    expect(cvss4Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBeNull();
    expect(buildCvss4Vector({ AV: "N" })).toBeNull();
  });

  it("round-trips a vector through the metric form", () => {
    const v = "CVSS:4.0/AV:A/AC:H/AT:P/PR:L/UI:P/VC:L/VI:N/VA:N/SC:L/SI:N/SA:N";
    expect(buildCvss4Vector(parseCvss4Vector(v))).toBe(v);
  });

  it("bands like v3.1", () => {
    expect(cvss4Band(9.3)).toBe("critical");
    expect(cvss4Band(6.9)).toBe("medium");
    expect(cvss4Band(0)).toBe("none");
  });
});

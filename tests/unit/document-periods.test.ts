import { describe, expect, it } from "vitest";
import { calendarYearRange, financialPeriodRange, financialQuarterOf, financialYearOf, monthRange, parseRange, recentMonths } from "../../lib/document-periods";

describe("document periods", () => {
  it("cuts the Indian financial year at 1 April", () => {
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
    expect(financialYearOf("2027-03-31")).toBe("2026-27");
    expect(financialYearOf("2099-12-31")).toBe("2099-00");
    expect(financialQuarterOf("2026-06-30")).toBe("Q1");
    expect(financialQuarterOf("2026-07-01")).toBe("Q2");
    expect(financialQuarterOf("2026-12-31")).toBe("Q3");
    expect(financialQuarterOf("2027-02-01")).toBe("Q4");
  });

  it("turns periods into exact date ranges and refuses malformed ones", () => {
    expect(financialPeriodRange("2026-27")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(financialPeriodRange("2026-27-Q2")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(financialPeriodRange("2026-27-Q4")).toEqual({ from: "2027-01-01", to: "2027-03-31" });
    expect(financialPeriodRange("2026-28")).toBeNull();
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-13")).toBeNull();
    expect(calendarYearRange("2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("defaults a range to the last 30 days and rejects a reversed one", () => {
    expect(parseRange(undefined, undefined, "2026-10-22")).toEqual({ from: "2026-09-23", to: "2026-10-22" });
    expect(parseRange("2026-10-05", "2026-10-01")).toBeNull();
    expect(parseRange("bad", "2026-10-01")).toEqual({ from: "2026-09-02", to: "2026-10-01" });
    expect(recentMonths(3, "2026-01-15")).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

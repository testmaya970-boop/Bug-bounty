import { describe, expect, it } from "vitest";
import { isBankCode, isPassportNumber, isPhoneCountryCode, isPhoneNumber, isPlausibleDateOfBirth, normalizeBankCode } from "../../lib/kyc-validation";

describe("identity and payout field checks", () => {
  it("phone: country code like +91, number of 6 to 14 digits", () => {
    expect(isPhoneCountryCode("+91")).toBe(true);
    expect(isPhoneCountryCode("abc")).toBe(false);
    expect(isPhoneCountryCode("+1234")).toBe(false);
    expect(isPhoneNumber("98765 43210")).toBe(true);
    expect(isPhoneNumber("12")).toBe(false);
  });

  it("passport: 6 to 9 letters and numbers", () => {
    expect(isPassportNumber("K1234567")).toBe(true);
    expect(isPassportNumber("X")).toBe(false);
    expect(isPassportNumber("AB-12345")).toBe(false);
  });

  it("date of birth: real, past, at least 16", () => {
    const now = new Date("2026-10-14T00:00:00Z");
    expect(isPlausibleDateOfBirth("1990-05-20", now)).toBe(true);
    expect(isPlausibleDateOfBirth("2030-01-01", now)).toBe(false);
    expect(isPlausibleDateOfBirth("2015-01-01", now)).toBe(false);
    expect(isPlausibleDateOfBirth("1990-02-30", now)).toBe(false);
    expect(isPlausibleDateOfBirth("1800-01-01", now)).toBe(false);
  });

  it("bank code: IFSC, US routing or SWIFT, nothing else", () => {
    expect(isBankCode("hdfc0001234")).toBe(true);
    expect(isBankCode("021000021")).toBe(true);
    expect(isBankCode("DEUTDEFF500")).toBe(true);
    for (const junk of ["!!", "ZZ", "<script>", "12345"]) expect(isBankCode(junk)).toBe(false);
    expect(normalizeBankCode(" hdfc 0001234 ")).toBe("HDFC0001234");
  });
});

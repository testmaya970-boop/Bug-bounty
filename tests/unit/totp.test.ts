import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, totpUri } from "../../lib/auth/totp";

// RFC 6238 Appendix B (SHA1, 8 digits there; the last 6 digits are what authenticator
// apps show). The same algorithm runs in Postgres (private.totp_code); the E2E test
// cross-checks the two by enrolling with a code computed here.
const RFC_KEY = Buffer.from("12345678901234567890");

describe("totpCode matches the RFC 6238 test vectors", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("T=%i -> %s", (unixSeconds, expected) => {
    expect(totpCode(RFC_KEY, Math.floor(unixSeconds / 30))).toBe(expected);
  });
});

describe("base32 / secrets / otpauth URI", () => {
  it("round-trips and matches the RFC 4648 example", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW 6YTB OI").toString()).toBe("foobar");
  });

  it("generates a 160-bit secret whose base32 and hex forms agree", () => {
    const { hex, base32 } = generateTotpSecret();
    expect(hex).toMatch(/^[0-9a-f]{40}$/);
    expect(base32).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(base32).toString("hex")).toBe(hex);
  });

  it("builds an otpauth URI authenticator apps accept", () => {
    expect(totpUri("a+b@example.com", "JBSWY3DPEHPK3PXP")).toBe(
      "otpauth://totp/Unpatched%3Aa%2Bb%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Unpatched&algorithm=SHA1&digits=6&period=30",
    );
  });
});

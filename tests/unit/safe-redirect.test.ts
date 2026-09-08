import { describe, expect, it } from "vitest";
import { isSafeRedirect } from "../../lib/auth/safe-redirect";

describe("isSafeRedirect: the one open-redirect guard, now consolidated to a single implementation (previously duplicated in app/sign-in/page.tsx and actions/auth.ts)", () => {
  it("accepts a root-relative path", () => {
    expect(isSafeRedirect("/organizations/org-1")).toBe(true);
  });

  it("rejects a protocol-relative URL -- a leading // is treated by browsers as a full URL, not a path", () => {
    expect(isSafeRedirect("//evil.test")).toBe(false);
  });

  it("rejects an absolute URL to another host", () => {
    expect(isSafeRedirect("https://evil.test/phish")).toBe(false);
  });

  it("rejects a path that does not start with /", () => {
    expect(isSafeRedirect("organizations")).toBe(false);
  });

  it("rejects undefined/empty", () => {
    expect(isSafeRedirect(undefined)).toBe(false);
    expect(isSafeRedirect("")).toBe(false);
  });
});

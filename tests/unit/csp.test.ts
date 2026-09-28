import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "../../lib/security/csp";

const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("content security policy", () => {
  it("allows only nonce'd scripts in production -- no unsafe-inline, no unsafe-eval", () => {
    const script = directive(buildContentSecurityPolicy("abc123", false), "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("adds unsafe-eval only in development", () => {
    expect(directive(buildContentSecurityPolicy("n", true), "script-src")).toContain("'unsafe-eval'");
  });

  it("keeps clickjacking, plugin and base-tag protections", () => {
    const policy = buildContentSecurityPolicy("n", false);
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
  });

  it("generates a different nonce every call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

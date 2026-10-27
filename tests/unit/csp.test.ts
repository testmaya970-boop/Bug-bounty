import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, evidenceStorageOrigin, generateNonce } from "../../lib/security/csp";

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

  it("lets the browser connect to the evidence store (direct uploads) and nowhere else", () => {
    expect(directive(buildContentSecurityPolicy("n", false, "https://storage.example.com"), "connect-src")).toBe("connect-src 'self' https://storage.example.com");
    expect(directive(buildContentSecurityPolicy("n", false, ""), "connect-src")).toBe("connect-src 'self'");
    expect(evidenceStorageOrigin("https://storage.example.com:9000/some/path?x=1")).toBe("https://storage.example.com:9000");
    // A bad value never widens the policy.
    expect(evidenceStorageOrigin("not a url")).toBe("");
    expect(evidenceStorageOrigin("javascript:alert(1)")).toBe("");
    expect(evidenceStorageOrigin(undefined)).toBe("");
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

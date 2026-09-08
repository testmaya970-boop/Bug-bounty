import { describe, expect, it } from "vitest";
import { generateInvitationToken, hashInvitationToken } from "../../services/invitations";

describe("invitation tokens", () => {
  it("generates a long, url-safe token", () => {
    const token = generateInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token every call", () => {
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });

  it("hashes deterministically, so the same token always looks up the same row", () => {
    const token = "fixed-token-value-for-this-test";
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it("produces a 64-hex-char SHA-256 digest that does not contain the raw token", () => {
    const token = "another-fixed-token-for-this-test";
    const hash = hashInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("gives different tokens different hashes", () => {
    expect(hashInvitationToken(generateInvitationToken())).not.toBe(hashInvitationToken(generateInvitationToken()));
  });
});

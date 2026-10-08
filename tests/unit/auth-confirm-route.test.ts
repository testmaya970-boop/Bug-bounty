import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/services/auth", () => ({ peekPasswordResetToken: vi.fn(async () => true) }));

const ENV = {
  APP_ORIGIN: "https://app.example.test",
  DATABASE_URL: "postgres://app:s3cret@db:5432/unpatched",
  SESSION_COOKIE_SECRET: "a".repeat(64),
  S3_ENDPOINT: "http://minio:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "evidence",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};
const original = { ...process.env };
beforeEach(() => Object.assign(process.env, ENV));
afterEach(() => {
  process.env = { ...original };
});

describe("GET /auth/confirm: redirects are built from APP_ORIGIN, never from request headers", () => {
  it("ignores a forged Host and X-Forwarded-Proto on a valid reset token", async () => {
    const { GET } = await import("../../app/auth/confirm/route");
    const request = new NextRequest("http://attacker.example/auth/confirm?type=recovery&token=abc", {
      headers: { host: "attacker.example", "x-forwarded-proto": "https" },
    });

    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://app.example.test");
    expect(location.pathname).toBe("/reset-password");
  });

  it("uses APP_ORIGIN for the failure redirect too", async () => {
    const { GET } = await import("../../app/auth/confirm/route");
    const request = new NextRequest("http://attacker.example/auth/confirm", { headers: { host: "attacker.example" } });

    const response = await GET(request);

    expect(new URL(response.headers.get("location")!).origin).toBe("https://app.example.test");
  });
});

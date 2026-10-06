import { afterEach, describe, expect, it } from "vitest";
import { DEV_KYC_ENCRYPTION_KEY, findConfigurationProblems, findKycEncryptionKeyProblem } from "../../lib/startup-check";

const VALID = {
  DATABASE_URL: "postgres://app:s3cret@db:5432/sentinel",
  SESSION_COOKIE_SECRET: "a".repeat(64),
  S3_ENDPOINT: "http://minio:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "evidence",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  EMAIL_PROVIDER: "resend",
};
const original = { ...process.env };
function withEnv(env: Record<string, string | undefined>) {
  for (const key of Object.keys(VALID)) delete process.env[key];
  Object.assign(process.env, env);
  return process.env;
}
afterEach(() => {
  process.env = { ...original };
});

describe("startup configuration check", () => {
  it("passes a complete, real configuration", () => {
    expect(findConfigurationProblems(withEnv(VALID), true)).toEqual([]);
  });

  it("names missing variables", () => {
    const problems = findConfigurationProblems(withEnv({ ...VALID, S3_BUCKET: undefined, SESSION_COOKIE_SECRET: "short" }), false);
    expect(problems.join("\n")).toMatch(/S3_BUCKET/);
    expect(problems.join("\n")).toMatch(/SESSION_COOKIE_SECRET/);
  });

  it("rejects .env.example placeholders in production only", () => {
    const env = withEnv({ ...VALID, SESSION_COOKIE_SECRET: "your-32-plus-byte-random-secret-padding-padding" });
    expect(findConfigurationProblems(env, true)).toEqual(["SESSION_COOKIE_SECRET still has the .env.example placeholder value"]);
    expect(findConfigurationProblems(env, false)).toEqual([]);
  });

  it("rejects the simulated dev email provider in production, unless it is the local prod-build test", () => {
    for (const provider of [undefined, "dev"]) {
      expect(findConfigurationProblems(withEnv({ ...VALID, EMAIL_PROVIDER: provider }), true).join("\n")).toMatch(/EMAIL_PROVIDER/);
    }
    expect(findConfigurationProblems(withEnv({ ...VALID, EMAIL_PROVIDER: "dev" }), false)).toEqual([]);
    expect(findConfigurationProblems(withEnv({ ...VALID, EMAIL_PROVIDER: "dev", LOCAL_PROD_TEST: "1" }), true)).toEqual([]);
  });

  it("rejects a missing or dev-only KYC encryption key, accepts a real one", () => {
    expect(findKycEncryptionKeyProblem(null)).toMatch(/not set/);
    expect(findKycEncryptionKeyProblem("")).toMatch(/not set/);
    expect(findKycEncryptionKeyProblem(DEV_KYC_ENCRYPTION_KEY)).toMatch(/local-dev key/);
    expect(findKycEncryptionKeyProblem("a-real-secret-from-the-secret-manager")).toBeNull();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { findConfigurationProblems } from "../../lib/startup-check";

const VALID = {
  DATABASE_URL: "postgres://app:s3cret@db:5432/sentinel",
  SESSION_COOKIE_SECRET: "a".repeat(64),
  S3_ENDPOINT: "http://minio:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "evidence",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
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
});

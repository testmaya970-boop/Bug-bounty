import { z } from "zod";

/**
 * DATABASE_URL points at the standalone Postgres instance (local dev:
 * docker-compose.native.yml's sentinel-postgres service). SESSION_COOKIE_SECRET signs
 * the opaque session cookie (lib/auth/session.ts). The S3_* vars configure the
 * evidence-store backend (lib/evidence-store.ts's s3EvidenceObjectStore) -- local dev
 * points these at docker-compose.native.yml's MinIO.
 */
const nativeSchema = z.object({
  // The app's own public origin, e.g. https://app.example.com. Every absolute link the app
  // emails or redirects to is built from this -- never from the request's Host or
  // X-Forwarded-* headers, which the client controls (password-reset link poisoning).
  APP_ORIGIN: z
    .string()
    .url()
    .refine((value) => /^https?:\/\/[^/]+\/?$/.test(value), "APP_ORIGIN must be an origin like https://app.example.com (no path)")
    .transform((value) => value.replace(/\/$/, "")),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_SECRET: z.string().min(32),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export function getNativeEnv() {
  return nativeSchema.parse({
    APP_ORIGIN: process.env.APP_ORIGIN || process.env.APP_URL || "http://localhost:3000",
    DATABASE_URL: process.env.DATABASE_URL || "postgres://mock:mock@localhost:5432/unpatched_mock",
    SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET || "unpatched-ai-studio-session-cookie-secret-key-2026",
    S3_ENDPOINT: process.env.S3_ENDPOINT || "http://localhost:9000",
    S3_REGION: process.env.S3_REGION || "us-east-1",
    S3_BUCKET: process.env.S3_BUCKET || "evidence",
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "mock-access-key",
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "mock-secret-key",
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "true",
  });
}

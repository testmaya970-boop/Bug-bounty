import { z } from "zod";

/**
 * DATABASE_URL points at the standalone Postgres instance (local dev:
 * docker-compose.native.yml's sentinel-postgres service). SESSION_COOKIE_SECRET signs
 * the opaque session cookie (lib/auth/session.ts). The S3_* vars configure the
 * evidence-store backend (lib/evidence-store.ts's s3EvidenceObjectStore) -- local dev
 * points these at docker-compose.native.yml's MinIO.
 */
const nativeSchema = z.object({
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
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  });
}

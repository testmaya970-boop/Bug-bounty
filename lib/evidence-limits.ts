import "server-only";
import type { EvidenceLimits } from "./evidence-policy";

/**
 * The one place attachment limits are configured, per deployment:
 *   EVIDENCE_MAX_FILE_MB  per-file limit in MiB (default 50)
 *   EVIDENCE_MAX_FILES    attachments per report submission (default 20)
 * Pages pass these to the upload UI as props, and the server enforces the same values when it
 * signs an upload and again when it verifies the stored object. Files never pass through the
 * app server or a reverse proxy (they go straight to object storage under a signed URL bound to
 * the exact size), so there is no request-body limit to keep in step. The database refuses
 * anything above its fixed 1 GiB ceiling (202610260004), so a larger setting is rejected here.
 */
const DB_CEILING_MB = 1024;

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max} (got "${raw}").`);
  }
  return value;
}

export function evidenceLimits(): EvidenceLimits {
  return {
    maxFileBytes: intFromEnv("EVIDENCE_MAX_FILE_MB", 50, 1, DB_CEILING_MB) * 1024 * 1024,
    maxFiles: intFromEnv("EVIDENCE_MAX_FILES", 20, 1, 100),
  };
}

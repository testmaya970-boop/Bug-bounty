import "server-only";
import { recordError } from "@/lib/error-tracking";

/**
 * Shared by every service that calls a `CODE: message`-raising SECURITY DEFINER
 * function (organization-members.ts, organizations.ts). services/auth.ts does not use
 * this -- Supabase Auth's own errors are plain English sentences, not this convention,
 * and are mapped separately there.
 */
export class OrganizationServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OrganizationServiceError";
  }
}

export function mapRpcError(error: { message: string; stack?: string }): never {
  const match = /^([A-Z_]+): (.+)$/.exec(error.message);
  if (match) throw new OrganizationServiceError(match[2], match[1]);
  // Do not surface a raw Postgres/PostgREST error to the client -- SECURITY.md requires
  // errors not expose internal details, and an unrecognized error is, by definition,
  // one we have not deliberately decided is safe to show. It IS recorded for platform
  // admins (/platform/errors): this path used to swallow real bugs silently -- a swapped
  // RPC argument broke every report-template save with only this generic message.
  void recordError({ source: "server", message: `Unmapped database error: ${error.message}`, stack: error.stack ?? new Error().stack });
  throw new OrganizationServiceError("The request could not be completed. Try again in a moment.", "UNKNOWN");
}

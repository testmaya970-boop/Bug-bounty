import "server-only";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Mints a request id and logs a start/completed-or-failed pair around one operation,
 * with duration and (on failure) the error's own code -- never its message, which may
 * legitimately be safe user-facing text but is not what this log line is for. Request
 * ids are for debugging/correlation only, never an authorization input (they are never
 * checked against anything -- there is no `if (requestId === ...)` anywhere).
 *
 * Deliberately explicit pass-through, not AsyncLocalStorage-based propagation: Server
 * Actions in this codebase call services directly with no existing shared per-request
 * context, and introducing one is a larger refactor than this hardening slice's scope.
 * This wrapper is applied incrementally at representative, abuse-sensitive call sites
 * (submitReportAction, createOrganizationAction, the /api/v1/reports route) -- adopting
 * it at the remaining Server Actions is a documented, mechanical follow-up, not an
 * architectural change. See docs/decisions/0018-production-hardening-and-integration-boundary.md.
 */
export async function withRequestLogging<T>(operation: string, context: { actorId?: string | null; organizationId?: string | null }, fn: (requestId: string) => Promise<T>): Promise<T> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const base = { requestId, operation, actorId: context.actorId ?? null, organizationId: context.organizationId ?? null };

  logger.log({ level: "info", ...base, message: "started" });
  try {
    const result = await fn(requestId);
    logger.log({ level: "info", ...base, durationMs: Date.now() - startedAt, message: "completed" });
    return result;
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
    logger.log({ level: "error", ...base, durationMs: Date.now() - startedAt, errorCode, message: "failed" });
    throw error;
  }
}

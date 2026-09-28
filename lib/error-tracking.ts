import "server-only";
import { createHash } from "node:crypto";
import { callRpc, withServiceRoleTransaction } from "@/lib/db/pool";

export type ErrorSource = "server" | "client";

/** Groups occurrences of the same bug: the message with volatile values (ids, numbers,
 * quoted strings) masked, plus the top stack frame without line/column numbers. */
export function errorFingerprint(source: ErrorSource, message: string, stack?: string | null): string {
  const normalizedMessage = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/(["'`]).*?\1/g, "<str>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .trim();
  const topFrame = (stack ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("at "))
    ?.replace(/:\d+:\d+\)?$/, "")
    ?? "";
  return createHash("sha256").update(`${source}|${normalizedMessage}|${topFrame}`).digest("hex").slice(0, 32);
}

export type ErrorReport = {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  route?: string | null;
  digest?: string | null;
  requestId?: string | null;
  userId?: string | null;
};

/** Best-effort: never throws, never blocks the caller's own error handling. If the
 * database itself is what failed, this fails too and only the console line remains. */
export async function recordError(report: ErrorReport): Promise<void> {
  try {
    await withServiceRoleTransaction((client) =>
      callRpc(client, "public.record_app_error", [
        report.source,
        errorFingerprint(report.source, report.message, report.stack),
        report.message || "(no message)",
        report.stack ?? null,
        report.route ?? null,
        report.digest ?? null,
        report.requestId ?? null,
        report.userId ?? null,
      ]),
    );
  } catch (error) {
    console.error("[error-tracking] could not record error:", error instanceof Error ? error.message : error, "| original:", report.message);
  }
}

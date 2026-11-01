import "server-only";
import { callRpc, withServiceRoleTransaction } from "@/lib/db/pool";

export type ErrorSource = "server" | "client";

function simpleHexHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${hex1}${hex2}${hex1}${hex2}`;
}

export function errorFingerprint(source: ErrorSource, message: string, stack?: string | null): string {
  const normalizedMessage = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/(["'`]).*?\1/g, "<str>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .trim();
  const topFrame =
    (stack ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("at "))
      ?.replace(/:\d+:\d+\)?$/, "") ?? "";
  return simpleHexHash(`${source}|${normalizedMessage}|${topFrame}`);
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
    console.error(
      "[error-tracking] could not record error:",
      error instanceof Error ? error.message : error,
      "| original:",
      report.message,
    );
  }
}

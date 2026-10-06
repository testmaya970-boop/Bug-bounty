import type { Instrumentation } from "next";

/** Once per server start: refuse to start with missing, invalid, or placeholder settings. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { exitOnConfigurationProblems, exitOnDatabaseConfigurationProblems } = await import("./lib/startup-check");
  exitOnConfigurationProblems();
  await exitOnDatabaseConfigurationProblems();
}

/** Server-side capture for in-house error tracking: every error Next.js catches while
 * rendering, running a Server Action, or serving a route handler is recorded to
 * public.app_errors (viewable at /platform/errors). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // lib/error-tracking uses `pg`, which only runs on the Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const err = error instanceof Error ? error : new Error(String(error));
  // A client that disconnects mid-stream (closed tab, navigated away) tears down the
  // response stream. That is not an app bug, and recording it buried real errors on
  // /platform/errors (seen live: every E2E run produced several).
  const code = (err as { code?: string }).code;
  if (code === "ERR_STREAM_PREMATURE_CLOSE" || err.name === "AbortError" || err.message === "The destination stream closed early.") return;
  const { recordError } = await import("./lib/error-tracking");
  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : (value ?? null);
  };
  await recordError({
    source: "server",
    message: err.message,
    stack: err.stack,
    // Path only: query strings can carry tokens (invitation links, password resets).
    route: `${request.method} ${request.path.split("?")[0]} (${context.routerKind} ${context.routeType}: ${context.routePath})`,
    digest: typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : null,
    requestId: header("x-request-id"),
    // Set by proxy.ts only after real session validation (any client copy is stripped).
    userId: header("x-sentinel-verified-user-id"),
  });
};

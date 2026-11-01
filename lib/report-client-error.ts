/** Browser side of in-house error tracking: POSTs to /api/client-errors (same origin, so
 * the CSP's connect-src 'self' allows it). Best-effort and quiet -- never throws, and
 * drops a repeat of the same message within 30s so a render loop can't flood it. */
const recentlySent = new Map<string, number>();

export function reportClientError(error: unknown, digest?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-Error thrown");
    const message = err.message || "(no message)";
    const now = Date.now();
    if ((recentlySent.get(message) ?? 0) > now - 30_000) return;
    recentlySent.set(message, now);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message: message.slice(0, 1000), stack: err.stack?.slice(0, 8000) ?? null, route: location.pathname, digest: digest ?? null }),
    }).catch(() => {});
  } catch {
    // Reporting must never become a second error.
  }
}

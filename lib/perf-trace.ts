import "server-only";

// TEMPORARY instrumentation for the latency audit -- traces where server-side time is
// actually spent for one request (middleware -> auth -> DB -> render), gated behind an
// env var so it never runs unless explicitly enabled. Remove once the audit is done.
//
// Turn 8c: every line now carries the request id middleware.ts mints and sets on
// x-request-id (both the outbound request header, readable here via next/headers(), and
// the response header) -- so a forensics pass can join client-side navigation timing to
// the exact server-side stage breakdown for that same request, not just eyeball
// coincidentally-close timestamps in a log stream.
const ENABLED = process.env.PERF_TRACE === "1";

async function currentRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get("x-request-id");
  } catch {
    // Outside a real Next.js request scope (middleware itself, a unit test, a script) --
    // next/headers() throws rather than returning empty. Fall back to "no id" rather than
    // let the instrumentation itself break the request it's measuring.
    return null;
  }
}

export function perfMark(label: string, extra?: Record<string, unknown>) {
  if (!ENABLED) return;
  const t = process.hrtime.bigint();
  console.log(`[perf] ${label} t=${t.toString()}${extra ? " " + JSON.stringify(extra) : ""}`);
}

export async function perfTimed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  const requestId = await currentRequestId();
  const prefix = requestId ? `requestId=${requestId} ` : "";
  try {
    const result = await fn();
    console.log(`[perf] ${prefix}${label} durationMs=${(performance.now() - start).toFixed(1)}`);
    return result;
  } catch (error) {
    console.log(`[perf] ${prefix}${label} durationMs=${(performance.now() - start).toFixed(1)} FAILED`);
    throw error;
  }
}

/** Middleware itself runs before next/headers() has a request to read from (it's what's
 * setting the header everything else reads) -- so it logs with an explicit, pre-minted id
 * rather than going through currentRequestId(). */
export function perfTimedWithId<T>(requestId: string, label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!ENABLED) return Promise.resolve(fn());
  const start = performance.now();
  return Promise.resolve(fn()).then(
    (result) => {
      console.log(`[perf] requestId=${requestId} ${label} durationMs=${(performance.now() - start).toFixed(1)}`);
      return result;
    },
    (error) => {
      console.log(`[perf] requestId=${requestId} ${label} durationMs=${(performance.now() - start).toFixed(1)} FAILED`);
      throw error;
    },
  );
}

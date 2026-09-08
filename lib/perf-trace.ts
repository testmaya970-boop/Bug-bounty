import "server-only";

// TEMPORARY instrumentation for the latency audit -- traces where server-side time is
// actually spent for one request (middleware -> auth -> DB -> render), gated behind an
// env var so it never runs unless explicitly enabled. Remove once the audit is done.
const ENABLED = process.env.PERF_TRACE === "1";

export function perfMark(label: string, extra?: Record<string, unknown>) {
  if (!ENABLED) return;
  const t = process.hrtime.bigint();
  console.log(`[perf] ${label} t=${t.toString()}${extra ? " " + JSON.stringify(extra) : ""}`);
}

export async function perfTimed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    const result = await fn();
    console.log(`[perf] ${label} durationMs=${(performance.now() - start).toFixed(1)}`);
    return result;
  } catch (error) {
    console.log(`[perf] ${label} durationMs=${(performance.now() - start).toFixed(1)} FAILED`);
    throw error;
  }
}

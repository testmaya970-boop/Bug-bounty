/**
 * The one structured-logging boundary in this codebase. A single JSON line per event,
 * written to stdout/stderr -- no external log platform (Datadog, New Relic) is wired up
 * yet, and none is needed to get real operational signal locally or in any standard
 * hosting log aggregator, which already captures stdout/stderr. Swapping in a real sink
 * later means changing the `write` function below, never every call site.
 *
 * NEVER pass into `message`/any field: passwords, auth tokens, session cookies, API
 * keys, provider secrets, raw evidence bytes, report descriptions, private
 * communication content, or a signed URL. This module does not scan for secrets --
 * every call site is responsible for only ever passing safe identifiers (ids, codes,
 * counts, durations), never content. Full email addresses are also avoided in favor of
 * an id where one already exists.
 */
export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  requestId: string;
  operation: string;
  actorId?: string | null;
  organizationId?: string | null;
  aggregateType?: string;
  aggregateId?: string;
  errorCode?: string;
  durationMs?: number;
  message?: string;
};

function write(entry: LogEntry): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = { log: write };

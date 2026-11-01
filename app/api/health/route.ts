import { NextResponse } from "next/server";
import { query, withServiceRoleTransaction } from "@/lib/db/pool";
import { checkEvidenceStorageReachable } from "@/lib/evidence-store";

// Liveness/readiness for a load balancer or uptime monitor. Unauthenticated by design and
// deliberately coarse -- no hostnames, versions, error text, or row data. Excluded from
// proxy.ts by path: the proxy opens a DB connection for session validation, so with the
// database down it would fail before this could report that.
//
//   503 "down"      the database is unreachable (nothing works)
//   200 "degraded"  the app serves, but storage is unreachable, or the outbox worker is
//                   not draining (oldest pending event older than OUTBOX_STALE_SECONDS),
//                   or events dead-lettered in the last 24h (older ones are a recovery
//                   backlog on /platform/needs-recovery, not a current health problem --
//                   they are still counted in deadLettered)
//   200 "ok"

const CHECK_TIMEOUT_MS = 3000;
const OUTBOX_STALE_SECONDS = 300;

type Check = { ok: boolean; ms: number };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const start = performance.now();
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS))]);
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
}

export async function GET() {
  const database = await timed(() => query("select 1"));
  const storage = await timed(checkEvidenceStorageReachable);

  let outbox: { ok: boolean; oldestPendingSeconds: number | null; deadLettered: number | null; deadLetteredLast24h: number | null } = {
    ok: false,
    oldestPendingSeconds: null,
    deadLettered: null,
    deadLetteredLast24h: null,
  };
  if (database.ok) {
    try {
      const rows = await withServiceRoleTransaction((client) =>
        client
          .query<{ oldest: number | null; dead: string; dead_recent: string }>(
            `select extract(epoch from now() - min(available_at) filter (where status = 'pending' and available_at <= now()))::int as oldest,
                    count(*) filter (where status = 'dead_letter') as dead,
                    count(*) filter (where status = 'dead_letter' and updated_at > now() - interval '24 hours') as dead_recent
               from public.outbox_events`,
          )
          .then((r) => r.rows),
      );
      const oldest = rows[0]?.oldest ?? null;
      const dead = Number(rows[0]?.dead ?? 0);
      const deadRecent = Number(rows[0]?.dead_recent ?? 0);
      outbox = { ok: (oldest ?? 0) <= OUTBOX_STALE_SECONDS && deadRecent === 0, oldestPendingSeconds: oldest, deadLettered: dead, deadLetteredLast24h: deadRecent };
    } catch {
      // Leave outbox as not-ok.
    }
  }

  const status = !database.ok ? "down" : storage.ok && outbox.ok ? "ok" : "degraded";
  // Up/down per check only: timings and queue counts told anyone how the system was doing
  // inside. The numbers are on /platform/needs-recovery for admins.
  return NextResponse.json(
    { status, checks: { database: database.ok, storage: storage.ok, outbox: outbox.ok }, checkedAt: new Date().toISOString() },
    { status: status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

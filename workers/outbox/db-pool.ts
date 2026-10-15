import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getNativeEnv } from "@/lib/env";
import { ensureEnumArrayTypeParsers } from "@/lib/db/type-parsers";

/**
 * The worker's own copy of lib/db/pool.ts's pool/transaction/RPC helpers -- NOT a
 * `server-only`-guarded module, deliberately, for the same reason lib/email-provider.ts's
 * own header comment already documents: this file is reachable from the standalone
 * outbox worker process (workers/outbox/run.ts, started via plain `tsx`, never bundled
 * by Next.js), not just from Server Components/Actions. `server-only`'s guard relies on
 * webpack/Turbopack's special module resolution to enforce itself; outside that bundler
 * it throws unconditionally instead of no-op'ing, which would break every real
 * invocation of this file in the worker process. No client component imports this
 * module (nothing under `app/`, `actions/`, or `services/` may import it -- see
 * workers/outbox/client.ts's own comment, carried forward from the file this module
 * replaces), so the guard's actual purpose (never let this reach a browser bundle) is
 * already satisfied without it.
 *
 * Deliberately narrower than lib/db/pool.ts: the worker only ever needs `service_role`
 * (claim_outbox_events/complete_outbox_event and every handler RPC are all
 * service_role-only grants -- see db/migrations/202608290002_outbox_event_foundation.sql
 * and siblings), so this file has no withActorTransaction/withAnonTransaction/
 * withPublicTransaction -- those exist only in lib/db/pool.ts, for request-scoped,
 * RLS-personalized reads this worker never performs.
 */

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!pool) {
    const env = getNativeEnv();
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 5, keepAlive: true });
    // Same as lib/db/pool.ts: a connection the database closed while idle is dropped and
    // logged, and the worker keeps going on fresh connections.
    pool.on("error", (error) => {
      console.error(`[outbox-worker] idle connection lost: ${error.message}`);
    });
  }
  // The worker is a separate Node.js process from Next.js's own -- pg's type-parser
  // registry is process-global, so this must run against the worker's own pool too. See
  // lib/db/type-parsers.ts for why this is needed at all (pg does not auto-parse
  // enum/composite array columns; several handler RPCs read researcher-
  // identity/program-scope columns of exactly that shape). date/timestamp/timestamptz
  // correctness is already covered by this same import above (registerDateTimeTypeParsers
  // runs at module load time, not gated on this call).
  await ensureEnumArrayTypeParsers(pool);
  return pool;
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
  // A connection too broken to roll back is destroyed, not returned to the pool.
  let broken: Error | undefined;
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch((rollbackError: Error) => {
      broken = rollbackError;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

/**
 * The worker's ONLY database entry point. Switches to the `service_role` Postgres role
 * (BYPASSRLS, see db/migrations/000000000001_native_auth_shim.sql) for the lifetime of
 * one transaction, via `SET LOCAL`/`SET ROLE` -- transaction-scoped, automatically
 * reverted on COMMIT/ROLLBACK, so a pooled connection returned to the Pool can never
 * leak into the next call that reuses it. `claim_outbox_events`/`complete_outbox_event`
 * and every handler RPC are granted to `service_role` only -- `authenticated`/`anon`
 * have no EXECUTE grant at all, and RLS on both outbox tables has zero permissive
 * policies, so this is the only way to reach them, mirroring exactly what the
 * Supabase-era service-role key provided.
 */
export async function withServiceRoleTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
    await client.query("set local role service_role");
    return fn(client);
  });
}

/**
 * Mirrors lib/db/pool.ts's callRpc exactly: `pg`'s thrown DatabaseError.message is
 * already the identical `CODE: message` text every handler's own error-prefix check
 * (PROVENANCE_MISMATCH, REPORT_NOT_FOUND, INVALID_FACT_TYPE, ...) already expects, with
 * zero adaptation needed beyond the call syntax itself.
 */
const VALID_FUNCTION_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

export async function callRpc<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  functionName: string,
  args: unknown[] = [],
): Promise<T[]> {
  if (!VALID_FUNCTION_NAME.test(functionName)) {
    throw new Error(`callRpc: invalid function name "${functionName}"`);
  }
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query<T>(`select * from ${functionName}(${placeholders})`, args);
  return result.rows;
}

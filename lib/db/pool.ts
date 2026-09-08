import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getNativeEnv } from "@/lib/env";
import { ensureEnumArrayTypeParsers } from "@/lib/db/type-parsers";

/**
 * One module-scoped Pool per process/lambda container, never one per request -- a fresh
 * Pool per invocation is exactly the connection-exhaustion failure mode standalone
 * Postgres has under serverless concurrency that Supabase's PostgREST/pooler layer
 * previously hid from this codebase. `max` is deliberately small: this app is expected to
 * run behind a transaction-pooling proxy (PgBouncer or a managed-Postgres equivalent) in
 * any real deployment, so each serverless function instance only ever needs a handful of
 * concurrent connections of its own, not a large local pool.
 */
let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!pool) {
    const env = getNativeEnv();
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  }
  // See lib/db/type-parsers.ts for why this is needed (pg does not auto-parse
  // enum/composite array columns) -- also called by workers/outbox/db-pool.ts, against
  // its own separate pool/process, since pg's type-parser registry is process-global.
  // date/timestamp/timestamptz correctness is a separate concern handled by the same
  // module's own import-time side effect (registerDateTimeTypeParsers) -- already in
  // effect the moment this file's own top-level import above runs, not gated on this
  // call or on a Pool existing at all.
  await ensureEnumArrayTypeParsers(pool);
  return pool;
}

/**
 * Sets the full claims blob auth.uid()/auth.jwt()/auth.role() read (see
 * db/migrations/000000000001_native_auth_shim.sql) and switches to the `authenticated`
 * (or `anon`/`service_role`) Postgres role for the remainder of the current transaction.
 * Both the GUC and the role switch are set via `SET LOCAL`/`SET ROLE` (transaction-scoped,
 * never session-scoped), so both are automatically reverted on COMMIT/ROLLBACK -- a
 * pooled connection returned to the Pool can never leak one request's actor/role into the
 * next request that reuses it (verified live). The role switch specifically is not
 * optional: the app's own DATABASE_URL connection role (db/init/01-app-role.sql) is a
 * plain non-superuser, non-BYPASSRLS login role with no privileges of its own -- every
 * GRANT and every RLS policy in this schema is scoped `to authenticated` (or `anon`/
 * `service_role`), so without this SET ROLE the connection can see nothing at all rather
 * than everything; there is no silent fallback to "superuser sees all" the way local
 * Supabase's own bootstrap role might tempt you to assume.
 */
const VALID_DB_ROLES = new Set(["authenticated", "anon", "service_role"]);

export async function setActorClaims(client: PoolClient, claims: { sub: string; sessionId?: string; aal?: "aal1" | "aal2"; role?: "authenticated" | "anon" | "service_role" }): Promise<void> {
  const role = claims.role ?? "authenticated";
  // role is a literal union at every call site, but interpolated directly below (SET
  // ROLE has no bind-parameter form in Postgres) -- guarded the same way callRpc guards
  // functionName, as a hard backstop against it ever becoming caller-controlled input.
  if (!VALID_DB_ROLES.has(role)) throw new Error(`setActorClaims: invalid role "${role}"`);
  await client.query("select set_config('app.current_claims', $1, true)", [
    JSON.stringify({ sub: claims.sub, session_id: claims.sessionId, aal: claims.aal, role }),
  ]);
  await client.query(`set local role ${role}`);
}

/** Borrows a pooled client for the duration of fn, always releasing it back to the pool
 * afterward -- for call sites (middleware's session-cookie validation) that need a raw
 * client without an implicit transaction wrapper around the whole call. */
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The standard entry point for authenticated request handling: opens a transaction, sets
 * the actor's claims (auth.uid() = actorId) and switches to the `authenticated` role for
 * the lifetime of that transaction only, runs fn, and commits. Pass `actorId: null` for
 * genuinely unauthenticated-but-still-RLS-scoped paths (rare -- most unauthenticated
 * paths should use withServiceRoleTransaction or plain withTransaction instead); the GUC
 * is still set (auth.uid() resolves to null), so this never falls back to stale state
 * from a previous transaction on a reused connection.
 */
export async function withActorTransaction<T>(
  actorId: string | null,
  fn: (client: PoolClient) => Promise<T>,
  options?: { sessionId?: string; aal?: "aal1" | "aal2" },
): Promise<T> {
  return withTransaction(async (client) => {
    await setActorClaims(client, { sub: actorId ?? "", sessionId: options?.sessionId, aal: options?.aal, role: "authenticated" });
    return fn(client);
  });
}

/**
 * The service-role equivalent of withActorTransaction -- switches to the `service_role`
 * Postgres role (BYPASSRLS, see the auth-shim migration), for the same narrow reason
 * lib/supabase/service-role.ts's createServiceRoleClient() existed: a bearer-token
 * `/api/v1/*` request has no session for RLS to scope by, so the only correct path is to
 * bypass RLS explicitly and filter every query by an already-verified actor id in
 * application code, never trusting a client-supplied one. NEVER use this for a
 * cookie-session request -- withActorTransaction (RLS-scoped, the correct default) is
 * what every Server Component/Action should use.
 */
export async function withServiceRoleTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await setActorClaims(client, { sub: "", role: "service_role" });
    return fn(client);
  });
}

/**
 * The `anon` equivalent -- for the small set of SECURITY DEFINER functions deliberately
 * grantED to `anon` because they are genuinely meant to be reachable by an unauthenticated
 * caller (public program discovery, account signup/sign-in-rate-limit-checking before any
 * session exists). Distinct from withServiceRoleTransaction: `anon` does NOT bypass RLS
 * and has no table-level grants at all beyond what a handful of specific migrations
 * explicitly gave it -- using this instead of service_role for these call sites
 * preserves the original, deliberately narrow reachability those grants encode, rather
 * than silently widening it to "any service_role-capable server code."
 */
export async function withAnonTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await setActorClaims(client, { sub: "", role: "anon" });
    return fn(client);
  });
}

/**
 * For RPCs grantED to both `anon` and `authenticated` (public discovery pages reachable
 * by a signed-out visitor, but that also make sense to call from a signed-in page) --
 * uses `authenticated` (with the real actor id, so RLS/auth.uid()-based personalization
 * inside the function still works for a signed-in caller) when actorId is non-null,
 * `anon` otherwise. Matches the original Supabase behavior exactly: the same
 * cookie-bound client was used either way there too, and PostgREST resolved the role
 * from whether a valid session cookie was present, not from a separate code path.
 */
export async function withPublicTransaction<T>(actorId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return actorId ? withActorTransaction(actorId, fn) : withAnonTransaction(fn);
}

/** Unauthenticated/system-level query outside any actor context (e.g. looking up a
 * session row by its token hash, before we know who the actor is). Never use this for a
 * query that depends on RLS/`auth.uid()` scoping -- use withActorTransaction instead. */
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await (await getPool()).query<T>(sql, params);
  return result.rows;
}

/**
 * Mirrors services/rpc-error.ts's expectations exactly: every SECURITY DEFINER function
 * that used to raise `RAISE EXCEPTION 'CODE: message'` for supabase.rpc() to surface as
 * `{ error: { message: "CODE: message" } }` now throws that identical string via `pg`'s
 * DatabaseError instead. `pg` prefixes the raised message with nothing extra beyond the
 * message itself (unlike psql's own "ERROR:  " prefix, which is a client-side display
 * convention, not part of the wire error) -- so `error.message` here is already exactly
 * the `CODE: message` text mapRpcError expects, with zero adaptation needed at the ~155
 * call sites beyond changing `if (error) mapError(error)` to `catch (error) { mapError(error) }`.
 */
const VALID_FUNCTION_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

export async function callRpc<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  functionName: string,
  args: unknown[] = [],
): Promise<T[]> {
  // functionName is always a call-site literal (e.g. "am_i_deactivated"), never
  // user-controlled input -- this check exists as a hard guard against it ever
  // accidentally becoming one, since it is interpolated directly into the query text
  // (a function name cannot be a bind parameter in Postgres).
  if (!VALID_FUNCTION_NAME.test(functionName)) {
    throw new Error(`callRpc: invalid function name "${functionName}"`);
  }
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query<T>(`select * from ${functionName}(${placeholders})`, args);
  return result.rows;
}

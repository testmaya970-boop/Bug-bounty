import "server-only";

import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { MockPoolClient } from "@/lib/db/mock-db";

export const VERIFIED_SESSION_ID_HEADER = "x-unpatched-verified-session-id";

export function getPool(): Pool {
  return {
    connect: async () => new MockPoolClient() as unknown as PoolClient,
    query: async <R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<R>> => {
      const client = new MockPoolClient();
      return client.query<R>(text, values);
    },
    end: async () => undefined,
  } as unknown as Pool;
}

export async function closePool(): Promise<void> {
  // No-op for in-memory mock database
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = new MockPoolClient() as unknown as PoolClient;
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  });
}

export type DbActor =
  | { role: "anon" }
  | { role: "authenticated"; userId: string }
  | { role: "service_role"; userId?: string };

export async function withActorTransaction<T>(
  actorOrUserId: string | null | DbActor,
  fn: (client: PoolClient) => Promise<T>,
  options?: { sessionId?: string | null },
): Promise<T> {
  return withTransaction(async (client) => {
    let sub = "";
    let role = "anon";
    if (typeof actorOrUserId === "string") {
      sub = actorOrUserId;
      role = "authenticated";
    } else if (actorOrUserId && typeof actorOrUserId === "object") {
      role = actorOrUserId.role;
      sub = actorOrUserId.role === "anon" ? "" : (actorOrUserId.userId ?? "");
    }
    await client.query(
      `SELECT
         set_config('request.jwt.claim.sub', $1, true),
         set_config('request.jwt.claim.role', $2, true)`,
      [sub, role, options?.sessionId ?? null],
    );
    return fn(client);
  });
}

export async function withServiceRoleTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  actorUserId?: string,
): Promise<T> {
  return withActorTransaction({ role: "service_role", userId: actorUserId }, fn);
}

export async function withAnonTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withActorTransaction({ role: "anon" }, fn);
}

export async function withPublicTransaction<T>(
  userIdOrFn: (string | null) | ((client: PoolClient) => Promise<T>),
  maybeFn?: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (typeof userIdOrFn === "function") {
    return withActorTransaction(null, userIdOrFn);
  }
  return withActorTransaction(userIdOrFn, maybeFn!);
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<R>> {
  const client = new MockPoolClient();
  return client.query<R>(text, values);
}

const SAFE_IDENT = /^[a-z_][a-z0-9_.]*$/i;

export async function callRpc<R extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  fnName: string,
  params: unknown[] | Record<string, unknown> = [],
): Promise<R[]> {
  if (!SAFE_IDENT.test(fnName)) {
    throw new Error(`Invalid RPC function identifier: ${fnName}`);
  }
  const normalizedFn = fnName.includes(".") ? fnName : `public.${fnName}`;
  const values = Array.isArray(params) ? params : Object.values(params);
  const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
  const sql = `SELECT * FROM ${normalizedFn}(${placeholders})`;
  const res = await client.query<R>(sql, values);
  return res.rows;
}

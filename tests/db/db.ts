import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Shared helpers for tests/db. The owner connection can switch into the app's real roles, so
// each test exercises exactly what a signed-in user, the server (service_role) or an anonymous
// visitor would hit -- RLS, grants, SECURITY DEFINER checks and triggers included.

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("tests/db needs MIGRATION_DATABASE_URL (npm run test:db loads .env.local)");

export type Db = pg.Client & {
  as(role: "service" | "anon" | { user: string; session?: string }): Promise<void>;
  one<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T>;
  rows<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T[]>;
  /** Runs sql and returns the error message, or null if it succeeded (inside a savepoint). */
  fails(sql: string, args?: unknown[]): Promise<string | null>;
};

export const fixture = JSON.parse(fs.readFileSync("e2e/.seed-fixture.json", "utf8")) as {
  organizationId: string;
  publicProgramId: string;
  privateProgramId: string;
};

/** Runs fn in a transaction that is always rolled back. */
export async function inTx(fn: (db: Db) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: url }) as Db;
  await client.connect();
  client.as = async (role) => {
    await client.query("reset role");
    if (role === "service") {
      await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
      await client.query("set local role service_role");
    } else if (role === "anon") {
      await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "anon" })]);
      await client.query("set local role anon");
    } else {
      await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: role.user, session_id: role.session, role: "authenticated" })]);
      await client.query("set local role authenticated");
    }
  };
  client.one = async (sql, args) => (await client.query(sql, args)).rows[0];
  client.rows = async (sql, args) => (await client.query(sql, args)).rows;
  client.fails = async (sql, args) => {
    await client.query("savepoint t");
    try {
      await client.query(sql, args);
      await client.query("release savepoint t");
      return null;
    } catch (error) {
      await client.query("rollback to savepoint t");
      return (error as Error).message;
    }
  };
  try {
    await client.query("begin");
    await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

/** Seeded account id by email (seed:e2e). */
export async function userId(db: Db, email: string): Promise<string> {
  await db.query("reset role");
  const row = await db.one<{ id: string }>("select id from public.users where email = $1", [email]);
  if (!row) throw new Error(`seed account missing: ${email} (run npm run seed:e2e)`);
  return row.id;
}

/** A fresh verified account of the given type, created as the owner (rolled back with the test). */
export async function newUser(db: Db, type: "researcher" | "organization", tag = randomUUID().slice(0, 8)): Promise<string> {
  await db.query("reset role");
  const u = await db.one<{ id: string }>("select id from public.create_user($1, 'x', $2, $3)", [`dbtest.${tag}@unpatched.demo`, `DB Test ${tag}`, `dbtest_${tag}`]);
  await db.query("update public.users set email_verified_at = now(), account_type = $2 where id = $1", [u.id, type]);
  return u.id;
}

/** An MFA-verified session for a platform admin (is_platform_admin requires one). */
export async function adminSession(db: Db, adminId: string): Promise<string> {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal2')", [id, adminId, `dbtest-${id}`]);
  return id;
}

export async function ackPolicy(db: Db, programId: string): Promise<void> {
  await db.query(
    "select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)",
    [programId],
  );
}

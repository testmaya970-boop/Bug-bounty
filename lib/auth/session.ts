import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { getNativeEnv } from "@/lib/env";

/**
 * Opaque, DB-backed sessions -- replacing GoTrue's JWT+refresh-token pair (see the
 * migration plan's session-model decision: this removes the refresh-race bug class
 * lib/supabase/middleware.ts's old header comment warned about, at the cost of one
 * indexed DB lookup per request, which is no more than middleware already paid via the
 * am_i_deactivated/get_my_mfa_status RPCs).
 *
 * The cookie value is `${sessionId}.${secret}`, never a bare session id: the session row
 * itself (id, user_id, timestamps, user_agent, ip, aal) is not secret and is exactly what
 * list_my_sessions() already returns to its own owner, but the row's existence must never
 * be guessable/enumerable as a bearer credential from the id alone. `secret` is a 32-byte
 * CSPRNG value; only its HMAC (keyed by SESSION_COOKIE_SECRET, so a stolen database alone
 * is insufficient to forge a valid cookie for an existing session row) is persisted as
 * `token_hash` -- identical hash-at-rest convention to every other token table in this
 * schema (mfa_backup_codes, email_verification_tokens, password_reset_tokens), just
 * HMAC'd instead of plain SHA-256 specifically because the cookie secret must remain
 * unforgeable even if the database is read but SESSION_COOKIE_SECRET is not.
 */

export const SESSION_COOKIE_NAME = "sentinel_session";

export type SessionRow = {
  id: string;
  userId: string;
  aal: "aal1" | "aal2";
};

function signSecret(secret: string): string {
  const env = getNativeEnv();
  return createHmac("sha256", env.SESSION_COOKIE_SECRET).update(secret).digest("hex");
}

function parseCookieValue(value: string | undefined): { sessionId: string; secret: string } | null {
  if (!value) return null;
  const separatorIndex = value.indexOf(".");
  if (separatorIndex < 0) return null;
  const sessionId = value.slice(0, separatorIndex);
  const secret = value.slice(separatorIndex + 1);
  if (!sessionId || !secret) return null;
  return { sessionId, secret };
}

export type CreateSessionInput = {
  userId: string;
  userAgent: string | null;
  ip: string | null;
};

/** Creates a fresh session row and returns the opaque cookie value to set. Always starts
 * at aal1, identical to GoTrue's own invariant that only a real second-factor
 * verification (never password sign-in alone) can elevate a session -- see
 * elevateSessionToAal2 below, called only from the OTP-verify path. */
export async function createSession(client: PoolClient, input: CreateSessionInput): Promise<{ cookieValue: string; session: SessionRow }> {
  const secret = randomBytes(32).toString("base64url");
  const tokenHash = signSecret(secret);
  const { rows } = await client.query<{ id: string; user_id: string; aal: "aal1" | "aal2" }>(
    `insert into public.sessions (user_id, token_hash, user_agent, ip)
     values ($1, $2, $3, $4)
     returning id, user_id, aal`,
    [input.userId, tokenHash, input.userAgent, input.ip],
  );
  const row = rows[0];
  return {
    cookieValue: `${row.id}.${secret}`,
    session: { id: row.id, userId: row.user_id, aal: row.aal },
  };
}

/**
 * Validates a cookie value against the session table. Constant-time compares the
 * submitted secret's HMAC against the stored hash (via a hash-value lookup, which is
 * already a keyed-index equality check, not a loop over rows) -- the actual
 * timing-sensitive step is comparing two fixed-length hex strings, done with
 * timingSafeEqual below rather than `===`, so a mismatch's failure timing cannot leak how
 * many leading hex characters matched.
 */
export async function validateSessionCookie(client: PoolClient, cookieValue: string | undefined): Promise<SessionRow | null> {
  const parsed = parseCookieValue(cookieValue);
  if (!parsed) return null;

  const { rows } = await client.query<{ id: string; user_id: string; aal: "aal1" | "aal2"; token_hash: string }>(
    `select id, user_id, aal, token_hash from public.sessions where id = $1`,
    [parsed.sessionId],
  );
  const row = rows[0];
  if (!row) return null;

  const expectedHash = Buffer.from(row.token_hash, "hex");
  const actualHash = Buffer.from(signSecret(parsed.secret), "hex");
  if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) return null;

  await client.query(`update public.sessions set updated_at = now() where id = $1`, [row.id]);
  return { id: row.id, userId: row.user_id, aal: row.aal };
}

/** Elevates a session to aal2 -- called only after a real, server-verified OTP check
 * (services/mfa.ts). Never callable from a password-only context, mirroring GoTrue's own
 * invariant that only mfa.verify() (never signInWithPassword alone) sets aal2. */
export async function elevateSessionToAal2(client: PoolClient, sessionId: string): Promise<void> {
  await client.query(`update public.sessions set aal = 'aal2', updated_at = now() where id = $1`, [sessionId]);
}

export async function revokeSession(client: PoolClient, sessionId: string): Promise<void> {
  await client.query(`delete from public.sessions where id = $1`, [sessionId]);
}

export async function revokeAllSessionsForUser(client: PoolClient, userId: string): Promise<void> {
  await client.query(`delete from public.sessions where user_id = $1`, [userId]);
}

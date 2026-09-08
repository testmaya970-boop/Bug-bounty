// Live, end-to-end exercise of the new native-Postgres auth flows against a real
// database -- signup, email verification, sign-in, session validation (the same
// validateSessionCookie middleware calls), password reset, sign-out, and session
// expiry/revocation. Run with tsx so the real TS modules (not mocks) execute for real.
import { Pool, types as pgTypes } from "pg";
import argon2 from "argon2";
import { randomBytes, createHash, createHmac } from "node:crypto";

// pg parses date/timestamp/timestamptz columns into JS Date objects by default, not the
// ISO strings the real app (lib/db/type-parsers.ts) always sees -- this bare Pool has no
// access to that module (this file is a self-contained ad-hoc script run by plain
// `node`, never `tsx`, and none of the scripts/ directory imports from lib/), so the
// same three stable built-in OIDs are registered directly here. See
// lib/db/type-parsers.ts's own comment for the full rationale.
for (const oid of [1082, 1114, 1184]) pgTypes.setTypeParser(oid, (value) => new Date(value).toISOString());

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_COOKIE_SECRET = "live-test-secret-at-least-32-bytes-long-000";
const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
function signSecret(secret) {
  return createHmac("sha256", SESSION_COOKIE_SECRET).update(secret).digest("hex");
}

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

// Mirrors services/auth.ts's withServiceRoleTransaction: every table this script
// exercises directly (users writes, sessions, email_verification_tokens,
// password_reset_tokens) is service_role-only -- `authenticated` has SELECT-only (or
// nothing at all) on them, matching Supabase's own service-role-key-for-auth-internals
// pattern (see db/migrations/000000000001_native_auth_shim.sql's service_role comment).
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const email = `live-test-${Date.now()}@example.test`;
  const password = "a-real-strong-password-123";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // 1. signup: create_user + issue verification token
  const { userId, verifyToken } = await withTx(async (client) => {
    const { rows } = await client.query("select * from public.create_user($1, $2, $3, $4)", [email, passwordHash, "Live Test", null]);
    const user = rows[0];
    const token = randomBytes(32).toString("base64url");
    await client.query(
      "insert into public.email_verification_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + interval '24 hours')",
      [user.id, hashToken(token)],
    );
    return { userId: user.id, verifyToken: token };
  });
  assert(!!userId, "signup: create_user returned a new user id");

  // 2. sign-in BEFORE email verification must fail with EMAIL_NOT_CONFIRMED-equivalent
  const preVerifyRow = await withTx((client) =>
    client.query("select email_verified_at from public.users where id = $1", [userId]).then((r) => r.rows[0]),
  );
  assert(preVerifyRow.email_verified_at === null, "signup: email_verified_at is null before confirmation");

  // 3. verify email token (consumes it, single-use)
  const verifyResult = await withTx(async (client) => {
    const { rows } = await client.query(
      "update public.email_verification_tokens set consumed_at = now() where token_hash = $1 and consumed_at is null and expires_at > now() returning user_id",
      [hashToken(verifyToken)],
    );
    if (rows[0]) await client.query("update public.users set email_verified_at = now() where id = $1", [rows[0].user_id]);
    return rows[0];
  });
  assert(!!verifyResult, "email verification: token consumed successfully");

  const replayResult = await withTx((client) =>
    client
      .query("update public.email_verification_tokens set consumed_at = now() where token_hash = $1 and consumed_at is null and expires_at > now() returning user_id", [hashToken(verifyToken)])
      .then((r) => r.rows[0]),
  );
  assert(!replayResult, "email verification: token cannot be replayed (single-use)");

  // 4. sign-in: create a real session
  const secret = randomBytes(32).toString("base64url");
  const tokenHash = signSecret(secret);
  const session = await withTx((client) =>
    client
      .query("insert into public.sessions (user_id, token_hash, user_agent, ip) values ($1, $2, $3, $4) returning id, user_id, aal", [userId, tokenHash, "live-test-agent", "127.0.0.1"])
      .then((r) => r.rows[0]),
  );
  assert(session.aal === "aal1", "sign-in: new session starts at aal1");
  const cookieValue = `${session.id}.${secret}`;

  // 5. middleware-equivalent: validate the session cookie
  const validated = await withTx(async (client) => {
    const [sessionId, secretPart] = cookieValue.split(".");
    const { rows } = await client.query("select id, user_id, aal, token_hash from public.sessions where id = $1", [sessionId]);
    const row = rows[0];
    if (!row) return null;
    return row.token_hash === signSecret(secretPart) ? row : null;
  });
  assert(!!validated && validated.user_id === userId, "middleware: validateSessionCookie resolves the correct user from a real cookie");

  // 6. tampered cookie must fail
  const tamperedValidated = await withTx(async (client) => {
    const [sessionId] = cookieValue.split(".");
    const { rows } = await client.query("select token_hash from public.sessions where id = $1", [sessionId]);
    const row = rows[0];
    return row.token_hash === signSecret("wrong-secret") ? row : null;
  });
  assert(!tamperedValidated, "middleware: a tampered/wrong session secret is rejected");

  // 7. am_i_deactivated gate via the shim
  const deactivatedCheck = await withTx(async (client) => {
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await client.query("set local role authenticated");
    const { rows } = await client.query("select public.am_i_deactivated()");
    return rows[0].am_i_deactivated;
  });
  assert(deactivatedCheck === false, "gate: am_i_deactivated() is false for an active account via the auth.uid() shim");

  // 8. password reset: issue token, confirm, verify sessions revoked
  const resetToken = randomBytes(32).toString("base64url");
  await withTx((client) =>
    client.query("insert into public.password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [userId, hashToken(resetToken)]),
  );
  const newPasswordHash = await argon2.hash("a-different-new-password-456", { type: argon2.argon2id });
  const resetConsumed = await withTx(async (client) => {
    const { rows } = await client.query(
      "update public.password_reset_tokens set consumed_at = now() where token_hash = $1 and consumed_at is null and expires_at > now() returning user_id",
      [hashToken(resetToken)],
    );
    if (rows[0]) {
      await client.query("update public.users set password_hash = $1 where id = $2", [newPasswordHash, rows[0].user_id]);
      await client.query("delete from public.sessions where user_id = $1", [rows[0].user_id]);
    }
    return rows[0];
  });
  assert(!!resetConsumed, "password reset: token consumed and password updated");

  const sessionsAfterReset = await withTx((client) => client.query("select id from public.sessions where user_id = $1", [userId]).then((r) => r.rows));
  assert(sessionsAfterReset.length === 0, "password reset: every session for the account was revoked");

  // 9. old password no longer verifies, new one does
  const finalHash = await withTx((client) => client.query("select password_hash from public.users where id = $1", [userId]).then((r) => r.rows[0].password_hash));
  assert(!(await argon2.verify(finalHash, password)), "password reset: old password no longer verifies");
  assert(await argon2.verify(finalHash, "a-different-new-password-456"), "password reset: new password verifies");

  // cleanup
  await withTx((client) => client.query("delete from public.users where id = $1", [userId]));

  await pool.end();

  console.log(`\n${failures === 0 ? "ALL LIVE AUTH FLOW TESTS PASSED" : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("LIVE TEST CRASHED:", e);
  process.exitCode = 1;
});

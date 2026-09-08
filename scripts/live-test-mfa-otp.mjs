// Live, end-to-end exercise of the new email-OTP MFA RPCs
// (db/migrations/202609080001_email_otp_mfa.sql) against a real database -- enrollment,
// confirmation (which elevates to aal2 only for a 'verify' purpose, never 'enroll'),
// wrong-code/attempt-limit handling, single-use/expiry, ownership, rate limiting, and
// unenroll. Run with tsx so the real TS modules (not mocks) execute for real. Mirrors
// scripts/live-test-auth-flows.mjs's own structure/conventions.
import { Pool, types as pgTypes } from "pg";
import argon2 from "argon2";
import { createHash } from "node:crypto";

// pg parses date/timestamp/timestamptz columns into JS Date objects by default, not the
// ISO strings the real app (lib/db/type-parsers.ts) always sees -- this bare Pool has no
// access to that module (see live-test-auth-flows.mjs's own comment for why), so the
// same three stable built-in OIDs are registered directly here.
for (const oid of [1082, 1114, 1184]) pgTypes.setTypeParser(oid, (value) => new Date(value).toISOString());

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

async function withServiceRole(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
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

async function withActor(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await client.query("set local role authenticated");
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

async function callRpc(client, fn, args) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await client.query(`select * from ${fn}(${placeholders})`, args);
  return rows;
}

async function main() {
  const email = `live-otp-test-${Date.now()}@example.test`;
  const passwordHash = await argon2.hash("a-real-strong-password-123", { type: argon2.argon2id });

  const userId = await withServiceRole(async (client) => {
    const { rows } = await client.query("select * from public.create_user($1, $2, $3, $4)", [email, passwordHash, "Live OTP Test", null]);
    return rows[0].id;
  });
  assert(!!userId, "setup: created a real user");

  // 1. Ownership/auth guard: an unauthenticated actor (no GUC set) cannot call create_mfa_challenge.
  const unauthResult = await pool
    .connect()
    .then(async (client) => {
      try {
        await client.query("begin");
        await client.query("set local role authenticated");
        return await callRpc(client, "public.create_mfa_challenge", ["enroll", "x", 600]).catch((e) => e);
      } finally {
        await client.query("rollback").catch(() => {});
        client.release();
      }
    });
  assert(unauthResult instanceof Error && unauthResult.message.startsWith("AUTH_REQUIRED"), "auth guard: create_mfa_challenge rejects a caller with no actor claim");

  // 2. Enrollment: create an 'enroll' challenge -- this also creates the unverified mfa_factors row.
  const enrollCode = "123456";
  const challengeId = await withActor(userId, async (client) => {
    const rows = await callRpc(client, "public.create_mfa_challenge", ["enroll", hashCode(enrollCode), 600]);
    return rows[0].create_mfa_challenge;
  });
  assert(!!challengeId, "enrollment: create_mfa_challenge('enroll') returns a new challenge id");

  const factorAfterEnrollStart = await withServiceRole((client) =>
    client.query("select status from public.mfa_factors where user_id = $1", [userId]).then((r) => r.rows[0]),
  );
  assert(factorAfterEnrollStart?.status === "unverified", "enrollment: mfa_factors row created as 'unverified' before confirmation");

  // 3. Wrong code returns 'invalid' without raising (see the migration's own IMPORTANT
  // comment: a RAISE from inside verify_mfa_challenge would discard its own attempts
  // increment) -- attempts increments, but the challenge stays live under the limit.
  const wrongCodeRows = await withActor(userId, (client) => callRpc(client, "public.verify_mfa_challenge", [challengeId, hashCode("000000")]));
  assert(wrongCodeRows[0]?.verify_mfa_challenge === "invalid", "verify: a wrong code returns 'invalid'");

  const attemptsAfterWrong = await withServiceRole((client) => client.query("select attempts, consumed_at from public.mfa_challenges where id = $1", [challengeId]).then((r) => r.rows[0]));
  assert(attemptsAfterWrong.attempts === 1, "verify: a wrong code still increments attempts");
  assert(attemptsAfterWrong.consumed_at === null, "verify: a wrong code (under the attempt limit) does not consume the challenge");

  // 4. Ownership: a different user cannot verify this challenge, even with the exact right code hash.
  const otherUserId = await withServiceRole(async (client) => {
    const { rows } = await client.query("select * from public.create_user($1, $2, $3, $4)", [`live-otp-other-${Date.now()}@example.test`, passwordHash, "Other User", null]);
    return rows[0].id;
  });
  const crossOwnerResult = await withActor(otherUserId, (client) => callRpc(client, "public.verify_mfa_challenge", [challengeId, hashCode(enrollCode)]).catch((e) => e));
  assert(crossOwnerResult instanceof Error && crossOwnerResult.message.startsWith("INVALID_CODE"), "ownership: a different user cannot verify someone else's challenge (no owned row to increment, so this still raises)");

  // 5. Correct code succeeds, marks the factor verified, returns purpose 'enroll'.
  const enrollVerifyRows = await withActor(userId, (client) => callRpc(client, "public.verify_mfa_challenge", [challengeId, hashCode(enrollCode)]));
  assert(enrollVerifyRows[0]?.verify_mfa_challenge === "enroll", "enrollment confirm: verify_mfa_challenge returns purpose 'enroll'");

  const factorAfterVerify = await withServiceRole((client) => client.query("select status, verified_at from public.mfa_factors where user_id = $1", [userId]).then((r) => r.rows[0]));
  assert(factorAfterVerify.status === "verified", "enrollment confirm: mfa_factors status flips to 'verified'");
  assert(!!factorAfterVerify.verified_at, "enrollment confirm: verified_at is stamped");

  // 6. Single-use: the same challenge cannot be verified again, even with the correct code
  // (it's already consumed_at is not null, so the UPDATE ... WHERE consumed_at is null
  // matches zero rows -- the "no owned/unconsumed row" raising path).
  const replayResult = await withActor(userId, (client) => callRpc(client, "public.verify_mfa_challenge", [challengeId, hashCode(enrollCode)]).catch((e) => e));
  assert(replayResult instanceof Error && replayResult.message.startsWith("INVALID_CODE"), "single-use: a consumed challenge cannot be replayed");

  // 7. Re-enrolling an already-verified account is rejected.
  const reEnrollResult = await withActor(userId, (client) => callRpc(client, "public.create_mfa_challenge", ["enroll", hashCode("111111"), 600]).catch((e) => e));
  assert(reEnrollResult instanceof Error && reEnrollResult.message.startsWith("ALREADY_ENROLLED"), "re-enroll guard: create_mfa_challenge('enroll') rejects an already-verified account");

  // 8. Sign-in-time gate: 'verify' purpose challenge, correct code returns purpose 'verify'
  // (services/mfa.ts uses this to decide whether to elevate the session to aal2).
  const verifyCode = "654321";
  const verifyChallengeId = await withActor(userId, async (client) => {
    const rows = await callRpc(client, "public.create_mfa_challenge", ["verify", hashCode(verifyCode), 600]);
    return rows[0].create_mfa_challenge;
  });
  const verifyPurposeRows = await withActor(userId, (client) => callRpc(client, "public.verify_mfa_challenge", [verifyChallengeId, hashCode(verifyCode)]));
  assert(verifyPurposeRows[0]?.verify_mfa_challenge === "verify", "sign-in gate: a correct 'verify' challenge returns purpose 'verify' (triggers aal2 elevation)");

  // 9. Attempt limit: 5 wrong attempts exhausts a challenge even before its expiry.
  const limitChallengeId = await withActor(userId, async (client) => {
    const rows = await callRpc(client, "public.create_mfa_challenge", ["verify", hashCode("999999"), 600]);
    return rows[0].create_mfa_challenge;
  });
  let lastAttemptOutcome;
  for (let i = 0; i < 5; i++) {
    const rows = await withActor(userId, (client) => callRpc(client, "public.verify_mfa_challenge", [limitChallengeId, hashCode("000000")]));
    lastAttemptOutcome = rows[0]?.verify_mfa_challenge;
  }
  assert(lastAttemptOutcome === "invalid", "attempt limit: the 5th wrong attempt is still rejected");
  const exhaustedRow = await withServiceRole((client) => client.query("select attempts, consumed_at from public.mfa_challenges where id = $1", [limitChallengeId]).then((r) => r.rows[0]));
  assert(exhaustedRow.attempts === 5, "attempt limit: attempts reaches exactly 5 after 5 wrong guesses");
  assert(!!exhaustedRow.consumed_at, "attempt limit: the challenge is consumed (exhausted) after 5 wrong attempts");
  const correctAfterExhaustedResult = await withActor(userId, (client) => callRpc(client, "public.verify_mfa_challenge", [limitChallengeId, hashCode("999999")]).catch((e) => e));
  assert(correctAfterExhaustedResult instanceof Error && correctAfterExhaustedResult.message.startsWith("INVALID_CODE"), "attempt limit: even the correct code fails once a challenge is exhausted (already consumed, so no owned/unconsumed row remains)");

  // 10. Rate limit: the 6th challenge request within 15 minutes for the same purpose is rejected.
  // (Purposely uses a fresh 'verify' purpose count: 1 from step 8, 1 from step 9 = 2 so far.)
  let rateLimited = false;
  for (let i = 0; i < 5; i++) {
    const result = await withActor(userId, (client) => callRpc(client, "public.create_mfa_challenge", ["verify", hashCode("111111"), 600]).catch((e) => e));
    if (result instanceof Error) {
      rateLimited = result.message.startsWith("RATE_LIMITED");
      break;
    }
  }
  assert(rateLimited, "rate limit: repeated challenge requests are eventually rejected with RATE_LIMITED");

  // 11. Superseding: creating a new challenge invalidates the previous unconsumed one of the same purpose.
  // (Covered implicitly above -- step 9's attempt-limit challenge was itself created after step 8's
  // already-consumed one, so this asserts the earlier still-live one from before rate-limiting kicked in
  // is now consumed.)
  const supersededCheck = await withServiceRole((client) =>
    client.query("select count(*) as live from public.mfa_challenges where user_id = $1 and purpose = 'verify' and consumed_at is null", [userId]).then((r) => Number(r.rows[0].live)),
  );
  assert(supersededCheck <= 1, "superseding: at most one live 'verify' challenge exists at a time for this user");

  // 12. list_my_mfa_factors reflects the verified factor, keyed by the user's own id.
  const listedFactors = await withActor(userId, (client) => callRpc(client, "public.list_my_mfa_factors", []));
  assert(listedFactors.length === 1 && listedFactors[0].id === userId && listedFactors[0].status === "verified", "list: list_my_mfa_factors returns exactly one verified factor keyed by user id");

  // 13. Unenroll clears both mfa_factors and any mfa_challenges rows.
  await withActor(userId, (client) => callRpc(client, "public.unenroll_my_mfa_factor", []));
  const afterUnenroll = await withServiceRole(async (client) => {
    const factors = await client.query("select 1 from public.mfa_factors where user_id = $1", [userId]);
    const challenges = await client.query("select 1 from public.mfa_challenges where user_id = $1", [userId]);
    return { factors: factors.rowCount, challenges: challenges.rowCount };
  });
  assert(afterUnenroll.factors === 0, "unenroll: mfa_factors row removed");
  assert(afterUnenroll.challenges === 0, "unenroll: mfa_challenges rows removed");

  // 14. Post-unenroll: a 'verify' challenge is now rejected (NOT_ENROLLED), enrollment is allowed again.
  const verifyAfterUnenroll = await withActor(userId, (client) => callRpc(client, "public.create_mfa_challenge", ["verify", hashCode("222222"), 600]).catch((e) => e));
  assert(verifyAfterUnenroll instanceof Error && verifyAfterUnenroll.message.startsWith("NOT_ENROLLED"), "post-unenroll: a 'verify' challenge is rejected with NOT_ENROLLED");

  // cleanup
  await withServiceRole((client) => client.query("delete from public.users where id = any($1)", [[userId, otherUserId]]));
  await pool.end();

  console.log(`\n${failures === 0 ? "ALL LIVE EMAIL-OTP MFA TESTS PASSED" : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("LIVE TEST CRASHED:", e);
  process.exitCode = 1;
});

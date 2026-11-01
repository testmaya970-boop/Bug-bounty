import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockPoolClient, mockDb } from "./mock-db";
import { hashPassword, verifyPassword } from "../auth/password";

describe("Unpatched Mock Database & Auth Layer", () => {
  it("seeds public programs, researchers, disclosures, and CTF challenges", async () => {
    const client = new MockPoolClient();

    const programsRes = await client.query("SELECT * FROM app.list_public_programs($1, $2)", [null, null]);
    assert.ok(programsRes.rows.length >= 4, "Expected at least 4 seeded public programs");

    const leaderboardRes = await client.query("SELECT * FROM app.get_researcher_leaderboard($1)", [50]);
    assert.ok(leaderboardRes.rows.length >= 4, "Expected at least 4 public researchers on leaderboard");

    const disclosuresRes = await client.query("SELECT * FROM app.list_public_disclosures($1, $2, $3)", [null, null, 20]);
    assert.ok(disclosuresRes.rows.length >= 3, "Expected at least 3 public disclosures");

    const ctfRes = await client.query("SELECT * FROM app.list_ctf_challenges()", []);
    assert.equal(ctfRes.rows.length, 4, "Expected 4 CTF challenges");
  });

  it("verifies demo passwords and scrypt password hashes", async () => {
    const demoUser = mockDb.users.find((u) => u.email === "demo.researcher@sentinel.demo");
    assert.ok(demoUser, "Expected demo researcher user to exist");
    const validDemo = await verifyPassword(demoUser.password_hash, "SentinelDemo!2026");
    assert.equal(validDemo, true);

    const hashed = await hashPassword("CustomPass!2026");
    assert.equal( await verifyPassword(hashed, "CustomPass!2026"), true);
    assert.equal(await verifyPassword(hashed, "WrongPassword"), false);
  });

  it("awards points when submitting a valid CTF flag", async () => {
    const client = new MockPoolClient();
    await client.query(
      "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)",
      ["11111111-1111-4111-8111-111111111102", "authenticated"],
    );

    const submitRes = await client.query(
      "SELECT * FROM app.submit_ctf_flag($1, $2)",
      ["graphql-batch-rate-limit-bypass", "UNPATCHED{gR4pHqL_aL1aS_mUlT1pL3x}"],
    );
    assert.equal(submitRes.rows[0]?.is_correct, true);
    assert.equal(submitRes.rows[0]?.points_awarded, 150);
  });
});

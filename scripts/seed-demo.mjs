#!/usr/bin/env node
// Resets/prepares two EXISTING demo accounts on the native Postgres stack -- one
// researcher, one organization owner -- so they're both immediately usable with a known
// password and have a small amount of real mock data. Does NOT create new accounts:
// demo.researcher@sentinel.demo and demo.org.northwind@sentinel.demo already exist from
// earlier work (their password_hash is an unusable, never-verifiable placeholder value with
// must_reset_password = true, matching the convention scripts/migrate-users-data.mjs
// applies to every migrated account -- see services/auth.ts's own comment on that
// convention).
//
// Everything here goes through the exact same SQL RPCs the real product uses
// (activate_program, set_program_visibility, join_public_program, submit_report,
// start_triage, accept_report, ...) -- there is no direct table write for anything
// business-logic-shaped. Each RPC that requires an authenticated actor is called with the
// real actor's claims set via SET LOCAL app.current_claims (see
// db/migrations/000000000001_native_auth_shim.sql and lib/db/pool.ts's
// withActorTransaction, which this script mirrors directly with `pg` since it runs
// outside Next.js).
//
// Safe to re-run: password reset is idempotent, and each RPC call either succeeds once
// (creating one new report/program-state) or is skipped if that state already exists.
//
// Usage: npm run seed:demo (reads DATABASE_URL from .env.local via --env-file)

import pg from "pg";
import argon2 from "argon2";

// Security: this creates/resets accounts whose passwords are in the source code (and for
// seed-e2e, a platform admin). Never against a real deployment -- only when asked explicitly.
if (process.env.ALLOW_TEST_ACCOUNTS !== "1") {
  console.error("Refusing to seed: this creates accounts with passwords published in the repo. Set ALLOW_TEST_ACCOUNTS=1 for a local or CI test database only.");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (e.g. run with `npm run seed:demo`, which loads .env.local).");
  process.exit(1);
}

const PASSWORD = "SentinelDemo!2026";
const DEMO_RESEARCHER_EMAIL = "demo.researcher@sentinel.demo";
const DEMO_ORG_EMAIL = "demo.org.northwind@sentinel.demo";

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

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
  return rows[0];
}

// Non-fatal: logs and continues rather than exiting, since most steps here are
// "make sure this state exists" and may already be satisfied from a prior run or from
// this account's own pre-existing test history.
async function tryStep(promise, label) {
  try {
    return await promise;
  } catch (error) {
    console.log(`  (skipped) ${label}: ${error.message}`);
    return null;
  }
}

async function findUser(email) {
  return withServiceRole(async (client) => {
    const { rows } = await client.query("select id, email, platform_role from public.users where email = $1", [email]);
    return rows[0] ?? null;
  });
}

async function resetPasswordAndVerify(userId) {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  await withServiceRole((client) =>
    client.query(
      "update public.users set password_hash = $1, must_reset_password = false, email_verified_at = coalesce(email_verified_at, now()) where id = $2",
      [passwordHash, userId],
    ),
  );
}

console.log("Preparing Unpatched demo accounts on the native Postgres stack...\n");

const researcher = await findUser(DEMO_RESEARCHER_EMAIL);
const orgUser = await findUser(DEMO_ORG_EMAIL);

if (!researcher || !orgUser) {
  console.error(`Expected accounts not found: ${DEMO_RESEARCHER_EMAIL} / ${DEMO_ORG_EMAIL}. This script resets existing demo accounts, it does not create new ones.`);
  process.exit(1);
}

console.log(`Resetting password for ${DEMO_ORG_EMAIL}...`);
await resetPasswordAndVerify(orgUser.id);
console.log(`Resetting password for ${DEMO_RESEARCHER_EMAIL}...`);
await resetPasswordAndVerify(researcher.id);
console.log("Both accounts now sign in with the known demo password.\n");

// --- Organization: bring one existing draft program to a real, public, active state ---

const org = await withServiceRole(async (client) => {
  const { rows } = await client.query("select id, name from public.organizations where created_by = $1 order by created_at asc limit 1", [orgUser.id]);
  return rows[0] ?? null;
});

let program = null;
if (org) {
  console.log(`Using existing organization "${org.name}"...`);
  program = await withServiceRole(async (client) => {
    const { rows } = await client.query("select id, name, status, visibility from public.programs where organization_id = $1 order by created_at asc limit 1", [org.id]);
    return rows[0] ?? null;
  });

  if (program && program.status !== "active") {
    console.log(`Bringing program "${program.name}" from '${program.status}' to active/public...`);
    await tryStep(
      withActor(orgUser.id, (client) =>
        client.query("select public.add_scope_entry($1, $2, $3, $4, $5)", [program.id, "domain", "api.northwind.example", "in_scope", "Primary public REST API."]),
      ),
      "add_scope_entry",
    );
    if (program.status === "draft") {
      await tryStep(withActor(orgUser.id, (client) => client.query("select public.submit_program_for_review($1)", [program.id])), "submit_program_for_review");
    }
    // activate_program requires real platform-admin authority
    // (202609050013_program_launch_review_gate.sql -- an organization can no longer
    // self-certify its own program launch), checked via private.is_platform_admin(),
    // which reads membership in public.platform_admins -- NOT users.platform_role (that
    // enum value exists but this authorization path doesn't consult it). This script
    // briefly adds the org owner to platform_admins to approve its own seeded program,
    // then removes the row -- a seed-time convenience, not a capability the org owner
    // actually keeps.
    await withServiceRole((client) => client.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [orgUser.id]));
    await tryStep(withActor(orgUser.id, (client) => client.query("select public.activate_program($1)", [program.id])), "activate_program");
    await withServiceRole((client) => client.query("delete from public.platform_admins where user_id = $1", [orgUser.id]));
    await tryStep(withActor(orgUser.id, (client) => client.query("select public.set_program_visibility($1, $2)", [program.id, "public"])), "set_program_visibility");
    await tryStep(
      withActor(orgUser.id, (client) =>
        client.query("select public.update_program_description($1, $2)", [
          program.id,
          "Our primary public API surface — authentication, account management, and billing endpoints.",
        ]),
      ),
      "update_program_description",
    );
  } else if (program) {
    console.log(`Program "${program.name}" is already active.`);
  }
} else {
  console.log(`No organization found for ${DEMO_ORG_EMAIL} -- skipping program setup.`);
}
console.log("");

// --- Researcher: join the public program and submit a couple of mock reports ---

if (program) {
  console.log("Joining the demo researcher to the public program...");
  await tryStep(withActor(researcher.id, (client) => client.query("select public.join_public_program($1)", [program.id])), "join_public_program");

  const existingReports = await withServiceRole(async (client) => {
    const { rows } = await client.query("select count(*) as n from public.reports where researcher_id = $1 and program_id = $2", [researcher.id, program.id]);
    return Number(rows[0].n);
  });

  if (existingReports === 0) {
    console.log("Submitting mock reports...");
    // submit_report's target must fall under an existing in_scope entry for this
    // program -- reusing whatever scope entries the program already has (rather than
    // this script's own preferred asset_type/target) since scope may already be locked
    // in a non-draft program and this script only tries to add scope while still draft.
    const scopeEntry = await withServiceRole(async (client) => {
      const { rows } = await client.query(
        "select asset_type, target from public.program_scope_entries where program_id = $1 and scope_state = 'in_scope' and removed_at is null order by created_at asc limit 1",
        [program.id],
      );
      return rows[0] ?? null;
    });

    if (!scopeEntry) {
      console.log("  (skipped) mock reports: program has no in-scope entries to submit against");
    } else {
      const target = scopeEntry.target;
      await tryStep(
        withActor(researcher.id, (client) =>
          callRpc(client, "public.submit_report", [
            program.id,
            scopeEntry.asset_type,
            target,
            "Reflected XSS in search endpoint",
            "The `q` query parameter on /search is reflected into the response HTML without encoding.\n\nSteps to reproduce:\n1. GET /search?q=<script>alert(1)</script>\n2. Observe the payload executes unescaped in the response body.",
            "cross_site_scripting",
            "An attacker-controlled link can execute arbitrary JavaScript in a victim's session.",
            "medium",
          ]),
        ),
        "submit_report (XSS)",
      );

      const report2 = await tryStep(
        withActor(researcher.id, (client) =>
          callRpc(client, "public.submit_report", [
            program.id,
            scopeEntry.asset_type,
            target,
            "IDOR on user profile API",
            "The /users/{id} endpoint does not verify the caller owns the requested profile.\n\nSteps to reproduce:\n1. Authenticate as user A.\n2. GET /users/{user B's id}.\n3. Observe user B's full profile is returned.",
            "idor",
            "Any authenticated user can enumerate and read every other user's PII.",
            "high",
          ]),
        ),
        "submit_report (IDOR)",
      );

      if (report2) {
        // Take this one through triage/accept so the researcher account isn't showing
        // only untouched "new" reports.
        await tryStep(withActor(orgUser.id, (client) => client.query("select public.start_triage($1)", [report2.id])), "start_triage");
        await tryStep(withActor(orgUser.id, (client) => client.query("select public.set_report_severity($1, $2)", [report2.id, "high"])), "set_report_severity");
        await tryStep(withActor(orgUser.id, (client) => client.query("select public.accept_report($1)", [report2.id])), "accept_report");
      }
      console.log("Submitted mock reports (1 new, 1 accepted).\n");
    }
  } else {
    console.log(`Researcher already has ${existingReports} report(s) on this program -- skipping mock report submission.\n`);
  }
}

await pool.end();

console.log("Done. Sign in to explore:\n");
console.log(`  Researcher : ${DEMO_RESEARCHER_EMAIL} / ${PASSWORD}`);
console.log(`  Org owner  : ${DEMO_ORG_EMAIL} / ${PASSWORD}${org ? `  (${org.name})` : ""}`);

#!/usr/bin/env tsx
// Phase 7 launch-checklist seed: creates a self-contained, dedicated demo dataset
// (1 organization, 2 users, 1 program, 2 scope entries, 3 reports across new/triaged/
// resolved-with-finalized-bounty) entirely through real RPCs -- no direct table inserts
// for anything business-logic-shaped, matching scripts/seed-demo.mjs's own established
// convention exactly (that script resets two PRE-EXISTING demo accounts and is left
// untouched; this one creates a fresh, independent dataset under its own dedicated email
// addresses, so the two scripts can never collide or double-seed each other's data).
//
// Idempotent: every step first checks for existing state (by email, by org/program name,
// by report title) and skips creation if that state already exists -- safe to re-run.
// User creation goes through the real public.create_user RPC (never a raw
// `insert into public.users`), organization/program creation through
// public.create_organization/public.create_program, scope through
// public.add_scope_entry, and every report/triage/bounty step through the identical RPCs
// the real app calls (submit_report, start_triage, set_report_severity, accept_report,
// resolve_report, create_bounty_policy_version, calculate_bounty_recommendation,
// finalize_bounty) -- so every row this script produces carries the exact same RLS
// policies, audit_logs entries, and invariants a real user's action would produce. No
// path here bypasses RLS or skips audit logging.
//
// Usage: npm run seed:launch (reads DATABASE_URL from .env.local via tsx --env-file)

import { Pool, type PoolClient, types as pgTypes } from "pg";
import argon2 from "argon2";

// See lib/db/type-parsers.ts for why this is needed outside the Next.js app -- this
// script has no access to that module (same reason scripts/live-test-*.mjs register it
// inline; see live-test-auth-flows.mjs's own comment), and this script does read
// timestamptz columns (created_at logging below).
for (const oid of [1082, 1114, 1184]) pgTypes.setTypeParser(oid, (value: string) => new Date(value).toISOString());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (e.g. run with `npm run seed:launch`, which loads .env.local).");
  process.exit(1);
}

const PASSWORD = "SentinelLaunch!2026";
const ORG_OWNER_EMAIL = "launch.admin@unpatched.demo";
const RESEARCHER_EMAIL = "launch.researcher@unpatched.demo";
const ORG_NAME = "Launch Checklist Org";
const PROGRAM_NAME = "Launch Checklist Program";

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

async function withServiceRole<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

async function withActor<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

async function callRpc<T>(client: PoolClient, fn: string, args: unknown[]): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await client.query(`select * from ${fn}(${placeholders})`, args);
  return rows[0] as T;
}

async function tryStep<T>(promise: Promise<T>, label: string): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.log(`  (skipped) ${label}: ${(error as Error).message}`);
    return null;
  }
}

type UserRow = { id: string; email: string; display_name: string };

async function findUserByEmail(email: string): Promise<UserRow | null> {
  return withServiceRole(async (client) => {
    const { rows } = await client.query<UserRow>("select id, email, display_name from public.users where email = $1", [email]);
    return rows[0] ?? null;
  });
}

/** Goes through the real public.create_user RPC (granted to service_role), then verifies
 * the email directly -- create_user itself never sets email_verified_at (matching real
 * signup, which requires a separate confirmation step this script substitutes for
 * directly, the same shortcut scripts/seed-demo.mjs's own resetPasswordAndVerify already
 * takes for its two pre-existing accounts). Idempotent: returns the existing row if this
 * email already exists rather than calling create_user again (which would correctly
 * reject with EMAIL_TAKEN). */
async function ensureUser(email: string, displayName: string, username: string): Promise<UserRow> {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`User ${email} already exists.`);
    return existing;
  }
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const created = await withServiceRole((client) => callRpc<UserRow>(client, "public.create_user", [email, passwordHash, displayName, username]));
  await withServiceRole((client) => client.query("update public.users set email_verified_at = now() where id = $1", [created.id]));
  console.log(`Created user ${email}.`);
  return created;
}

type OrgRow = { id: string; name: string };

async function ensureOrganization(ownerId: string, name: string): Promise<OrgRow> {
  const existing = await withServiceRole(async (client) => {
    const { rows } = await client.query<OrgRow>("select id, name from public.organizations where name = $1 and created_by = $2", [name, ownerId]);
    return rows[0] ?? null;
  });
  if (existing) {
    console.log(`Organization "${name}" already exists.`);
    return existing;
  }
  // Only organization accounts may create one (202609280002).
  await withServiceRole((client) => client.query("update public.users set account_type = 'organization' where id = $1", [ownerId]));
  const created = await withActor(ownerId, (client) => callRpc<OrgRow>(client, "public.create_organization", [name]));
  console.log(`Created organization "${name}".`);
  return created;
}

type ProgramRow = { id: string; name: string; status: string };

async function ensureProgram(ownerId: string, orgId: string, name: string): Promise<ProgramRow> {
  const existing = await withServiceRole(async (client) => {
    const { rows } = await client.query<ProgramRow>("select id, name, status from public.programs where organization_id = $1 and name = $2", [orgId, name]);
    return rows[0] ?? null;
  });
  if (existing) {
    console.log(`Program "${name}" already exists (status: ${existing.status}).`);
    return existing;
  }
  const created = await withActor(ownerId, (client) => callRpc<ProgramRow>(client, "public.create_program", [orgId, name]));
  console.log(`Created program "${name}".`);
  return created;
}

/** activate_program is platform-admin-only (see docs/decisions on the program-launch
 * review gate, 202609050013) -- an organization can no longer self-certify its own
 * launch. This mirrors scripts/seed-demo.mjs's own exact pattern: briefly grant the org
 * owner platform_admins membership to approve its own seeded program, then revoke it
 * immediately -- a seed-time convenience, never a capability this account actually
 * keeps afterward. */
async function activateProgram(ownerId: string, programId: string): Promise<void> {
  await withServiceRole((client) => client.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [ownerId]));
  await tryStep(withActor(ownerId, (client) => client.query("select public.activate_program($1)", [programId])), "activate_program");
  await withServiceRole((client) => client.query("delete from public.platform_admins where user_id = $1", [ownerId]));
  await tryStep(withActor(ownerId, (client) => client.query("select public.set_program_visibility($1, $2)", [programId, "public"])), "set_program_visibility");
}

// Security: this creates accounts whose passwords are in the source code. Never against a
// real deployment -- only when asked for explicitly.
if (process.env.ALLOW_TEST_ACCOUNTS !== "1") {
  console.error("Refusing to seed: this creates accounts with passwords published in the repo. Set ALLOW_TEST_ACCOUNTS=1 for a local or CI test database only.");
  process.exit(1);
}

async function main() {
  console.log("Seeding the Phase 7 launch-checklist demo dataset...\n");

  const owner = await ensureUser(ORG_OWNER_EMAIL, "Launch Admin", "launch_admin");
  const researcher = await ensureUser(RESEARCHER_EMAIL, "Launch Researcher", "launch_researcher");
  console.log("");

  const org = await ensureOrganization(owner.id, ORG_NAME);
  let program = await ensureProgram(owner.id, org.id, PROGRAM_NAME);
  console.log("");

  // --- Scope: 2 entries, one in-scope and one explicitly out-of-scope, only while the
  // program is still in `draft` (add_scope_entry rejects SCOPE_LOCKED once a program has
  // moved past draft -- matches the real, database-enforced rule this whole codebase
  // already follows, see docs/decisions/0006-scope-asset-model.md). ---
  if (program.status === "draft") {
    console.log("Adding scope entries (in-scope, out-of-scope)...");
    await tryStep(
      withActor(owner.id, (client) => client.query("select public.add_scope_entry($1, $2, $3, $4, $5)", [program.id, "domain", "api.launchcheck.example", "in_scope", "Primary public API."])),
      "add_scope_entry (in-scope)",
    );
    await tryStep(
      withActor(owner.id, (client) =>
        client.query("select public.add_scope_entry($1, $2, $3, $4, $5)", [program.id, "domain", "staging.launchcheck.example", "out_of_scope", "Staging environment -- do not test."]),
      ),
      "add_scope_entry (out-of-scope)",
    );

    console.log("Submitting program for review and activating...");
    await tryStep(withActor(owner.id, (client) => client.query("select public.submit_program_for_review($1)", [program.id])), "submit_program_for_review");
    await activateProgram(owner.id, program.id);

    program = (await ensureProgram(owner.id, org.id, PROGRAM_NAME)) as ProgramRow;
    console.log(`Program is now: ${program.status}.\n`);
  } else {
    console.log(`Program already past draft (status: ${program.status}) -- scope/activation steps skipped.\n`);
  }

  // --- Researcher joins, then 3 reports: new / triaged / resolved-with-finalized-bounty ---
  console.log("Joining the researcher to the program...");
  await tryStep(withActor(researcher.id, (client) => client.query("select public.join_public_program($1)", [program.id])), "join_public_program");

  const inScopeEntry = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ asset_type: string; target: string }>(
      "select asset_type, target from public.program_scope_entries where program_id = $1 and scope_state = 'in_scope' and status = 'active' order by created_at asc limit 1",
      [program.id],
    );
    return rows[0] ?? null;
  });

  if (!inScopeEntry) {
    console.log("  (skipped) reports: program has no in-scope entry to submit against\n");
  } else {
    const target = inScopeEntry.target;

    async function ensureReport(title: string, description: string, weaknessType: string, impact: string, severity: string) {
      const existing = await withServiceRole(async (client) => {
        const { rows } = await client.query<{ id: string; status: string }>("select id, status from public.reports where program_id = $1 and title = $2", [program.id, title]);
        return rows[0] ?? null;
      });
      if (existing) {
        console.log(`Report "${title}" already exists (status: ${existing.status}).`);
        return existing;
      }
      const created = await tryStep(
        withActor(researcher.id, (client) =>
          callRpc<{ id: string; status: string }>(client, "public.submit_report", [program.id, inScopeEntry.asset_type, target, title, description, weaknessType, impact, severity]),
        ),
        `submit_report (${title})`,
      );
      if (created) console.log(`Submitted report "${title}".`);
      return created;
    }

    console.log("Submitting 3 reports (new, triaged, resolved-with-finalized-bounty)...");

    // Report 1: left as `new` -- untouched, the researcher's freshest submission.
    await ensureReport(
      "Launch check: reflected XSS in search",
      "The `q` query parameter on /search is reflected into the response HTML without encoding.\n\nSteps to reproduce:\n1. GET /search?q=<script>alert(1)</script>\n2. Observe the payload executes unescaped in the response body.",
      "cross_site_scripting",
      "An attacker-controlled link can execute arbitrary JavaScript in a victim's session.",
      "medium",
    );

    // Report 2: taken through start_triage only -- real `triaging` status, not accepted
    // or resolved, so the inbox/findings/report-detail QA lines below have a genuine
    // in-flight report to exercise a real state transition against.
    const report2 = await ensureReport(
      "Launch check: IDOR on user profile API",
      "The /users/{id} endpoint does not verify the caller owns the requested profile.\n\nSteps to reproduce:\n1. Authenticate as user A.\n2. GET /users/{user B's id}.\n3. Observe user B's full profile is returned.",
      "idor",
      "Any authenticated user can enumerate and read every other user's PII.",
      "high",
    );
    if (report2 && report2.status === "new") {
      await tryStep(withActor(owner.id, (client) => client.query("select public.start_triage($1)", [report2.id])), "start_triage (report 2)");
    }

    // Report 3: the full real award flow -- triage, severity, accept, resolve, real
    // bounty policy, calculate, finalize. Exercises every RPC Turn 3's rewards work
    // depends on, end to end, exactly as a real triager would.
    const report3 = await ensureReport(
      "Launch check: SSRF via webhook URL field",
      "The webhook configuration endpoint accepts an arbitrary URL and fetches it server-side with no allowlist, including internal/link-local addresses.\n\nSteps to reproduce:\n1. Configure a webhook URL of http://169.254.169.254/latest/meta-data/.\n2. Trigger the webhook.\n3. Observe the response includes real cloud metadata.",
      "ssrf",
      "An attacker can pivot into internal-only services and cloud metadata endpoints from the public webhook feature.",
      "critical",
    );
    if (report3 && report3.status === "new") {
      await tryStep(withActor(owner.id, (client) => client.query("select public.start_triage($1)", [report3.id])), "start_triage (report 3)");
      await tryStep(withActor(owner.id, (client) => client.query("select public.set_report_severity($1, $2)", [report3.id, "critical"])), "set_report_severity (report 3)");
      await tryStep(withActor(owner.id, (client) => client.query("select public.accept_report($1)", [report3.id])), "accept_report (report 3)");
      await tryStep(
        withActor(owner.id, (client) => client.query("select public.resolve_report($1, $2)", [report3.id, "Fixed by adding an allowlist and blocking link-local/internal address ranges."])),
        "resolve_report (report 3)",
      );

      const hasPolicy = await withServiceRole(async (client) => {
        const { rows } = await client.query("select id from public.program_bounty_policy_versions where program_id = $1 and superseded_at is null", [program.id]);
        return rows.length > 0;
      });
      if (!hasPolicy) {
        await tryStep(
          withActor(owner.id, (client) =>
            client.query("select public.create_bounty_policy_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [
              program.id,
              "USD",
              0,
              0,
              10000,
              50000,
              50000,
              150000,
              150000,
              500000,
              500000,
              2000000,
            ]),
          ),
          "create_bounty_policy_version",
        );
      }

      const hasDecision = await withServiceRole(async (client) => {
        const { rows } = await client.query("select id, state from public.report_bounty_decisions where report_id = $1", [report3.id]);
        return rows[0] ?? null;
      });
      if (!hasDecision) {
        await tryStep(withActor(owner.id, (client) => client.query("select public.calculate_bounty_recommendation($1)", [report3.id])), "calculate_bounty_recommendation (report 3)");
      }
      if (!hasDecision || hasDecision.state !== "finalized") {
        await tryStep(
          withActor(owner.id, (client) => client.query("select public.finalize_bounty($1, $2, $3)", [report3.id, 300000, "Critical SSRF into cloud metadata -- exceptional impact."])),
          "finalize_bounty (report 3)",
        );
      }
    }
    console.log("Reports ready (1 new, 1 triaged, 1 resolved with a finalized $3,000 bounty).\n");
  }

  await pool.end();

  console.log("Done. Sign in to explore:\n");
  console.log(`  Org owner  : ${ORG_OWNER_EMAIL} / ${PASSWORD}  (${ORG_NAME})`);
  console.log(`  Researcher : ${RESEARCHER_EMAIL} / ${PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

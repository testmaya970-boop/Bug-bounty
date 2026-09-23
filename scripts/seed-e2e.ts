#!/usr/bin/env tsx
// Turn 8 -- a dedicated, deterministic dataset for the E2E journey suite (e2e/org-journey.
// spec.ts), independent of scripts/seed-demo.ts's own launch-checklist dataset (different
// email addresses, different org/program names -- the two scripts can never collide).
//
// Same conventions as seed-demo.ts, copied deliberately rather than re-derived: every step
// goes through the real RPCs the app itself calls (create_user, create_organization,
// create_program, invite_researcher_to_program, submit_report, start_triage,
// accept_report, resolve_report, finalize_bounty...), never a direct business-logic
// insert, so every row this script produces carries the exact same RLS policies, audit_log
// entries, and outbox events a real user's action would produce. Idempotent: every step
// checks for existing state first and skips creation if it already exists -- safe to
// re-run before every E2E run without accumulating duplicate data.
//
// Produces: 1 organization, 2 programs (one public+active, one private+active), 1 org
// admin, 3 researchers --
//   - e2e.invited@unpatched.demo: invited to the PRIVATE program, invitation still
//     pending (not yet accepted) -- the org-journey spec itself accepts it, proving the
//     real accept flow end to end.
//   - e2e.veteran@unpatched.demo: has real reputation history (a resolved report + a
//     finalized bounty), already an active researcher on the PUBLIC program.
//   - e2e.newcomer@unpatched.demo: a brand-new account with no program participation at
//     all -- the uninvited researcher the visibility-with-teeth assertion uses to prove
//     the private program is genuinely RLS-denied, not just UI-hidden.
//
// Usage: npm run seed:e2e (reads DATABASE_URL from .env.local via tsx --env-file)

import { Pool, type PoolClient, types as pgTypes } from "pg";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

for (const oid of [1082, 1114, 1184]) pgTypes.setTypeParser(oid, (value: string) => new Date(value).toISOString());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (e.g. run with `npm run seed:e2e`, which loads .env.local).");
  process.exit(1);
}

export const E2E_PASSWORD = "E2ESeed!2026";
export const E2E_ADMIN_EMAIL = "e2e.admin@unpatched.demo";
export const E2E_INVITED_EMAIL = "e2e.invited@unpatched.demo";
export const E2E_VETERAN_EMAIL = "e2e.veteran@unpatched.demo";
export const E2E_NEWCOMER_EMAIL = "e2e.newcomer@unpatched.demo";
export const E2E_ORG_NAME = "E2E Journey Org";
export const E2E_PUBLIC_PROGRAM_NAME = "E2E Public Program";
export const E2E_PRIVATE_PROGRAM_NAME = "E2E Private Program";

// Turn 8b: e2e/notifications.spec.ts drives its own report through triage/accept/message
// live, in a spec FILE Playwright can run in parallel with org-journey.spec.ts's own file
// (test.describe.configure({ mode: "serial" }) only serializes tests *within* one file --
// nothing in playwright.config.ts caps cross-file parallelism). Sharing the triage-walk
// report between the two spec files would be a real race, not a hypothetical one -- this
// program/report pair exists so notifications.spec.ts never touches org-journey.spec.ts's
// own fixture rows.
export const E2E_NOTIF_PROGRAM_NAME = "E2E Notifications Program";
// A second, wholly unrelated organization -- its own owner, its own program -- so
// notifications.spec.ts's cross-org-isolation assertion ("unrelated org's activity ->
// nothing appears") is a real RLS/routing fact, not just "no matching report_id happened
// to be seeded."
export const E2E_UNRELATED_ADMIN_EMAIL = "e2e.unrelated-admin@unpatched.demo";
export const E2E_UNRELATED_ORG_NAME = "E2E Unrelated Org";
export const E2E_UNRELATED_PROGRAM_NAME = "E2E Unrelated Program";

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

async function ensureUser(email: string, displayName: string, username: string): Promise<UserRow> {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`User ${email} already exists.`);
    return existing;
  }
  const passwordHash = await argon2.hash(E2E_PASSWORD, { type: argon2.argon2id });
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
  const created = await withActor(ownerId, (client) => callRpc<OrgRow>(client, "public.create_organization", [name]));
  console.log(`Created organization "${name}".`);
  return created;
}

type ProgramRow = { id: string; name: string; status: string; visibility: string };

async function ensureProgram(ownerId: string, orgId: string, name: string): Promise<ProgramRow> {
  const existing = await withServiceRole(async (client) => {
    const { rows } = await client.query<ProgramRow>("select id, name, status, visibility from public.programs where organization_id = $1 and name = $2", [orgId, name]);
    return rows[0] ?? null;
  });
  if (existing) {
    console.log(`Program "${name}" already exists (status: ${existing.status}, visibility: ${existing.visibility}).`);
    return existing;
  }
  const created = await withActor(ownerId, (client) => callRpc<ProgramRow>(client, "public.create_program", [orgId, name]));
  console.log(`Created program "${name}".`);
  return created;
}

/** activate_program is platform-admin-only -- briefly grant the org owner platform_admins
 * membership to approve its own seeded program, then revoke it immediately (same
 * seed-time-only convenience scripts/seed-demo.ts already established). visibility is set
 * AFTER activation for the public program (matches the real workflow: a program is drafted
 * private, then made public once it's actually ready to receive researchers) and left
 * untouched (private, the schema default) for the private one. */
async function activateProgram(ownerId: string, programId: string, visibility: "public" | "private"): Promise<void> {
  await withServiceRole((client) => client.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [ownerId]));
  await tryStep(withActor(ownerId, (client) => client.query("select public.activate_program($1)", [programId])), "activate_program");
  await withServiceRole((client) => client.query("delete from public.platform_admins where user_id = $1", [ownerId]));
  if (visibility === "public") {
    await tryStep(withActor(ownerId, (client) => client.query("select public.set_program_visibility($1, $2)", [programId, "public"])), "set_program_visibility");
  }
}

async function ensureScopeAndActivate(ownerId: string, program: ProgramRow, target: string, visibility: "public" | "private"): Promise<ProgramRow> {
  if (program.status !== "draft") {
    console.log(`Program "${program.name}" already past draft (status: ${program.status}) -- scope/activation skipped.`);
    return program;
  }
  await tryStep(withActor(ownerId, (client) => client.query("select public.add_scope_entry($1, $2, $3, $4, $5)", [program.id, "domain", target, "in_scope", "Primary target."])), "add_scope_entry");
  await tryStep(withActor(ownerId, (client) => client.query("select public.submit_program_for_review($1)", [program.id])), "submit_program_for_review");
  await activateProgram(ownerId, program.id, visibility);
  const refreshed = await withServiceRole(async (client) => {
    const { rows } = await client.query<ProgramRow>("select id, name, status, visibility from public.programs where id = $1", [program.id]);
    return rows[0];
  });
  console.log(`Program "${program.name}" is now: ${refreshed.status} / ${refreshed.visibility}.`);
  return refreshed;
}

/** Real invitation token generation, matching services/invitations.ts's own
 * generateInvitationToken/hashInvitationToken exactly (this script has no access to that
 * module's "server-only" import outside the Next.js app, so it's replicated inline --
 * identical algorithm, not a divergent one). Idempotent: returns the existing pending
 * invitation's id (no way to recover the original raw token for an existing row, but the
 * e2e spec itself drives a fresh invite through the real UI, so this is only a seed-time
 * fallback for re-runs). */
function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}
function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function ensurePendingInvitation(ownerId: string, programId: string, orgId: string, email: string): Promise<void> {
  const existing = await withServiceRole(async (client) => {
    const { rows } = await client.query("select id from public.program_invitations where program_id = $1 and email = $2 and accepted_at is null and revoked_at is null", [programId, email]);
    return rows[0] ?? null;
  });
  if (existing) {
    console.log(`Pending invitation for ${email} already exists.`);
    return;
  }
  // The org-journey spec's own researcher leg accepts this invitation for real (proving
  // the accept flow, not just its existence) -- a prior E2E run leaves it accepted, and
  // the participation row it created stays. Both are cleaned up here so a re-run gets a
  // genuinely fresh pending invitation and the acceptance step is exercised for real
  // again, not skipped because the researcher is already an active participant.
  await withServiceRole((client) => client.query("delete from public.program_researchers where program_id = $1 and user_id = (select id from public.users where email = $2)", [programId, email]));
  const token = generateInvitationToken();
  await tryStep(
    withActor(ownerId, (client) => client.query("select public.invite_researcher_to_program($1, $2, $3, $4)", [programId, email, "Join our private program.", hashInvitationToken(token)])),
    "invite_researcher_to_program",
  );
  console.log(`Invited ${email} to the private program (pending acceptance).`);
}

async function ensureReputationHistory(ownerId: string, orgId: string, researcherId: string, program: ProgramRow, target: string): Promise<void> {
  await tryStep(withActor(researcherId, (client) => client.query("select public.join_public_program($1)", [program.id])), "join_public_program (veteran)");

  const existingReport = await withServiceRole(async (client) => {
    const { rows } = await client.query("select id, status from public.reports where program_id = $1 and title = $2", [program.id, "E2E seed: resolved report with finalized bounty"]);
    return rows[0] ?? null;
  });
  let reportId: string;
  if (existingReport) {
    reportId = existingReport.id;
    console.log(`Veteran's seed report already exists (status: ${existingReport.status}).`);
  } else {
    const created = await tryStep(
      withActor(researcherId, (client) =>
        callRpc<{ id: string }>(client, "public.submit_report", [
          program.id,
          "domain",
          target,
          "E2E seed: resolved report with finalized bounty",
          "Seed data for the E2E journey suite's reputation-history fixture.",
          "other",
          "Seed impact statement.",
          "high",
        ]),
      ),
      "submit_report (veteran)",
    );
    if (!created) return;
    reportId = created.id;
    console.log("Submitted the veteran's seed report.");
  }

  const current = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ status: string }>("select status from public.reports where id = $1", [reportId]);
    return rows[0]?.status;
  });
  if (current === "new") {
    await tryStep(withActor(ownerId, (client) => client.query("select public.start_triage($1)", [reportId])), "start_triage (veteran report)");
    await tryStep(withActor(ownerId, (client) => client.query("select public.set_report_severity($1, $2)", [reportId, "high"])), "set_report_severity (veteran report)");
    await tryStep(withActor(ownerId, (client) => client.query("select public.accept_report($1)", [reportId])), "accept_report (veteran report)");
    await tryStep(withActor(ownerId, (client) => client.query("select public.resolve_report($1, $2)", [reportId, "Fixed for the seed fixture."])), "resolve_report (veteran report)");
  }

  const hasPolicy = await withServiceRole(async (client) => {
    const { rows } = await client.query("select id from public.program_bounty_policy_versions where program_id = $1 and superseded_at is null", [program.id]);
    return rows.length > 0;
  });
  if (!hasPolicy) {
    await tryStep(
      withActor(ownerId, (client) =>
        client.query("select public.create_bounty_policy_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [program.id, "USD", 0, 0, 10000, 50000, 50000, 150000, 150000, 500000, 500000, 2000000]),
      ),
      "create_bounty_policy_version (veteran program)",
    );
  }

  const hasDecision = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ id: string; state: string }>("select id, state from public.report_bounty_decisions where report_id = $1", [reportId]);
    return rows[0] ?? null;
  });
  if (!hasDecision) {
    await tryStep(withActor(ownerId, (client) => client.query("select public.calculate_bounty_recommendation($1)", [reportId])), "calculate_bounty_recommendation (veteran report)");
  }
  if (!hasDecision || hasDecision.state !== "finalized") {
    await tryStep(withActor(ownerId, (client) => client.query("select public.finalize_bounty($1, $2, $3)", [reportId, 150000, "Seed fixture -- exceptional impact."])), "finalize_bounty (veteran report)");
  }
  console.log("Veteran's reputation history ready (1 resolved report, 1 finalized $1,500 bounty).");
}

/** A second, untouched `new` report on the public program -- the org-journey spec's own
 * live Inbox walk (new -> triaged -> resolved -> finalize bounty) needs a report it
 * controls the state of from the very start, distinct from the veteran's own
 * already-resolved reputation-history report above. Submitted by the veteran researcher
 * (already an active participant on this program) rather than creating yet another
 * account, matching seed-demo.ts's own "leave one report untouched at new" convention. */
async function ensureFreshReportForTriageWalk(researcherId: string, program: ProgramRow, target: string): Promise<void> {
  const title = "E2E seed: fresh report for the live triage walk";
  const existing = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ id: string; status: string }>("select id, status from public.reports where program_id = $1 and title = $2", [program.id, title]);
    return rows[0] ?? null;
  });
  if (existing) {
    if (existing.status !== "new") {
      // A prior E2E run drove this report through triage/accept/resolve/finalize before
      // this script runs again -- reset it to a clean `new` state so the spec's own live
      // triage walk starts from the same real precondition every time. A plain data
      // reset (this row already went through the real submit_report RPC once), not a new
      // bypass -- also clears any bounty decision/message rows a prior run created
      // against it, so the reset is genuinely clean, not partially stale.
      // Prior-run notification/outbox_events rows for this report are deliberately left
      // in place, not deleted -- neither the app's own runtime role nor service_role has
      // DELETE on public.notifications (append-only by design, matching its read-only
      // grant to authenticated; confirmed live). They're harmless here: the spec's own
      // assertions check for a matching notification's presence, not an exact count, and
      // stale historical rows don't block new ones from being created for the reset
      // report below.
      await withServiceRole((client) => client.query("delete from public.report_bounty_decisions where report_id = $1", [existing.id]));
      await withServiceRole((client) => client.query("delete from public.report_messages where report_id = $1", [existing.id]));
      await withServiceRole((client) =>
        client.query("update public.reports set status = 'new', confirmed_severity = null, resolution_summary = null, updated_at = now() where id = $1", [existing.id]),
      );
      console.log(`Triage-walk seed report existed at "${existing.status}" -- reset to "new" for a clean re-run.`);
    } else {
      console.log("Triage-walk seed report already exists (status: new).");
    }
    return;
  }
  const created = await tryStep(
    withActor(researcherId, (client) =>
      callRpc<{ id: string }>(client, "public.submit_report", [
        program.id,
        "domain",
        target,
        title,
        "Seed data for the E2E journey suite's own live triage walk -- left at `new` deliberately.",
        "other",
        "Seed impact statement.",
        "medium",
      ]),
    ),
    "submit_report (triage-walk fixture)",
  );
  if (created) console.log("Submitted the triage-walk seed report (left at `new`).");
}

/** The dedicated report notifications.spec.ts drives live (new -> triaging -> accepted,
 * plus messages both directions) -- its own row, isolated from org-journey.spec.ts's
 * triage-walk report (see the E2E_NOTIF_PROGRAM_NAME comment above). Reset to a clean
 * `new` state on re-run for the same reason ensureFreshReportForTriageWalk resets its own. */
async function ensureFreshReportForNotificationsWalk(researcherId: string, program: ProgramRow, target: string): Promise<void> {
  const title = "E2E seed: fresh report for the live notifications walk";
  const existing = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ id: string; status: string }>("select id, status from public.reports where program_id = $1 and title = $2", [program.id, title]);
    return rows[0] ?? null;
  });
  if (existing) {
    if (existing.status !== "new") {
      await withServiceRole((client) => client.query("delete from public.report_bounty_decisions where report_id = $1", [existing.id]));
      await withServiceRole((client) => client.query("delete from public.report_messages where report_id = $1", [existing.id]));
      await withServiceRole((client) =>
        client.query("update public.reports set status = 'new', confirmed_severity = null, resolution_summary = null, updated_at = now() where id = $1", [existing.id]),
      );
      console.log(`Notifications-walk seed report existed at "${existing.status}" -- reset to "new" for a clean re-run.`);
    } else {
      console.log("Notifications-walk seed report already exists (status: new).");
    }
    return;
  }
  const created = await tryStep(
    withActor(researcherId, (client) =>
      callRpc<{ id: string }>(client, "public.submit_report", [
        program.id,
        "domain",
        target,
        title,
        "Seed data for the E2E notifications suite's own live walk -- left at `new` deliberately.",
        "other",
        "Seed impact statement.",
        "medium",
      ]),
    ),
    "submit_report (notifications-walk fixture)",
  );
  if (created) console.log("Submitted the notifications-walk seed report (left at `new`).");
}

/** A second organization, unrelated to E2E_ORG_NAME -- its own owner, its own active
 * public program -- purely so notifications.spec.ts can prove its own org's admin never
 * sees activity from a report that isn't theirs. No researcher participation, no reports:
 * existence alone is enough for the isolation assertion (nothing should route to this
 * org's admin no matter what happens in E2E_ORG_NAME). */
async function ensureUnrelatedOrg(): Promise<void> {
  const unrelatedAdmin = await ensureUser(E2E_UNRELATED_ADMIN_EMAIL, "E2E Unrelated Admin", "e2e_unrelated_admin");
  const unrelatedOrg = await ensureOrganization(unrelatedAdmin.id, E2E_UNRELATED_ORG_NAME);
  const unrelatedProgram = await ensureProgram(unrelatedAdmin.id, unrelatedOrg.id, E2E_UNRELATED_PROGRAM_NAME);
  await ensureScopeAndActivate(unrelatedAdmin.id, unrelatedProgram, "api.e2e-unrelated.example", "public");
}

async function main() {
  console.log("Seeding the E2E journey dataset...\n");

  const admin = await ensureUser(E2E_ADMIN_EMAIL, "E2E Admin", "e2e_admin");
  await ensureUser(E2E_INVITED_EMAIL, "E2E Invited Researcher", "e2e_invited");
  const veteran = await ensureUser(E2E_VETERAN_EMAIL, "E2E Veteran Researcher", "e2e_veteran");
  await ensureUser(E2E_NEWCOMER_EMAIL, "E2E Newcomer Researcher", "e2e_newcomer");
  console.log("");

  const org = await ensureOrganization(admin.id, E2E_ORG_NAME);
  console.log("");

  let publicProgram = await ensureProgram(admin.id, org.id, E2E_PUBLIC_PROGRAM_NAME);
  publicProgram = await ensureScopeAndActivate(admin.id, publicProgram, "api.e2e-public.example", "public");
  console.log("");

  let privateProgram = await ensureProgram(admin.id, org.id, E2E_PRIVATE_PROGRAM_NAME);
  privateProgram = await ensureScopeAndActivate(admin.id, privateProgram, "api.e2e-private.example", "private");
  console.log("");

  await ensurePendingInvitation(admin.id, privateProgram.id, org.id, E2E_INVITED_EMAIL);
  console.log("");

  await ensureReputationHistory(admin.id, org.id, veteran.id, publicProgram, "api.e2e-public.example");
  console.log("");

  await ensureFreshReportForTriageWalk(veteran.id, publicProgram, "api.e2e-public.example");
  console.log("");

  let notifProgram = await ensureProgram(admin.id, org.id, E2E_NOTIF_PROGRAM_NAME);
  notifProgram = await ensureScopeAndActivate(admin.id, notifProgram, "api.e2e-notif.example", "public");
  await tryStep(withActor(veteran.id, (client) => client.query("select public.join_public_program($1)", [notifProgram.id])), "join_public_program (veteran, notif program)");
  await ensureFreshReportForNotificationsWalk(veteran.id, notifProgram, "api.e2e-notif.example");
  console.log("");

  await ensureUnrelatedOrg();

  // Turn 8: the visibility-with-teeth E2E assertion needs a real id to attempt a direct
  // URL against as the uninvited researcher -- a UI-only search can only prove "not
  // listed," never "denied even by direct id." Writing it here (not read back from the
  // database inside the spec itself) keeps the spec's own access model honest: it drives
  // the browser exactly like a real attacker with a guessed/leaked id would, nothing more.
  const fixturePath = path.join(process.cwd(), "e2e", ".seed-fixture.json");
  await writeFile(fixturePath, JSON.stringify({ organizationId: org.id, publicProgramId: publicProgram.id, privateProgramId: privateProgram.id }, null, 2));
  console.log(`Wrote e2e/.seed-fixture.json (organizationId, publicProgramId, privateProgramId).`);

  await pool.end();

  console.log("\nDone. Sign in to explore:");
  console.log(`  Admin              : ${E2E_ADMIN_EMAIL} / ${E2E_PASSWORD}  (${E2E_ORG_NAME})`);
  console.log(`  Invited researcher : ${E2E_INVITED_EMAIL} / ${E2E_PASSWORD}  (pending invite to ${E2E_PRIVATE_PROGRAM_NAME})`);
  console.log(`  Veteran researcher : ${E2E_VETERAN_EMAIL} / ${E2E_PASSWORD}  (real reputation history)`);
  console.log(`  Newcomer researcher: ${E2E_NEWCOMER_EMAIL} / ${E2E_PASSWORD}  (no participation anywhere)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

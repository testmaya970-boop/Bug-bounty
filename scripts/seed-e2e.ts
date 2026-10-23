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
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ctfFlag } from "../lib/ctf-flags";
import { totpCode } from "../lib/auth/totp";

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
export const E2E_FLAGGED_EMAIL = "e2e.flagged@unpatched.demo";
// e2e/functional-cases.spec.ts changes this account's password and profile; every seed
// run puts them back (resetSettingsAccount).
export const E2E_SETTINGS_EMAIL = "e2e.settings@unpatched.demo";
// The password case alone: it spends several sign-in-limited attempts (10 per 15 min).
export const E2E_PASSWORD_CASE_EMAIL = "e2e.password@unpatched.demo";
// e2e/program-launch-journey.spec.ts: a standing platform admin (approves the launch review
// through /platform/programs, the real UI path) and a researcher used only by that spec.
export const E2E_PLATFORM_ADMIN_EMAIL = "e2e.platform-admin@unpatched.demo";
// A second platform admin (account-reactivation, admin-organization-search) so neither
// admin signs in more than the sign-in limit's 10 times per 15 minutes in one run.
export const E2E_PLATFORM_ADMIN_2_EMAIL = "e2e.platform-admin-2@unpatched.demo";
export const E2E_HUNTER_EMAIL = "e2e.hunter@unpatched.demo";
// Those specs (and scope-import-hackerone.spec.ts) create a program -- and a report -- on
// every run. Their own org keeps that data out of E2E Journey Org, whose Home action queue
// (8 slots) org-journey.spec.ts asserts on: 8 accumulated launch-journey reports had
// pushed its seeded report out of the queue.
export const E2E_LAUNCH_ADMIN_EMAIL = "e2e.launch-admin@unpatched.demo";
export const E2E_LAUNCH_ORG_NAME = "E2E Launch Org";
// e2e/org-roles.spec.ts -- the three limited organization roles.
export const E2E_PROGRAM_MANAGER_EMAIL = "e2e.program-manager@unpatched.demo";
export const E2E_TRIAGER_EMAIL = "e2e.triager@unpatched.demo";
export const E2E_BILLING_ADMIN_EMAIL = "e2e.billing-admin@unpatched.demo";
export const E2E_ORG_NAME = "E2E Journey Org";
export const E2E_PUBLIC_PROGRAM_NAME = "E2E Public Program";
export const E2E_PRIVATE_PROGRAM_NAME = "E2E Private Program";
export const E2E_REQUEST_PROGRAM_NAME = "E2E Request Program";
export const E2E_REQUESTER_EMAIL = "e2e.requester@unpatched.demo";

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
// e2e/jira-integration.spec.ts -- see ensureIntegrationsOrg.
export const E2E_INTEGRATIONS_ADMIN_EMAIL = "e2e.integrations-admin@unpatched.demo";
export const E2E_INTEGRATIONS_ORG_NAME = "E2E Integrations Org";
export const E2E_INTEGRATIONS_PROGRAM_NAME = "E2E Integrations Program";

// CTF events (db/migrations/202609290001_ctf_events.sql). Three states so the events
// surface has real data to render and the leaderboard has a seeded solve to assert against:
// an ENDED event with completed solves (its leaderboard is final and non-empty), a currently
// ACTIVE event, and an UPCOMING one. e2e/ctf.spec.ts asserts on these slugs.
export const E2E_CTF_EVENT_ENDED_SLUG = "e2e-past-clash";
export const E2E_CTF_EVENT_ACTIVE_SLUG = "e2e-live-fire";
export const E2E_CTF_EVENT_UPCOMING_SLUG = "e2e-winter-open";

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

/** Platform-admin RPCs need an MFA-verified session (202610100001): a throwaway aal2
 * session row for the duration of the call, removed afterwards. Seed-time only. */
async function withPlatformActor<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const sessionId = randomUUID();
  await withServiceRole((client) => client.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal2')", [sessionId, userId, `seed-${sessionId}`]));
  try {
    return await withActor(userId, fn, sessionId);
  } finally {
    await withServiceRole((client) => client.query("delete from public.sessions where id = $1", [sessionId]));
  }
}

async function withActor<T>(userId: string, fn: (client: PoolClient) => Promise<T>, sessionId?: string): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userId, session_id: sessionId, role: "authenticated" })]);
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

/** No spec expects a seeded account to have two-factor auth. A leftover enrollment (one
 * happened during manual MFA testing on 2026-10-01) sends every page to /mfa/verify and
 * fails most of the suite, so seeded accounts always start without it. */
async function resetMfa(userId: string) {
  await withServiceRole(async (client) => {
    for (const table of ["mfa_verified_sessions", "mfa_backup_codes", "mfa_challenges", "mfa_factors"]) {
      await client.query(`delete from public.${table} where user_id = $1`, [userId]);
    }
  });
}

/** Puts a fixture report back to "new" for a clean re-run. Not a real transition, so
 * reports_enforce_rules (202610060005) refuses it; this test-only reset runs on the
 * schema-owner connection with triggers off for its one transaction -- something only a
 * superuser can do, so it is not a bypass the app could use. */
async function resetReportToNew(reportId: string) {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL is required to reset fixture reports");
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
  const client = await owner.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query("update public.reports set status = 'new', duplicate_of_report_id = null, confirmed_severity = null, resolution_summary = null, updated_at = now() where id = $1", [reportId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
    await owner.end();
  }
}

/** submit_report, accepting the program's current policy version first -- the reports insert
 * trigger refuses a report on a program with a policy unless the submitter acknowledged
 * exactly that version (202610060009). Same transaction, like services/reports.ts. */
async function submitReportAcknowledgingPolicy(client: PoolClient, args: unknown[]): Promise<{ id: string }> {
  await client.query(
    "select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)",
    [args[0]],
  );
  return callRpc<{ id: string }>(client, "public.submit_report", args);
}

/** Platform admins must have MFA (202610100001). Enrolled through the real RPCs with a
 * random authenticator secret; specs pass the sign-in gate with a backup code
 * (e2e/mfa-gate.ts), so the secret is never needed again. */
async function ensurePlatformAdmin(email: string, displayName: string, username: string): Promise<UserRow> {
  const user = await ensureUser(email, displayName, username);
  await withServiceRole((client) => client.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [user.id]));
  const totpSecret = randomBytes(20);
  await withActor(user.id, (client) => client.query("select public.begin_my_totp_enrollment($1)", [totpSecret.toString("hex")]));
  const enrolled = await withActor(user.id, (client) => callRpc<{ verify_my_totp_code: string }>(client, "public.verify_my_totp_code", [totpCode(totpSecret, Math.floor(Date.now() / 30_000))]));
  if (enrolled.verify_my_totp_code !== "enroll") throw new Error(`${email}: MFA enrollment failed (${enrolled.verify_my_totp_code})`);
  return user;
}

// Every researcher must have a verified identity to submit (202610230008). Test accounts get
// a verified passport on file, except the one account that exists to test that gate.
const E2E_UNVERIFIED_EMAIL = "e2e.unverified@unpatched.demo";
async function verifyIdentity(userId: string, email: string) {
  if (email === E2E_UNVERIFIED_EMAIL) return;
  await withServiceRole((client) =>
    client.query("insert into public.researcher_kyc (user_id, passport_status) values ($1, 'verified') on conflict (user_id) do update set passport_status = 'verified'", [userId]),
  );
}

async function ensureUser(email: string, displayName: string, username: string): Promise<UserRow> {
  const existing = await findUserByEmail(email);
  if (existing) {
    await resetMfa(existing.id);
    await verifyIdentity(existing.id, email);
    console.log(`User ${email} already exists.`);
    return existing;
  }
  const passwordHash = await argon2.hash(E2E_PASSWORD, { type: argon2.argon2id });
  const created = await withServiceRole((client) => callRpc<UserRow>(client, "public.create_user", [email, passwordHash, displayName, username]));
  await withServiceRole((client) => client.query("update public.users set email_verified_at = now() where id = $1", [created.id]));
  await verifyIdentity(created.id, email);
  console.log(`Created user ${email}.`);
  return created;
}

async function resetSettingsAccount(user: UserRow) {
  const passwordHash = await argon2.hash(E2E_PASSWORD, { type: argon2.argon2id });
  await withServiceRole((client) => client.query("update public.users set password_hash = $2, display_name = 'E2E Settings Researcher' where id = $1", [user.id, passwordHash]));
}

type OrgRow = { id: string; name: string };

/** Organization-side test accounts: only these may create an organization (202609280002). */
async function markOrganizationAccount(userId: string) {
  await withServiceRole((client) => client.query("update public.users set account_type = 'organization' where id = $1", [userId]));
}

async function ensureOrganization(ownerId: string, name: string): Promise<OrgRow> {
  await markOrganizationAccount(ownerId);
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
  await tryStep(withPlatformActor(ownerId, (client) => client.query("select public.activate_program($1)", [programId])), "activate_program");
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
    // expires_at: an expired invitation is not pending -- reusing one silently broke the
    // invited-researcher journey once the Sep 9 seed invitation lapsed.
    const { rows } = await client.query("select id from public.program_invitations where program_id = $1 and email = $2 and accepted_at is null and revoked_at is null and expires_at > now()", [programId, email]);
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
        submitReportAcknowledgingPolicy(client, [
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
    // finalize_bounty refuses an unfunded award (202610140006): fund the report's org first.
    // Idempotent -- one reference per organization, claimable once.
    await withServiceRole((client) =>
      client.query(
        `insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_at)
         select r.organization_id, 'USD', 100000000, 'wire', 'SEED-FUNDING-' || r.organization_id, 'confirmed', $2, now() from public.reports r where r.id = $1
         on conflict do nothing`,
        [reportId, ownerId],
      ),
    );
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
      await resetReportToNew(existing.id);
      console.log(`Triage-walk seed report existed at "${existing.status}" -- reset to "new" for a clean re-run.`);
    } else {
      console.log("Triage-walk seed report already exists (status: new).");
    }
    return;
  }
  const created = await tryStep(
    withActor(researcherId, (client) =>
      submitReportAcknowledgingPolicy(client, [
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
      await resetReportToNew(existing.id);
      console.log(`Notifications-walk seed report existed at "${existing.status}" -- reset to "new" for a clean re-run.`);
    } else {
      console.log("Notifications-walk seed report already exists (status: new).");
    }
    return;
  }
  const created = await tryStep(
    withActor(researcherId, (client) =>
      submitReportAcknowledgingPolicy(client, [
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

/** e2e/jira-integration.spec.ts: its OWN organization, because a connected Jira makes the
 * outbox worker try to sync every report event in that org -- isolating it here means no
 * other spec's triage activity can ever reach the Jira consumer mid-run. One accepted
 * report (the only state the inbound "issue moved to Done" maps from). Reset every run:
 * any leftover connection is deleted (its report links cascade) and the report goes back
 * to `accepted` -- a plain data reset of a row that went through the real RPCs once. */
async function ensureIntegrationsOrg(researcherId: string): Promise<{ organizationId: string; programId: string; reportId: string | null }> {
  const admin = await ensureUser(E2E_INTEGRATIONS_ADMIN_EMAIL, "E2E Integrations Admin", "e2e_integrations_admin");
  const org = await ensureOrganization(admin.id, E2E_INTEGRATIONS_ORG_NAME);
  let program = await ensureProgram(admin.id, org.id, E2E_INTEGRATIONS_PROGRAM_NAME);
  program = await ensureScopeAndActivate(admin.id, program, "api.e2e-integrations.example", "public");
  await tryStep(withActor(researcherId, (client) => client.query("select public.join_public_program($1)", [program.id])), "join_public_program (veteran, integrations program)");
  await withServiceRole((client) => client.query("delete from public.jira_connections where organization_id = $1", [org.id]));

  const title = "E2E seed: accepted report for the Jira walk";
  let report = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ id: string; status: string }>("select id, status from public.reports where program_id = $1 and title = $2", [program.id, title]);
    return rows[0] ?? null;
  });
  if (!report) {
    const created = await tryStep(
      withActor(researcherId, (client) =>
        submitReportAcknowledgingPolicy(client, [program.id, "domain", "api.e2e-integrations.example", title, "Seed data for the Jira integration E2E walk.", "other", "Seed impact statement.", "high"]),
      ),
      "submit_report (jira-walk fixture)",
    );
    if (created) {
      await tryStep(withActor(admin.id, (client) => client.query("select public.accept_report($1)", [created.id])), "accept_report (jira-walk fixture)");
      report = { id: created.id, status: "accepted" };
    }
  } else if (report.status !== "accepted") {
    await withServiceRole((client) => client.query("update public.reports set status = 'accepted', resolution_summary = null, updated_at = now() where id = $1", [report!.id]));
    console.log(`Jira-walk seed report existed at "${report.status}" -- reset to "accepted".`);
  }
  console.log(`${E2E_INTEGRATIONS_ORG_NAME} ready (no Jira connection, one accepted report).`);
  return { organizationId: org.id, programId: program.id, reportId: report?.id ?? null };
}

/** Seed three CTF events (ended / active / upcoming) plus real solves so the events surface
 * and per-event leaderboards have data to render and assert against. Events are created via
 * the real create_ctf_event / set_ctf_event_challenges RPCs (with a brief platform_admin
 * grant, the same seed-time convenience activateProgram uses). The ACTIVE event's solve is
 * driven through the real submit_ctf_flag (it attributes live, proving that path); the ENDED
 * event's solves are backfilled directly into ctf_event_solves, because submit_ctf_flag only
 * attributes to an OPEN window and this event's window is in the past -- a fixture backfill,
 * clearly seed-only, not a new code path. Idempotent: skips creation when the event exists. */
async function seedCtfEvents(adminId: string, veteranId: string, newcomerId: string): Promise<void> {
  // The 28 challenges must already be seeded by the CTF migration.
  const challengeCount = await withServiceRole(async (client) => {
    const { rows } = await client.query<{ n: string }>("select count(*)::text as n from public.ctf_challenges");
    return Number(rows[0].n);
  });
  if (challengeCount === 0) {
    console.log("  (skipped) CTF events: no ctf_challenges seeded -- run migrations first.");
    return;
  }

  // Grant admin for the duration of event creation, then revoke.
  await withServiceRole((client) => client.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [adminId]));

  async function ensureEvent(slug: string, name: string, description: string, startsAt: string, endsAt: string, status: string, challengeIds: string[]): Promise<string | null> {
    const existing = await withServiceRole(async (client) => {
      const { rows } = await client.query<{ id: string }>("select id from public.ctf_events where slug = $1", [slug]);
      return rows[0] ?? null;
    });
    if (existing) {
      // A not-yet-ended event's set is re-applied so a retired challenge drops out of it;
      // an ended event keeps the set its final leaderboard was earned on.
      if (status !== "ended") {
        await tryStep(withPlatformActor(adminId, (client) => client.query("select public.set_ctf_event_challenges($1, $2)", [existing.id, challengeIds])), `set_ctf_event_challenges (${slug})`);
      }
      console.log(`CTF event "${slug}" already exists.`);
      return existing.id;
    }
    const created = await tryStep(
      withPlatformActor(adminId, (client) => callRpc<{ id: string }>(client, "public.create_ctf_event", [slug, name, description, startsAt, endsAt, status])),
      `create_ctf_event (${slug})`,
    );
    if (!created) return null;
    await tryStep(withPlatformActor(adminId, (client) => client.query("select public.set_ctf_event_challenges($1, $2)", [created.id, challengeIds])), `set_ctf_event_challenges (${slug})`);
    console.log(`Created CTF event "${slug}" (${status}) with ${challengeIds.length} challenges.`);
    return created.id;
  }

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const day = 24 * 60 * 60 * 1000;

  const endedId = await ensureEvent(
    E2E_CTF_EVENT_ENDED_SLUG,
    "E2E Past Clash",
    "A finished event -- its leaderboard is final.",
    iso(now - 10 * day),
    iso(now - 9 * day),
    "ended",
    ["c-web-1", "c-web-3", "c-crypto-1", "c-network-1"],
  );

  const activeId = await ensureEvent(
    E2E_CTF_EVENT_ACTIVE_SLUG,
    "E2E Live Fire",
    "A currently-running event -- solve its challenges before the window closes.",
    iso(now - day),
    iso(now + 2 * day),
    "active",
    ["c-crypto-1", "c-forensics-1", "c-network-1", "c-re-1"],
  );

  await ensureEvent(
    E2E_CTF_EVENT_UPCOMING_SLUG,
    "E2E Winter Open",
    "An upcoming event -- its challenges open when the window begins.",
    iso(now + 3 * day),
    iso(now + 5 * day),
    "scheduled", // published, but the future window makes its effective status "upcoming"
    ["c-crypto-4", "c-re-2", "c-pwn-4"],
  );

  await withServiceRole((client) => client.query("delete from public.platform_admins where user_id = $1", [adminId]));

  // ENDED event leaderboard: backfill solves within its past window (submit_ctf_flag won't
  // attribute to a closed event, by design). Veteran solves 3, newcomer solves 1 -- a real
  // ranking to assert on. Backfill both ctf_event_solves (the event board) and ctf_solves
  // (the durable practice-solve fact), matching what a live solve during the window produced.
  if (endedId) {
    const endedWindowSolves: Array<{ userId: string; challengeId: string; points: number }> = [
      { userId: veteranId, challengeId: "c-web-1", points: 100 },
      { userId: veteranId, challengeId: "c-web-3", points: 250 },
      { userId: veteranId, challengeId: "c-crypto-1", points: 100 },
      { userId: newcomerId, challengeId: "c-web-1", points: 100 },
    ];
    for (const s of endedWindowSolves) {
      await withServiceRole((client) =>
        client.query(
          "insert into public.ctf_solves (researcher_id, challenge_id, points_awarded, solved_at) values ($1,$2,$3,$4) on conflict (researcher_id, challenge_id) do nothing",
          [s.userId, s.challengeId, s.points, iso(now - 9.5 * day)],
        ),
      );
      await withServiceRole((client) =>
        client.query(
          "insert into public.ctf_event_solves (event_id, researcher_id, challenge_id, points_awarded, solved_at) values ($1,$2,$3,$4,$5) on conflict (event_id, researcher_id, challenge_id) do nothing",
          [endedId, s.userId, s.challengeId, s.points, iso(now - 9.5 * day)],
        ),
      );
    }
    console.log("Backfilled ENDED event leaderboard (veteran: 3 solves / 450 pts, newcomer: 1 solve / 100 pts).");
  }

  // ACTIVE event: drive one real solve through submit_ctf_flag as the veteran -- it attributes
  // live (the window is open now), proving the real solve->event-leaderboard path end to end.
  if (activeId) {
    await tryStep(
      withActor(veteranId, (client) => client.query("select * from public.submit_ctf_flag($1, $2)", ["c-network-1", ctfFlag("c-network-1")])),
      "submit_ctf_flag (veteran, active event, c-network-1)",
    );
    console.log("Veteran solved one challenge in the ACTIVE event via the real submit_ctf_flag path.");
  }
}

// Security: this creates accounts whose passwords are in the source code, including a
// platform admin. Never against a real deployment -- only when asked for explicitly.
if (process.env.ALLOW_TEST_ACCOUNTS !== "1") {
  console.error("Refusing to seed: this creates accounts with passwords published in the repo. Set ALLOW_TEST_ACCOUNTS=1 for a local or CI test database only.");
  process.exit(1);
}

async function main() {
  console.log("Seeding the E2E journey dataset...\n");

  // One suite run signs e2e.admin in ~9 times; check_sign_in_rate_limit allows 10 per email
  // per 15 minutes, so a second run inside that window was locked out and failed with
  // misleading sign-in timeouts. Reset only these seeded test accounts' counters -- the
  // limit itself is untouched. private.* is owner-only (the app role correctly can't write
  // it), so this one statement uses the schema-owner connection instead of widening grants.
  if (process.env.MIGRATION_DATABASE_URL) {
    const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
    const cleared = await owner.query("delete from private.rate_limit_counters where bucket_key like 'auth_sign_in:e2e.%@unpatched.demo'");
    // Same for the sign-up/reset limits (202610100001): every spec signs up from this
    // machine, so the loopback client buckets and the specs' own addresses are reset too.
    await owner.query(
      `delete from private.rate_limit_counters
        where bucket_key ~ '^(sign_up|password_reset)_client:(::1|::ffff:127\\.0\\.0\\.1|127\\.0\\.0\\.1)$'
           or bucket_key ~ '^(sign_up|password_reset):.*@(unpatched\\.demo|example\\.com)$'`,
    );
    // Leftovers from before those specs moved to E2E Launch Org (see E2E_LAUNCH_ORG_NAME).
    // Programs only -- every dependent row (reports, scope, members...) cascades.
    // Also the two "E2E Live Public/Private <timestamp>" programs org-journey.spec.ts creates
    // every run: ~200 had piled up, making the analytics program table 10,000px tall.
    // Their append-only reputation rows go first (replica mode for that one statement only;
    // it also disables FK cascades), then the programs cascade normally.
    const strayPrograms = `select p.id from public.programs p join public.organizations o on o.id = p.organization_id
      where o.name = $1 and (p.name like 'Acme Payments Bug Bounty %' or p.name like 'H1 Import %' or p.name ~ '^E2E Live (Public|Private) [0-9]+$')`;
    await owner.query("begin");
    await owner.query("set local session_replication_role = replica");
    await owner.query(`delete from public.reputation_ledger where program_id in (${strayPrograms})`, [E2E_ORG_NAME]);
    await owner.query("set local session_replication_role = origin");
    const removed = await owner.query(`delete from public.programs where id in (${strayPrograms})`, [E2E_ORG_NAME]);
    await owner.query("commit");
    // notifications.spec.ts proves cross-org isolation by asserting this account has NO
    // notifications at all -- anything it legitimately received (e.g. a manual
    // suspend/reinstate check of its own org) would break that proof, so start it clean.
    await owner.query("delete from public.notifications where recipient_id = (select id from public.users where email = $1)", [E2E_UNRELATED_ADMIN_EMAIL]);
    await owner.end();
    console.log(`Cleared ${cleared.rowCount} sign-in rate-limit counter(s) for E2E accounts; removed ${removed.rowCount} stray test program(s) from ${E2E_ORG_NAME}.\n`);
  } else {
    console.log("MIGRATION_DATABASE_URL not set -- sign-in rate-limit counters NOT cleared; back-to-back suite runs may be locked out.\n");
  }

  // e2e/program-policy.spec.ts submits a report every run; left in place they push the
  // fixture reports out of the program page's 5-report preview that journeys click through.
  const policyReports = await withServiceRole((client) => client.query("delete from public.reports where title like 'E2E policy-bound report %'"));
  if (policyReports.rowCount) console.log(`Removed ${policyReports.rowCount} report(s) left by the program-policy spec.`);
  // e2e/report-validation.spec.ts does the same; they filled org Home's 8-slot action queue
  // and pushed the triage-walk fixture out of it.
  const attachmentReports = await withServiceRole((client) => client.query("delete from public.reports where title like 'E2E attachment report %'"));
  if (attachmentReports.rowCount) console.log(`Removed ${attachmentReports.rowCount} report(s) left by the report-validation spec.`);
  // e2e/discovery.spec.ts saves a server-side draft every run.
  await withServiceRole((client) => client.query("delete from public.report_drafts d using public.users u where u.id = d.researcher_id and u.email like 'e2e.%'"));
  const admin = await ensureUser(E2E_ADMIN_EMAIL, "E2E Admin", "e2e_admin");
  await ensureUser(E2E_INVITED_EMAIL, "E2E Invited Researcher", "e2e_invited");
  const veteran = await ensureUser(E2E_VETERAN_EMAIL, "E2E Veteran Researcher", "e2e_veteran");
  const newcomer = await ensureUser(E2E_NEWCOMER_EMAIL, "E2E Newcomer Researcher", "e2e_newcomer");
  await resetSettingsAccount(await ensureUser(E2E_SETTINGS_EMAIL, "E2E Settings Researcher", "e2e_settings"));
  await resetSettingsAccount(await ensureUser(E2E_PASSWORD_CASE_EMAIL, "E2E Settings Researcher", "e2e_password"));
  const hunter = await ensureUser(E2E_HUNTER_EMAIL, "E2E Hunter Researcher", "e2e_hunter");
  // e2e/documents.spec.ts: a researcher with no verified identity, kept that way every run.
  const unverified = await ensureUser(E2E_UNVERIFIED_EMAIL, "E2E Unverified Researcher", "e2e_unverified");
  await withServiceRole((client) => client.query("delete from public.researcher_kyc where user_id = $1", [unverified.id]));
  const platformAdmin = await ensurePlatformAdmin(E2E_PLATFORM_ADMIN_EMAIL, "E2E Platform Admin", "e2e_platform_admin");
  await ensurePlatformAdmin(E2E_PLATFORM_ADMIN_2_EMAIL, "E2E Platform Admin 2", "e2e_platform_admin_2");
  const launchAdmin = await ensureUser(E2E_LAUNCH_ADMIN_EMAIL, "E2E Launch Admin", "e2e_launch_admin");
  await ensureOrganization(launchAdmin.id, E2E_LAUNCH_ORG_NAME);
  console.log("");

  const org = await ensureOrganization(admin.id, E2E_ORG_NAME);
  console.log("");

  let publicProgram = await ensureProgram(admin.id, org.id, E2E_PUBLIC_PROGRAM_NAME);
  publicProgram = await ensureScopeAndActivate(admin.id, publicProgram, "api.e2e-public.example", "public");
  // e2e/discovery.spec.ts drafts a report here as the hunter (the veteran is near its sign-in limit).
  await tryStep(withActor(hunter.id, (client) => client.query("select public.join_public_program($1)", [publicProgram.id])), "join_public_program (hunter, public program)");
  await tryStep(withActor(unverified.id, (client) => client.query("select public.join_public_program($1)", [publicProgram.id])), "join_public_program (unverified, public program)");
  // e2e/submission-signal.spec.ts: a researcher whose submissions an admin pauses and resumes.
  // Starts every run unpaused, with the normal "new researcher" cap (no override).
  const flagged = await ensureUser(E2E_FLAGGED_EMAIL, "E2E Flagged Researcher", "e2e_flagged");
  await withServiceRole((client) => client.query("update public.submission_restrictions set lifted_at = now() where user_id = $1 and lifted_at is null", [flagged.id]));
  await tryStep(withActor(flagged.id, (client) => client.query("select public.join_public_program($1)", [publicProgram.id])), "join_public_program (flagged, public program)");
  // The suite submits ~15 reports a run and the seed is re-run before every check, so the
  // other test researchers get a high daily cap (202610210001); the flagged one keeps the real one.
  await withServiceRole((client) =>
    client.query("update public.users set submission_daily_cap_override = 1000 where email like 'e2e.%@unpatched.demo' and email <> $1", [E2E_FLAGGED_EMAIL]),
  );
  // e2e/program-policy.spec.ts: a published policy (safe harbor, coordinated disclosure, SLA
  // targets) researchers must accept before submitting. Published once; later runs keep it.
  const publicPolicy = await withServiceRole((client) => client.query("select 1 from public.program_policy_versions where program_id = $1", [publicProgram.id]));
  if (publicPolicy.rowCount === 0) {
    await tryStep(
      withActor(admin.id, (client) =>
        client.query("select public.publish_program_policy($1, $2, true, 'coordinated', 90, 72, 168, 90, 'Initial policy')", [
          publicProgram.id,
          "Test only the in-scope API. No denial of service, social engineering, or access to other users' data -- use your own test accounts. Stop and report as soon as you confirm an issue.",
        ]),
      ),
      "publish_program_policy (public program)",
    );
    console.log("Published program policy v1 for the public program.");
  }
  console.log("");

  let privateProgram = await ensureProgram(admin.id, org.id, E2E_PRIVATE_PROGRAM_NAME);
  privateProgram = await ensureScopeAndActivate(admin.id, privateProgram, "api.e2e-private.example", "private");

  // e2e/request-to-join.spec.ts: a public program that reviews who joins (202610220002), and a
  // researcher who asks. Reset every run: requests cleared, the researcher not yet a participant.
  let requestProgram = await ensureProgram(admin.id, org.id, E2E_REQUEST_PROGRAM_NAME);
  requestProgram = await ensureScopeAndActivate(admin.id, requestProgram, "api.e2e-request.example", "public");
  const requester = await ensureUser(E2E_REQUESTER_EMAIL, "E2E Requester Researcher", "e2e_requester");
  await withServiceRole(async (client) => {
    await client.query("update public.programs set join_mode = 'request' where id = $1", [requestProgram.id]);
    await client.query("update public.program_access_requests set status = 'withdrawn', decided_at = coalesce(decided_at, now()) where program_id = $1 and status in ('pending', 'declined')", [requestProgram.id]);
    await client.query("delete from public.program_researchers where program_id = $1 and user_id = $2", [requestProgram.id, requester.id]);
  });
  console.log("");

  // e2e/org-roles.spec.ts: one member per limited role. The manager and triager are
  // assigned to the PUBLIC program only, so the private program proves the scoping.
  for (const [email, name, username, role] of [
    [E2E_PROGRAM_MANAGER_EMAIL, "E2E Program Manager", "e2e_program_manager", "program_manager"],
    [E2E_TRIAGER_EMAIL, "E2E Triager", "e2e_triager", "triager"],
    [E2E_BILLING_ADMIN_EMAIL, "E2E Billing Admin", "e2e_billing_admin", "billing_admin"],
  ] as const) {
    const member = await ensureUser(email, name, username);
    await markOrganizationAccount(member.id);
    await withServiceRole((client) =>
      client.query(
        `insert into public.organization_members (organization_id, user_id, role, status, invited_by, joined_at)
         values ($1, $2, $3, 'active', $4, now())
         on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active', suspended_at = null, removed_at = null`,
        [org.id, member.id, role, admin.id],
      ),
    );
    if (role !== "billing_admin") {
      await withActor(admin.id, (client) => client.query("select public.assign_program_member($1, $2)", [publicProgram.id, member.id]));
      await withServiceRole((client) => client.query("delete from public.program_members where program_id = $1 and user_id = $2", [privateProgram.id, member.id]));
    }
    console.log(`${email} is a ${role} of ${E2E_ORG_NAME}${role !== "billing_admin" ? `, assigned to ${E2E_PUBLIC_PROGRAM_NAME} only` : ""}.`);
  }
  // Staff may not be researchers on their own organization's programs (202609280001 now
  // refuses it); drop any such row an earlier run created before that rule existed.
  const staffAsResearcher = await withServiceRole((client) =>
    client.query("delete from public.program_researchers pr using public.organization_members m where m.organization_id = pr.organization_id and m.user_id = pr.user_id and pr.organization_id = $1", [org.id]),
  );
  if (staffAsResearcher.rowCount) console.log(`Removed ${staffAsResearcher.rowCount} researcher row(s) held by ${E2E_ORG_NAME}'s own staff.`);
  console.log("");

  await ensurePendingInvitation(admin.id, privateProgram.id, org.id, E2E_INVITED_EMAIL);
  console.log("");

  await ensureReputationHistory(admin.id, org.id, veteran.id, publicProgram, "api.e2e-public.example");
  // e2e/org-roles.spec.ts: one real payment obligation (the $1,500 finalized bounty above)
  // for the billing admin's Payments page. Recreated every run (its attempts cascade), so
  // e2e/functional-cases.spec.ts's payout case always starts from a pending obligation.
  const resolvedTitle = "E2E seed: resolved report with finalized bounty";
  // The payout gate (202610060008) needs a payout method and a verified tax form before a
  // payout can start: the veteran gets both through the real RPCs, reviewed by the platform
  // admin. Idempotent -- a tax form already verified is left alone.
  await tryStep(withActor(veteran.id, (client) => client.query("select public.upsert_my_payout_details('paypal', null, null, null, $1)", ["e2e.veteran.payouts@example.test"])), "upsert_my_payout_details (veteran)");
  const veteranTax = await withServiceRole((client) => client.query<{ tax_form_status: string | null }>("select tax_form_status from public.researcher_payout_details where user_id = $1", [veteran.id]));
  if (veteranTax.rows[0]?.tax_form_status !== "verified") {
    await tryStep(withActor(veteran.id, (client) => client.query("select public.upsert_my_tax_form('w9', $1)", ["000-00-4821"])), "upsert_my_tax_form (veteran)");
    await withServiceRole((client) => client.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [platformAdmin.id]));
    await tryStep(withPlatformActor(platformAdmin.id, (client) => client.query("select public.review_tax_form($1, 'verified', 'E2E seed')", [veteran.id])), "review_tax_form (veteran)");
  }
  // A payout from a previous run left an immutable tax deduction on this obligation
  // (202610220040). Test reset only: the owner clears it with triggers off; the app never can.
  if (process.env.MIGRATION_DATABASE_URL) {
    const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
    try {
      const c = await owner.connect();
      try {
        await c.query("begin");
        await c.query("set local session_replication_role = replica");
        await c.query(
          "delete from public.payout_tax_withholdings w using public.payment_obligations o, public.reports r where w.obligation_id = o.id and r.id = o.report_id and r.program_id = $1 and r.title = $2",
          [publicProgram.id, resolvedTitle],
        );
        await c.query("commit");
      } finally {
        c.release();
      }
    } finally {
      await owner.end();
    }
  }
  await withServiceRole((client) =>
    client.query("delete from public.payment_obligations o using public.reports r where r.id = o.report_id and r.program_id = $1 and r.title = $2", [publicProgram.id, resolvedTitle]),
  );
  // e2e/triage.spec.ts assigns reports every run; start every run unassigned.
  await withServiceRole((client) => client.query("update public.reports set assignee_id = null where organization_id = $1 and assignee_id is not null", [org.id]));
  // e2e/disclosure.spec.ts requests, approves and unpublishes this report's disclosure every run.
  await withServiceRole((client) =>
    client.query("delete from public.report_disclosures d using public.reports r where r.id = d.report_id and r.program_id = $1 and r.title = $2", [publicProgram.id, resolvedTitle]),
  );
  // e2e/payouts.spec.ts confirms the award every run.
  await withServiceRole((client) =>
    client.query("delete from public.bounty_acceptances a using public.reports r where r.id = a.report_id and r.program_id = $1 and r.title = $2", [publicProgram.id, resolvedTitle]),
  );
  // Awards draw on the prepaid balance (202610140004): one confirmed deposit, large enough for
  // every run's awards. Idempotent -- the reference can be claimed once.
  await withServiceRole((client) =>
    client.query(
      `insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_by, reviewed_at)
       values ($1, 'USD', 100000000, 'wire', 'E2E-SEED-FUNDING', 'confirmed', $2, $3, now()) on conflict do nothing`,
      [org.id, admin.id, platformAdmin.id],
    ),
  );
  await tryStep(
    withActor(admin.id, (client) => client.query("select public.create_payment_obligation((select id from public.reports where program_id = $1 and title = $2))", [publicProgram.id, resolvedTitle])),
    "create_payment_obligation (veteran report)",
  );
  console.log("Created a fresh payment obligation for the veteran's finalized bounty.");
  console.log("");

  await ensureFreshReportForTriageWalk(veteran.id, publicProgram, "api.e2e-public.example");
  console.log("");

  let notifProgram = await ensureProgram(admin.id, org.id, E2E_NOTIF_PROGRAM_NAME);
  notifProgram = await ensureScopeAndActivate(admin.id, notifProgram, "api.e2e-notif.example", "public");
  await tryStep(withActor(veteran.id, (client) => client.query("select public.join_public_program($1)", [notifProgram.id])), "join_public_program (veteran, notif program)");
  await ensureFreshReportForNotificationsWalk(veteran.id, notifProgram, "api.e2e-notif.example");
  console.log("");

  await ensureUnrelatedOrg();
  const integrations = await ensureIntegrationsOrg(veteran.id);
  console.log("");

  await seedCtfEvents(admin.id, veteran.id, newcomer.id);
  console.log("");

  // Engagements lists 20 programs per page, newest first, and every full E2E run adds two
  // "E2E Live ..." programs (program-launch-journey.spec.ts) to this same org. Without this,
  // the seeded fixtures drift off page one (seen 2026-10-05: E2E Public Program at #21) and
  // every spec that clicks them from the list fails.
  await withServiceRole((client) =>
    client.query("update public.programs set updated_at = now() where id = any($1)", [[publicProgram.id, privateProgram.id, notifProgram.id]]),
  );

  // Turn 8: the visibility-with-teeth E2E assertion needs a real id to attempt a direct
  // URL against as the uninvited researcher -- a UI-only search can only prove "not
  // listed," never "denied even by direct id." Writing it here (not read back from the
  // database inside the spec itself) keeps the spec's own access model honest: it drives
  // the browser exactly like a real attacker with a guessed/leaked id would, nothing more.
  const fixturePath = path.join(process.cwd(), "e2e", ".seed-fixture.json");
  await writeFile(
    fixturePath,
    JSON.stringify(
      {
        organizationId: org.id,
        publicProgramId: publicProgram.id,
        privateProgramId: privateProgram.id,
        requestProgramId: requestProgram.id,
        integrationsOrganizationId: integrations.organizationId,
        integrationsProgramId: integrations.programId,
        integrationsReportId: integrations.reportId,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote e2e/.seed-fixture.json (organizationId, publicProgramId, privateProgramId, integrations*).`);

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

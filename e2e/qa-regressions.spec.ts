import { test, expect } from "./qa-test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Regressions for the 2026-10-12 QA findings (db/migrations/202610120001), replayed through the
// same RPCs and actor claims the app uses, on a disposable org this file creates and removes.

const tag = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const match = new RegExp(`^${name}=(.+)$`, "m").exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error(`${name} not found`);
  return match[1].trim();
}

async function as<T>(claims: { sub: string; session_id?: string } | null, fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: env("DATABASE_URL") });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('app.current_claims', $1, true)", [JSON.stringify(claims ? { ...claims, role: "authenticated" } : { sub: "", role: "service_role" })]);
    await db.query(`set local role ${claims ? "authenticated" : "service_role"}`);
    const result = await fn(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
const service = <T>(fn: (db: pg.Client) => Promise<T>) => as(null, fn);
const rpc = (actor: string, sql: string, args: unknown[] = [], sessionId?: string) => as({ sub: actor, session_id: sessionId }, async (db) => (await db.query(sql, args)).rows[0]);

const ids: Record<string, string> = {};

async function submitReport(actor: string, title: string, description = "Steps.") {
  return as({ sub: actor }, async (db) => {
    await db.query("select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)", [ids.program]);
    const { rows } = await db.query("select id from public.submit_report($1, $2, $3, $4, $5, $6, $7, $8)", [ids.program, "domain", `qa-${tag}.example.com`, title, description, "other", "Impact.", "high"]);
    return rows[0].id as string;
  });
}

async function resolveReport(report: string) {
  for (const sql of ["select public.start_triage($1)", "select public.set_report_severity($1, 'high')", "select public.accept_report($1)"]) await rpc(ids.owner, sql, [report]);
  await rpc(ids.owner, "select public.resolve_report($1, $2)", [report, "Fixed."]);
}

async function asOwner<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: env("MIGRATION_DATABASE_URL") });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function createUser(key: string, accountType: "researcher" | "organization") {
  ids[key] = await service(async (db) => {
    const { rows } = await db.query("select id from public.create_user($1, $2, $3, null)", [`e2e.qa-reg-${key}-${tag}@example.com`, "not-a-real-hash", `QA ${key}`]);
    await db.query("update public.users set email_verified_at = now(), account_type = $2 where id = $1", [rows[0].id, accountType]);
    return rows[0].id as string;
  });
}

test.describe.serial("QA regressions (2026-10-12)", () => {
  test.beforeAll(async () => {
    await createUser("owner", "organization");
    await createUser("r1", "researcher");
    await createUser("r2", "researcher");
    await createUser("admin", "researcher");
    await createUser("r3", "researcher");
    ids.session = randomUUID();
    await service(async (db) => {
      await db.query("insert into public.platform_admins (user_id) values ($1)", [ids.admin]);
      await db.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal2')", [ids.session, ids.admin, `qa-${ids.session}`]);
    });
    ids.org = (await rpc(ids.owner, "select id from public.create_organization($1)", [`QA Regressions ${tag}`])).id;
    ids.program = (await rpc(ids.owner, "select id from public.create_program($1, $2)", [ids.org, `QA Program ${tag}`])).id;
    await rpc(ids.owner, "select public.create_bounty_policy_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [ids.program, "USD", 0, 0, 10000, 50000, 50000, 150000, 150000, 500000, 500000, 2000000]);
    // Awards must be funded (202610140006).
    await service((db) =>
      db.query("insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by) values ($1, 'USD', 100000000, 'wire', $2, 'confirmed', $3)", [ids.org, `QA-${tag}`, ids.owner]),
    );
  });

  test.afterAll(async () => {
    // Append-only tables (reputation ledger, audit log) block a normal delete; the owner
    // connection skips those triggers for this test-only cleanup, like scripts/seed-e2e.ts.
    const owner = new pg.Client({ connectionString: env("MIGRATION_DATABASE_URL") });
    await owner.connect();
    // The outbox worker may still be writing this org's notifications; deleting the org at
    // that moment can deadlock (seen once). Test-only teardown, so just try again.
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          await teardown(owner);
          break;
        } catch (error) {
          await owner.query("rollback").catch(() => {});
          if ((error as { code?: string }).code !== "40P01" || attempt >= 3) throw error;
        }
      }
    } finally {
      await owner.end();
    }
  });

  async function teardown(owner: pg.Client) {
    await owner.query("begin");
    const users = Object.entries(ids).filter(([k]) => ["owner", "r1", "r2", "r3", "admin", "o2"].includes(k)).map(([, v]) => v);
    const orgs = [ids.org, ids.org2].filter(Boolean);
    // Replica mode only for the append-only ledger rows -- it also disables FK cascades, so
    // the org/user deletes below must run in normal mode or they leave orphans behind.
    await owner.query("set local session_replication_role = replica");
    await owner.query("delete from public.reputation_ledger where researcher_id = any($1::uuid[]) or organization_id = any($2::uuid[])", [users, orgs]);
    await owner.query("set local session_replication_role = origin");
    await owner.query("delete from public.organization_deposits where organization_id = any($1::uuid[])", [orgs]);
    await owner.query("delete from public.organizations where id = any($1::uuid[])", [orgs]);
    await owner.query("delete from public.users where id = any($1::uuid[])", [users]);
    await owner.query("commit");
  }

  test("launch review needs in-scope assets, and scope is locked while in review", async () => {
    await expect(rpc(ids.owner, "select public.submit_program_for_review($1)", [ids.program])).rejects.toThrow(/SCOPE_REQUIRED/);
    await rpc(ids.owner, "select public.add_scope_entry($1, $2, $3, $4, $5)", [ids.program, "domain", `qa-${tag}.example.com`, "in_scope", null]);
    await rpc(ids.owner, "select public.submit_program_for_review($1)", [ids.program]);
    await expect(rpc(ids.owner, "select public.add_scope_entry($1, $2, $3, $4, $5)", [ids.program, "domain", `late-${tag}.example.com`, "in_scope", null])).rejects.toThrow(/SCOPE_LOCKED_IN_REVIEW/);
    const entry = await service(async (db) => (await db.query("select id from public.program_scope_entries where program_id = $1", [ids.program])).rows[0].id);
    await expect(rpc(ids.owner, "select public.remove_scope_entry($1)", [entry])).rejects.toThrow(/SCOPE_LOCKED_IN_REVIEW/);
    await rpc(ids.admin, "select public.activate_program($1)", [ids.program], ids.session);
    await rpc(ids.owner, "select public.set_program_visibility($1, $2)", [ids.program, "public"]);
  });

  test("bounty amounts: outside the range needs a reason, and there is a hard cap", async () => {
    await rpc(ids.r1, "select public.join_public_program($1)", [ids.program]);
    ids.report = await as({ sub: ids.r1 }, async (db) => {
      await db.query("select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)", [ids.program]);
      const { rows } = await db.query("select id from public.submit_report($1, $2, $3, $4, $5, $6, $7, $8)", [ids.program, "domain", `qa-${tag}.example.com`, "QA regression report", "Steps.", "other", "Impact.", "high"]);
      return rows[0].id as string;
    });
    for (const sql of ["select public.start_triage($1)", "select public.set_report_severity($1, 'high')", "select public.accept_report($1)"]) await rpc(ids.owner, sql, [ids.report]);
    await rpc(ids.owner, "select public.resolve_report($1, $2)", [ids.report, "Fixed."]);
    await rpc(ids.owner, "select public.calculate_bounty_recommendation($1)", [ids.report]);

    await expect(rpc(ids.owner, "select public.finalize_bounty($1, $2, $3)", [ids.report, 900000, null])).rejects.toThrow(/outside the policy range/);
    await expect(rpc(ids.owner, "select public.finalize_bounty($1, $2, $3)", [ids.report, "9000000000000000000", "huge"])).rejects.toThrow(/more than 10,000,000/);
    await rpc(ids.owner, "select public.finalize_bounty($1, $2, $3)", [ids.report, 900000, "Exceptional chain -- bonus agreed."]);
    await expect(rpc(ids.owner, "select public.adjust_bounty($1, $2, $3)", [ids.report, "2000000000", "typo"])).rejects.toThrow(/more than 10,000,000/);
  });

  test("a report with a finalized bounty can't be reopened and then rejected", async () => {
    const retest = await rpc(ids.r1, "select id from public.request_report_retest($1, $2)", [ids.report, "Still works?"]);
    await rpc(ids.owner, "select public.decide_report_retest($1, 'still_vulnerable', $2)", [retest.id, "Fix incomplete."]);
    await rpc(ids.owner, "select public.request_information($1, $2)", [ids.report, "More detail please."]);
    await expect(rpc(ids.owner, "select public.reject_report($1)", [ids.report])).rejects.toThrow(/BOUNTY_FINALIZED/);
  });

  test("an invitation sent before a suspension doesn't lift it", async () => {
    await rpc(ids.r2, "select public.join_public_program($1)", [ids.program]);
    const email = `e2e.qa-reg-r2-${tag}@example.com`;
    await rpc(ids.owner, "select public.invite_researcher_to_program($1, $2, $3, $4)", [ids.program, email, "Join.", createHash("sha256").update(randomUUID()).digest("hex")]);
    const invitation = await service(async (db) => (await db.query("select id from public.program_invitations where program_id = $1 and email = $2", [ids.program, email])).rows[0].id);
    await rpc(ids.owner, "select public.suspend_program_researcher($1, $2)", [ids.program, ids.r2]);
    await expect(rpc(ids.r2, "select public.accept_program_invitation_by_id($1)", [invitation])).rejects.toThrow(/INVITATION_SUPERSEDED/);
    const status = await service(async (db) => (await db.query("select status from public.program_researchers where program_id = $1 and user_id = $2", [ids.program, ids.r2])).rows[0].status);
    expect(status).toBe("suspended");
  });

  test("reputation follows the latest outcome and the severity at resolution", async () => {
    const report = await submitReport(ids.r1, "QA reputation report");
    await resolveReport(report);
    const retest = await rpc(ids.r1, "select id from public.request_report_retest($1, $2)", [report, "Still works?"]);
    await rpc(ids.owner, "select public.decide_report_retest($1, 'still_vulnerable', $2)", [retest.id, "Fix incomplete."]);
    await rpc(ids.owner, "select public.set_report_severity($1, 'low')", [report]);
    await rpc(ids.owner, "select public.request_information($1, $2)", [report, "More detail please."]);
    await rpc(ids.owner, "select public.reject_report($1)", [report]);

    // What the outbox worker would record, in order (deduplicated if it already did).
    const facts = await asOwner(async (db) => {
      const event = async (type: string) => (await db.query("select id, occurred_at from public.outbox_events where aggregate_id = $1 and event_type = $2 order by occurred_at limit 1", [report, type])).rows[0];
      for (const [type, fact] of [["report.resolved", "report_resolved"], ["report.rejected", "report_rejected"]]) {
        const e = await event(type);
        await db.query("select public.record_reputation_fact($1, $2, $3, $4)", [e.id, fact, report, e.occurred_at]);
      }
      const resolved = await db.query("select confirmed_severity from public.reputation_ledger where report_id = $1 and fact_type = 'report_resolved'", [report]);
      const effective = await db.query("select fact_type from private.effective_reputation_facts() where report_id = $1", [report]);
      return { resolvedSeverity: resolved.rows[0].confirmed_severity, effective: effective.rows.map((r) => r.fact_type) };
    });
    expect(facts.resolvedSeverity).toBe("high"); // not the later "low"
    expect(facts.effective).toEqual(["report_rejected"]); // the resolved points no longer count
  });

  test("duplicate chains point at the root original", async () => {
    const [a, b, c] = [await submitReport(ids.r1, "QA original"), await submitReport(ids.r1, "QA dup one"), await submitReport(ids.r1, "QA dup two")];
    for (const r of [b, c]) await rpc(ids.owner, "select public.start_triage($1)", [r]);
    await rpc(ids.owner, "select public.mark_duplicate($1, $2)", [b, a]);
    await rpc(ids.owner, "select public.mark_duplicate($1, $2)", [c, b]);
    const root = await service(async (db) => (await db.query("select duplicate_of_report_id from public.reports where id = $1", [c])).rows[0].duplicate_of_report_id);
    expect(root).toBe(a);
  });

  test("collaborator split rounding can't leave the submitter 0%", async () => {
    await rpc(ids.r3, "select public.join_public_program($1)", [ids.program]);
    const report = await submitReport(ids.r1, "QA collab report");
    const username = `qa-collab-${tag}`.slice(0, 30);
    await service((db) => db.query("update public.users set public_username = $2 where id = $1", [ids.r3, username]));
    await expect(rpc(ids.r1, "select public.add_report_collaborator($1, $2, $3)", [report, username, "99.999"])).rejects.toThrow(/INVALID_SPLIT/);
  });

  test("retests are capped at 3 per report", async () => {
    const report = await submitReport(ids.r1, "QA retest report");
    await resolveReport(report);
    for (let n = 0; n < 3; n++) {
      const retest = await rpc(ids.r1, "select id from public.request_report_retest($1, $2)", [report, `Round ${n}`]);
      await rpc(ids.owner, "select public.decide_report_retest($1, 'confirmed_fixed', $2)", [retest.id, "Fixed."]);
    }
    await expect(rpc(ids.r1, "select id from public.request_report_retest($1, $2)", [report, "Again"])).rejects.toThrow(/RETEST_LIMIT_REACHED/);
  });

  test("whitespace-only report text is refused", async () => {
    await expect(submitReport(ids.r1, "QA blank description", "\n\t \n")).rejects.toThrow(/reports_text_not_blank|INVALID/);
  });

  test("a suspended organization can't change visibility or scope", async () => {
    await service((db) => db.query("update public.organizations set status = 'suspended' where id = $1", [ids.org]));
    try {
      await expect(rpc(ids.owner, "select public.set_program_visibility($1, $2)", [ids.program, "private"])).rejects.toThrow(/ORGANIZATION_SUSPENDED/);
      await expect(rpc(ids.owner, "select public.add_scope_entry($1, $2, $3, $4, $5)", [ids.program, "domain", `susp-${tag}.example.com`, "in_scope", null])).rejects.toThrow(/ORGANIZATION_SUSPENDED/);
    } finally {
      await service((db) => db.query("update public.organizations set status = 'active' where id = $1", [ids.org]));
    }
  });

  // --- Product decisions, 2026-10-13 (202610130001) ---------------------------------

  test("org staff see a researcher's alias, never the real email", async () => {
    await service((db) => db.query("insert into public.researcher_email_aliases (user_id, local_part) values ($1, $2) on conflict do nothing", [ids.r1, `qa_${tag}`]));
    await expect(rpc(ids.owner, "select email from public.users where id = $1", [ids.r1])).rejects.toThrow(/permission denied/);
    expect((await rpc(ids.owner, "select public.visible_email($1) as e", [ids.r1])).e).toBeNull();
    expect((await rpc(ids.owner, "select public.researcher_alias_local_part($1) as a", [ids.r1])).a).toBe(`qa_${tag}`);
    // ...and researchers never see staff emails; you still see your own.
    expect((await rpc(ids.r1, "select public.visible_email($1) as e", [ids.owner])).e).toBeNull();
    expect((await rpc(ids.r1, "select public.visible_email($1) as e", [ids.r1])).e).toBe(`e2e.qa-reg-r1-${tag}@example.com`);
  });

  test("a suspended organization's triage is frozen", async () => {
    const report = await submitReport(ids.r1, "QA frozen report");
    await service((db) => db.query("update public.organizations set status = 'suspended' where id = $1", [ids.org]));
    try {
      await expect(rpc(ids.owner, "select public.start_triage($1)", [report])).rejects.toThrow(/ORGANIZATION_SUSPENDED/);
    } finally {
      await service((db) => db.query("update public.organizations set status = 'active' where id = $1", [ids.org]));
    }
    await rpc(ids.owner, "select public.start_triage($1)", [report]);
  });

  test("simultaneous submissions get a strict order, and only the later can be the duplicate", async () => {
    const [first, second] = await Promise.all([submitReport(ids.r1, "QA race A"), submitReport(ids.r1, "QA race B")]);
    const seq = await service(async (db) => Object.fromEntries((await db.query("select id, submission_seq from public.reports where id = any($1::uuid[])", [[first, second]])).rows.map((r) => [r.id, Number(r.submission_seq)])));
    expect(seq[first]).not.toBe(seq[second]);
    const [earlier, later] = seq[first] < seq[second] ? [first, second] : [second, first];
    for (const r of [earlier, later]) await rpc(ids.owner, "select public.start_triage($1)", [r]);
    await expect(rpc(ids.owner, "select public.mark_duplicate($1, $2)", [earlier, later])).rejects.toThrow(/INVALID_DUPLICATE/);
    await rpc(ids.owner, "select public.mark_duplicate($1, $2)", [later, earlier]);
  });

  test("a deactivated account no longer exists for anyone else", async () => {
    await service((db) => db.query("update public.users set deactivated_at = now() where id = $1", [ids.r3]));
    expect(await rpc(ids.owner, "select count(*)::int as n from public.users where id = $1", [ids.r3])).toEqual({ n: 0 });
    const report = await submitReport(ids.r1, "QA collab after deactivation");
    await expect(rpc(ids.r1, "select public.add_report_collaborator($1, $2, $3)", [report, `qa-collab-${tag}`.slice(0, 30), "10"])).rejects.toThrow(/COLLABORATOR_NOT_FOUND/);
    // They still see themselves (and platform admins still see the record).
    expect(await rpc(ids.r3, "select count(*)::int as n from public.users where id = $1", [ids.r3])).toEqual({ n: 1 });
  });

  // --- Races from the system design review (202610130002), run truly concurrently -------

  test("two co-owners deactivating at the same moment can't leave the org ownerless", async () => {
    await createUser("o2", "organization");
    ids.org2 = (await rpc(ids.owner, "select id from public.create_organization($1)", [`QA Owners ${tag}`])).id;
    await service((db) => db.query("insert into public.organization_members (organization_id, user_id, role, status) values ($1, $2, 'owner', 'active')", [ids.org2, ids.o2]));
    const results = await Promise.allSettled([rpc(ids.owner, "select public.deactivate_my_account()"), rpc(ids.o2, "select public.deactivate_my_account()")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/LAST_OWNER/);
    // Put the first owner back for cleanup symmetry (only the platform can, normally).
    await service((db) => db.query("update public.users set deactivated_at = null where id = any($1::uuid[])", [[ids.owner, ids.o2]]));
  });

  test("one emailed MFA code can't verify two sessions", async () => {
    const codeHash = createHash("sha256").update(randomUUID()).digest("hex");
    await service((db) => db.query("insert into public.mfa_factors (user_id, status, method, verified_at) values ($1, 'verified', 'email', now()) on conflict (user_id) do nothing", [ids.r2]));
    await rpc(ids.r2, "select public.create_mfa_challenge('verify', $1, 600)", [codeHash]);
    const results = await Promise.allSettled([1, 2].map(() => rpc(ids.r2, "select public.verify_mfa_challenge($1) as r", [codeHash])));
    const verified = results.filter((r) => r.status === "fulfilled" && (r.value as { r: string }).r === "verify");
    expect(verified).toHaveLength(1);
  });
});

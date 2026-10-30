import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminSession, fixture, inTx, newUser, userId, type Db } from "./db";

// 202610290008 / 0009: Managed Triage (billing, analyst access, escalations) and the analytics
// dataset + scheduled exports, enforced in the database.

const ORG = fixture.organizationId;

async function fund(db: Db, minor: number) {
  await db.query("reset role");
  await db.query(
    "insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_at) select $1, 'USD', $2, 'wire', 'TEST-MT-' || gen_random_uuid(), 'confirmed', (select user_id from public.organization_members where organization_id = $1 and role = 'owner' limit 1), now()",
    [ORG, minor],
  );
}
async function available(db: Db): Promise<number> {
  await db.query("reset role");
  return Number((await db.one<{ available: string }>("select coalesce((select available from private.organization_balance($1) where currency = 'USD'), 0) as available", [ORG])).available);
}
async function newReport(db: Db): Promise<{ id: string; program_id: string }> {
  await db.query("reset role");
  const r = await db.one<{ id: string; program_id: string }>("select id, program_id from public.reports where organization_id = $1 and status = 'new' order by submitted_at desc limit 1", [ORG]);
  if (!r) throw new Error("seed has no new report in the E2E organization");
  return r;
}

async function activate(db: Db) {
  const owner = await userId(db, "e2e.admin@unpatched.demo");
  const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
  await db.as({ user: owner });
  await db.query("select public.request_managed_triage($1, 'standard', 'USD')", [ORG]);
  await db.as({ user: admin, session: await adminSession(db, admin) });
  await db.query("select public.decide_managed_triage($1, true, null)", [ORG]);
}

describe("managed triage", () => {
  it("activation charges the balance exactly once and the statement still adds up", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.query("reset role");
      await db.query("delete from public.managed_triage_subscriptions where organization_id = $1", [ORG]);

      // Only org admins request; nobody but a platform admin activates.
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.as({ user: triager });
      expect(await db.fails("select public.request_managed_triage($1, 'standard', 'USD')", [ORG])).toMatch(/FORBIDDEN/);
      await db.as({ user: owner });
      await db.query("select public.request_managed_triage($1, 'standard', 'USD')", [ORG]);
      expect(await db.fails("select public.decide_managed_triage($1, true, null)", [ORG])).toMatch(/FORBIDDEN/);

      // Activation refuses when the balance can't cover the month, then succeeds once funded.
      const before = await available(db);
      const session = await adminSession(db, admin);
      if (before < 150000) {
        await db.as({ user: admin, session });
        expect(await db.fails("select public.decide_managed_triage($1, true, null)", [ORG])).toMatch(/INSUFFICIENT_BALANCE/);
        await fund(db, 150000 - before + 1000);
      }
      const funded = await available(db);
      await db.as({ user: admin, session });
      await db.query("select public.decide_managed_triage($1, true, null)", [ORG]);
      expect(await available(db)).toBe(funded - 150000);
      expect(await db.fails("select public.decide_managed_triage($1, true, null)", [ORG])).toMatch(/NOT_REQUESTED/);

      // The wallet statement opens and closes on the same arithmetic as the balance.
      await db.as({ user: owner });
      const ledger = await db.rows<{ kind: string; amount_minor_units: string }>("select * from public.get_organization_wallet_ledger($1, 'USD', current_date - 400, current_date)", [ORG]);
      expect(ledger.some((l) => l.kind === "service")).toBe(true);
      expect(ledger.reduce((s, l) => s + Number(l.amount_minor_units), 0)).toBe(await available(db));
    });
  });

  it("analysts triage subscribed organizations only, never touch money, and need MFA", async () => {
    await inTx(async (db) => {
      await db.query("reset role");
      await db.query("delete from public.managed_triage_subscriptions where organization_id = $1", [ORG]);
      await fund(db, 500000);
      const report = await newReport(db);
      const analyst = await userId(db, "e2e.analyst@unpatched.demo");
      const session = await adminSession(db, analyst);

      // Not subscribed: the report is invisible and can't be triaged.
      await db.as({ user: analyst, session });
      expect(await db.rows("select id from public.reports where id = $1", [report.id])).toHaveLength(0);
      expect(await db.fails("select public.start_triage($1)", [report.id])).toMatch(/FORBIDDEN|NOT_FOUND/);

      await activate(db);
      // Without an MFA-verified session: still nothing.
      await db.as({ user: analyst });
      expect(await db.rows("select id from public.reports where id = $1", [report.id])).toHaveLength(0);
      expect((await db.one<{ triage_analyst: boolean; analyst_needs_mfa: boolean }>("select * from public.get_my_platform_staff()")).analyst_needs_mfa).toBe(true);

      await db.as({ user: analyst, session });
      expect(await db.rows("select id from public.reports where id = $1", [report.id])).toHaveLength(1);
      await db.query("select public.claim_managed_report($1, false)", [report.id]);
      const queue = await db.rows<{ report_id: string; claimed_by: string }>("select * from public.list_managed_triage_queue('mine', null)");
      expect(queue.map((q) => q.report_id)).toContain(report.id);
      await db.query("select public.start_triage($1)", [report.id]);
      await db.query("select public.record_triage_assessment($1, 'reproduced', 'high', null, 'Reproduced on staging with the given request.')", [report.id]);
      // Money is the organization's: finance checks reject analysts.
      expect(await db.fails("select public.finalize_bounty($1, 1000, null)", [report.id])).toMatch(/FORBIDDEN|NOT_READY|not authorized/i);

      // An escalation reaches the organization through the outbox, and only staff can answer it.
      const esc = await db.one<{ id: string }>("select id from public.escalate_report_to_customer($1, 'severity_decision', 'Is the admin panel internet-facing in production?')", [report.id]);
      expect(await db.fails("select public.answer_triage_escalation($1, 'Answering my own question.')", [esc.id])).toMatch(/NOT_FOUND/);
      await db.query("reset role");
      expect(await db.rows("select 1 from public.outbox_events where event_type = 'report.triage_escalated' and aggregate_id = $1 and occurred_at >= now()", [report.id])).toHaveLength(1);
      const researcher = (await db.one<{ researcher_id: string }>("select researcher_id from public.reports where id = $1", [report.id])).researcher_id;
      await db.as({ user: researcher });
      expect(await db.rows("select id from public.report_triage_escalations where report_id = $1", [report.id])).toHaveLength(0);
      expect(await db.rows("select id from public.report_triage_assessments where report_id = $1", [report.id])).toHaveLength(0);
      await db.as({ user: await userId(db, "e2e.admin@unpatched.demo") });
      await db.query("select public.answer_triage_escalation($1, 'Yes, it is public.')", [esc.id]);
      await db.query("reset role");
      expect(await db.rows("select 1 from public.outbox_events where event_type = 'report.escalation_answered' and aggregate_id = $1 and occurred_at >= now() and payload ->> 'recipient_id' = $2", [report.id, analyst])).toHaveLength(1);

      // A renewal the balance can't cover pauses the service and the analyst's access.
      await db.query("update public.managed_triage_subscriptions set paid_through = current_date - 1 where organization_id = $1", [ORG]);
      await db.query("insert into public.organization_service_charges (organization_id, service, currency, amount_minor_units, description, period_start, period_end) values ($1, 'managed_triage', 'USD', $2, 'test drain', current_date - 400, current_date - 370)", [ORG, await available(db)]);
      await db.as("service");
      await db.query("select public.renew_managed_triage_subscriptions()");
      await db.query("reset role");
      expect((await db.one<{ status: string }>("select status from public.managed_triage_subscriptions where organization_id = $1", [ORG])).status).toBe("past_due");
      await db.as({ user: analyst, session });
      expect(await db.rows("select id from public.reports where id = $1", [report.id])).toHaveLength(0);
    });
  });
});

describe("analytics dataset and scheduled exports", () => {
  it("finance roles and outsiders can't read report facts; schedules are claimed once per slot", async () => {
    await inTx(async (db) => {
      for (const email of ["e2e.billing-admin@unpatched.demo", "e2e.unrelated-admin@unpatched.demo", "e2e.veteran@unpatched.demo"]) {
        await db.as({ user: await userId(db, email) });
        expect(await db.fails("select * from public.list_organization_report_facts($1, current_date - 30, current_date)", [ORG])).toMatch(/FORBIDDEN|not an active member/i);
      }
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const facts = await db.rows("select * from public.list_organization_report_facts($1, current_date - 365, current_date, null, array['critical','high','medium','low','none','unrated'], null, null)", [ORG]);
      expect(facts.length).toBeGreaterThan(0);
      expect(await db.fails("select * from public.list_organization_report_facts($1, current_date, current_date - 1)", [ORG])).toMatch(/INVALID_PERIOD/);

      const s = await db.one<{ id: string; next_run_at: Date }>("select * from public.create_analytics_export_schedule($1, 'Weekly', 'pdf', 'weekly', '{}'::jsonb)", [ORG]);
      expect(new Date(s.next_run_at).getUTCDay()).toBe(1);
      await db.query("reset role");
      await db.query("update public.analytics_export_schedules set next_run_at = now() - interval '1 minute' where id = $1", [s.id]);
      await db.as("service");
      expect((await db.rows<{ id: string }>("select id from public.claim_due_analytics_exports(5)")).map((r) => r.id)).toContain(s.id);
      expect((await db.rows<{ id: string }>("select id from public.claim_due_analytics_exports(5)")).map((r) => r.id)).not.toContain(s.id);

      // A researcher can't create one, nor read the organization's schedules.
      await db.as({ user: await userId(db, "e2e.veteran@unpatched.demo") });
      expect(await db.fails("select public.create_analytics_export_schedule($1, 'x', 'csv', 'weekly', '{}'::jsonb)", [ORG])).toMatch(/FORBIDDEN|not an active member/i);
      expect(await db.rows("select id from public.analytics_export_schedules where id = $1", [s.id])).toHaveLength(0);
    });
  });
});

describe("analyst invitations", () => {
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");

  it("an unregistered email gets a single-use invitation that creates a verified analyst account", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const email = `new.analyst.${Date.now()}@example.com`;
      await db.as({ user: admin, session: await adminSession(db, admin) });
      expect((await db.one<{ invite_triage_analyst: string }>("select public.invite_triage_analyst($1, $2)", [email.toUpperCase(), hash("tok-1")])).invite_triage_analyst).toBe("invited");
      // A researcher can't invite, and can't redeem (service role only).
      await db.as({ user: await userId(db, "e2e.veteran@unpatched.demo") });
      expect(await db.fails("select public.invite_triage_analyst($1, $2)", [email, hash("tok-x")])).toMatch(/FORBIDDEN/);
      expect(await db.fails("select public.redeem_triage_analyst_invitation($1, 'x', 'New Analyst')", [hash("tok-1")])).toMatch(/permission denied/);

      await db.as("service");
      expect(await db.fails("select public.redeem_triage_analyst_invitation($1, 'x', 'New Analyst')", [hash("wrong")])).toMatch(/INVITATION_INVALID/);
      const created = (await db.one<{ redeem_triage_analyst_invitation: string }>("select public.redeem_triage_analyst_invitation($1, 'argon-hash', 'New Analyst')", [hash("tok-1")])).redeem_triage_analyst_invitation;
      // Single use.
      expect(await db.fails("select public.redeem_triage_analyst_invitation($1, 'x', 'Again')", [hash("tok-1")])).toMatch(/INVITATION_INVALID/);
      await db.query("reset role");
      const u = await db.one<{ email: string; verified: boolean; analyst: boolean }>(
        "select u.email, u.email_verified_at is not null as verified, exists (select 1 from public.triage_analysts a where a.user_id = u.id and a.active) as analyst from public.users u where u.id = $1",
        [created],
      );
      expect(u).toEqual({ email: email.toLowerCase(), verified: true, analyst: true });
    });
  });

  it("accepting while signed in needs the invited email; an existing account is added directly", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.as({ user: admin, session: await adminSession(db, admin) });
      await db.query("select public.invite_triage_analyst('someone.else@example.com', $1)", [hash("tok-2")]);
      await db.as({ user: await userId(db, "e2e.veteran@unpatched.demo") });
      expect(await db.fails("select public.accept_triage_analyst_invitation($1)", [hash("tok-2")])).toMatch(/INVITATION_EMAIL_MISMATCH/);
      // An organization member can never become an analyst.
      await db.as({ user: admin, session: await adminSession(db, admin) });
      expect(await db.fails("select public.invite_triage_analyst('e2e.admin@unpatched.demo', $1)", [hash("tok-3")])).toMatch(/ANALYST_CONFLICT/);
      expect((await db.one<{ invite_triage_analyst: string }>("select public.invite_triage_analyst('e2e.newcomer@unpatched.demo', $1)", [hash("tok-4")])).invite_triage_analyst).toBe("added");
    });
  });
});

describe("demo accounts (development databases only)", () => {
  it("a demo researcher counts as verified and a demo organization's scope needs no proof, only while the switch is on", async () => {
    await inTx(async (db) => {
      const researcher = await newUser(db, "researcher");
      await db.query("delete from public.researcher_kyc where user_id = $1", [researcher]);
      const kyc = async () => (await db.one<{ ok: boolean }>("select private.researcher_has_verified_kyc($1) as ok", [researcher])).ok;
      await db.query("select set_config('app.settings.demo_accounts', 'on', true)");
      expect(await kyc()).toBe(false);

      // Signed-in users can never set the flag on themselves.
      await db.as({ user: researcher });
      expect(await db.fails("update public.users set is_demo = true where id = $1", [researcher])).toMatch(/FORBIDDEN|permission denied/);
      await db.as("service");
      // Only this researcher, and the organization row itself (no recompute of its whole scope, which
      // would wait on other test files working on the same seeded organization).
      await db.query("select public.set_demo_flags(array[(select email from public.users where id = $1)], '{}')", [researcher]);
      await db.query("update public.organizations set is_demo = true where id = $1", [ORG]);
      await db.query("reset role");
      expect(await kyc()).toBe(true);
      const host = `demo-${Date.now()}.unpatched-unowned.com`;
      const entry = await db.one<{ clearance: string }>(
        "insert into public.program_scope_entries (program_id, organization_id, asset_type, target, display_target, scope_state, created_by) select id, organization_id, 'domain', $1, $1, 'in_scope', (select user_id from public.organization_members where organization_id = $2 and role = 'owner' limit 1) from public.programs where id = $3 returning clearance",
        [host, ORG, fixture.publicProgramId],
      );
      expect(entry.clearance).toBe("not_required");

      // Switch off: the same account and organization get no exemption.
      await db.query("select set_config('app.settings.demo_accounts', '', true)");
      expect(await kyc()).toBe(false);
      expect((await db.one<{ c: string }>("select private.compute_scope_clearance(e, null)::text as c from public.program_scope_entries e where target = $1", [host])).c).toBe("pending_verification");
      await db.as("service");
      expect(await db.fails("select public.set_demo_flags('{}', '{}')")).toMatch(/DEMO_DISABLED/);
    });
  });
});

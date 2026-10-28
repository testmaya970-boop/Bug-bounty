import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inTx, newUser, userId, type Db } from "./db";

// 202610290003: post-award bonuses, enforced in the database (money paths first).

async function finalizedReport(db: Db): Promise<{ id: string; researcher_id: string; organization_id: string; final_amount_minor_units: string; currency: string }> {
  await db.query("reset role");
  return db.one(
    "select r.id, r.researcher_id, r.organization_id, d.final_amount_minor_units, d.currency from public.reports r join public.report_bounty_decisions d on d.report_id = r.id where r.title = 'E2E seed: resolved report with finalized bounty'",
  );
}

/** Make sure the organization can fund a bonus inside this (rolled back) transaction. */
async function fund(db: Db, organizationId: string, currency: string) {
  await db.query("reset role");
  await db.query(
    "insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_at) select $1, $2, 100000000, 'wire', 'TEST-BONUS-FUNDS', 'confirmed', (select user_id from public.organization_members where organization_id = $1 and role = 'owner' limit 1), now()",
    [organizationId, currency],
  );
}

describe("post-award bonuses", () => {
  it("proposal is idempotent and capped; the proposer can't approve it", async () => {
    await inTx(async (db) => {
      const report = await finalizedReport(db);
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const key = randomUUID();
      await db.as({ user: owner });
      const first = await db.one<{ id: string; status: string }>("select * from public.propose_bonus($1, 5000, 'exceptional_quality', 'A very clear report with a working fix.', $2)", [report.id, key]);
      const again = await db.one<{ id: string }>("select * from public.propose_bonus($1, 5000, 'exceptional_quality', 'A very clear report with a working fix.', $2)", [report.id, key]);
      expect(again.id).toBe(first.id);
      expect(first.status).toBe("proposed");
      expect(await db.fails("select public.propose_bonus($1, $2, 'other', 'Too big a bonus.', $3)", [report.id, Number(report.final_amount_minor_units) + 1, randomUUID()])).toMatch(/BONUS_TOO_LARGE/);
      expect(await db.fails("select public.decide_bonus($1, true, null)", [first.id])).toMatch(/SELF_APPROVAL/);

      // Not for anyone outside the organization's finance roles, and researchers can't see a proposal.
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.as({ user: triager });
      expect(await db.fails("select public.propose_bonus($1, 100, 'other', 'Should not be allowed.', $2)", [report.id, randomUUID()])).toMatch(/FORBIDDEN|not authorized|NOT_FOUND/i);
      await db.as({ user: report.researcher_id });
      expect(await db.rows("select id from public.report_bonuses where id = $1", [first.id])).toHaveLength(0);
    });
  });

  it("approval by a second person creates split obligations exactly once, and the researcher then sees it", async () => {
    await inTx(async (db) => {
      const report = await finalizedReport(db);
      await fund(db, report.organization_id, report.currency);
      // A collaborator with a 30% share on this report.
      const collaborator = await newUser(db, "researcher");
      await db.query("reset role");
      await db.query("insert into public.program_researchers (program_id, organization_id, user_id, status, source) select program_id, organization_id, $2, 'active', 'invitation' from public.reports where id = $1 on conflict do nothing", [report.id, collaborator]).catch(() => null);
      await db.query("set session_replication_role = replica"); // seed a collaborator past the report's status lock (test only)
      await db.query("insert into public.report_collaborators (report_id, researcher_id, bounty_split_percent, added_by) values ($1, $2, 30, $3)", [report.id, collaborator, report.researcher_id]);
      await db.query("set session_replication_role = origin");

      const admin = await userId(db, "e2e.admin@unpatched.demo");
      const platform = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.as({ user: admin });
      const bonus = await db.one<{ id: string }>("select * from public.propose_bonus($1, 10001, 'retest', 'Thanks for the fast retest.', $2)", [report.id, randomUUID()]);

      // A second person approves (platform staff here, with an MFA session).
      await db.query("reset role");
      const sessionId = randomUUID();
      await db.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal2')", [sessionId, platform, `bonus-${sessionId}`]);
      await db.as({ user: platform, session: sessionId });
      const approved = await db.one<{ status: string }>("select * from public.decide_bonus($1, true, 'Approved')", [bonus.id]);
      expect(approved.status).toBe("approved");
      expect(await db.fails("select public.decide_bonus($1, true, null)", [bonus.id])).toMatch(/NOT_PENDING/); // never twice

      await db.query("reset role");
      const obligations = await db.rows<{ researcher_id: string; amount_minor_units: string; status: string }>("select researcher_id, amount_minor_units, status from public.payment_obligations where bonus_id = $1 order by amount_minor_units", [bonus.id]);
      expect(obligations).toHaveLength(2);
      expect(obligations.map((o) => Number(o.amount_minor_units))).toEqual([3000, 7001]); // floor(30%), remainder to the submitter
      expect(obligations.reduce((s, o) => s + Number(o.amount_minor_units), 0)).toBe(10001);
      expect(obligations.find((o) => Number(o.amount_minor_units) === 3000)?.researcher_id).toBe(collaborator);
      expect(obligations.every((o) => o.status === "pending")).toBe(true);
      const outbox = await db.rows("select id from public.outbox_events where event_type = 'bounty.bonus_approved' and payload ->> 'bonus_id' = $1", [bonus.id]);
      expect(outbox).toHaveLength(1);

      await db.as({ user: report.researcher_id });
      expect(await db.rows("select id from public.report_bonuses where id = $1", [bonus.id])).toHaveLength(1);
    });
  });

  it("rejection needs a reason and creates nothing", async () => {
    await inTx(async (db) => {
      const report = await finalizedReport(db);
      const pm = await userId(db, "e2e.program-manager@unpatched.demo");
      const admin = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: admin });
      const bonus = await db.one<{ id: string }>("select * from public.propose_bonus($1, 100, 'campaign', 'October campaign bonus.', $2)", [report.id, randomUUID()]);
      await db.as({ user: pm });
      expect(await db.fails("select public.decide_bonus($1, true, null)", [bonus.id])).toMatch(/FORBIDDEN/); // program managers propose, never approve
      const other = await newUser(db, "organization");
      await db.query("reset role");
      await db.query("insert into public.organization_members (organization_id, user_id, role, status) values ($1, $2, 'security_admin', 'active')", [report.organization_id, other]);
      await db.as({ user: other });
      expect(await db.fails("select public.decide_bonus($1, false, '')", [bonus.id])).toMatch(/NOTE_REQUIRED/);
      await db.query("select public.decide_bonus($1, false, 'Outside the campaign window')", [bonus.id]);
      await db.query("reset role");
      expect(await db.rows("select id from public.payment_obligations where bonus_id = $1", [bonus.id])).toHaveLength(0);
    });
  });
});

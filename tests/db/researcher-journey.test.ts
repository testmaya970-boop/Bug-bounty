import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminSession, ackPolicy, fixture, inTx, newUser, userId, type Db } from "./db";

// 202610280001: the researcher journey's internal workflows, enforced in the database.

async function researcherOnPublicProgram(db: Db): Promise<{ id: string; username: string }> {
  const id = await newUser(db, "researcher");
  await db.query("reset role");
  await db.query("update public.users set submission_daily_cap_override = 100 where id = $1", [id]);
  const { username } = await db.one<{ username: string }>("select username from public.users where id = $1", [id]);
  await db.as({ user: id });
  await db.query("select public.join_public_program($1)", [fixture.publicProgramId]);
  return { id, username };
}

async function submitReport(db: Db, researcher: string): Promise<string> {
  await db.as({ user: researcher });
  await ackPolicy(db, fixture.publicProgramId);
  const tag = randomUUID();
  const row = await db.one<{ id: string }>(
    "select id from public.submit_report($1, 'domain', 'api.e2e-public.example', $2, $3, 'sql_injection', 'impact', 'low')",
    [fixture.publicProgramId, `Collab ${tag.slice(0, 8)}`, `A finding ${tag} with enough detail to reproduce it`],
  );
  return row.id;
}

async function veteranResolvedReport(db: Db): Promise<{ reportId: string; veteran: string }> {
  const veteran = await userId(db, "e2e.veteran@unpatched.demo");
  const row = await db.one<{ id: string }>("select id from public.reports where researcher_id = $1 and status = 'resolved' and program_id = $2 limit 1", [veteran, fixture.publicProgramId]);
  return { reportId: row.id, veteran };
}

describe("collaboration invitations", () => {
  it("consent first: invited shares reserve the split, the invitee accepts, then reads the report", async () => {
    await inTx(async (db) => {
      const a = await researcherOnPublicProgram(db);
      const b = await researcherOnPublicProgram(db);
      const c = await researcherOnPublicProgram(db);
      const report = await submitReport(db, a.id);

      // The old direct add skipped consent and is no longer callable.
      expect(await db.fails("select public.add_report_collaborator($1, $2, 10)", [report, b.username])).toMatch(/permission denied/);

      const inv = await db.one<{ id: string; status: string }>("select * from public.invite_report_collaborator($1, $2, 30, 'Found it together')", [report, b.username]);
      expect(inv.status).toBe("pending");
      // The pending 30 is reserved: 70 more would leave the submitter nothing.
      expect(await db.fails("select public.invite_report_collaborator($1, $2, 70, null)", [report, c.username])).toMatch(/SPLIT_EXCEEDS_TOTAL/);
      expect(await db.fails("select public.invite_report_collaborator($1, $2, 10.555, null)", [report, c.username])).toMatch(/INVALID_SPLIT/);
      expect(await db.fails("select public.invite_report_collaborator($1, $2, 10, null)", [report, b.username])).toMatch(/INVITATION_PENDING/);

      // Before accepting, B cannot read the report; someone else cannot answer for B.
      await db.as({ user: b.id });
      expect(await db.rows("select id from public.reports where id = $1", [report])).toHaveLength(0);
      await db.as({ user: c.id });
      expect(await db.fails("select public.respond_collaboration_invitation($1, true)", [inv.id])).toMatch(/INVITATION_NOT_FOUND/);

      await db.as({ user: b.id });
      const mine = await db.rows<{ kind: string; status: string; my_role: string }>("select kind, status, my_role from public.list_my_collaborations()");
      expect(mine).toEqual([expect.objectContaining({ kind: "invitation", status: "pending", my_role: "invitee" })]);
      await db.query("select public.respond_collaboration_invitation($1, true)", [inv.id]);
      expect(await db.rows("select id from public.reports where id = $1", [report])).toHaveLength(1);
      expect(await db.fails("select public.respond_collaboration_invitation($1, false)", [inv.id])).toMatch(/INVITATION_CLOSED/);

      await db.as({ user: a.id });
      expect(await db.fails("select public.invite_report_collaborator($1, $2, 10, null)", [report, b.username])).toMatch(/ALREADY_COLLABORATOR/);
      const declined = await db.one<{ id: string }>("select * from public.invite_report_collaborator($1, $2, 20, null)", [report, c.username]);
      await db.query("select public.revoke_collaboration_invitation($1)", [declined.id]);
      const rows = await db.rows<{ kind: string; status: string; bounty_split_percent: string }>("select kind, status, bounty_split_percent from public.list_my_collaborations() order by kind");
      expect(rows).toEqual([
        expect.objectContaining({ kind: "collaborator", status: "accepted", bounty_split_percent: "30.00" }),
        expect.objectContaining({ kind: "invitation", status: "revoked" }),
      ]);
    });
  });
});

describe("CVE requests", () => {
  it("only for the submitter's resolved and published report; one open request; assignment needs evidence", async () => {
    await inTx(async (db) => {
      const { reportId, veteran } = await veteranResolvedReport(db);
      await db.as({ user: veteran });
      expect(await db.fails("select public.request_cve($1, 'Acme API', '1.0 to 1.4', 'Remote SQL injection in the public API that exposes every customer record.')", [reportId])).toMatch(/must be publicly disclosed/);

      await db.query("reset role");
      await db.query(
        "insert into public.report_disclosures (report_id, organization_id, status, requested_by, published_title, published_summary, published_at) select id, organization_id, 'approved', researcher_id, 'SQLi in API', 'Summary', now() from public.reports where id = $1",
        [reportId],
      );
      // Someone else cannot request a CVE for it.
      const other = await researcherOnPublicProgram(db);
      expect(await db.fails("select public.request_cve($1, 'Acme API', '1.0', 'Not my report but I would like a CVE for it anyway please.')", [reportId])).toMatch(/REPORT_NOT_FOUND/);
      expect(other.id).toBeTruthy();

      await db.as({ user: veteran });
      expect((await db.rows("select * from public.list_my_cve_eligible_reports()")).map((r) => (r as { report_id: string }).report_id)).toContain(reportId);
      const req = await db.one<{ id: string; status: string }>("select * from public.request_cve($1, 'Acme API', '1.0 to 1.4', 'Remote SQL injection in the public API that exposes every customer record.')", [reportId]);
      expect(req.status).toBe("pending");
      expect(await db.fails("select public.request_cve($1, 'Acme API', '1.0', 'A second request for the very same report should be refused.')", [reportId])).toMatch(/CVE_REQUEST_EXISTS/);
      // Researchers cannot review or assign.
      expect(await db.fails("select public.review_cve_request($1, 'approved', null)", [req.id])).toMatch(/FORBIDDEN/);
      expect(await db.fails("update public.cve_requests set status = 'assigned' where id = $1", [req.id])).toMatch(/permission denied/);

      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.as({ user: admin, session: await adminSession(db, admin) });
      expect(await db.fails("select public.record_cve_assignment($1, 'CVE-2026-12345', 'https://www.cve.org/CVERecord?id=CVE-2026-12345')", [req.id])).toMatch(/NOT_APPROVED/);
      await db.query("select public.review_cve_request($1, 'approved', null)", [req.id]);
      expect(await db.fails("select public.record_cve_assignment($1, 'CVE-26-1', 'https://x.example')", [req.id])).toMatch(/INVALID_CVE_ID/);
      expect(await db.fails("select public.record_cve_assignment($1, 'CVE-2026-12345', '')", [req.id])).toMatch(/EVIDENCE_REQUIRED/);
      const done = await db.one<{ status: string; cve_id: string }>("select * from public.record_cve_assignment($1, 'CVE-2026-12345', 'https://www.cve.org/CVERecord?id=CVE-2026-12345')", [req.id]);
      expect(done).toMatchObject({ status: "assigned", cve_id: "CVE-2026-12345" });
    });
  });
});

describe("acknowledgements", () => {
  it("organization proposes, the researcher decides, only published ones are public", async () => {
    await inTx(async (db) => {
      const { reportId, veteran } = await veteranResolvedReport(db);
      await db.as({ user: veteran });
      expect(await db.fails("select public.propose_acknowledgement($1, null)", [reportId])).toMatch(/FORBIDDEN/);

      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const ack = await db.one<{ id: string; status: string }>("select * from public.propose_acknowledgement($1, 'Thanks for the clear report')", [reportId]);
      expect(ack.status).toBe("proposed");
      await db.as("anon");
      expect(await db.rows("select * from public.list_hall_of_fame($1, 50)", [fixture.publicProgramId])).toHaveLength(0);

      await db.as({ user: veteran });
      await db.query("select public.respond_acknowledgement($1, true)", [ack.id]);
      await db.as("anon");
      const hof = await db.rows<Record<string, unknown>>("select * from public.list_hall_of_fame($1, 50)", [fixture.publicProgramId]);
      expect(hof).toHaveLength(1);
      expect(Object.keys(hof[0])).not.toContain("report_title");

      // The researcher can withdraw consent; it disappears from the public list.
      await db.as({ user: veteran });
      await db.query("select public.revoke_acknowledgement($1)", [ack.id]);
      await db.as("anon");
      expect(await db.rows("select * from public.list_hall_of_fame($1, 50)", [fixture.publicProgramId])).toHaveLength(0);
    });
  });
});

describe("events, mentorship, swag, follows, agreements", () => {
  it("event capacity and registration windows hold; only staff create events", async () => {
    await inTx(async (db) => {
      const r1 = await researcherOnPublicProgram(db);
      const r2 = await researcherOnPublicProgram(db);
      await db.as({ user: r1.id });
      expect(await db.fails("select public.save_hacking_event(null, 'Live hack', 'An internal live hacking day', 'online', null, now() + interval '2 days', now() + interval '3 days', now() + interval '1 day', 1, 0)")).toMatch(/FORBIDDEN/);
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.as({ user: admin, session: await adminSession(db, admin) });
      const ev = await db.one<{ id: string }>("select * from public.save_hacking_event(null, 'Live hack', 'An internal live hacking day', 'online', null, now() + interval '2 days', now() + interval '3 days', now() + interval '1 day', 1, 0)");
      await db.as({ user: r1.id });
      expect(await db.fails("select public.register_for_hacking_event($1)", [ev.id])).toMatch(/NOT_FOUND/); // still a draft
      await db.as({ user: admin, session: await adminSession(db, admin) });
      await db.query("select public.set_hacking_event_status($1, 'published')", [ev.id]);
      await db.as({ user: r1.id });
      await db.query("select public.register_for_hacking_event($1)", [ev.id]);
      await db.as({ user: r2.id });
      expect(await db.fails("select public.register_for_hacking_event($1)", [ev.id])).toMatch(/EVENT_FULL/);
      await db.as({ user: r1.id });
      await db.query("select public.cancel_hacking_event_registration($1)", [ev.id]);
      await db.as({ user: r2.id });
      expect(await db.fails("select public.register_for_hacking_event($1)", [ev.id])).toBeNull();
    });
  });

  it("mentors need a track record; requests are one open per pair and accepting shares the meeting note", async () => {
    await inTx(async (db) => {
      const newbie = await researcherOnPublicProgram(db);
      await db.as({ user: newbie.id });
      expect(await db.fails("select public.save_my_mentor_profile('Web app testing', array['xss'], true, 2)")).toMatch(/NOT_ELIGIBLE/);

      const mentor = await userId(db, "showcase.hunter@unpatched.demo").catch(() => null);
      if (!mentor) return; // showcase seed not loaded
      await db.as({ user: mentor });
      await db.query("select public.save_my_mentor_profile('Web app testing and IDOR hunting', array['idor', 'xss'], true, 1)");
      await db.as({ user: newbie.id });
      const req = await db.one<{ id: string }>("select * from public.request_mentorship($1, 'idor', 'I would like help understanding how to find IDOR bugs in APIs.')", [mentor]);
      expect(await db.fails("select public.request_mentorship($1, 'xss', 'A second open request to the same mentor should be refused.')", [mentor])).toMatch(/REQUEST_EXISTS/);
      await db.as({ user: mentor });
      expect(await db.fails("select public.respond_mentorship_request($1, true, '')", [req.id])).toMatch(/NOTE_REQUIRED/);
      await db.query("select public.respond_mentorship_request($1, true, 'Tuesdays 6pm IST on the call link I will send in your report thread')", [req.id]);
      await db.as({ user: newbie.id });
      const mine = await db.one<{ status: string; mentor_note: string }>("select * from public.list_my_mentorships()");
      expect(mine.status).toBe("accepted");
      expect(mine.mentor_note).toMatch(/Tuesdays/);
    });
  });

  it("swag: stock is real, approvals take from it, addresses stay private", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const session = await adminSession(db, admin);
      await db.as({ user: admin, session });
      const item = await db.one<{ id: string }>("select * from public.save_swag_item(null, 'Unpatched hoodie', 'Black hoodie with the seal', 0, 1, true)");
      const r1 = await researcherOnPublicProgram(db);
      const r2 = await researcherOnPublicProgram(db);
      await db.as({ user: r1.id });
      const req = await db.one<{ id: string }>("select * from public.request_swag($1, 'Asha Rao', '12 MG Road, Bengaluru 560001, India')", [item.id]);
      await db.as({ user: r2.id });
      const req2 = await db.one<{ id: string }>("select * from public.request_swag($1, 'Ravi K', '45 Park Street, Kolkata 700016, India')", [item.id]);
      expect(await db.rows("select id from public.swag_requests where id = $1", [req.id])).toHaveLength(0);
      await db.as({ user: admin, session });
      await db.query("select public.update_swag_request($1, 'approved', null, null)", [req.id]);
      expect(await db.fails("select public.update_swag_request($1, 'approved', null, null)", [req2.id])).toMatch(/OUT_OF_STOCK/);
      expect(await db.fails("select public.update_swag_request($1, 'requested', null, null)", [req.id])).toMatch(/INVALID_TRANSITION/);
      await db.query("select public.update_swag_request($1, 'shipped', null, 'DTDC 123')", [req.id]);
    });
  });

  it("follows only programs the caller can see; agreements record the version accepted", async () => {
    await inTx(async (db) => {
      const r = await researcherOnPublicProgram(db);
      await db.as({ user: r.id });
      await db.query("select public.set_program_follow($1, true)", [fixture.publicProgramId]);
      expect(await db.fails("select public.set_program_follow($1, true)", [fixture.privateProgramId])).toMatch(/NOT_FOUND/);
      expect(await db.rows("select * from public.list_my_followed_programs()")).toHaveLength(1);

      const agreements = await db.rows<{ agreement_id: string; kind: string; accepted_at: string | null }>("select * from public.list_my_agreements() where kind = 'platform'");
      expect(agreements.length).toBeGreaterThan(0);
      expect(agreements[0].accepted_at).toBeNull();
      const actions = await db.one<{ unaccepted_agreements: string }>("select * from public.get_my_researcher_actions()");
      expect(Number(actions.unaccepted_agreements)).toBeGreaterThan(0);
      await db.query("select public.accept_platform_agreement($1)", [agreements[0].agreement_id]);
      const after = await db.one<{ accepted_at: string | null }>("select accepted_at from public.list_my_agreements() where agreement_id = $1", [agreements[0].agreement_id]);
      expect(after.accepted_at).not.toBeNull();
    });
  });
});

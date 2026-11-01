import { describe, expect, it } from "vitest";
import { fixture, inTx, newUser, userId } from "./db";

// Request to join and duplicate suggestions (202610220002).

describe("request to join", () => {
  it("a by-request program can't be joined directly; staff approve a request and the researcher gets access", async () => {
    await inTx(async (db) => {
      await db.query("update public.programs set join_mode = 'request' where id = $1", [fixture.publicProgramId]);
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      expect(await db.fails("select public.join_public_program($1)", [fixture.publicProgramId])).toMatch(/APPROVAL_REQUIRED/);
      const req = await db.one<{ id: string }>("select id from public.request_program_access($1, 'I test payment flows for a living.')", [fixture.publicProgramId]);
      expect(await db.fails("select public.request_program_access($1, 'again')", [fixture.publicProgramId])).toMatch(/REQUEST_PENDING/);

      const outsider = await userId(db, "e2e.unrelated-admin@unpatched.demo");
      await db.as({ user: outsider });
      expect(await db.fails("select public.decide_program_access_request($1, true, null)", [req.id])).toMatch(/FORBIDDEN/);

      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const pending = await db.rows<{ id: string; tier: string }>("select id, tier from public.list_program_access_requests($1)", [fixture.publicProgramId]);
      expect(pending.map((p) => p.id)).toContain(req.id);
      await db.query("select public.decide_program_access_request($1, true, 'Welcome')", [req.id]);
      await db.query("reset role");
      const access = await db.one<{ status: string; source: string }>("select status, source from public.program_researchers where program_id = $1 and user_id = $2", [fixture.publicProgramId, r]);
      expect(access).toEqual({ status: "active", source: "request" });
    });
  });

  it("an open program refuses requests, and a declined researcher waits 30 days", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      expect(await db.fails("select public.request_program_access($1, null)", [fixture.publicProgramId])).toMatch(/OPEN_PROGRAM/);
      await db.query("reset role");
      await db.query("update public.programs set join_mode = 'request' where id = $1", [fixture.publicProgramId]);
      await db.as({ user: r });
      const req = await db.one<{ id: string }>("select id from public.request_program_access($1, null)", [fixture.publicProgramId]);
      await db.as({ user: await userId(db, "e2e.admin@unpatched.demo") });
      await db.query("select public.decide_program_access_request($1, false, 'Not this time')", [req.id]);
      await db.as({ user: r });
      expect(await db.fails("select public.request_program_access($1, null)", [fixture.publicProgramId])).toMatch(/RECENTLY_DECLINED/);
    });
  });
});

describe("duplicate suggestions", () => {
  it("staff get similar earlier reports ranked first; researchers can't probe other reports", async () => {
    await inTx(async (db) => {
      const report = await db.one<{ id: string; researcher_id: string }>(
        "select r.id, r.researcher_id from public.reports r where r.program_id = $1 and exists (select 1 from public.reports o where o.program_id = r.program_id and o.id <> r.id and o.submitted_at <= r.submitted_at) order by r.submitted_at desc limit 1",
        [fixture.publicProgramId],
      );
      await db.as({ user: await userId(db, "e2e.admin@unpatched.demo") });
      const suggestions = await db.rows<{ id: string; similarity: number }>("select id, similarity from public.suggest_duplicate_reports($1, 5)", [report.id]);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.map((s) => s.id)).not.toContain(report.id);
      await db.as({ user: report.researcher_id });
      expect(await db.fails("select * from public.suggest_duplicate_reports($1, 5)", [report.id])).toMatch(/FORBIDDEN/);
    });
  });
});

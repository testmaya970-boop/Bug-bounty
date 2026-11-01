import { describe, expect, it } from "vitest";
import { adminSession, fixture, inTx, userId, type Db } from "./db";

// 202610260008-0010: an organization cannot authorize testing of assets it does not own.

const ADD = "select * from public.add_scope_entry($1, $2::public.program_asset_type, $3, 'in_scope', 'test')";

async function asOwner(db: Db): Promise<string> {
  const owner = await userId(db, "e2e.admin@unpatched.demo");
  await db.as({ user: owner });
  return owner;
}


describe("scope ownership", () => {
  it("a domain the organization has not verified is added but authorizes nothing", async () => {
    await inTx(async (db) => {
      await asOwner(db);
      const e = await db.one<{ id: string; clearance: string }>(ADD, [fixture.publicProgramId, "domain", "*.victim-bank.com"]);
      expect(e.clearance).toBe("pending_verification");

      // Not in the public scope list, and the matcher (which submit_report uses) ignores it.
      await db.as("anon");
      const pub = await db.rows<{ id: string }>("select id from public.list_public_program_scope($1)", [fixture.publicProgramId]);
      expect(pub.map((r) => r.id)).not.toContain(e.id);
      await db.query("reset role");
      const m = await db.one<{ matched_entry_id: string | null }>(
        "select * from private.match_program_scope($1, 'domain', 'login.victim-bank.com', null, null, null)",
        [fixture.publicProgramId],
      );
      expect(m.matched_entry_id).toBeNull();

      // Researchers cannot even see it.
      const hunter = await userId(db, "e2e.hunter@unpatched.demo");
      await db.as({ user: hunter });
      expect(await db.rows("select id from public.program_scope_entries where id = $1", [e.id])).toHaveLength(0);
      // ...while still seeing the program's cleared scope.
      expect((await db.rows("select id from public.program_scope_entries where program_id = $1", [fixture.publicProgramId])).length).toBeGreaterThan(0);
    });
  });

  it("verifying the domain clears every host under it; only the server can mark it verified", async () => {
    await inTx(async (db) => {
      const owner = await asOwner(db);
      const e = await db.one<{ id: string }>(ADD, [fixture.publicProgramId, "url", "https://app.owned-corp.com/login"]);
      const d = await db.one<{ id: string; token: string; status: string }>("select * from public.add_organization_domain($1, 'https://Owned-Corp.com/')", [fixture.organizationId]);
      expect(d.status).toBe("pending");

      // The organization itself cannot flip its own domain to verified.
      expect(await db.fails("select public.record_domain_check($1, true, null, $2)", [d.id, owner])).toMatch(/permission denied/);
      expect(await db.fails("update public.organization_domains set status = 'verified' where id = $1", [d.id])).toMatch(/permission denied/);

      await db.as("service");
      await db.query("select public.record_domain_check($1, true, null, $2)", [d.id, owner]);
      await db.query("reset role");
      expect((await db.one<{ clearance: string }>("select clearance from public.program_scope_entries where id = $1", [e.id])).clearance).toBe("verified");

      // A look-alike domain is not covered: notowned-corp.com is not under owned-corp.com.
      await db.as({ user: owner });
      const lookalike = await db.one<{ clearance: string }>(ADD, [fixture.publicProgramId, "domain", "notowned-corp.com"]);
      expect(lookalike.clearance).toBe("pending_verification");

      // Removing the domain revokes it again.
      await db.query("select public.remove_organization_domain($1)", [d.id]);
      await db.query("reset role");
      expect((await db.one<{ clearance: string }>("select clearance from public.program_scope_entries where id = $1", [e.id])).clearance).toBe("pending_verification");
    });
  });

  it("reserved test names and documentation IP ranges need no proof; other assets wait for platform review", async () => {
    await inTx(async (db) => {
      await asOwner(db);
      expect((await db.one<{ clearance: string }>(ADD, [fixture.publicProgramId, "domain", "shop.acme.example"])).clearance).toBe("not_required");
      expect((await db.one<{ clearance: string }>(ADD, [fixture.publicProgramId, "ip_cidr", "198.51.100.0/24"])).clearance).toBe("not_required");
      const ip = await db.one<{ id: string; clearance: string }>(ADD, [fixture.publicProgramId, "ip_cidr", "8.8.8.0/24"]);
      expect(ip.clearance).toBe("pending_review");
      const app = await db.one<{ id: string; clearance: string }>(ADD, [fixture.publicProgramId, "android_app", "com.someone.else"]);
      expect(app.clearance).toBe("pending_review");

      // Organizations cannot approve their own assets.
      expect(await db.fails("select public.review_scope_entry($1, 'approved', null)", [app.id])).toMatch(/FORBIDDEN/);

      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const session = await adminSession(db, admin);
      await db.as({ user: admin, session });
      const queue = await db.rows<{ id: string }>("select id from public.list_scope_entries_pending_review()");
      expect(queue.map((r) => r.id)).toEqual(expect.arrayContaining([ip.id, app.id]));
      expect(await db.fails("select public.review_scope_entry($1, 'rejected', '')", [ip.id])).toMatch(/NOTE_REQUIRED/);
      expect((await db.one<{ clearance: string }>("select * from public.review_scope_entry($1, 'approved', null)", [app.id])).clearance).toBe("approved");
    });
  });

  it("a program cannot go to review or live without a cleared in-scope asset", async () => {
    await inTx(async (db) => {
      await asOwner(db);
      const p = await db.one<{ id: string }>("select id from public.create_program($1, 'Ownership gate test')", [fixture.organizationId]);
      await db.one(ADD, [p.id, "domain", "api.not-mine.com"]);
      expect(await db.fails("select public.submit_program_for_review($1)", [p.id])).toMatch(/SCOPE_UNVERIFIED/);
      await db.one(ADD, [p.id, "domain", "api.mine.example"]);
      expect(await db.fails("select public.submit_program_for_review($1)", [p.id])).toBeNull();
    });
  });
});

describe("contact requests", () => {
  it("only the server writes; validation and rate limits hold; only platform staff read", async () => {
    await inTx(async (db) => {
      const ARGS = ["Asha Rao", "asha@corp.example", "Corp", "https://corp.example", "launch_program", "We want to launch a private program next month."];
      const SUBMIT = "select public.submit_contact_request($1, $2, $3, $4, $5, $6, $7)";

      await db.as("anon");
      expect(await db.fails(SUBMIT, [...ARGS, "k"])).toMatch(/permission denied/);

      await db.as("service");
      expect(await db.fails(SUBMIT, [...ARGS.slice(0, 5), "too short", "k1"])).toMatch(/INVALID_INPUT/);
      expect(await db.fails(SUBMIT, [...ARGS.slice(0, 3), "javascript:alert(1)", ...ARGS.slice(4), "k1"])).toMatch(/INVALID_INPUT/);
      for (let i = 0; i < 3; i++) expect(await db.fails(SUBMIT, [...ARGS, `k-${i}`])).toBeNull();
      // Fourth from the same email in the hour.
      expect(await db.fails(SUBMIT, [...ARGS, "k-4"])).toMatch(/RATE_LIMITED/);

      const hunter = await userId(db, "e2e.hunter@unpatched.demo");
      await db.as({ user: hunter });
      expect(await db.fails("select * from public.list_contact_requests(null)")).toMatch(/FORBIDDEN/);
      expect(await db.fails("select * from public.contact_requests")).toMatch(/permission denied/);

      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const session = await adminSession(db, admin);
      await db.as({ user: admin, session });
      const list = await db.rows<{ id: string; email: string }>("select * from public.list_contact_requests('new')");
      const mine = list.filter((r) => r.email === "asha@corp.example");
      expect(mine).toHaveLength(3);
      expect(await db.fails("select public.mark_contact_request_handled($1)", [mine[0].id])).toBeNull();
      expect(await db.fails("select public.mark_contact_request_handled($1)", [mine[0].id])).toMatch(/NOT_FOUND/);
    });
  });
});

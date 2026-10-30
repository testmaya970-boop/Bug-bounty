import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ackPolicy, adminSession, fixture, inTx, newUser, userId } from "./db";

// Security tests against the real database: each one attacks a boundary as a real role and
// expects the database itself to refuse. These are the guarantees the UI relies on; a page
// hiding a button is never the protection.

describe("prepaid balance: money on its way", () => {
  it("an abandoned card checkout stops counting as pending after an hour; a bank transfer awaiting review still counts", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.admin@unpatched.demo");
      const pending = async () => {
        await db.as({ user: admin });
        const row = await db.one<{ p: string } | undefined>("select pending_deposits::text as p from public.get_organization_balances($1) where currency = 'USD'", [fixture.organizationId]);
        await db.query("reset role"); // fixture rows are written as the table owner
        return Number(row?.p ?? 0);
      };
      const before = await pending();
      const card = await db.one<{ id: string }>(
        "insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, requested_by, provider, gateway, charged_minor_units) values ($1, 'USD', 1000, 'card', $2, $3, 'sandbox', 'paypal', 1030) returning id",
        [fixture.organizationId, `card_${randomUUID().replace(/-/g, "")}`, admin],
      );
      expect(await pending()).toBe(before + 1000);
      await db.query("update public.organization_deposits set created_at = now() - interval '2 hours' where id = $1", [card.id]);
      expect(await pending()).toBe(before);
      await db.query("insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, requested_by, created_at) values ($1, 'USD', 500, 'wire', $2, $3, now() - interval '2 days')", [
        fixture.organizationId,
        `WIRE${randomUUID().slice(0, 8)}`,
        admin,
      ]);
      expect(await pending()).toBe(before + 500);
    });
  });
});

describe("usernames (202610300006)", () => {
  it("a blank username becomes a random mix of letters and numbers, never part of the email", async () => {
    await inTx(async (db) => {
      await db.query("reset role");
      const email = `jane.private.${randomUUID().slice(0, 6)}@example.com`;
      const { username } = await db.one<{ username: string }>("select (public.create_user($1, 'x', 'Jane', null)).username", [email]);
      expect(username).toMatch(/^r[a-z0-9]{9}$/);
      expect(username).not.toContain("jane");
      const chosen = await db.one<{ username: string }>("select (public.create_user($1, 'x', 'Jo', 'jo_hunter_42')).username", [`jo.${randomUUID().slice(0, 6)}@example.com`]);
      expect(chosen.username).toBe("jo_hunter_42");
    });
  });
});

describe("re-inviting a revoked researcher (202610300007)", () => {
  it("an organization can invite back a researcher it revoked, and accepting makes them active again", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.admin@unpatched.demo");
      const researcher = await newUser(db, "researcher");
      const { username } = await db.one<{ username: string }>("select username from public.users where id = $1", [researcher]);
      await db.query("insert into public.program_researchers (program_id, organization_id, user_id, status, source, joined_at) values ($1, $2, $3, 'active', 'invitation', now())", [fixture.privateProgramId, fixture.organizationId, researcher]);

      await db.as({ user: admin, session: await adminSession(db, admin) });
      await db.query("select public.revoke_program_researcher($1, $2)", [fixture.privateProgramId, researcher]);
      await db.query("reset role");
      // The whole test is one transaction (now() is fixed); the revocation must predate the new invitation, as it would in real time.
      await db.query("update public.program_researchers set revoked_at = now() - interval '1 minute' where program_id = $1 and user_id = $2", [fixture.privateProgramId, researcher]);

      await db.as({ user: admin, session: await adminSession(db, admin) });
      const token = randomUUID();
      expect(await db.fails("select public.invite_researcher_by_username($1, $2, null, $3)", [fixture.privateProgramId, `@${username}`, token])).toBeNull();

      await db.as({ user: researcher });
      await db.query("select public.accept_program_invitation($1)", [token]);
      await db.query("reset role");
      const { status } = await db.one<{ status: string }>("select status from public.program_researchers where program_id = $1 and user_id = $2", [fixture.privateProgramId, researcher]);
      expect(status).toBe("active");

      // Still refused while they are in the program.
      await db.as({ user: admin, session: await adminSession(db, admin) });
      expect(await db.fails("select public.invite_researcher_by_username($1, $2, null, $3)", [fixture.privateProgramId, `@${username}`, randomUUID()])).toMatch(/ALREADY_PARTICIPATING/);
    });
  });
});

describe("leaderboard names (202610300004)", () => {
  it("shows name and sign-up @username for everyone; an opted-out researcher is anonymous to others but not to themselves", async () => {
    await inTx(async (db) => {
      const veteran = await userId(db, "e2e.veteran@unpatched.demo");
      const hunter = await userId(db, "e2e.hunter@unpatched.demo");
      const { username } = await db.one<{ username: string }>("select username from public.users where id = $1", [veteran]);
      const row = async (viewer: string) => {
        await db.as({ user: viewer });
        return db.one<{ display_name: string; username: string | null } | undefined>("select display_name, username from public.get_public_leaderboard(200) where username = $1 or researcher_id is null and $2::boolean limit 1", [username, false]);
      };
      const shown = await row(hunter);
      expect(shown?.username).toBe(username);

      await db.as({ user: veteran });
      await db.query("select public.set_my_leaderboard_visibility(false)");
      expect((await db.one<{ v: boolean }>("select public.get_my_leaderboard_visibility() as v")).v).toBe(false);
      expect(await row(hunter)).toBeUndefined(); // no row carries the veteran's username any more
      expect((await row(veteran))?.username).toBe(username); // they still see themselves
    });
  });

  it("an organization can invite a researcher by the sign-up @username it sees", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.admin@unpatched.demo");
      const fresh = await newUser(db, "researcher");
      await db.query("reset role");
      const { username } = await db.one<{ username: string }>("update public.users set email_verified_at = now(), public_username = null where id = $1 returning username", [fresh]);
      await db.as({ user: admin, session: await adminSession(db, admin) });
      const invited = await db.one<{ invited_username: string }>("select invited_username from public.invite_researcher_by_username($1, $2, null, $3)", [fixture.privateProgramId, `@${username}`, randomUUID()]);
      expect(invited.invited_username.toLowerCase()).toBe(username.toLowerCase());
    });
  });
});

describe("tenant isolation", () => {
  it("an unrelated organization's admin can read none of this organization's reports, programs' private data or members", async () => {
    await inTx(async (db) => {
      const outsider = await userId(db, "e2e.unrelated-admin@unpatched.demo");
      await db.as({ user: outsider });
      const reports = await db.one<{ n: number }>("select count(*)::int as n from public.reports where organization_id = $1", [fixture.organizationId]);
      expect(reports.n).toBe(0);
      const members = await db.one<{ n: number }>("select count(*)::int as n from public.organization_members where organization_id = $1", [fixture.organizationId]);
      expect(members.n).toBe(0);
      const deposits = await db.fails("select * from public.get_organization_balances($1)", [fixture.organizationId]);
      expect(deposits).toMatch(/FORBIDDEN|permission/i);
    });
  });

  it("a researcher sees only their own reports", async () => {
    await inTx(async (db) => {
      const hunter = await userId(db, "e2e.hunter@unpatched.demo");
      await db.as({ user: hunter });
      const foreign = await db.one<{ n: number }>("select count(*)::int as n from public.reports where researcher_id <> $1", [hunter]);
      expect(foreign.n).toBe(0);
    });
  });

  it("a private program is invisible to a researcher who was never invited", async () => {
    await inTx(async (db) => {
      const stranger = await newUser(db, "researcher");
      await db.as({ user: stranger });
      const row = await db.one<{ n: number }>("select count(*)::int as n from public.programs where id = $1", [fixture.privateProgramId]);
      expect(row.n).toBe(0);
      const submit = await db.fails("select public.submit_report($1, 'domain', 'api.e2e-private.example', 't', 'd', 'cross_site_scripting', 'i', 'low')", [fixture.privateProgramId]);
      expect(submit).toMatch(/FORBIDDEN|PROGRAM_NOT_FOUND/);
    });
  });

  it("a billing admin cannot read report contents", async () => {
    await inTx(async (db) => {
      const billing = await userId(db, "e2e.billing-admin@unpatched.demo");
      await db.as({ user: billing });
      const rows = await db.rows<{ description: string | null }>("select description from public.reports where organization_id = $1", [fixture.organizationId]);
      expect(rows.every((r) => r.description === null) || rows.length === 0).toBe(true);
    });
  });
});

describe("roles and separation", () => {
  it("platform staff cannot join programs or submit reports", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const session = await adminSession(db, admin);
      await db.as({ user: admin, session });
      const join = await db.fails("select public.join_public_program($1)", [fixture.publicProgramId]);
      expect(join).toMatch(/platform staff/i);
    });
  });

  it("platform admin powers need an MFA-verified session", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      await db.as({ user: admin }); // no MFA'd session
      const err = await db.fails("select * from public.list_submission_restrictions_for_admin(10)");
      expect(err).toMatch(/FORBIDDEN/);
    });
  });

  it("a suspended organization member loses every org power", async () => {
    await inTx(async (db) => {
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.query("update public.users set is_suspended = true where id = $1", [triager]);
      await db.as({ user: triager });
      const n = await db.one<{ n: number }>("select count(*)::int as n from public.reports where organization_id = $1", [fixture.organizationId]);
      expect(n.n).toBe(0);
    });
  });

  it("a researcher cannot be added to an organization's team", async () => {
    await inTx(async (db) => {
      const researcher = await newUser(db, "researcher");
      const err = await db.fails("insert into public.organization_members (organization_id, user_id, role, status) values ($1, $2, 'triager', 'active')", [fixture.organizationId, researcher]);
      expect(err).toMatch(/organization account|researcher/i);
    });
  });
});

describe("privilege escalation", () => {
  it("a signed-in user cannot write to users, raise their own cap or grant themselves admin", async () => {
    await inTx(async (db) => {
      const hunter = await userId(db, "e2e.hunter@unpatched.demo");
      await db.as({ user: hunter });
      expect(await db.fails("update public.users set submission_daily_cap_override = 1000 where id = $1", [hunter])).toMatch(/permission denied/);
      expect(await db.fails("update public.users set is_suspended = false where id = $1", [hunter])).toMatch(/permission denied/);
      expect(await db.fails("insert into public.platform_admins (user_id) values ($1)", [hunter])).toMatch(/permission denied/);
    });
  });

  it("anonymous callers can't reach any non-public function", async () => {
    await inTx(async (db) => {
      await db.as("anon");
      expect(await db.fails("select * from public.get_my_submission_standing()")).toMatch(/permission denied|AUTH_REQUIRED/);
      expect(await db.fails("select * from public.list_restricted_accounts_for_admin(null, 10)")).toMatch(/permission denied|FORBIDDEN/);
      expect(await db.fails("select * from public.reports limit 1")).toMatch(/permission denied/);
    });
  });

  it("nobody can change a report's severity once its bounty is finalized", async () => {
    await inTx(async (db) => {
      const report = await db.one<{ id: string }>("select r.id from public.reports r join public.report_bounty_decisions d on d.report_id = r.id and d.state = 'finalized' limit 1");
      expect(report, "seed has a finalized bounty").toBeTruthy();
      const err = await db.fails("update public.reports set confirmed_severity = 'none' where id = $1", [report.id]);
      expect(err).toMatch(/SEVERITY_LOCKED/);
    });
  });
});

describe("abuse limits", () => {
  it("a new researcher gets 5 reports a day, near-duplicates are refused", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      await db.query("select public.join_public_program($1)", [fixture.publicProgramId]);
      await ackPolicy(db, fixture.publicProgramId);
      const submit = (i: number, text: string) =>
        db.fails("select public.submit_report($1, 'domain', 'api.e2e-public.example', $2, $3, 'cross_site_scripting', 'impact', 'low')", [fixture.publicProgramId, `DB test ${i}`, text]);
      expect(await submit(0, "First finding with enough distinct words to stand alone in this program.")).toBeNull();
      expect(await submit(1, "First finding with enough distinct words to stand alone in this program.")).toMatch(/NEAR_DUPLICATE/);
      for (let i = 2; i <= 5; i++) expect(await submit(i, `Different finding ${i} ${"xyz".repeat(i * 3)} ${i * 7919}`)).toBeNull();
      expect(await submit(6, "A sixth distinct report about cache poisoning on the CDN layer.")).toMatch(/DAILY_LIMIT/);
    });
  });
});

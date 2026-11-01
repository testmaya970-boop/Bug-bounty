import { describe, expect, it } from "vitest";
import { ackPolicy, adminSession, fixture, inTx, newUser, userId } from "./db";

// Business rules enforced in the database (triggers and routers), checked end to end.

describe("submission cooldown (202610210001)", () => {
  it("five invalid closes in a row pause submissions for 7 days and drop the tier to limited", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.query("reset role");
      await db.query("update public.users set submission_daily_cap_override = 100 where id = $1", [r]);
      await db.as({ user: r });
      await db.query("select public.join_public_program($1)", [fixture.publicProgramId]);
      await ackPolicy(db, fixture.publicProgramId);
      for (let i = 0; i < 5; i++) {
        await db.query("select public.submit_report($1, 'domain', 'api.e2e-public.example', $2, $3, 'cross_site_scripting', 'i', 'low')", [
          fixture.publicProgramId, `cooldown ${i}`, `Distinct finding ${i} ${"abc".repeat(i * 4)} ${i * 104729}`,
        ]);
      }
      await db.query("reset role");
      await db.query("update public.reports set status = 'triaging' where researcher_id = $1", [r]);
      await db.query("update public.reports set status = 'not_applicable', updated_at = clock_timestamp() where researcher_id = $1", [r]);
      const restriction = await db.one<{ source: string; days: number }>(
        "select source, round(extract(epoch from restricted_until - now()) / 86400)::int as days from public.submission_restrictions where user_id = $1 and lifted_at is null",
        [r],
      );
      expect(restriction).toMatchObject({ source: "automatic", days: 7 });
      await db.query("update public.users set submission_daily_cap_override = null where id = $1", [r]);
      await db.as({ user: r });
      const standing = await db.one<{ tier: string; daily_cap: number }>("select * from public.get_my_submission_standing()");
      expect(standing).toMatchObject({ tier: "limited", daily_cap: 2 });
    });
  });
});

describe("invitations", () => {
  it("making a program public cancels its pending invitations with the reason (202610210004)", async () => {
    await inTx(async (db) => {
      await db.query(
        "insert into public.program_invitations (program_id, organization_id, email, invited_by, token_hash, expires_at) select $1, organization_id, 'pending.dbtest@unpatched.demo', created_by, 'x' || gen_random_uuid(), now() + interval '7 days' from public.programs where id = $1",
        [fixture.privateProgramId],
      );
      await db.query("update public.programs set visibility = 'public' where id = $1", [fixture.privateProgramId]);
      const left = await db.one<{ pending: number; cancelled: number }>(
        "select count(*) filter (where accepted_at is null and revoked_at is null)::int as pending, count(*) filter (where revoke_reason = 'program_made_public')::int as cancelled from public.program_invitations where program_id = $1",
        [fixture.privateProgramId],
      );
      expect(left.pending).toBe(0);
      expect(left.cancelled).toBeGreaterThan(0);
    });
  });

  it("the wrong kind of account is refused at invite time (202610210007)", async () => {
    await inTx(async (db) => {
      const org = await newUser(db, "organization", "orgacct");
      const researcher = await newUser(db, "researcher", "resacct");
      const emailOf = async (id: string) => (await db.one<{ email: string }>("select email from public.users where id = $1", [id])).email;
      const programInvite = await db.fails(
        "insert into public.program_invitations (program_id, organization_id, email, invited_by, token_hash, expires_at) select $1, organization_id, $2, created_by, 'x' || gen_random_uuid(), now() + interval '7 days' from public.programs where id = $1",
        [fixture.privateProgramId, await emailOf(org)],
      );
      expect(programInvite).toMatch(/ORGANIZATION_ACCOUNT/);
      const orgInvite = await db.fails(
        "insert into public.organization_invitations (organization_id, email, role, invited_by, token_hash, expires_at) select $1, $2, 'triager', created_by, 'x' || gen_random_uuid(), now() + interval '7 days' from public.organizations where id = $1",
        [fixture.organizationId, await emailOf(researcher)],
      );
      expect(orgInvite).toMatch(/RESEARCHER_ACCOUNT/);
    });
  });
});

describe("program-match emails (202610210005)", () => {
  it("only inactive, matching, opted-in researchers outside the program are notified, at most weekly", async () => {
    await inTx(async (db) => {
      const prog = await db.one<{ id: string; organization_id: string }>("select id, organization_id from public.programs where id = $1", [fixture.publicProgramId]);
      await db.query("update public.programs set focus_areas = array['web_applications']::public.researcher_focus_area[] where id = $1", [prog.id]);
      const mk = async (tag: string, interests: string[], idleDays: number) => {
        const id = await newUser(db, "researcher", tag);
        await db.query("update public.users set last_active_at = now() - make_interval(days => $2), created_at = now() - interval '200 days' where id = $1", [id, idleDays]);
        await db.query("insert into public.researcher_profiles (user_id, hacking_interests) values ($1, $2::public.researcher_focus_area[]) on conflict (user_id) do update set hacking_interests = excluded.hacking_interests", [id, interests]);
        return id;
      };
      const idle = await mk("idle", ["web_applications"], 30);
      const active = await mk("active", ["web_applications"], 1);
      const other = await mk("other", ["mobile_applications"], 30);
      const optedOut = await mk("optout", ["web_applications"], 30);
      await db.query("insert into public.notification_preferences (user_id, category, email_enabled) values ($1, 'program_recommendations', false)", [optedOut]);

      const publish = async () => {
        const audit = await db.one<{ id: string }>("insert into public.audit_logs (organization_id, action, entity_type, entity_id, metadata) values ($1, 'program.published', 'program', $2, '{}') returning id", [prog.organization_id, prog.id]);
        const ev = await db.one<{ id: string }>("select id from public.outbox_events where (payload ->> 'audit_log_id')::uuid = $1", [audit.id]);
        return (await db.rows<{ recipient_id: string }>("select recipient_id from public.route_program_recommendations($1, 'program_recommended')", [ev.id])).map((x) => x.recipient_id);
      };
      const first = await publish();
      expect(first).toContain(idle);
      expect(first).not.toContain(active);
      expect(first).not.toContain(other);
      expect(first).not.toContain(optedOut);
      expect(await publish()).not.toContain(idle); // weekly cap
    });
  });
});

describe("trust signals (202610220001)", () => {
  it("a program's track-record requirement blocks public joins but not invitations", async () => {
    await inTx(async (db) => {
      await db.query("update public.programs set min_valid_reports = 3 where id = $1", [fixture.publicProgramId]);
      const fresh = await newUser(db, "researcher");
      await db.as({ user: fresh });
      expect(await db.fails("select public.join_public_program($1)", [fixture.publicProgramId])).toMatch(/TRACK_RECORD_REQUIRED: this program asks for 3 valid reports \(you have 0\)/);
      await db.query("reset role");
      expect(await db.fails("insert into public.program_researchers (program_id, organization_id, user_id, status, source, joined_at) values ($1, $2, $3, 'active', 'invitation', now())", [fixture.publicProgramId, fixture.organizationId, fresh])).toBeNull();
    });
  });

  it("the same report blasted to a third program in a day is refused", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.query("update public.users set submission_daily_cap_override = 100 where id = $1", [r]);
      const programs = (await db.rows<{ id: string; target: string }>(
        `select p.id, min(s.target) as target from public.programs p join public.program_scope_entries s on s.program_id = p.id and s.status = 'active' and s.scope_state = 'in_scope' and s.asset_type = 'domain'
         where p.status = 'active' and p.visibility = 'public' and p.min_signal is null and p.min_valid_reports is null and not p.requires_kyc group by p.id limit 3`,
      ));
      expect(programs.length, "seed has 3 public programs with a domain in scope").toBe(3);
      const text = "Reflected XSS in the search box: the q parameter is echoed into the page without encoding.";
      const results: (string | null)[] = [];
      for (const p of programs) {
        await db.as({ user: r });
        await db.query("select public.join_public_program($1)", [p.id]);
        await db.query("select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)", [p.id]);
        results.push(await db.fails("select public.submit_report($1, 'domain', $2, 'Reflected XSS in search', $3, 'cross_site_scripting', 'i', 'low')", [p.id, p.target, text]));
      }
      expect(results[0]).toBeNull();
      expect(results[1]).toBeNull();
      expect(results[2]).toMatch(/NEAR_DUPLICATE_BLAST/);
    });
  });

  it("a researcher sharing a sign-in network with a paying organization's member is flagged for admins", async () => {
    await inTx(async (db) => {
      const admin = await userId(db, "e2e.platform-admin@unpatched.demo");
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const paid = await db.one<{ researcher_id: string }>("select researcher_id from public.payment_obligations where organization_id = $1 and status <> 'cancelled' limit 1", [fixture.organizationId]);
      expect(paid, "seed has a payment obligation").toBeTruthy();
      for (const u of [owner, paid.researcher_id]) {
        await db.query("insert into public.sessions (id, user_id, token_hash, aal, ip) values (gen_random_uuid(), $1, 'fp-' || gen_random_uuid(), 'aal1', '203.0.113.77')", [u]);
      }
      const session = await adminSession(db, admin);
      await db.as({ user: admin, session });
      const flags = await db.rows<{ researcher_id: string; organization_id: string }>("select researcher_id, organization_id from public.list_collusion_signals_for_admin()");
      expect(flags).toContainEqual(expect.objectContaining({ researcher_id: paid.researcher_id, organization_id: fixture.organizationId }));
    });
  });
});

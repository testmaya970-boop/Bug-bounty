import { describe, expect, it } from "vitest";
import { ackPolicy, fixture, inTx, newUser } from "./db";

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

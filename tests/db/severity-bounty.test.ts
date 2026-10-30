import { describe, expect, it } from "vitest";
import { fixture, inTx, userId } from "./db";

// CVSS 4.0 (202610220006) and reward groups (202610300001).

describe("CVSS 4.0", () => {
  it("staff can set a valid vector; malformed vectors are refused; finalized bounties lock it", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const open = await db.one<{ id: string }>(
        "select r.id from public.reports r where r.organization_id = $1 and r.status in ('new', 'triaging', 'accepted') and not exists (select 1 from public.report_bounty_decisions d where d.report_id = r.id and d.state = 'finalized') limit 1",
        [fixture.organizationId],
      );
      await db.as({ user: owner });
      expect(await db.fails("select public.set_report_cvss4($1, 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N', 9.3)", [open.id])).toBeNull();
      expect(await db.fails("select public.set_report_cvss4($1, 'CVSS:4.0/AV:X/AC:L', 9.3)", [open.id])).toMatch(/check constraint/);
      await db.query("reset role");
      const paid = await db.one<{ id: string }>("select r.id from public.reports r join public.report_bounty_decisions d on d.report_id = r.id and d.state = 'finalized' where r.organization_id = $1 limit 1", [fixture.organizationId]);
      expect(await db.fails("update public.reports set cvss4_vector = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N', cvss4_score = 6.9 where id = $1", [paid.id])).toMatch(/SEVERITY_LOCKED/);
    });
  });
});

describe("reward groups", () => {
  it("a report is paid from its asset's reward group table; without a row for the severity, the program's table applies", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      const r = await db.one<{ id: string; asset_id: string; program_id: string }>(
        `select r.id, r.asset_id, r.program_id from public.reports r
         where r.organization_id = $1 and r.asset_id is not null and r.status in ('new', 'triaging', 'accepted')
           and exists (select 1 from public.program_bounty_policy_versions v where v.program_id = r.program_id)
           and not exists (select 1 from public.report_bounty_decisions d where d.report_id = r.id and d.state = 'finalized') limit 1`,
        [fixture.organizationId],
      );
      expect(r, "seed has an open report with an asset on a program with a bounty table").toBeTruthy();
      await db.query("update public.reports set confirmed_severity = 'high' where id = $1", [r.id]);
      const path = ["new", "triaging", "accepted", "resolved"];
      const { status } = await db.one<{ status: string }>("select status from public.reports where id = $1", [r.id]);
      for (const next of path.slice(path.indexOf(status) + 1)) await db.query("update public.reports set status = $2 where id = $1", [r.id, next]);
      await db.as({ user: owner });

      // A group with its own table: the asset moves there and the range comes from it, in its currency.
      const g = await db.one<{ id: string }>(
        "select id from public.create_reward_group($1, 'Payment Systems', 'Money movement', 'green', 'credit-card', 'INR', $2::jsonb)",
        [fixture.organizationId, JSON.stringify([{ severity: "high", min: 12000000, max: 20000000 }])],
      );
      await db.query("select public.set_asset_reward_group($1, $2)", [r.asset_id, g.id]);
      const suggestion = await db.one<{ source: string; max_amount_minor_units: string; reward_group_name: string }>("select * from public.get_report_reward_suggestion($1)", [r.id]);
      expect(suggestion).toMatchObject({ source: "reward_group", max_amount_minor_units: "20000000", reward_group_name: "Payment Systems" });
      await db.query("select public.calculate_bounty_recommendation($1)", [r.id]);
      const fromGroup = await db.one<{ min: string; max: string; currency: string; reward_group_name: string }>(
        "select calculated_min_amount_minor_units as min, calculated_max_amount_minor_units as max, currency, reward_group_name from public.report_bounty_decisions where report_id = $1", [r.id]);
      expect(fromGroup).toEqual({ min: "12000000", max: "20000000", currency: "INR", reward_group_name: "Payment Systems" });

      // No row for this severity: the program's own table.
      await db.query("select public.update_reward_group($1, 'Payment Systems', '', 'green', 'credit-card', 'INR', $2::jsonb)", [g.id, JSON.stringify([{ severity: "critical", min: 1, max: 2 }])]);
      await db.query("select public.calculate_bounty_recommendation($1)", [r.id]);
      const fromProgram = await db.one<{ reward_group_name: string | null; max: string }>("select reward_group_name, calculated_max_amount_minor_units as max from public.report_bounty_decisions where report_id = $1", [r.id]);
      expect(fromProgram.reward_group_name).toBeNull();
      const program = await db.one<{ max: string }>(
        "select x.max_amount_minor_units as max from public.program_bounty_policy_severity_ranges x join public.program_bounty_policy_versions v on v.id = x.policy_version_id where v.program_id = $1 and v.superseded_at is null and x.severity = 'high'", [r.program_id]);
      expect(fromProgram.max).toBe(program.max);
    });
  });

  it("templates, defaults and archiving keep every asset in exactly one active group", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const created = await db.one<{ n: number }>("select public.apply_reward_group_template($1, 'banking', 'INR') as n", [fixture.organizationId]);
      expect(created.n).toBe(5);
      // Applying again creates nothing new (names already taken).
      expect((await db.one<{ n: number }>("select public.apply_reward_group_template($1, 'banking', 'INR') as n", [fixture.organizationId])).n).toBe(0);
      const payments = await db.one<{ id: string; bounties: Record<string, { max: number }> }>("select id, bounties from public.list_reward_groups($1) where name = 'Payments'", [fixture.organizationId]);
      expect(Number(payments.bounties.critical.max)).toBe(60000000); // ₹6,00,000 from the template

      const def = await db.one<{ id: string }>("select id from public.list_reward_groups($1) where is_default", [fixture.organizationId]);
      expect(await db.fails("select public.archive_reward_group($1, true)", [def.id])).toMatch(/DEFAULT_GROUP/);
      const asset = await db.one<{ id: string }>("select asset_id as id from public.list_asset_reward_groups($1) limit 1", [fixture.organizationId]);
      await db.query("select public.set_asset_reward_group($1, $2)", [asset.id, payments.id]);
      await db.query("select public.archive_reward_group($1, true)", [payments.id]);
      const moved = await db.one<{ reward_group_id: string }>("select reward_group_id from public.list_asset_reward_groups($1) where asset_id = $2", [fixture.organizationId, asset.id]);
      expect(moved.reward_group_id).toBe(def.id);
      expect(await db.fails("select public.set_asset_reward_group($1, $2)", [asset.id, payments.id])).toMatch(/INVALID_REWARD_GROUP/);
      expect(await db.fails("select public.create_reward_group($1, 'Cards', null, 'blue', 'bank', 'INR', null)", [fixture.organizationId])).toMatch(/NAME_TAKEN/);

      // Only owners and security admins manage them; billing admins can't read them.
      await db.as({ user: await userId(db, "e2e.triager@unpatched.demo") });
      expect(await db.fails("select public.set_asset_reward_group($1, $2)", [asset.id, def.id])).toMatch(/FORBIDDEN/);
      expect(await db.fails("select public.create_reward_group($1, 'Nope', null, 'blue', 'bank', 'INR', null)", [fixture.organizationId])).toMatch(/FORBIDDEN/);
      await db.as({ user: await userId(db, "e2e.billing-admin@unpatched.demo") });
      expect(await db.fails("select * from public.list_reward_groups($1)", [fixture.organizationId])).toMatch(/FORBIDDEN/);
    });
  });
});

import { describe, expect, it } from "vitest";
import { fixture, inTx, userId } from "./db";

// CVSS 4.0 and asset tiers (202610220006).

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

describe("asset tiers", () => {
  it("a tier-2 asset gets the program's tier-2 percentage of the bounty range", async () => {
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
      // Walk it to resolved through the real transitions (calculation needs a final report).
      for (const next of ["triaging", "accepted", "resolved"]) await db.query("update public.reports set status = $2 where id = $1 and status <> $2 and status <> 'resolved'", [r.id, next]);
      await db.as({ user: owner });
      await db.query("select public.calculate_bounty_recommendation($1)", [r.id]);
      const full = await db.one<{ min: string; max: string; asset_tier: number; tier_percent: number }>("select calculated_min_amount_minor_units as min, calculated_max_amount_minor_units as max, asset_tier, tier_percent from public.report_bounty_decisions where report_id = $1", [r.id]);
      expect(full.tier_percent).toBe(100);
      await db.query("select public.set_asset_tier($1, 2::smallint)", [r.asset_id]);
      await db.query("select public.set_program_bounty_tiers($1, 50::smallint, 25::smallint)", [r.program_id]);
      expect(await db.fails("select public.set_program_bounty_tiers($1, 20::smallint, 40::smallint)", [r.program_id])).toMatch(/INVALID_PERCENT/);
      await db.query("select public.calculate_bounty_recommendation($1)", [r.id]);
      const tiered = await db.one<{ min: string; max: string; asset_tier: number; tier_percent: number }>("select calculated_min_amount_minor_units as min, calculated_max_amount_minor_units as max, asset_tier, tier_percent from public.report_bounty_decisions where report_id = $1", [r.id]);
      expect(tiered.asset_tier).toBe(2);
      expect(tiered.tier_percent).toBe(50);
      expect(Number(tiered.max)).toBe(Math.round(Number(full.max) / 2));
      expect(Number(tiered.min)).toBe(Math.round(Number(full.min) / 2));
    });
  });

  it("only an owner or security admin sets asset tiers", async () => {
    await inTx(async (db) => {
      const asset = await db.one<{ id: string }>("select id from public.assets where organization_id = $1 limit 1", [fixture.organizationId]);
      await db.as({ user: await userId(db, "e2e.triager@unpatched.demo") });
      expect(await db.fails("select public.set_asset_tier($1, 3::smallint)", [asset.id])).toMatch(/FORBIDDEN/);
    });
  });
});

import { describe, expect, it } from "vitest";
import { fixture, inTx, newUser, userId, type Db } from "./db";

// Response-time metrics, benchmarks and the export dataset (202610220020).

type Stats = { metric?: string; median_hours: number | null; p90_hours: number | null; count: number; sla_met: number; sla_tracked: number; benchmark_hours?: number | null; benchmark_orgs?: number };
type Metrics = { reports: number; metrics: Stats[]; programs: { program_id: string; reports: number; metrics: Record<string, Stats> }[] };
type Timing = { report_id: string; submitted_at: string; program_name: string; first_response_at: string | null; triaged_at: string | null; resolved_at: string | null };

const OWNER = "e2e.admin@unpatched.demo";
const metricsSql = "select public.get_organization_response_metrics($1, $2) as m";
const timingsSql = "select * from public.list_organization_report_timings($1, $2)";

/** percentile_cont semantics (linear interpolation), rounded to 0.01 like the RPC. */
function percentileCont(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = p * (s.length - 1);
  const lo = Math.floor(pos);
  const v = s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
  return Math.round(v * 100) / 100;
}
const hours = (from: string, to: string | null) => (to === null ? null : (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000);

async function asOwner(db: Db) {
  await db.as({ user: await userId(db, OWNER) });
}

describe("response-time metrics", () => {
  it("derives first response and triage from staff messages and status history", async () => {
    await inTx(async (db) => {
      await db.query("reset role");
      const report = await db.one<{ id: string; program_id: string; researcher_id: string; submitted_at: string }>(
        "select id, program_id, researcher_id, submitted_at from public.reports where organization_id = $1 order by submitted_at desc limit 1",
        [fixture.organizationId],
      );
      const owner = await userId(db, OWNER);
      const at = (seconds: number) => new Date(new Date(report.submitted_at).getTime() + seconds * 1000).toISOString();
      const message = "insert into public.report_messages (report_id, program_id, organization_id, researcher_id, author_id, author_context, visibility, body, created_at) values ($1, $2, $3, $4, $5, $6, $7, 'x', $8)";
      // Ignored: an internal note and the researcher's own message.
      await db.query(message, [report.id, report.program_id, fixture.organizationId, report.researcher_id, owner, "organization", "internal", at(1)]);
      await db.query(message, [report.id, report.program_id, fixture.organizationId, report.researcher_id, report.researcher_id, "researcher", "researcher_visible", at(2)]);
      // Counts: the first researcher-visible staff message.
      await db.query(message, [report.id, report.program_id, fixture.organizationId, report.researcher_id, owner, "organization", "researcher_visible", at(10)]);
      await db.query("insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, created_at) values ($1, $2, 'report.triage_started', 'report', $3, $4)", [
        owner,
        fixture.organizationId,
        report.id,
        at(120),
      ]);

      await asOwner(db);
      const rows = await db.rows<Timing>(timingsSql, [fixture.organizationId, 365]);
      const row = rows.find((r) => r.report_id === report.id)!;
      expect(new Date(row.first_response_at!).toISOString()).toBe(at(10));
      expect(new Date(row.triaged_at!).toISOString()).toBe(at(120));
    });
  });

  it("org medians, p90 and SLA counts match the report-level dataset and the policy targets", async () => {
    await inTx(async (db) => {
      await db.query("reset role");
      const targets = new Map(
        (
          await db.rows<{ id: string; fr: number | null; tr: number | null; res: number | null }>(
            "select r.id, v.first_response_target_hours as fr, v.triage_target_hours as tr, v.resolution_target_days * 24 as res from public.reports r left join public.program_policy_versions v on v.id = r.policy_version_id where r.organization_id = $1",
            [fixture.organizationId],
          )
        ).map((t) => [t.id, t]),
      );
      await asOwner(db);
      const rows = await db.rows<Timing>(timingsSql, [fixture.organizationId, 365]);
      const { m } = await db.one<{ m: Metrics }>(metricsSql, [fixture.organizationId, 365]);
      expect(rows.length).toBeGreaterThan(0);
      expect(m.reports).toBe(rows.length);

      const now = Date.now();
      const check = (metric: string, field: "first_response_at" | "triaged_at" | "resolved_at", target: "fr" | "tr" | "res") => {
        const values = rows.map((r) => hours(r.submitted_at, r[field])).filter((v): v is number => v !== null);
        let met = 0;
        let tracked = 0;
        for (const r of rows) {
          const t = targets.get(r.report_id)![target];
          if (t === null) continue;
          const h = hours(r.submitted_at, r[field]);
          if (h !== null) {
            tracked++;
            if (h <= t) met++;
          } else if (now > new Date(r.submitted_at).getTime() + t * 3_600_000) tracked++;
        }
        const got = m.metrics.find((x) => x.metric === metric)!;
        expect(got.count).toBe(values.length);
        expect(got.median_hours === null ? null : Number(got.median_hours)).toBe(percentileCont(values, 0.5));
        expect(got.p90_hours === null ? null : Number(got.p90_hours)).toBe(percentileCont(values, 0.9));
        expect([got.sla_met, got.sla_tracked]).toEqual([met, tracked]);
      };
      check("first_response", "first_response_at", "fr");
      check("triage", "triaged_at", "tr");
      check("resolution", "resolved_at", "res");
      expect(m.metrics.find((x) => x.metric === "bounty")!.sla_tracked).toBe(0);
      expect(m.programs.reduce((sum, p) => sum + p.reports, 0)).toBe(rows.length);
    });
  });

  it("benchmarks appear only when at least 5 organizations contribute", async () => {
    await inTx(async (db) => {
      await asOwner(db);
      for (const days of [7, 30, 90, 365]) {
        const { m } = await db.one<{ m: Metrics }>(metricsSql, [fixture.organizationId, days]);
        for (const metric of m.metrics) {
          expect(metric.benchmark_hours === null).toBe(metric.benchmark_orgs! < 5);
        }
      }
      // The seed spans many organizations over a year.
      const { m } = await db.one<{ m: Metrics }>(metricsSql, [fixture.organizationId, 365]);
      expect(m.metrics.find((x) => x.metric === "first_response")!.benchmark_orgs).toBeGreaterThanOrEqual(5);
    });
  });
});

describe("response-time metrics authorization", () => {
  it("refuses an unrelated org admin, billing admin, triager, researcher and anonymous callers", async () => {
    await inTx(async (db) => {
      for (const email of ["e2e.unrelated-admin@unpatched.demo", "e2e.billing-admin@unpatched.demo", "e2e.triager@unpatched.demo"]) {
        await db.as({ user: await userId(db, email) });
        expect(await db.fails(metricsSql, [fixture.organizationId, 90])).toMatch(/FORBIDDEN/);
        expect(await db.fails(timingsSql, [fixture.organizationId, 90])).toMatch(/FORBIDDEN/);
      }
      await db.as({ user: await newUser(db, "researcher") });
      expect(await db.fails(metricsSql, [fixture.organizationId, 90])).toMatch(/FORBIDDEN/);
      expect(await db.fails(timingsSql, [fixture.organizationId, 90])).toMatch(/FORBIDDEN/);
      await db.as("anon");
      expect(await db.fails(metricsSql, [fixture.organizationId, 90])).toMatch(/permission denied/);
    });
  });

  it("a program manager sees only the programs they manage", async () => {
    await inTx(async (db) => {
      await db.query("reset role");
      const pm = await userId(db, "e2e.program-manager@unpatched.demo");
      const managed = (await db.rows<{ program_id: string }>("select program_id from public.program_members where user_id = $1 and organization_id = $2 and role = 'manager'", [pm, fixture.organizationId])).map((r) => r.program_id);
      const names = (await db.rows<{ name: string }>("select name from public.programs where id = any ($1)", [managed])).map((r) => r.name);
      await db.as({ user: pm });
      const { m } = await db.one<{ m: Metrics }>(metricsSql, [fixture.organizationId, 365]);
      for (const p of m.programs) expect(managed).toContain(p.program_id);
      const rows = await db.rows<Timing>(timingsSql, [fixture.organizationId, 365]);
      for (const r of rows) expect(names).toContain(r.program_name);
      await asOwner(db);
      const all = await db.rows<Timing>(timingsSql, [fixture.organizationId, 365]);
      expect(all.length).toBeGreaterThan(rows.length);
    });
  });
});

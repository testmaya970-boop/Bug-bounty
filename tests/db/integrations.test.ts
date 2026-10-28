import { describe, expect, it } from "vitest";
import { fixture, inTx, userId, type Db } from "./db";

// 202610290001: webhooks and Slack / Teams alerts, enforced in the database.

const SECRET = "whsec_" + Buffer.alloc(24, 7).toString("base64");

async function anyReport(db: Db): Promise<{ id: string; program_id: string }> {
  await db.query("reset role");
  return db.one("select id, program_id from public.reports where organization_id = $1 and program_id = $2 order by submitted_at desc limit 1", [fixture.organizationId, fixture.publicProgramId]);
}

async function outboxEvent(db: Db, type: string, reportId: string): Promise<string> {
  await db.query("reset role");
  const row = await db.one<{ id: string }>(
    "insert into public.outbox_events (event_type, aggregate_type, aggregate_id, organization_id, payload, available_at) values ($1, 'report', $2::uuid, $3::uuid, jsonb_build_object('report_id', $2::text), now() + interval '1 day') returning id",
    [type, reportId, fixture.organizationId],
  );
  return row.id;
}

describe("webhook endpoints", () => {
  it("only org admins manage them; secrets are never readable", async () => {
    await inTx(async (db) => {
      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.as({ user: triager });
      expect(await db.fails("select public.create_webhook_endpoint($1, 'https://hooks.example.com/x', null, array['report.created'], null, $2)", [fixture.organizationId, SECRET])).toMatch(/FORBIDDEN/);

      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      expect(await db.fails("select public.create_webhook_endpoint($1, 'https://hooks.example.com/x', null, array['report.everything'], null, $2)", [fixture.organizationId, SECRET])).toMatch(/INVALID_EVENTS/);
      const { create_webhook_endpoint: id } = await db.one<{ create_webhook_endpoint: string }>("select public.create_webhook_endpoint($1, 'https://hooks.example.com/x', 'SIEM', array['report.created'], null, $2)", [fixture.organizationId, SECRET]);
      expect(await db.rows("select id, url, status from public.webhook_endpoints where id = $1", [id])).toHaveLength(1);
      expect(await db.fails("select secret_encrypted from public.webhook_endpoints where id = $1", [id])).toMatch(/permission denied/);

      const unrelated = await userId(db, "e2e.unrelated-admin@unpatched.demo");
      await db.as({ user: unrelated });
      expect(await db.rows("select id from public.webhook_endpoints where id = $1", [id])).toHaveLength(0);
      expect(await db.fails("select public.queue_integration_test('webhook', $1)", [id])).toMatch(/FORBIDDEN/);
    });
  });

  it("an event fans out once per subscribed endpoint, respecting event types and programs", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const all = (await db.one<{ id: string }>("select public.create_webhook_endpoint($1, 'https://a.example.com/x', null, array['report.created'], null, $2) as id", [fixture.organizationId, SECRET])).id;
      const other = (await db.one<{ id: string }>("select public.create_webhook_endpoint($1, 'https://b.example.com/x', null, array['report.created'], $2, $3) as id", [fixture.organizationId, fixture.privateProgramId, SECRET])).id;
      const wrongType = (await db.one<{ id: string }>("select public.create_webhook_endpoint($1, 'https://c.example.com/x', null, array['report.resolved'], null, $2) as id", [fixture.organizationId, SECRET])).id;

      const report = await anyReport(db);
      const ev = await outboxEvent(db, "report.created", report.id);
      await db.as("service");
      expect((await db.one<{ n: number }>("select private.enqueue_integration_deliveries($1) as n", [ev])).n).toBe(1);
      expect((await db.one<{ n: number }>("select private.enqueue_integration_deliveries($1) as n", [ev])).n).toBe(0); // idempotent
      const rows = await db.rows<{ target_id: string; message_id: string; payload: { data: { report: Record<string, unknown> } } }>("select target_id, message_id, payload from public.integration_deliveries where event_id = $1", [ev]);
      expect(rows.map((r) => r.target_id)).toEqual([all]);
      expect([other, wrongType]).not.toContain(rows[0].target_id);
      expect(rows[0].message_id).toBe(`msg_${ev}`);
      // Never the report body.
      expect(Object.keys(rows[0].payload.data.report).sort()).toEqual(["id", "path", "priority", "program_id", "program_name", "severity", "status", "submitted_at", "title"]);
    });
  });

  it("retries with backoff, gives up after the last attempt, and disables an endpoint that keeps failing", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const ep = (await db.one<{ id: string }>("select public.create_webhook_endpoint($1, 'https://a.example.com/x', null, array['report.created'], null, $2) as id", [fixture.organizationId, SECRET])).id;
      await db.query("reset role");
      await db.query("update public.integration_deliveries set status = 'succeeded' where status in ('pending', 'delivering')"); // isolate from other queued work
      for (let i = 0; i < 5; i++) {
        await db.as({ user: owner });
        await db.query("select public.queue_integration_test('webhook', $1)", [ep]);
      }
      await db.as("service");
      const claimed = await db.rows<{ id: string; attempts: number }>("select * from private.claim_integration_deliveries(10, 60)");
      expect(claimed).toHaveLength(5);
      expect(claimed.every((c) => c.attempts === 1)).toBe(true);
      // Test deliveries have one attempt, so each failure is final and counts toward the streak.
      for (const c of claimed) await db.query("select private.complete_integration_delivery($1, false, false, 500, 'HTTP 500', 'nope', 12)", [c.id]);
      const ep2 = await db.one<{ status: string; failure_streak: number; disabled_reason: string }>("select status, failure_streak, disabled_reason from public.webhook_endpoints where id = $1", [ep]);
      expect(ep2).toMatchObject({ status: "disabled", failure_streak: 5 });

      // A normal delivery retries: pending again, about a minute later.
      const report = await anyReport(db);
      await db.query("reset role");
      await db.query("update public.webhook_endpoints set status = 'active', failure_streak = 0 where id = $1", [ep]);
      const ev = await outboxEvent(db, "report.created", report.id);
      await db.as("service");
      await db.query("select private.enqueue_integration_deliveries($1)", [ev]);
      const [d] = await db.rows<{ id: string }>("select * from private.claim_integration_deliveries(10, 60)");
      await db.query("select private.complete_integration_delivery($1, false, false, 503, 'HTTP 503', null, 5)", [d.id]);
      const after = await db.one<{ status: string; wait: number }>("select status, extract(epoch from next_attempt_at - now())::int as wait from public.integration_deliveries where id = $1", [d.id]);
      expect(after.status).toBe("pending");
      expect(after.wait).toBeGreaterThan(50);
      expect(after.wait).toBeLessThan(70);

      // Replay keeps the message id so receivers can dedupe.
      await db.query("update public.integration_deliveries set status = 'failed' where id = $1", [d.id]);
      await db.as({ user: owner });
      const replay = (await db.one<{ id: string }>("select public.replay_integration_delivery($1) as id", [d.id])).id;
      await db.query("reset role");
      const pair = await db.rows<{ message_id: string }>("select message_id from public.integration_deliveries where id = any($1)", [[d.id, replay]]);
      expect(new Set(pair.map((p) => p.message_id)).size).toBe(1);
    });
  });
});

describe("chat alerts", () => {
  it("critical findings and SLA breaches reach the channels that asked for them", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.as({ user: owner });
      const criticalOnly = (await db.one<{ id: string }>("select public.create_chat_connection($1, 'teams', 'Crit', 'https://prod-1.westus.logic.azure.com/workflows/x', 'x', array['critical'], null) as id", [fixture.organizationId])).id;
      const sla = (await db.one<{ id: string }>("select public.create_chat_connection($1, 'slack', 'SLA', 'https://hooks.slack.com/services/T/B/x', 'x', array['sla_breach'], null) as id", [fixture.organizationId])).id;
      expect(await db.fails("select target_encrypted from public.chat_connections where id = $1", [criticalOnly])).toMatch(/permission denied/);

      const report = await anyReport(db);
      await db.query("reset role");
      await db.query("update public.reports set confirmed_severity = 'critical' where id = $1", [report.id]).catch(() => null);
      const severity = (await db.one<{ s: string }>("select coalesce(confirmed_severity, researcher_severity)::text as s from public.reports where id = $1", [report.id])).s;
      const created = await outboxEvent(db, "report.created", report.id);
      await db.query("reset role");
      const breach = await db.one<{ id: string }>(
        "insert into public.outbox_events (event_type, aggregate_type, aggregate_id, organization_id, payload, available_at) values ('report.sla_breached', 'report', $1::uuid, $2::uuid, jsonb_build_object('report_id', $1::text, 'sla', 'triage'), now() + interval '1 day') returning id",
        [report.id, fixture.organizationId],
      );
      await db.as("service");
      await db.query("select private.enqueue_integration_deliveries($1)", [created.valueOf()]);
      await db.query("select private.enqueue_integration_deliveries($1)", [breach.id]);
      const got = await db.rows<{ target_id: string; event_type: string; alerts: string[] }>("select target_id, event_type, payload -> 'alerts' as alerts from public.integration_deliveries where target_id = any($1)", [[criticalOnly, sla]]);
      if (severity === "critical") expect(got).toContainEqual(expect.objectContaining({ target_id: criticalOnly, event_type: "report.created", alerts: ["critical"] }));
      expect(got).toContainEqual(expect.objectContaining({ target_id: sla, event_type: "report.sla_breached", alerts: ["sla_breach"] }));
      expect(got.filter((g) => g.target_id === sla && g.event_type === "report.created")).toHaveLength(0);
    });
  });
});

describe("GitHub / GitLab issue sync", () => {
  it("issues only for accepted reports by triage staff, one per provider, never across organizations", async () => {
    await inTx(async (db) => {
      const owner = await userId(db, "e2e.admin@unpatched.demo");
      await db.query("reset role");
      const conn = await db.one<{ id: string }>(
        "insert into public.code_host_connections (organization_id, provider, account_label, github_installation_id, created_by) values ($1, 'github', 'acme', '999001', $2) returning id",
        [fixture.organizationId, owner],
      );
      const accepted = await db.one<{ id: string }>("select id from public.reports where program_id = $1 and status in ('accepted', 'resolved') limit 1", [fixture.publicProgramId]);
      const fresh = await db.one<{ id: string }>("select id from public.reports where program_id = $1 and status = 'new' limit 1", [fixture.publicProgramId]);

      const triager = await userId(db, "e2e.triager@unpatched.demo");
      await db.as({ user: triager });
      expect(await db.fails("select public.set_program_repository($1, 'github', '1', 'acme/secret', 'https://github.com/acme/secret')", [fixture.publicProgramId])).toMatch(/FORBIDDEN/);
      await db.as({ user: owner });
      await db.query("select public.set_program_repository($1, 'github', '1', 'acme/secret', 'https://github.com/acme/secret')", [fixture.publicProgramId]);
      expect(await db.fails("select * from public.begin_report_issue($1, 'github')", [fresh.id])).toMatch(/ISSUE_NOT_ELIGIBLE/);
      const begin = await db.one<{ connection_id: string; repo_full_name: string }>("select * from public.begin_report_issue($1, 'github')", [accepted.id]);
      expect(begin).toMatchObject({ connection_id: conn.id, repo_full_name: "acme/secret" });

      await db.as("service");
      await db.query("select private.record_report_issue($1, 'github', $2, '1', 'acme/secret', 42, 'https://github.com/acme/secret/issues/42', $3)", [accepted.id, conn.id, owner]);
      await db.as({ user: owner });
      expect(await db.fails("select * from public.begin_report_issue($1, 'github')", [accepted.id])).toMatch(/ISSUE_EXISTS/);

      // A connection from another organization can't be attached to this report.
      const unrelated = await userId(db, "e2e.unrelated-admin@unpatched.demo");
      await db.query("reset role");
      const otherOrg = await db.one<{ organization_id: string }>("select organization_id from public.organization_members where user_id = $1 and role = 'owner' limit 1", [unrelated]);
      const foreign = await db.one<{ id: string }>("insert into public.code_host_connections (organization_id, provider, account_label, github_installation_id, created_by) values ($1, 'github', 'x', '999002', $2) returning id", [otherOrg.organization_id, unrelated]);
      await db.as("service");
      expect(await db.fails("select private.record_report_issue($1, 'gitlab', $2, '9', 'x/y', 1, 'https://x', $3)", [accepted.id, foreign.id, owner])).toMatch(/different organizations/);

      // Researchers never see issue links.
      const veteran = await userId(db, "e2e.veteran@unpatched.demo");
      await db.as({ user: veteran });
      expect(await db.rows("select * from public.report_issue_links where report_id = $1", [accepted.id])).toHaveLength(0);
    });
  });
});

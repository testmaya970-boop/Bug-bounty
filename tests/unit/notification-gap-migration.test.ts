import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Turn 8: static source-level checks on
// db/migrations/202609090007_message_and_triage_notifications.sql, the migration that
// closes the notification gap the Turn 5 outbox trace found (report.message_posted and the
// start_triage/accept_report state transitions previously wrote to audit_logs only). Same
// "prove it's present in source, as regression protection" posture as
// tests/unit/migration-security.test.ts -- the actual routing behavior (recipient gets
// notified, sender never notified of their own action) was verified live against a real
// database this session; this is the fast-running, CI-safe layer underneath that.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationPath = `${repoRoot}db/migrations/202609090007_message_and_triage_notifications.sql`;
const sql = readFileSync(migrationPath, "utf8");

describe("migration source: start_triage and accept_report now emit a real outbox event", () => {
  for (const fn of ["start_triage", "accept_report"]) {
    it(`${fn} inserts into public.outbox_events, not only public.audit_logs`, () => {
      const start = sql.indexOf(`create or replace function public.${fn}(`);
      expect(start, `${fn} should be redefined in this migration`).toBeGreaterThan(-1);
      const bodyEnd = sql.indexOf("\n$$;", start);
      const body = sql.slice(start, bodyEnd);
      expect(body).toContain("insert into public.audit_logs");
      expect(body).toContain("insert into public.outbox_events");
    });
  }

  it("start_triage's event_type is 'report.triage_started', accept_report's is 'report.accepted'", () => {
    const triageStart = sql.indexOf("create or replace function public.start_triage(");
    const triageBodyEnd = sql.indexOf("\n$$;", triageStart);
    expect(sql.slice(triageStart, triageBodyEnd)).toContain("'report.triage_started'");

    const acceptStart = sql.indexOf("create or replace function public.accept_report(");
    const acceptBodyEnd = sql.indexOf("\n$$;", acceptStart);
    expect(sql.slice(acceptStart, acceptBodyEnd)).toContain("'report.accepted'");
  });

  it("both events' payloads include researcher_id, the field route_and_create_notifications' single-recipient path needs", () => {
    for (const fn of ["start_triage", "accept_report"]) {
      const start = sql.indexOf(`create or replace function public.${fn}(`);
      const bodyEnd = sql.indexOf("\n$$;", start);
      const body = sql.slice(start, bodyEnd);
      expect(body).toMatch(/'researcher_id', report\.researcher_id/);
    }
  });
});

describe("migration source: post_organization_message and post_researcher_message now emit a real outbox event", () => {
  for (const fn of ["post_organization_message", "post_researcher_message"]) {
    it(`${fn} inserts into public.outbox_events with event_type 'report.message_posted'`, () => {
      const start = sql.indexOf(`create or replace function public.${fn}(`);
      expect(start, `${fn} should be redefined in this migration`).toBeGreaterThan(-1);
      const bodyEnd = sql.indexOf("\n$$;", start);
      const body = sql.slice(start, bodyEnd);
      expect(body).toContain("insert into public.outbox_events");
      expect(body).toContain("'report.message_posted'");
    });

    it(`${fn}'s outbox payload includes actor_id -- the field routing needs to determine who NOT to notify`, () => {
      const start = sql.indexOf(`create or replace function public.${fn}(`);
      const bodyEnd = sql.indexOf("\n$$;", start);
      const body = sql.slice(start, bodyEnd);
      expect(body).toMatch(/'actor_id', actor/);
    });
  }

  it("post_organization_message's payload includes the real visibility, not a hardcoded value -- an 'internal' message must be distinguishable from 'researcher_visible' at routing time", () => {
    const start = sql.indexOf("create or replace function public.post_organization_message(");
    const bodyEnd = sql.indexOf("\n$$;", start);
    const body = sql.slice(start, bodyEnd);
    expect(body).toMatch(/'visibility', p_visibility/);
  });

  it("post_researcher_message's payload hardcodes visibility to 'researcher_visible' -- a researcher can never post an internal-only message", () => {
    const start = sql.indexOf("create or replace function public.post_researcher_message(");
    const bodyEnd = sql.indexOf("\n$$;", start);
    const body = sql.slice(start, bodyEnd);
    expect(body).toMatch(/'visibility', 'researcher_visible'/);
  });
});

describe("migration source: route_and_create_notifications routes report_message_posted away from its own actor", () => {
  const start = sql.indexOf("create or replace function public.route_and_create_notifications(");
  const bodyEnd = sql.lastIndexOf("$$;");
  const body = sql.slice(start, bodyEnd);

  it("takes a p_actor_id parameter, defaulted to null so every pre-existing call site is unaffected", () => {
    // The signature spans multiple lines and includes an inline comment (with its own
    // parentheses) explaining p_actor_id -- searching within `body` (already sliced to the
    // whole function) rather than re-finding the first bare ")" avoids matching a
    // parenthesis inside that comment instead of the real signature close.
    expect(body.slice(0, body.indexOf("returns setof"))).toMatch(/p_actor_id uuid default null/);
  });

  it("branches on whether the actor is the report's own researcher -- the researcher posting routes to the organization side, never back to the researcher", () => {
    expect(body).toMatch(/if p_actor_id = report\.researcher_id then/);
    expect(body).toMatch(/resolve_report_organization_recipients/);
  });

  it("an organization actor's message routes to the researcher ONLY when the message is researcher_visible -- an internal message notifies nobody", () => {
    const orgBranchStart = body.indexOf("else", body.indexOf("if p_actor_id = report.researcher_id then"));
    const orgBranch = body.slice(orgBranchStart, body.indexOf("end if;", body.indexOf("end if;", orgBranchStart) + 1));
    expect(orgBranch).toMatch(/'researcher_visible'/);
    expect(orgBranch).toMatch(/recipient := report\.researcher_id;/);
  });

  it("report_message_posted is exempt from the report.status provenance check every other non-report_created type goes through -- a message can be posted from several different statuses", () => {
    expect(body).toMatch(/p_notification_type not in \('report_created', 'report_message_posted'\)/);
  });

  it("accepts the two new single-recipient types (report_triage_started, report_accepted) in its type allowlist and status-provenance map", () => {
    expect(body).toMatch(/'report_triage_started'/);
    expect(body).toMatch(/'report_accepted'/);
    expect(body).toMatch(/when 'report_triage_started' then 'triaging'::public\.report_status/);
    expect(body).toMatch(/when 'report_accepted' then 'accepted'::public\.report_status/);
  });
});

describe("migration source: the notifications table's check constraints admit the 3 new types", () => {
  it("widens notifications_notification_type_check to include all three", () => {
    const start = sql.indexOf("add constraint notifications_notification_type_check");
    const end = sql.indexOf(";", start);
    const block = sql.slice(start, end);
    for (const type of ["report_triage_started", "report_accepted", "report_message_posted"]) {
      expect(block).toContain(`'${type}'`);
    }
  });

  it("widens notifications_category_matches_type_check to keep all three under report_activity, never bounty_activity", () => {
    const start = sql.indexOf("add constraint notifications_category_matches_type_check");
    const end = sql.indexOf(";", start);
    const block = sql.slice(start, end);
    expect(block).toMatch(/category = 'report_activity' and notification_type = any \(array\[[\s\S]*?'report_triage_started'[\s\S]*?'report_accepted'[\s\S]*?'report_message_posted'/);
  });
});

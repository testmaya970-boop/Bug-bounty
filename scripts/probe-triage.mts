// Live workflow probe for professional triage (db/migrations/202610060011): assignment,
// assignment notifications and auto-release, triager-decided mediations/retests, and the
// retest-driven reopen. Real RPCs, real roles, one transaction, always rolled back.
//
//   npx tsx --env-file=.env.local scripts/probe-triage.mts
//
// Needs the deterministic E2E seed (npm run seed:e2e).
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
}

async function run(userId: string | null, sql: string, params: unknown[] = [], role: "authenticated" | "service_role" = "authenticated", ack?: string) {
  await client.query("savepoint s");
  try {
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userId ?? "", role })]);
    await client.query("select set_config('app.acknowledged_policy_version', $1, true)", [ack ?? ""]);
    await client.query(`set local role ${role}`);
    const { rows } = await client.query(sql, params);
    await client.query("release savepoint s");
    return { rows, code: null as string | null };
  } catch (error) {
    await client.query("rollback to savepoint s");
    const message = error instanceof Error ? error.message : String(error);
    return { rows: [] as pg.QueryResultRow[], code: /^([A-Z_]+):/.exec(message)?.[1] ?? message };
  }
}

const sr = (sql: string, params: unknown[] = []) => run(null, sql, params, "service_role");
const userId = async (email: string) => (await sr("select id from public.users where email = $1", [email])).rows[0]?.id as string;
const lastEvent = async (reportId: string, type: string) =>
  (await sr("select id, payload from public.outbox_events where aggregate_id = $1 and event_type = $2 order by created_at desc limit 1", [reportId, type])).rows[0];
const route = (eventId: string, type: string) => sr("select recipient_id from public.route_payment_notifications($1, $2)", [eventId, type]);

await client.query("begin");
try {
  const S = await userId("e2e.veteran@unpatched.demo");
  const X = await userId("e2e.newcomer@unpatched.demo");
  const O = await userId("e2e.admin@unpatched.demo");
  const T = await userId("e2e.triager@unpatched.demo");
  const B = await userId("e2e.billing-admin@unpatched.demo");
  const program = (await sr("select id, organization_id from public.programs where name = 'E2E Public Program' limit 1")).rows[0];
  const P = program.id as string;
  const version = (await sr("select version_number from public.program_policy_versions where program_id = $1 and superseded_at is null", [P])).rows[0]?.version_number;
  const R = (await run(S, "select id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Probe: triage assignment', 'd', 'other', 'i', 'low')", [P], "authenticated", String(version ?? ""))).rows[0]?.id;
  check("a fresh report to triage", Boolean(R));

  // Who can be listed / assigned.
  const staff = (await run(T, "select user_id from public.list_assignable_staff($1, $2)", [program.organization_id, P])).rows.map((r) => r.user_id);
  check("a triager lists the program's assignable staff (incl. self and the owner)", staff.includes(T) && staff.includes(O), staff);
  check("staff list never includes the billing admin", !staff.includes(B));
  check("a researcher cannot list staff", (await run(S, "select * from public.list_assignable_staff($1, $2)", [program.organization_id, P])).code === "FORBIDDEN");
  check("a billing admin cannot list staff", (await run(B, "select * from public.list_assignable_staff($1, $2)", [program.organization_id, P])).code === "FORBIDDEN");

  check("the researcher cannot assign their own report", (await run(S, "select * from public.assign_report($1, $2)", [R, T])).code === "FORBIDDEN");
  check("a billing admin cannot assign reports", (await run(B, "select * from public.assign_report($1, $2)", [R, T])).code === "FORBIDDEN");
  check("the report's researcher cannot be the assignee", (await run(O, "select * from public.assign_report($1, $2)", [R, S])).code === "INVALID_ASSIGNEE");
  check("a billing admin cannot be the assignee", (await run(O, "select * from public.assign_report($1, $2)", [R, B])).code === "INVALID_ASSIGNEE");
  check("an outside researcher cannot be the assignee", (await run(O, "select * from public.assign_report($1, $2)", [R, X])).code === "INVALID_ASSIGNEE");

  // Owner assigns the triager: audited, notified.
  check("the owner assigns the triager", (await run(O, "select assignee_id from public.assign_report($1, $2)", [R, T])).rows[0]?.assignee_id === T);
  check("assignment is audited", (await sr("select 1 from public.audit_logs where entity_id = $1 and action = 'report.assigned' and metadata->>'assignee_id' = $2", [R, T])).rows.length === 1);
  const assigned = await lastEvent(R, "report.assigned");
  const notified = await route(assigned?.id, "report_assigned");
  check("the assignee is notified", notified.rows.length === 1 && notified.rows[0].recipient_id === T, notified);
  check("the triager's queue filter finds it", (await run(T, "select 1 from public.reports where assignee_id = $1 and id = $2", [T, R])).rows.length === 1);
  check("the researcher still sees their report (RLS unchanged)", (await run(S, "select 1 from public.reports where id = $1", [R])).rows.length === 1);

  // Self-assignment notifies nobody; unassign is audited.
  await run(O, "select * from public.assign_report($1, null)", [R]);
  check("unassigning is audited", (await sr("select 1 from public.audit_logs where entity_id = $1 and action = 'report.unassigned'", [R])).rows.length === 1);
  check("a triager can take the report themselves", (await run(T, "select assignee_id from public.assign_report($1, $2)", [R, T])).rows[0]?.assignee_id === T);
  // Every event in this one transaction shares a timestamp, so pick the self-assignment by its payload.
  const selfEvent = (await sr("select id from public.outbox_events where aggregate_id = $1 and event_type = 'report.assigned' and payload->>'recipient_id' is null", [R])).rows[0];
  check("the self-assignment event carries no recipient", Boolean(selfEvent));
  check("self-assignment notifies nobody", (await route(selfEvent?.id, "report_assigned")).rows.length === 0);

  // Losing program access releases the assignment.
  await sr("delete from public.program_members where program_id = $1 and user_id = $2", [P, T]);
  check("removing the triager from the program unassigns them", (await sr("select assignee_id from public.reports where id = $1", [R])).rows[0]?.assignee_id === null);
  check("the release is audited with the reason", (await sr("select 1 from public.audit_logs where entity_id = $1 and action = 'report.unassigned' and metadata->>'reason' = 'access_lost'", [R])).rows.length === 1);
  await sr("insert into public.program_members (program_id, organization_id, user_id, role, added_by) select $1, organization_id, $2, 'triager', $3 from public.programs where id = $1", [P, T, O]);

  // Mediation and retest on the resolved, finalized fixture report.
  const resolved = (await sr("select id from public.reports where program_id = $1 and researcher_id = $2 and status = 'resolved' limit 1", [P, S])).rows[0]?.id;
  check("a resolved fixture report", Boolean(resolved));
  const mediation = (await run(S, "select id from public.open_report_mediation($1, 'other', 'Please re-check the severity rationale.')", [resolved])).rows[0];
  check("the researcher cannot resolve their own mediation", (await run(S, "select * from public.resolve_report_mediation($1, 'resolved', 'self')", [mediation?.id])).code === "FORBIDDEN");
  check("a triager can now resolve a mediation", (await run(T, "select status from public.resolve_report_mediation($1, 'resolved', 'Rationale explained in thread.')", [mediation?.id])).rows[0]?.status === "resolved");
  const mediationEvent = await lastEvent(resolved, "report.mediation_resolved");
  const mediationNotified = await route(mediationEvent?.id, "report_mediation_resolved");
  check("the researcher is told the mediation was answered", mediationNotified.rows.length === 1 && mediationNotified.rows[0].recipient_id === S);

  await sr("update public.report_retests set status = 'confirmed_fixed' where report_id = $1 and status = 'requested'", [resolved]);
  const retest = (await run(S, "select id from public.request_report_retest($1, 'The patch can be bypassed with a trailing slash.')", [resolved])).rows[0];
  const retestEvent = await lastEvent(resolved, "report.retest_requested");
  const orgNotified = (await route(retestEvent?.id, "report_retest_requested")).rows.map((r) => r.recipient_id);
  check("a retest request notifies the triage team, not the researcher", orgNotified.includes(T) && orgNotified.includes(O) && !orgNotified.includes(S), orgNotified);
  check("the researcher cannot decide their own retest", (await run(S, "select * from public.decide_report_retest($1, 'still_vulnerable')", [retest?.id])).code === "FORBIDDEN");
  check("resolved stays terminal for ordinary transitions", (await run(T, "select * from public.start_triage($1)", [resolved])).code !== null);
  const decided = await run(T, "select status from public.decide_report_retest($1, 'still_vulnerable', 'Bypass reproduced.')", [retest?.id]);
  check("a triager decides the retest", decided.rows[0]?.status === "still_vulnerable", decided.code);
  check("still vulnerable reopens the report to accepted", (await sr("select status from public.reports where id = $1", [resolved])).rows[0]?.status === "accepted");
  check("the reopen is audited", (await sr("select 1 from public.audit_logs where entity_id = $1 and action = 'report.reopened'", [resolved])).rows.length === 1);
  const reopenEvent = await lastEvent(resolved, "report.reopened");
  check("the researcher is told it was reopened", (await route(reopenEvent?.id, "report_reopened")).rows[0]?.recipient_id === S);
  check("the reopen exception does not leak past the transaction step", (await sr("select current_setting('app.reopening_report', true) v")).rows[0]?.v === "");
  check("a reopened report can be resolved again", (await run(T, "select status from public.resolve_report($1, 'Fixed properly this time.')", [resolved])).rows[0]?.status === "resolved");
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);

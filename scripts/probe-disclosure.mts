// Live workflow probe for the disclosure lifecycle (db/migrations/202610060012). Real RPCs,
// real roles, one transaction, always rolled back.
//
//   npx tsx --env-file=.env.local scripts/probe-disclosure.mts
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

async function run(userId: string | null, sql: string, params: unknown[] = [], role: "authenticated" | "service_role" | "anon" = "authenticated", ack?: string) {
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
const POLICY = "select * from public.publish_program_policy($1, 'Probe rules.', true, $2, $3, null, null, null, 'probe')";

await client.query("begin");
try {
  const S = await userId("e2e.veteran@unpatched.demo");
  const X = await userId("e2e.newcomer@unpatched.demo");
  const O = await userId("e2e.admin@unpatched.demo");
  const T = await userId("e2e.triager@unpatched.demo");
  const P = (await sr("select id from public.programs where name = 'E2E Public Program' limit 1")).rows[0].id as string;
  const R = (await sr("select id from public.reports where program_id = $1 and researcher_id = $2 and status = 'resolved' limit 1", [P, S])).rows[0]?.id;
  check("a resolved fixture report", Boolean(R));
  await sr("delete from public.report_disclosures where report_id = $1", [R]);
  await sr("update public.reports set policy_version_id = null where id = $1", [R]); // governed by the program's current policy
  check("the program's current policy is coordinated (90 days)", (await run(O, POLICY, [P, "coordinated", 90])).code === null);

  // Eligibility.
  const version = (await sr("select version_number from public.program_policy_versions where program_id = $1 and superseded_at is null", [P])).rows[0].version_number;
  const fresh = (await run(S, "select id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Probe: not resolved', 'd', 'other', 'i', 'low')", [P], "authenticated", String(version))).rows[0]?.id;
  check("an unresolved report cannot be disclosed", (await run(S, "select * from public.request_report_disclosure($1, 'x', 'y')", [fresh])).code === "NOT_DISCLOSABLE");
  check("someone else cannot request it", (await run(X, "select * from public.request_report_disclosure($1, 'x', 'y')", [R])).code === "FORBIDDEN");

  // Request with a proposed write-up.
  const requested = await run(S, "select status, draft_title from public.request_report_disclosure($1, 'Stored XSS in invoice notes', 'Notes were rendered unescaped. Internal host api-int-7 used for repro.')", [R]);
  check("the researcher requests with a proposed write-up", requested.rows[0]?.status === "requested" && requested.rows[0]?.draft_title === "Stored XSS in invoice notes", requested.code);
  check("an outsider cannot read the request", (await run(X, "select 1 from public.report_disclosures where report_id = $1", [R])).rows.length === 0);
  check("signed-out users cannot read the table at all", (await run(null, "select 1 from public.report_disclosures limit 1", [], "anon")).code !== null);
  const reqEvent = (await sr("select id from public.outbox_events where aggregate_id = $1 and event_type = 'report_disclosure.requested'", [R])).rows[0];
  const reqNotified = (await sr("select recipient_id from public.route_payment_notifications($1, 'report_disclosure_requested')", [reqEvent?.id])).rows.map((r) => r.recipient_id);
  check("the request notifies the triage team", reqNotified.includes(O) && reqNotified.includes(T) && !reqNotified.includes(S), reqNotified);

  // Redaction.
  check("a triager redacts the write-up", (await run(T, "select draft_summary from public.update_report_disclosure_draft($1, 'Stored XSS in invoice notes', 'Notes were rendered unescaped.')", [R])).rows[0]?.draft_summary === "Notes were rendered unescaped.");
  check("an outsider cannot edit it", (await run(X, "select * from public.update_report_disclosure_draft($1, 'x', 'y')", [R])).code === "FORBIDDEN");

  // Who decides.
  check("a triager cannot approve", (await run(T, "select * from public.approve_report_disclosure($1)", [R])).code === "FORBIDDEN");
  check("the researcher cannot approve", (await run(S, "select * from public.approve_report_disclosure($1)", [R])).code === "FORBIDDEN");

  // Coordinated: approved now, public after the waiting period.
  const approved = (await run(O, "select status, published_at, published_summary, published_severity from public.approve_report_disclosure($1)", [R])).rows[0];
  const resolvedAt = (await sr("select min(created_at) at from public.audit_logs where entity_id = $1 and action = 'report.resolved'", [R])).rows[0]?.at;
  const expected = Math.max(Date.now(), new Date(resolvedAt).getTime() + 90 * 86400e3);
  check("approval under coordinated disclosure schedules it 90 days after resolution", approved?.status === "approved" && Math.abs(new Date(approved.published_at).getTime() - expected) < 60e3, { approved, resolvedAt });
  check("the redacted write-up is what was snapshotted", approved?.published_summary === "Notes were rendered unescaped.");
  check("a scheduled disclosure is not public yet", (await run(null, "select * from public.get_public_disclosure($1)", [R], "anon")).rows.length === 0);
  const appEvent = (await sr("select id from public.outbox_events where aggregate_id = $1 and event_type = 'report_disclosure.approved'", [R])).rows[0];
  check("approval notifies the researcher", (await sr("select recipient_id from public.route_payment_notifications($1, 'report_disclosure_approved')", [appEvent?.id])).rows[0]?.recipient_id === S);

  // Retest reopen is refused while approved.
  await sr("update public.report_retests set status = 'confirmed_fixed' where report_id = $1 and status = 'requested'", [R]);
  const retest = (await run(S, "select id from public.request_report_retest($1, 'still broken')", [R])).rows[0];
  check("reopening an approved disclosure's report is refused", (await run(O, "select * from public.decide_report_retest($1, 'still_vulnerable')", [retest?.id])).code === "REPORT_PUBLICLY_DISCLOSED");

  // Unpublish, then full disclosure publishes immediately.
  check("unpublishing needs a reason", (await run(O, "select * from public.unpublish_report_disclosure($1, '  ')", [R])).code === "INVALID_UNPUBLISH");
  check("the owner unpublishes it", (await run(O, "select status from public.unpublish_report_disclosure($1, 'Customer asked for more time')", [R])).rows[0]?.status === "unpublished");
  const unpubEvent = (await sr("select id from public.outbox_events where aggregate_id = $1 and event_type = 'report_disclosure.unpublished'", [R])).rows[0];
  check("unpublishing notifies the researcher", (await sr("select recipient_id from public.route_payment_notifications($1, 'report_disclosure_unpublished')", [unpubEvent?.id])).rows[0]?.recipient_id === S);
  check("the researcher may ask again", (await run(S, "select status from public.request_report_disclosure($1, 'Stored XSS in invoice notes', 'Short write-up.')", [R])).rows[0]?.status === "requested");
  await run(O, POLICY, [P, "full", null]);
  const published = (await run(O, "select published_at from public.approve_report_disclosure($1)", [R])).rows[0];
  check("under full disclosure, approval publishes now", published && new Date(published.published_at).getTime() <= Date.now() + 1000, published);
  await sr("update public.report_disclosures set published_at = now() - interval '1 second' where report_id = $1", [R]);
  const pub = (await run(null, "select * from public.get_public_disclosure($1)", [R], "anon")).rows[0];
  check("signed out, the published write-up is readable", pub?.published_summary === "Short write-up.", pub);
  check("the public read carries no user ids", pub && !("requested_by" in pub) && !("decided_by" in pub) && !("researcher_id" in pub));
  check("the public feed lists it", (await run(null, "select report_id from public.list_public_disclosures(50, null)", [], "anon")).rows.some((r) => r.report_id === R));
  const username = (await sr("select public_username from public.users where id = $1", [S])).rows[0]?.public_username;
  check("the researcher is credited only via their opted-in public username", pub?.researcher_username === (username ?? null), { got: pub?.researcher_username, username });

  // A program with no disclosure refuses requests.
  await run(O, "select * from public.unpublish_report_disclosure($1, 'probe')", [R]);
  await run(O, POLICY, [P, "none", null]);
  check("a 'none' disclosure policy refuses requests", (await run(S, "select * from public.request_report_disclosure($1, 't', 's')", [R])).code === "DISCLOSURE_NOT_PERMITTED");
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);

// Live probe for reputation integrity (db/migrations/202610060013): one fact per report and
// outcome (incl. resolve -> reopen -> resolve), facts survive a reopen, severity weighting,
// penalties, $0 bounties, score privacy, suspended accounts, CTF leaderboard anonymity.
// Real RPCs, real roles, one transaction, always rolled back.
//
//   npx tsx --env-file=.env.local scripts/probe-reputation.mts
import pg from "pg";
import { randomUUID } from "node:crypto";

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
const myScore = async (who: string) => Number((await run(who, "select score from public.get_my_leaderboard_position()")).rows[0]?.score ?? NaN);
// As the worker does: record against the next unprocessed outbox event the outcome emitted.
const EVENT_FOR: Record<string, string> = { report_resolved: "report.resolved", report_rejected: "report.rejected" };
async function record(type: string, reportId: string) {
  const event = (await sr(
    "select id from public.outbox_events where aggregate_id = $1 and event_type = $2 and id not in (select source_event_id from public.reputation_ledger where source_event_id is not null) order by created_at, id limit 1",
    [reportId, EVENT_FOR[type]],
  )).rows[0];
  return sr("select id from public.record_reputation_fact($1, $2, $3, now())", [event?.id ?? randomUUID(), type, reportId]);
}

await client.query("begin");
try {
  const S = await userId("e2e.veteran@unpatched.demo");
  const N = await userId("e2e.newcomer@unpatched.demo");
  const O = await userId("e2e.admin@unpatched.demo");
  const P = (await sr("select id from public.programs where name = 'E2E Public Program' limit 1")).rows[0].id as string;
  const version = String((await sr("select version_number from public.program_policy_versions where program_id = $1 and superseded_at is null", [P])).rows[0]?.version_number ?? "");

  // Existing data: the seeded report with dozens of repeated facts counts once.
  const raw = Number((await sr("select count(*) n from public.reputation_ledger where researcher_id = $1 and fact_type = 'report_resolved'", [S])).rows[0].n);
  const distinct = Number((await sr("select count(distinct report_id) n from public.reputation_ledger where researcher_id = $1 and fact_type = 'report_resolved'", [S])).rows[0].n);
  const shown = Number((await run(S, "select resolved_count from public.get_public_leaderboard(200) where researcher_id = $1", [S])).rows[0]?.resolved_count);
  check(`repeated facts count once (${raw} rows -> ${distinct} reports)`, shown === distinct, { raw, distinct, shown });

  // A critical report: resolve, record, reopen, re-resolve, record again.
  const before = await myScore(S);
  const R = (await run(S, "select id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Probe: reputation', 'd', 'other', 'i', 'critical')", [P], "authenticated", version)).rows[0]?.id;
  for (const sql of [
    "select * from public.start_triage($1)",
    "select * from public.set_report_severity($1, 'critical', null, null, null, null, null, null, null, null)",
    "select * from public.accept_report($1)",
    "select * from public.resolve_report($1, 'Fixed.')",
  ]) {
    const r = await run(O, sql, [R]);
    if (r.code) check(`triage step ${sql}`, false, r.code);
  }
  const firstRecord = await record("report_resolved", R);
  check("recording the resolve works", firstRecord.code === null, firstRecord.code);
  check("a critical resolve is worth 50", (await myScore(S)) - before === 50, { before, after: await myScore(S) });

  const retest = (await run(S, "select id from public.request_report_retest($1, 'bypass')", [R])).rows[0]?.id;
  check("still vulnerable reopens it", (await run(O, "select status from public.decide_report_retest($1, 'still_vulnerable')", [retest])).rows[0]?.status === "still_vulnerable");
  check("a fact recorded after the reopen still records (history, not current status)", (await record("report_resolved", R)).code === null);
  await run(O, "select * from public.resolve_report($1, 'Fixed properly.')", [R]);
  await record("report_resolved", R);
  check("resolve -> reopen -> resolve adds no extra points", (await myScore(S)) - before === 50, { after: await myScore(S) });
  check("and no extra ledger row", Number((await sr("select count(*) n from public.reputation_ledger where report_id = $1 and fact_type = 'report_resolved'", [R])).rows[0].n) === 1);
  check("an outcome the report never reached is refused", (await record("report_rejected", R)).code === "PROVENANCE_MISMATCH");

  // Penalty.
  const R2 = (await run(S, "select id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Probe: spam', 'd', 'other', 'i', 'low')", [P], "authenticated", version)).rows[0]?.id;
  await run(O, "select * from public.reject_report($1)", [R2]);
  const beforeReject = await myScore(S);
  await record("report_rejected", R2);
  check("a rejected report costs 5", (await myScore(S)) - beforeReject === -5);

  // $0 bounty earns nothing.
  const bountyReport = (await sr("select l.report_id from public.reputation_ledger l where l.researcher_id = $1 and l.fact_type = 'bounty_finalized' limit 1", [S])).rows[0]?.report_id;
  const beforeZero = await myScore(S);
  await sr("update public.payment_obligations set status = 'cancelled' where report_id = $1", [bountyReport]);
  await sr("update public.report_bounty_decisions set final_amount_minor_units = 0 where report_id = $1", [bountyReport]);
  check("a bounty finalized at zero earns nothing", (await myScore(S)) - beforeZero === -10, { beforeZero, after: await myScore(S) });

  // Score privacy.
  await sr("update public.users set public_username = null where id = $1", [N]);
  check("signed out, a non-opted-in researcher's score is not answered", (await run(null, "select public.get_researcher_reputation_score($1) s", [N], "anon")).rows[0]?.s === null);
  check("a researcher can read their own score", (await run(N, "select public.get_researcher_reputation_score($1) s", [N])).rows[0]?.s !== null);

  // CTF event leaderboard anonymity.
  const event = (await sr("select id from public.ctf_events where slug = 'e2e-past-clash'")).rows[0]?.id;
  const board = (await run(S, "select researcher_id, display_name from public.get_ctf_event_leaderboard($1)", [event])).rows;
  const self = board.find((r) => r.researcher_id === S);
  check("on a CTF board you still see yourself", Boolean(self), board);
  check("a non-opted-in solver is anonymous to others", board.some((r) => r.researcher_id === null && r.display_name === "Anonymous researcher"), board);

  // Suspended researchers drop off.
  await sr("update public.users set is_suspended = true where id = $1", [S]);
  check("a suspended researcher has no leaderboard position", (await run(S, "select * from public.get_my_leaderboard_position()")).rows.length === 0);
  check("nor a public row", (await run(null, "select 1 from public.get_public_leaderboard(200) where public_username = (select public_username from public.users where id = $1)", [S], "anon")).rows.length === 0);
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);

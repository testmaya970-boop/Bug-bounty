// Live workflow probe for program policies and SLAs (db/migrations/202610060009). Real RPCs,
// real roles, one transaction, always rolled back.
//
//   npx tsx --env-file=.env.local scripts/probe-program-policy.mts
//
// Needs the deterministic E2E seed (npm run seed:e2e): the public program with policy v1.
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
const POLICY_SQL = "select * from public.publish_program_policy($1, $2, $3, $4, $5, $6, $7, $8, $9)";
const SUBMIT_SQL = "select id, policy_version_id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Probe: policy binding', 'Probe description.', 'other', 'Probe impact.', 'low')";

await client.query("begin");
try {
  const S = await userId("e2e.veteran@unpatched.demo");
  const X = await userId("e2e.newcomer@unpatched.demo");
  const O = await userId("e2e.admin@unpatched.demo");
  const T = await userId("e2e.triager@unpatched.demo");
  const program = (await sr("select p.id, p.organization_id from public.programs p where p.name = 'E2E Public Program' limit 1")).rows[0];
  if (!program) throw new Error("E2E Public Program not found -- run npm run seed:e2e");
  const P = program.id as string;
  const v1 = (await sr("select version_number from public.program_policy_versions where program_id = $1 and superseded_at is null", [P])).rows[0]?.version_number;
  check("seeded program has an effective policy", typeof v1 === "number", v1);

  // Who may publish.
  const args = (rules: string, mode = "coordinated", days: number | null = 60) => [P, rules, true, mode, days, 48, 120, 60, "probe"];
  check("a triager cannot publish policy", (await run(T, POLICY_SQL, args("Triager rules"))).code === "FORBIDDEN");
  check("a researcher cannot publish policy", (await run(S, POLICY_SQL, args("Researcher rules"))).code === "FORBIDDEN");
  check("coordinated disclosure without days is refused", (await run(O, POLICY_SQL, args("Rules", "coordinated", null))).code === "INVALID_POLICY");
  check("empty rules are refused", (await run(O, POLICY_SQL, args("   "))).code === "INVALID_POLICY");
  const published = await run(O, POLICY_SQL, args("Probe rules v-next: no automated scanning above 5 rps."));
  const v2 = published.rows[0]?.version_number;
  check("the owner publishes the next version", v2 === v1 + 1, published.code);
  check("exactly one version is effective", (await sr("select count(*)::int n from public.program_policy_versions where program_id = $1 and superseded_at is null", [P])).rows[0].n === 1);
  check("publishing is audited with the version", (await sr("select 1 from public.audit_logs where entity_id = $1 and action = 'program.policy_published' and (metadata->>'version_number')::int = $2", [P, v2])).rows.length === 1);
  check("a published version cannot be edited", (await sr("update public.program_policy_versions set rules_of_engagement = 'tampered' where program_id = $1 and version_number = $2", [P, v2])).code === "IMMUTABLE_POLICY");
  check("a published version cannot be deleted", (await sr("delete from public.program_policy_versions where program_id = $1", [P])).code === "IMMUTABLE_POLICY");

  // Who may read it.
  check("signed out, the public program's policy is readable", (await run(null, "select version_number from public.get_program_policy($1)", [P], "anon")).rows[0]?.version_number === v2);
  check("a non-participating researcher can read it (public program)", (await run(X, "select version_number from public.get_program_policy($1)", [P])).rows[0]?.version_number === v2);
  const privateProgram = (await sr("select id from public.programs where name = 'E2E Private Program' limit 1")).rows[0]?.id;
  await sr("insert into public.program_policy_versions (program_id, organization_id, version_number, rules_of_engagement, safe_harbor, disclosure_mode, created_by) select id, organization_id, 1, 'private rules', true, 'none', $2 from public.programs where id = $1 on conflict do nothing", [privateProgram, O]);
  check("an outsider cannot read a private program's policy", (await run(X, "select * from public.get_program_policy($1)", [privateProgram])).rows.length === 0);

  // Submission must acknowledge exactly the effective version.
  check("submitting without accepting the policy is refused", (await run(S, SUBMIT_SQL, [P])).code === "POLICY_NOT_ACKNOWLEDGED");
  check("accepting a superseded version is refused", (await run(S, SUBMIT_SQL, [P], "authenticated", String(v1))).code === "POLICY_NOT_ACKNOWLEDGED");
  const submitted = await run(S, SUBMIT_SQL, [P], "authenticated", String(v2));
  const reportId = submitted.rows[0]?.id;
  check("accepting the current version submits the report", Boolean(reportId), submitted.code);
  const boundTo = (await sr("select v.version_number from public.reports r join public.program_policy_versions v on v.id = r.policy_version_id where r.id = $1", [reportId])).rows[0]?.version_number;
  check("the report is bound to the version accepted", boundTo === v2, boundTo);

  // SLA.
  const fresh = (await run(S, "select * from public.get_report_sla($1)", [reportId])).rows[0];
  check("a new report has due times and no breach", fresh && fresh.first_response_due_at && fresh.first_response_breached === false && fresh.triage_breached === false, fresh);
  check("an outsider sees no SLA for someone else's report", (await run(X, "select * from public.get_report_sla($1)", [reportId])).rows.length === 0);
  await sr("update public.reports set submitted_at = now() - interval '4 days' where id = $1", [reportId]);
  const late = (await run(O, "select * from public.get_report_sla($1)", [reportId])).rows[0];
  check("unanswered past 48h: first response is breached, triage (120h) not yet", late?.first_response_breached === true && late?.triage_breached === false, late);
  await run(O, "select * from public.start_triage($1)", [reportId]);
  const triaged = (await run(O, "select * from public.get_report_sla($1)", [reportId])).rows[0];
  check("starting triage records the first response (late) and the triage time", triaged?.first_responded_at && triaged?.first_response_breached === true && triaged?.triaged_at && triaged?.triage_breached === false, triaged);
  const summary = (await run(O, "select * from public.get_organization_sla_summary($1)", [program.organization_id])).rows.find((r) => r.program_id === P);
  check("the org SLA summary counts the missed first response", summary && Number(summary.first_response_breached) >= 1 && Number(summary.first_response_tracked) >= 1, summary);
  check("a researcher cannot read the org SLA summary", (await run(S, "select * from public.get_organization_sla_summary($1)", [program.organization_id])).code !== null);
  check("signed-in users can read policy history through the program's RLS (no error)", (await run(S, "select count(*)::int n from public.program_policy_versions where program_id = $1", [P])).code === null);
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);

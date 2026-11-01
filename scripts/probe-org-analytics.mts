// Live probe for org analytics authorization and correctness (db/migrations/202610060015).
// Real RPCs, real roles, one transaction, always rolled back.
//
//   npx tsx --env-file=.env.local scripts/probe-org-analytics.mts
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
}

async function run(userId: string | null, sql: string, params: unknown[] = [], role: "authenticated" | "service_role" = "authenticated") {
  await client.query("savepoint s");
  try {
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: userId ?? "", role })]);
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

await client.query("begin");
try {
  const org = (await sr("select o.id from public.organizations o where o.name = 'E2E Journey Org' limit 1")).rows[0].id as string;
  const who = {
    owner: await userId("e2e.admin@unpatched.demo"),
    billing: await userId("e2e.billing-admin@unpatched.demo"),
    manager: await userId("e2e.program-manager@unpatched.demo"),
    triager: await userId("e2e.triager@unpatched.demo"),
    researcher: await userId("e2e.veteran@unpatched.demo"),
  };
  const matrix: [string, string, string[]][] = [
    ["spend summary", "select * from public.get_organization_bounty_spend_summary($1)", ["owner", "billing"]],
    ["SLA summary", "select * from public.get_organization_sla_summary($1)", ["owner"]],
    ["top researchers", "select * from public.get_organization_top_researchers($1, 10)", ["owner"]],
  ];
  for (const [name, sql, allowed] of matrix) {
    for (const [role, id] of Object.entries(who)) {
      const result = await run(id, sql, [org]);
      const expectAllowed = allowed.includes(role);
      check(`${name}: ${role} ${expectAllowed ? "can" : "cannot"} read it`, expectAllowed ? result.code === null : result.code === "FORBIDDEN", result.code);
    }
  }

  // A currency with payments but no finalized award still shows up.
  const decision = (await sr("select d.id, d.report_id, r.program_id, r.researcher_id from public.report_bounty_decisions d join public.reports r on r.id = d.report_id where d.organization_id = $1 and d.state = 'finalized' limit 1", [org])).rows[0];
  await sr("update public.payment_obligations set status = 'cancelled' where bounty_decision_id = $1", [decision.id]);
  await sr(
    "insert into public.payment_obligations (organization_id, program_id, report_id, researcher_id, bounty_decision_id, amount_minor_units, platform_fee_minor_units, currency, status) values ($1, $2, $3, $4, $5, 777, 0, 'EUR', 'succeeded')",
    [org, decision.program_id, decision.report_id, decision.researcher_id, decision.id],
  );
  const eur = (await run(who.owner, "select * from public.get_organization_bounty_spend_summary($1) where currency = 'EUR'", [org])).rows[0];
  check("a paid currency without an award is reported, not dropped", eur && Number(eur.total_paid_minor_units) === 777 && Number(eur.total_awarded_minor_units) === 0, eur);

  // Top researchers reflect real outcomes.
  const top = (await run(who.owner, "select * from public.get_organization_top_researchers($1, 10)", [org])).rows;
  const vet = top.find((r) => r.researcher_id === who.researcher);
  const resolved = Number((await sr("select count(*) n from public.reports where organization_id = $1 and researcher_id = $2 and status = 'resolved'", [org, who.researcher])).rows[0].n);
  check("top researchers counts the veteran's resolved reports", vet && Number(vet.resolved_count) === resolved, { vet, resolved });
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);

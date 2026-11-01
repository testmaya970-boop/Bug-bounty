// Live probe for discovery and researcher experience (db/migrations/202610060014). Real
// RPCs, real roles, one transaction, always rolled back.
//
//   npx tsx --env-file=.env.local scripts/probe-discovery.mts
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
const LIST = "select * from public.list_public_programs($1, null, null, $2, $3, $4, $5, $6, $7, $8, $9)";
type Opts = { search?: string | null; asset?: string | null; type?: string | null; min?: number | null; kyc?: boolean | null; sort?: string };

async function listAll(who: string | null, o: Opts, pageSize: number) {
  const seen: string[] = [];
  let cursor: [string | null, string | null] = [null, null];
  for (let i = 0; i < 500; i++) {
    const page = (await run(who, LIST, [o.search ?? null, o.asset ?? null, o.type ?? null, o.min ?? null, o.kyc ?? null, o.sort ?? "recent", cursor[0], cursor[1], pageSize], who ? "authenticated" : "anon")).rows;
    seen.push(...page.map((r) => r.id));
    if (page.length < pageSize) break;
    cursor = [page[page.length - 1].sort_value, page[page.length - 1].id];
  }
  return seen;
}

await client.query("begin");
try {
  const S = await userId("e2e.veteran@unpatched.demo");
  const X = await userId("e2e.newcomer@unpatched.demo");
  const P = (await sr("select id, organization_id from public.programs where name = 'E2E Public Program' limit 1")).rows[0];

  // Stable pagination under every sort.
  for (const sort of ["recent", "bounty", "name"]) {
    const all = await listAll(null, { sort }, 100);
    const paged = await listAll(null, { sort }, 1);
    check(`sort "${sort}": paging one at a time returns the same set, no repeats`, paged.length === all.length && new Set(paged).size === paged.length && paged.every((id, i) => id === all[i]), { all: all.length, paged: paged.length });
  }
  const before = await listAll(null, { sort: "recent" }, 2);
  await sr("update public.programs set updated_at = now() where id = $1", [P.id]);
  const after = await listAll(null, { sort: "recent" }, 2);
  check("editing a program doesn't move it in the newest-first order", JSON.stringify(before) === JSON.stringify(after));

  // Filters.
  const vdp = (await run(null, LIST, [null, null, "vdp", null, null, "recent", null, null, 100], "anon")).rows;
  check("program-type filter returns only that type", vdp.every((r) => r.program_type === "vdp"));
  const domain = (await run(null, LIST, [null, "domain", null, null, null, "recent", null, null, 100], "anon")).rows;
  check("asset-type filter returns only programs with that asset in scope", domain.length > 0 && domain.every((r) => r.asset_types.includes("domain")));
  const rich = (await run(null, LIST, [null, null, null, 100000, null, "bounty", null, null, 100], "anon")).rows;
  check("minimum-bounty filter", rich.every((r) => Number(r.bounty_max_minor_units) >= 100000));
  await sr("update public.programs set requires_kyc = true where id = $1", [P.id]);
  const kyc = (await run(null, LIST, [null, null, null, null, true, "recent", null, null, 100], "anon")).rows;
  check("KYC filter and flag", kyc.some((r) => r.id === P.id && r.requires_kyc === true) && kyc.every((r) => r.requires_kyc));
  check("a literal % is not a wildcard", (await run(null, LIST, ["%", null, null, null, null, "recent", null, null, 100], "anon")).rows.length === 0);
  const asMember = (await run(S, LIST, ["E2E Public", null, null, null, null, "recent", null, null, 100])).rows.find((r) => r.id === P.id);
  const asOutsider = (await run(X, LIST, ["E2E Public", null, null, null, null, "recent", null, null, 100])).rows.find((r) => r.id === P.id);
  check("rows say whether the viewer has joined", asMember?.joined === true && asOutsider?.joined === false, { asMember: asMember?.joined, asOutsider: asOutsider?.joined });
  const pub = (await run(null, "select * from public.get_public_program($1)", [P.id], "anon")).rows[0];
  check("the public program read includes KYC and the bounty range", pub?.requires_kyc === true && pub.bounty_max_minor_units !== undefined, pub);

  // Recommendations skip suspended organizations.
  const area = (await sr("select (enum_range(null::public.researcher_focus_area))[1]::text a")).rows[0].a;
  await sr("update public.programs set focus_areas = array[$2::public.researcher_focus_area] where id = $1", [P.id, area]);
  await sr("insert into public.researcher_profiles (user_id, hacking_interests) values ($1, array[$2::public.researcher_focus_area]) on conflict (user_id) do update set hacking_interests = excluded.hacking_interests", [X, area]);
  const recBefore = (await run(X, "select id from public.list_recommended_programs(20)")).rows.some((r) => r.id === P.id);
  await sr("update public.organizations set status = 'suspended' where id = $1", [P.organization_id]);
  const recAfter = (await run(X, "select id from public.list_recommended_programs(20)")).rows.some((r) => r.id === P.id);
  check("a suspended organization's program is no longer recommended", recBefore === true && recAfter === false, { recBefore, recAfter });
  await sr("update public.organizations set status = 'active' where id = $1", [P.organization_id]);

  // My reports, filtered in the database.
  const resolvedOnly = (await run(S, "select status from public.list_my_reports(100, null, null, 'resolved', null, null)")).rows;
  check("my reports: status filter applies in the database", resolvedOnly.length > 0 && resolvedOnly.every((r) => r.status === "resolved"));
  const oneProgram = (await run(S, "select program_id from public.list_my_reports(100, null, null, null, $1, null)", [P.id])).rows;
  check("my reports: program filter", oneProgram.length > 0 && oneProgram.every((r) => r.program_id === P.id));

  // Server-side drafts.
  check("a researcher saves a draft for a program they're on", (await run(S, "select public.save_my_report_draft($1, $2::jsonb) t", [P.id, JSON.stringify({ title: "half-written" })])).code === null);
  check("they can read it back", (await run(S, "select draft->>'title' t from public.report_drafts where program_id = $1", [P.id])).rows[0]?.t === "half-written");
  check("nobody else can read it", (await run(X, "select 1 from public.report_drafts where program_id = $1", [P.id])).rows.length === 0);
  check("drafts need program membership", (await run(X, "select public.save_my_report_draft($1, '{}'::jsonb)", [P.id])).code === "FORBIDDEN");
  check("an oversized draft is refused", (await run(S, "select public.save_my_report_draft($1, $2::jsonb)", [P.id, JSON.stringify({ d: "x".repeat(130000) })])).code === "INVALID_DRAFT");
  await sr("update public.programs set requires_kyc = false where id = $1", [P.id]);
  const version = String((await sr("select version_number from public.program_policy_versions where program_id = $1 and superseded_at is null", [P.id])).rows[0]?.version_number ?? "");
  const submitted = await run(S, "select id from public.submit_report($1, 'domain', 'api.e2e-public.example', 'Probe: draft cleared', 'd', 'other', 'i', 'low')", [P.id], "authenticated", version);
  check("submitting removes the draft", submitted.code === null && (await sr("select 1 from public.report_drafts where researcher_id = $1 and program_id = $2", [S, P.id])).rows.length === 0, submitted.code);

  // Status history.
  const resolvedReport = (await sr("select id from public.reports where researcher_id = $1 and status = 'resolved' limit 1", [S])).rows[0]?.id;
  const history = await run(S, "select * from public.get_report_status_history($1)", [resolvedReport]);
  check("the researcher sees their report's history", history.rows.some((r) => r.action === "report.resolved"), history.code);
  check("the history carries no staff identity", history.rows.length > 0 && Object.keys(history.rows[0]).sort().join(",") === "action,detail,occurred_at");
  check("an outsider gets no history", (await run(X, "select * from public.get_report_status_history($1)", [resolvedReport])).rows.length === 0);
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}

console.log(failures === 0 ? "\nALL PASS (rolled back)" : `\n${failures} FAILED (rolled back)`);
process.exit(failures === 0 ? 0 : 1);

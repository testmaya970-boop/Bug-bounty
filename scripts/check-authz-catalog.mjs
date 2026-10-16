#!/usr/bin/env node
// Authorization catalog check (audit P0-3). Reads the live database catalog and fails when:
//   1. a SECURITY DEFINER function anyone signed in (or anonymous) can execute contains no
//      authorization guard and is not on the reviewed PUBLIC_BY_DESIGN list below;
//   2. an anonymous caller can execute a public function that is not on that list;
//   3. any function still calls a retired authorizer (the copy-forward bug behind P0-1);
//   4. anything in the private schema is executable by PUBLIC or anon (202610160006);
//   5. a SECURITY DEFINER function does not pin search_path.
// Run after migrations:  npm run check:authz   (needs MIGRATION_DATABASE_URL or DATABASE_URL)
import pg from "pg";

// Readable by anyone on purpose: public pages, leaderboards, and the token check that runs
// before a caller is known. Adding a function here is a security review decision.
const PUBLIC_BY_DESIGN = new Map([
  ["ctf_event_effective_status", "pure function over a CTF event's dates"],
  ["get_ctf_leaderboard", "public CTF leaderboard"],
  ["get_ctf_solve_counts", "public per-challenge solve counts"],
  ["get_program_policy", "a public program's published policy"],
  ["get_public_disclosure", "a disclosed report"],
  ["get_public_leaderboard", "public researcher leaderboard"],
  ["get_public_program", "a public program page"],
  ["get_public_researcher_profile", "opt-in public researcher profile"],
  ["get_researcher_badges", "badges shown on public profiles"],
  ["get_researcher_reputation_score", "score shown on public profiles"],
  ["list_ctf_events", "CTF events listing for signed-in researchers"],
  ["list_public_disclosures", "disclosed reports listing"],
  ["list_public_program_scope", "a public program's scope"],
  ["list_public_programs", "program directory"],
  ["list_top_bounty_programs", "public program directory sort"],
  ["verify_api_token", "authenticates an API token before any user is known"],
]);

const GUARD = /(auth\.uid\(\)|has_org_role|is_platform_admin|is_org_member|is_program_member|is_program_triager|authorize_|lock_and_authorize|actor_is_active|can_currently_read_report|is_report_collaborator)/;
const RETIRED = ["authorize_organization_analytics_read"];

const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(`
  select n.nspname as schema, p.proname as name, p.prosecdef as definer, pg_get_functiondef(p.oid) as def,
    coalesce(array_to_string(p.proconfig, ','), '') as config,
    has_function_privilege('authenticated', p.oid, 'execute') as authed,
    has_function_privilege('anon', p.oid, 'execute') as anon,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'`);
await c.end();

const problems = [];
for (const f of rows) {
  const id = `${f.schema}.${f.name}`;
  if (f.schema === "public" && f.definer && (f.authed || f.anon) && !GUARD.test(f.def) && !PUBLIC_BY_DESIGN.has(f.name)) {
    problems.push(`${id}: SECURITY DEFINER, callable by ${f.anon ? "anyone" : "any signed-in user"}, and has no authorization guard`);
  }
  if (f.schema === "public" && f.anon && !PUBLIC_BY_DESIGN.has(f.name)) problems.push(`${id}: executable by anon but not on PUBLIC_BY_DESIGN`);
  for (const r of RETIRED) if (f.name !== r && f.def.includes(r)) problems.push(`${id}: calls retired authorizer ${r}`);
  if (f.schema === "private" && (f.public_exec || f.anon)) problems.push(`${id}: private function executable by PUBLIC/anon`);
  if (f.definer && !/search_path/.test(f.config)) problems.push(`${id}: SECURITY DEFINER without a pinned search_path`);
}

if (problems.length) {
  console.error(`Authorization catalog check failed (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`Authorization catalog OK: ${rows.length} functions checked, ${PUBLIC_BY_DESIGN.size} public by design.`);

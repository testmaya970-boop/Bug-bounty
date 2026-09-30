#!/usr/bin/env node
// callRpc (lib/db/pool.ts) binds arguments by POSITION, but this code was ported from
// Supabase's rpc(), which bound them by NAME -- so an argument list written in a different
// order than the SQL signature silently passes values to the wrong parameters (found live:
// upsert_my_report_template got the template name as its uuid id). This check reads every
// public function's real parameter names from the database and flags, at each callRpc
// site: an unknown function, a wrong argument count, or an argument whose name matches a
// parameter at a different position. Heuristic by design -- it catches name-matched swaps,
// not swaps between arguments whose names resemble no parameter. Run after migrations:
//   npm run check:rpc-args      (needs MIGRATION_DATABASE_URL or DATABASE_URL)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL }); await c.connect();
const { rows } = await c.query(`select p.proname, coalesce(p.proargnames, '{}') as names, p.pronargs, p.pronargdefaults
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
await c.end();
const sigs = new Map();
for (const r of rows) (sigs.get(r.proname) ?? sigs.set(r.proname, []).get(r.proname)).push({ names: r.names.slice(0, r.pronargs), required: r.pronargs - r.pronargdefaults, total: r.pronargs });

const norm = (s) => s.toLowerCase().replace(/^(p|target|new|in|input)_/, "").replace(/_/g, "").replace(/(id)$/, "id");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });

const problems = []; let sites = 0;
for (const file of ["services", "lib", "workers", "actions", "app"].flatMap(walk)) {
  const src = readFileSync(file, "utf8");
  const re = /callRpc(?:<[^>]*>)?\(\s*\w+,\s*"public\.([a-z_0-9]+)"\s*(?:,\s*\[)?/g;
  let m;
  while ((m = re.exec(src))) {
    sites++;
    const fn = m[1]; const line = src.slice(0, m.index).split("\n").length;
    let args = [];
    if (m[0].trimEnd().endsWith("[")) {
      let depth = 1, i = re.lastIndex, cur = "", parts = [];
      for (; i < src.length && depth > 0; i++) {
        const ch = src[i];
        if ("([{".includes(ch)) depth++;
        if (")]}".includes(ch)) depth--;
        if (depth === 0) break;
        if (ch === "," && depth === 1) { parts.push(cur); cur = ""; } else cur += ch;
      }
      if (cur.trim()) parts.push(cur);
      args = parts.map((p) => p.trim()).filter(Boolean);
    }
    const cands = sigs.get(fn);
    if (!cands) { problems.push(`${file}:${line} ${fn}: NO SUCH FUNCTION in public schema`); continue; }
    const sig = cands.find((s) => args.length >= s.required && args.length <= s.total);
    if (!sig) { problems.push(`${file}:${line} ${fn}: ${args.length} args, signature(s) take ${cands.map((s) => `${s.required}-${s.total}`).join("/")}`); continue; }
    args.forEach((a, i) => {
      // Only plain names / property paths (e.g. `input.name`, `parsed.data.programId`) carry a
      // name worth comparing -- a call like `fn(a, b.stack)` would otherwise be read as `stack`.
      const expr = a.replace(/\s*(\?\?|\|\|).*$/s, "").trim();
      const ident = /^[A-Za-z_$][\w$]*(\??\.[A-Za-z_$][\w$]*)*!?$/.test(expr) ? expr.replace(/!$/, "").split(".").pop() : undefined;
      if (!ident || ["null", "undefined", "true", "false"].includes(ident)) return;
      const n = norm(ident);
      const at = sig.names.findIndex((pn) => norm(pn) === n);
      if (at !== -1 && at !== i) problems.push(`${file}:${line} ${fn}: arg ${i} "${a}" looks like param ${at} "${sig.names[at]}" (position ${i} is "${sig.names[i]}")`);
    });
  }
}
console.log(`${sites} call sites checked`);
console.log(problems.join("\n") || "no problems found");
process.exit(problems.length > 0 ? 1 : 0);

#!/usr/bin/env node
// Database backups, with a restore that is actually tested.
//
//   npm run db:backup                         dump to backups/sentinel-<utc>.dump, keep newest BACKUP_KEEP (14)
//   npm run db:restore -- <file> <new-db>     restore into a NEW database (never over an existing one)
//   npm run db:backup:verify                  backup -> restore into a scratch DB -> compare every
//                                             table's row count with the source -> drop the scratch DB
//
// Recovery is "restore alongside, check, then point DATABASE_URL at it" -- this script never
// overwrites a live database. Connects as MIGRATION_DATABASE_URL (the schema owner).
// pg_dump/pg_restore come from PATH, or run inside a container when PG_DOCKER_CONTAINER is
// set (local dev: sentinel_native_postgres), streaming over stdin/stdout either way.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL) is required");
  process.exit(1);
}
const source = new URL(url);
const sourceDb = source.pathname.slice(1);
const container = process.env.PG_DOCKER_CONTAINER;
const backupDir = process.env.BACKUP_DIR ?? "backups";
const keep = Number(process.env.BACKUP_KEEP ?? 14);

const urlFor = (db) => Object.assign(new URL(url), { pathname: `/${db}` }).toString();

/** argv for pg_dump/pg_restore against `db`: a URL on the host, or socket + user in the container. */
function pgCommand(tool, db, extra) {
  if (container) return ["docker", ["exec", "-i", container, tool, "-U", decodeURIComponent(source.username), "-d", db, ...extra]];
  return [tool, ["-d", urlFor(db), ...extra]];
}

function run(tool, db, extra, { stdin, stdout } = {}) {
  const [cmd, args] = pgCommand(tool, db, extra);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdin ? "pipe" : "ignore", stdout ? "pipe" : "inherit", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    if (stdin) createReadStream(stdin).pipe(child.stdin);
    if (stdout) child.stdout.pipe(stdout);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${tool} exited ${code}: ${stderr.trim()}`))));
  });
}

async function withDb(db, fn) {
  const client = new pg.Client({ connectionString: urlFor(db) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function backup() {
  mkdirSync(backupDir, { recursive: true });
  const file = join(backupDir, `${sourceDb}-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
  const out = createWriteStream(file);
  // Custom format: compressed, and restorable table-by-table with pg_restore.
  await run("pg_dump", sourceDb, ["--format=custom", "--no-owner", "--no-privileges"], { stdout: out });
  await new Promise((r) => out.close(r));
  const sha256 = await new Promise((resolve) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (d) => hash.update(d)).on("end", () => resolve(hash.digest("hex")));
  });
  console.log(`backup ${file} (${(statSync(file).size / 1024).toFixed(0)} KiB, sha256 ${sha256})`);

  const ours = readdirSync(backupDir).filter((f) => f.startsWith(`${sourceDb}-`) && f.endsWith(".dump")).sort();
  for (const old of ours.slice(0, Math.max(0, ours.length - keep))) {
    unlinkSync(join(backupDir, old));
    console.log(`pruned ${old}`);
  }
  return file;
}

async function restore(file, targetDb) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(targetDb)) throw new Error(`invalid database name: ${targetDb}`);
  const exists = await withDb(sourceDb, (c) => c.query("select 1 from pg_database where datname = $1", [targetDb]).then((r) => r.rowCount > 0));
  if (exists) throw new Error(`database ${targetDb} already exists -- restore always targets a new database`);
  await withDb(sourceDb, (c) => c.query(`create database ${targetDb}`));
  await run("pg_restore", targetDb, ["--no-owner", "--no-privileges", "--exit-on-error"], { stdin: file });
  console.log(`restored ${file} -> ${targetDb}`);
}

/** Exact row count of every table outside the system schemas. */
async function rowCounts(db) {
  return withDb(db, async (c) => {
    const { rows: tables } = await c.query(
      "select table_schema, table_name from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema') order by 1, 2",
    );
    const counts = new Map();
    for (const t of tables) {
      const { rows } = await c.query(`select count(*)::bigint as n from "${t.table_schema}"."${t.table_name}"`);
      counts.set(`${t.table_schema}.${t.table_name}`, Number(rows[0].n));
    }
    return counts;
  });
}

async function verify() {
  const file = await backup();
  const scratch = `${sourceDb}_restore_check_${Date.now()}`;
  try {
    await restore(file, scratch);
    // Counted after the dump, so a busy source can differ by a few rows; for a real
    // drill, point MIGRATION_DATABASE_URL at a quiet replica or run it off-peak.
    const [expected, actual] = await Promise.all([rowCounts(sourceDb), rowCounts(scratch)]);
    const mismatches = [...expected].filter(([table, n]) => actual.get(table) !== n).map(([table, n]) => `${table}: source ${n}, restored ${actual.get(table) ?? "missing"}`);
    const rows = [...expected.values()].reduce((a, b) => a + b, 0);
    if (mismatches.length > 0) throw new Error(`restore verification FAILED:\n  ${mismatches.join("\n  ")}`);
    console.log(`verified: ${expected.size} tables, ${rows} rows restored identically`);
  } finally {
    await withDb(sourceDb, (c) => c.query(`drop database if exists ${scratch} with (force)`)).catch((e) => console.error(`could not drop ${scratch}: ${e.message}`));
  }
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "backup") await backup();
  else if (command === "restore") {
    if (args.length !== 2) throw new Error("usage: db:restore -- <file> <new-database-name>");
    await restore(args[0], args[1]);
  } else if (command === "verify") await verify();
  else throw new Error("usage: db-backup.mjs backup | restore <file> <db> | verify");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

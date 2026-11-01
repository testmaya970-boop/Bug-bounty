#!/usr/bin/env node
// Applies db/migrations/*.sql in filename order, each file in its own transaction, and
// records every applied file in app_migrations.applied (filename + sha256 checksum) in
// that same transaction -- so a re-run applies only files it has not seen, and a crash
// mid-file leaves neither the schema change nor its record behind.
//
//   npm run db:migrate              apply pending migrations
//   npm run db:migrate -- --baseline
//       record every file as applied WITHOUT running it -- once, for a database built
//       before tracking existed (every file already applied by hand or by the old runner).
//
// Refuses to run if an already-applied file's contents changed since it was applied:
// editing a shipped migration silently diverges every environment that already ran it.
// Write a new migration instead.
//
// Connects as MIGRATION_DATABASE_URL (the schema owner), falling back to DATABASE_URL.
// The app's own DATABASE_URL is a restricted runtime role that cannot run DDL.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "db", "migrations");
const baseline = process.argv.includes("--baseline");

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL) is required");
  process.exit(1);
}

// Line endings normalized first, so a git autocrlf checkout on Windows hashes the same as
// the file on Linux CI.
const checksum = (sql) => createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => {
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    return { name, sql, checksum: checksum(sql) };
  });

const client = new pg.Client({ connectionString });
await client.connect();

let exitCode = 0;
try {
  // Session-level lock: a second concurrent deploy waits here instead of racing this one.
  await client.query("select pg_advisory_lock(hashtext('app_migrations'))");
  await client.query(`
    create schema if not exists app_migrations;
    create table if not exists app_migrations.applied (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query("select filename, checksum from app_migrations.applied");
  const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

  const changed = files.filter((f) => applied.has(f.name) && applied.get(f.name) !== f.checksum);
  if (changed.length > 0) {
    throw new Error(
      `already-applied migration(s) changed since they were applied: ${changed.map((f) => f.name).join(", ")}. ` +
        "Restore the original file and put the change in a new migration.",
    );
  }

  const pending = files.filter((f) => !applied.has(f.name));
  for (const file of pending) {
    process.stdout.write(`${baseline ? "recording" : "applying"} ${file.name} ... `);
    try {
      await client.query("begin");
      if (!baseline) await client.query(file.sql);
      await client.query("insert into app_migrations.applied (filename, checksum) values ($1, $2)", [file.name, file.checksum]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      throw err;
    }
  }

  console.log(`\n${pending.length} ${baseline ? "recorded as applied" : "applied"}, ${files.length - pending.length} already up to date.`);
} catch (err) {
  console.error(err.message);
  exitCode = 1;
} finally {
  await client.end();
}
process.exit(exitCode);

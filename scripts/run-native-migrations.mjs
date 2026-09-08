#!/usr/bin/env node
// Runs every file in db/migrations/ in filename order against DATABASE_URL, inside one
// transaction per file (matching this project's existing convention of applying
// migrations "in order" -- see db/migrations/README.md). No migration-tracking table
// exists yet (matching the pre-existing supabase/migrations/ convention of no db-side
// tracking); this is meant to run against a fresh database each time during Phase 1
// verification, not as a general-purpose incremental migrator.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "db", "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({ connectionString });
await client.connect();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  process.stdout.write(`applying ${file} ... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("ok");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.log("FAILED");
    console.error(err.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`\n${files.length} migrations applied successfully.`);

#!/usr/bin/env node
// Release, start, and roll back on the current (single-machine) production setup.
//
//   npm run release              backup -> migrate -> bucket -> build into .releases/<id> -> make it current
//   npm run start:prod           serve the current release (PORT, default 3000)
//   npm run rollback             point current back at the previous release (no rebuild)
//   npm run releases             list releases, marking the current one
//
// Each release is its own Next.js build folder (next.config.ts distDir via NEXT_DIST_DIR),
// so rollback is instant: switch the pointer and restart start:prod. That is safe because
// migrations here are additive (never edit/drop what shipped -- see db/migrations/README.md),
// so the previous build still runs against the newer schema. The pre-migration backup is
// the way back if a migration itself was the problem (npm run db:restore).
//
// ponytail: the outbox worker runs from the working tree (npm run worker:outbox), not from a
// release folder -- restart it after a release; a rollback does not roll it back.
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RELEASES = ".releases";
const CURRENT = join(RELEASES, "current");
const KEEP = Number(process.env.RELEASES_KEEP ?? 3);

const sh = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
const releases = () => (existsSync(RELEASES) ? readdirSync(RELEASES).filter((d) => /^\d{8}T\d{6}Z/.test(d)).sort() : []);
const current = () => (existsSync(CURRENT) ? readFileSync(CURRENT, "utf8").trim() : null);

function release() {
  const commit = execSync("git rev-parse --short HEAD").toString().trim();
  const dirty = execSync("git status --porcelain").toString().trim().length > 0;
  const id = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${commit}${dirty ? "-dirty" : ""}`;
  if (dirty) console.warn(`warning: uncommitted changes -- release ${id} is not reproducible from git alone`);

  console.log("\n[1/4] safety backup before migrating");
  sh("npm run db:backup");
  console.log("\n[2/4] migrations");
  sh("npm run db:migrate");
  console.log("\n[3/4] storage bucket");
  sh("npm run storage:init");
  console.log(`\n[4/4] build -> ${RELEASES}/${id}`);
  mkdirSync(RELEASES, { recursive: true });
  // next build adds the build folder's generated types to tsconfig.json; a new folder per
  // release would add a new entry every time, so put the file back as it was.
  const tsconfig = readFileSync("tsconfig.json", "utf8");
  try {
    sh("npm run build", { NEXT_DIST_DIR: join(RELEASES, id) });
  } finally {
    writeFileSync("tsconfig.json", tsconfig);
  }

  writeFileSync(CURRENT, id);
  for (const old of releases().slice(0, Math.max(0, releases().length - KEEP))) {
    if (old !== id) rmSync(join(RELEASES, old), { recursive: true, force: true });
  }
  console.log(`\nrelease ${id} is current. Restart: npm run start:prod (and restart npm run worker:outbox).`);
}

function rollback() {
  const all = releases();
  const index = all.indexOf(current());
  if (index <= 0) throw new Error("no previous release to roll back to");
  writeFileSync(CURRENT, all[index - 1]);
  console.log(`current: ${all[index]} -> ${all[index - 1]}. Restart npm run start:prod to serve it.`);
}

function start() {
  const id = current();
  if (!id || !existsSync(join(RELEASES, id))) throw new Error("no current release -- run npm run release first");
  console.log(`serving release ${id}`);
  // Node runs next's own entry point directly: no shell, so nothing to escape on any platform.
  const child = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "start", "-p", process.env.PORT ?? "3000"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", NEXT_DIST_DIR: join(RELEASES, id) },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

const command = process.argv[2];
try {
  if (command === "release") release();
  else if (command === "rollback") rollback();
  else if (command === "start") start();
  else if (command === "list") for (const r of releases()) console.log(`${r === current() ? "* " : "  "}${r}`);
  else throw new Error("usage: release.mjs release | start | rollback | list");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

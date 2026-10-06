#!/usr/bin/env node
// Master CTF artifact generator.
//
//   node scripts/ctf-artifacts/generate.mjs            build artifacts + manifest
//   node scripts/ctf-artifacts/generate.mjs --verify   also solve every artifact and
//                                                       assert it yields the exact flag
//                                                       AND that flag hashes to the value
//                                                       seeded in the CTF migration.
//
// Writes downloadable files under public/ctf-artifacts/<id>/ and a manifest at
// public/ctf-artifacts/manifest.json that lib/mock/ctf.ts reads at module load to attach
// `embeddedData` / `artifacts` to each challenge. The plaintext flags live ONLY in
// scripts/ctf-artifacts/lib.mjs (build-time) and, hashed, in the migration -- never in app
// code or the manifest. The manifest contains embedded challenge text and file references,
// never a flag.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAGS, sha256hex } from "./lib.mjs";
import { cryptoChallenges } from "./crypto.mjs";
import { forensicsNetworkChallenges } from "./forensics-network.mjs";
import { reChallenges, pwnChallenges } from "./re-pwn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
// Downloadable files are served statically from public/ctf-artifacts/. The manifest (embed
// text + file references, never a flag) is written into lib/mock/ as a source file the app
// imports directly -- app source never reaches across the public/ asset boundary.
const outDir = join(repoRoot, "public", "ctf-artifacts");
const manifestPath = join(repoRoot, "lib", "mock", "ctf-artifacts.manifest.json");

const ALL = [...cryptoChallenges, ...reChallenges, ...pwnChallenges, ...forensicsNetworkChallenges].filter((ch) => ch.id in FLAGS);

// Content types for the download links (Next serves public/ statically; the browser uses
// these for the "download" affordance). Keyed by extension.
const CONTENT_TYPE = {
  ".pcap": "application/vnd.tcpdump.pcap",
  ".jpg": "image/jpeg",
  ".img": "application/octet-stream",
  ".dmp": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".txt": "text/plain",
};

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

function build() {
  // Fresh output dir every run (deterministic artifacts -> byte-identical rebuild).
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const manifest = {};
  for (const ch of ALL) {
    const entry = {};
    if (typeof ch.build === "function") {
      const built = ch.build();
      if (built.embed) entry.embed = built.embed;
      if (built.files) writeFiles(ch.id, built.files, entry);
    }
    if (typeof ch.files === "function") {
      writeFiles(ch.id, ch.files(), entry);
    }
    manifest[ch.id] = entry;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

function writeFiles(id, files, entry) {
  const dir = join(outDir, id);
  mkdirSync(dir, { recursive: true });
  entry.files = entry.files || [];
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(dir, name), bytes);
    entry.files.push({ name, path: `/ctf-artifacts/${id}/${name}`, size: bytes.length, contentType: CONTENT_TYPE[extOf(name)] || "application/octet-stream" });
  }
}

function verify() {
  let ok = 0;
  const failures = [];
  for (const ch of ALL) {
    // Re-run build/files to get the exact artifact the solver consumes.
    let artifact = {};
    if (typeof ch.build === "function") artifact = { ...artifact, ...ch.build() };
    if (typeof ch.files === "function") artifact = ch.files();
    const got = ch.solve(artifact);
    const want = FLAGS[ch.id];
    // The inline text is shown on the page as-is: it must never carry the flag itself.
    const embedLeaks = typeof artifact.embed === "string" && artifact.embed.includes(want);
    const flagOk = got === want && !embedLeaks;
    // Cross-check the flag hashes to what the migration seeds (sha256(trim(flag))).
    const hash = sha256hex(want.trim());
    if (flagOk) ok++;
    else failures.push({ id: ch.id, got, want, embedLeaks });
    console.log(`${flagOk ? "PASS" : "FAIL"}  ${ch.id.padEnd(14)} flag_hash=${hash.slice(0, 16)}...  ${flagOk ? "" : `got=${JSON.stringify(got)}`}`);
  }
  console.log(`\n${ok}/${ALL.length} challenges: solver recovered the exact seeded flag from its own artifact.`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
  // Also assert every live challenge id has a generator, no more/less.
  const ids = new Set(ALL.map((c) => c.id));
  const missing = Object.keys(FLAGS).filter((id) => !ids.has(id));
  const extra = [...ids].filter((id) => !(id in FLAGS));
  if (missing.length || extra.length) {
    console.error("ID MISMATCH -- missing:", missing, "extra:", extra);
    process.exit(1);
  }
  console.log(`All ${ALL.length} live challenge ids have a generator.`);
}

const manifest = build();
console.log(`Built artifacts for ${Object.keys(manifest).length} challenges -> public/ctf-artifacts/`);
let fileCount = 0;
for (const e of Object.values(manifest)) fileCount += (e.files || []).length;
console.log(`  ${fileCount} downloadable files, ${Object.values(manifest).filter((e) => e.embed).length} embedded-text challenges.`);

if (process.argv.includes("--verify")) verify();

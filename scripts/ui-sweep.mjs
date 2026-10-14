// Breadth sweep of the whole UI, one pass per role: crawl every reachable page, record
// crashes / 5xx / console errors / broken links / unnamed controls / mobile overflow, then
// click every non-mutating button and flag the ones that do nothing ("dead buttons").
// Mutating actions (form submits, delete/approve/pay...) are skipped here -- the journey
// specs in e2e/ cover those. Signs in with the seed:e2e accounts only; re-run
// `npm run seed:e2e` afterwards to reset anything a click changed.
// SWEEP_OPENERS=1 also clicks mutating-named buttons and switches that are not form
// submits (Edit, Remove, Suspend...): most open a confirm dialog, which is then cancelled
// -- and must close on Escape; a switch is flipped and flipped back. Some act immediately
// (KYC Verify, Approve launch, Join program...), so a mutating click only ever happens on
// test data: inside a record (row/card) or page whose own text says "E2E", or on the
// account's own /settings and /notifications. The seed is re-run between roles. Every
// click, and every non-GET call it made, is appended to <out>-clicks.jsonl.
// SWEEP_PARALLEL=1: for running one process per role at once (seed once beforehand). No
// reseed between roles, and the two controls that change what OTHER roles can see are
// left to their specs: the program team's Assign/Remove (e2e/org-roles.spec.ts) and the
// program's public/private switch (e2e/org-journey.spec.ts).
//   node scripts/ui-sweep.mjs [baseUrl=http://127.0.0.1:3100] [role,role...]
import { chromium } from "@playwright/test";
import { appendFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const ONLY = process.argv[3]?.split(",");
const OUT = process.env.SWEEP_OUT ?? "ui-sweep-report.json";
const CLICK_LOG = OUT.replace(/\.json$/, "") + "-clicks.jsonl";
writeFileSync(CLICK_LOG, "");
const PASSWORD = "E2ESeed!2026";
const MAX_PAGES = 90;

const PUBLIC = ["/", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/researchers/sign-up", "/organizations/sign-up", "/help", "/safe-harbor", "/disclosures", "/programs", "/researchers", "/researchers/community", "/learn", "/ctf", "/coming-soon"];
const SETTINGS = ["", "/profile", "/password", "/security", "/notifications", "/payments", "/api-tokens", "/calendar", "/collaboration", "/digital-agreements", "/external-services", "/feedback", "/invitations", "/recovery", "/report-templates", "/reputation", "/skills", "/subscriptions", "/swag", "/deactivate"].map((s) => `/settings${s}`);
const SIGNED_IN = ["/", "/programs", "/reports", "/bounties", "/notifications", "/assistant", "/learn", "/ctf", "/organizations", ...SETTINGS];
const ORG = ["", "/programs", "/findings", "/assets", "/activity", "/analytics", "/members", "/researchers", "/payments", "/settings"];
const ROLES = {
  anonymous: { email: null, seeds: PUBLIC },
  researcher: { email: "e2e.veteran@unpatched.demo", seeds: SIGNED_IN },
  owner: { email: "e2e.admin@unpatched.demo", seeds: [...SIGNED_IN, ...ORG.map((p) => `@org${p}`)] },
  program_manager: { email: "e2e.program-manager@unpatched.demo", seeds: ["/", ...ORG.map((p) => `@org${p}`)] },
  triager: { email: "e2e.triager@unpatched.demo", seeds: ["/", ...ORG.map((p) => `@org${p}`)] },
  billing_admin: { email: "e2e.billing-admin@unpatched.demo", seeds: ["/", ...ORG.map((p) => `@org${p}`)] },
  platform_admin: { email: "e2e.platform-admin@unpatched.demo", seeds: ["/", "/platform", "/platform/organizations", "/platform/programs", "/platform/all-programs", "/platform/researchers", "/platform/kyc", "/platform/payouts", "/platform/mediations", "/platform/retests", "/platform/needs-recovery", "/platform/errors", "/platform/integrations", "/platform/audit-log", "/platform/ctf-events"] },
};

// Names of controls that change data or leave the page state -- never clicked by the sweep.
const MUTATING = /delete|remove|suspend|deactivate|sign ?out|log ?out|revoke|reject|archive|withdraw|\bban\b|disable|reset|close|pause|terminate|unassign|leave|decline|approve|accept|finali[sz]e|\bpay|record|launch|publish|submit|send|invite|save|create|confirm|assign|import|upload|generate|rotate|mark|resolve|reopen|block|restore|\bend\b|stop|request|apply|join|claim|enable|activate|verify|update|\badd\b|continue|cancel|retry|dismiss|follow|subscribe|register|sign ?in|sign ?up|next|back|copy|download/i;
const OPENERS = process.env.SWEEP_OPENERS === "1";
const PARALLEL = process.env.SWEEP_PARALLEL === "1";
// Never clicked, even with OPENERS: they end the sweep's own session or account.
const NEVER = /sign ?out|log ?out|deactivate|delete (my )?account/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ERROR_TEXT = /Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error|This page could not be found|could not load/i;

// The production session cookie is Secure. Chrome still sends it to http://127.0.0.1, but
// Playwright's request helper drops Secure cookies over http, so every signed-in link looked
// like a 401. Pass the browser's cookies explicitly.
async function checkLink(context, target) {
  // cookies(url) applies the same Secure filter, so take them all and match the host here.
  const host = new URL(target).hostname;
  const cookie = (await context.cookies()).filter((c) => c.domain.replace(/^\./, "") === host).map((c) => `${c.name}=${c.value}`).join("; ");
  return context.request.get(target, { maxRedirects: 5, timeout: 60_000, headers: cookie ? { cookie } : {} }).catch(() => null);
}

const issues = [];
const add = (role, severity, kind, where, detail) => issues.push({ role, severity, kind, where, detail });

async function signIn(context, email) {
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { timeout: 90_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 90_000 });
  // Platform admins must pass MFA (202610100001): same backup-code route as e2e/mfa-gate.ts.
  if (new URL(page.url()).pathname.startsWith("/mfa/verify")) {
    const code = randomBytes(5).toString("hex").toUpperCase();
    try { process.loadEnvFile(".env.local"); } catch {}
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("begin");
    await db.query("set local role service_role");
    await db.query("insert into public.mfa_backup_codes (user_id, code_hash) select id, $2 from public.users where email = $1", [email, createHash("sha256").update(code).digest("hex")]);
    await db.query("commit");
    await db.end();
    await page.getByRole("button", { name: "Use a backup code instead" }).click();
    await page.getByLabel("Backup code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/mfa/verify"), { timeout: 90_000 });
  }
  await page.close();
}

const keyOf = (u) => {
  const url = new URL(u);
  url.searchParams.delete("redirectTo");
  return (url.pathname + (url.search ? url.search : "")).replace(UUID, ":id");
};
const SLUG_PARENTS = ["/learn/", "/ctf/", "/researchers/"];

async function sweepRole(browser, role, { email, seeds }, orgId) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (email) await signIn(context, email);
  const page = await context.newPage();
  let where = "";
  const consoleSeen = new Set();
  page.on("pageerror", (e) => add(role, "P0", "page-error", where, e.message.slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text().slice(0, 300);
    if (consoleSeen.has(where + text)) return;
    consoleSeen.add(where + text);
    add(role, "P1", "console-error", where, text);
  });
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith(BASE)) add(role, "P0", "http-5xx", where, `${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });

  const queue = seeds.map((s) => BASE + s.replace("@org", `/organizations/${orgId}`));
  const visited = new Set();
  const slugCount = {};
  const linkChecked = new Map();
  let clicked = 0, skipped = 0, pages = 0, outOfScope = 0, vanished = 0;

  while (queue.length && pages < MAX_PAGES) {
    const url = queue.shift();
    const key = keyOf(url);
    if (visited.has(key)) continue;
    const parent = SLUG_PARENTS.find((p) => new URL(url).pathname.startsWith(p) && new URL(url).pathname.split("/").length === 3);
    if (parent) { slugCount[parent] = (slugCount[parent] ?? 0) + 1; if (slugCount[parent] > 2) continue; }
    visited.add(key);
    where = key;
    pages++;
    console.log(`  [${role}] ${pages} ${key}`);

    let response;
    try { response = await page.goto(url, { timeout: 90_000, waitUntil: "load" }); }
    catch (e) {
      // A link to a file (the activity CSV export) downloads instead of rendering: that's success.
      if (!/Download is starting/.test(e.message)) add(role, "P0", "load-failed", key, e.message.split("\n")[0]);
      continue;
    }
    if (email && new URL(page.url()).pathname === "/sign-in" && !key.startsWith("/sign-in")) {
      add(role, "P0", "session-lost", key, "signed out mid-sweep (a click ended the session?); signing in again");
      await signIn(context, email);
      response = await page.goto(url, { timeout: 90_000, waitUntil: "load" }).catch(() => null);
    }
    await page.waitForTimeout(700);
    const status = response?.status() ?? 0;
    if (status >= 400) add(role, status >= 500 ? "P0" : "P1", "page-status", key, `${status} (final url ${keyOf(page.url())})`);
    const body = await page.locator("body").innerText().catch(() => "");
    const errorText = body.match(ERROR_TEXT);
    if (errorText && status < 400) add(role, "P0", "error-text", key, errorText[0]);

    // Static checks on the loaded page.
    const statics = await page.evaluate(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
      const nameOf = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || [...(el.labels ?? [])].map((l) => l.innerText).join(" ") || el.innerText || el.querySelector("img[alt]")?.alt || (el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.innerText) || "").trim();
      const unnamed = [...document.querySelectorAll("button, a[href], [role=button]")].filter((el) => visible(el) && !nameOf(el) && !el.querySelector("svg title")).map((el) => el.outerHTML.slice(0, 140));
      const deadHash = [...document.querySelectorAll('a[href="#"], a[href=""]')].filter(visible).map((el) => (el.innerText || el.outerHTML).trim().slice(0, 80));
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith(location.origin));
      const unlabeledInputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]), select, textarea")].filter((el) => visible(el) && !(el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title"))).map((el) => el.outerHTML.slice(0, 120));
      const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && visible(i)).map((i) => i.src);
      return { unnamed, deadHash, links, unlabeledInputs, brokenImages };
    });
    for (const u of statics.unnamed.slice(0, 5)) add(role, "P2", "unnamed-control", key, u);
    for (const u of statics.deadHash) add(role, "P1", "dead-hash-link", key, u);
    for (const u of statics.unlabeledInputs.slice(0, 5)) add(role, "P2", "unlabeled-input", key, u);
    for (const u of statics.brokenImages) add(role, "P1", "broken-image", key, u);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) add(role, "P2", "mobile-overflow", key, `${overflow}px wider than a 390px screen`);
    await page.setViewportSize({ width: 1280, height: 900 });

    // Links: every internal target must answer (no 404/5xx), and gets crawled.
    for (const href of new Set(statics.links)) {
      const u = new URL(href);
      if (/sign-out|\/api\//.test(u.pathname)) continue;
      u.hash = "";
      const target = u.toString();
      if (!linkChecked.has(target)) {
        const r = await checkLink(context, target);
        linkChecked.set(target, r?.status() ?? 0);
        if (!r || r.status() >= 400) add(role, r && r.status() < 500 ? "P1" : "P0", "broken-link", key, `-> ${target.replace(BASE, "")} = ${r?.status() ?? "no response"}`);
      }
      if (!visited.has(keyOf(target))) queue.push(target);
    }

    // Buttons: click each eligible one on a fresh page; nothing observable = dead.
    const mark = () => page.evaluate(([mutatingSource, neverSource, openers, parallel]) => {
      const mutating = new RegExp(mutatingSource, "i");
      const never = new RegExp(neverSource, "i");
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
      const ownAccount = /^\/(settings|notifications)(\/|$)/.test(location.pathname);
      const pageContext = [...document.querySelectorAll("h1, nav[aria-label='Breadcrumb']")].map((e) => e.innerText).join(" ");
      const out = [];
      let id = 0;
      for (const el of document.querySelectorAll("button, [role=button], [role=tab], [role=switch], summary")) {
        el.removeAttribute("data-sweep-id");
        if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true" || ["aria-pressed", "aria-selected", "aria-checked"].some((a) => el.getAttribute(a) === "true" && el.getAttribute("role") !== "switch") || el.hasAttribute("aria-current") || el.closest("header nav, [aria-label='Primary navigation']")) continue;
        const kind = el.getAttribute("role") === "switch" ? "switch" : "button";
        const labelText = [...(el.labels ?? [])].map((l) => l.innerText).join(" ");
        const name = (el.getAttribute("aria-label") || (kind === "switch" ? labelText : el.innerText) || labelText || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60);
        const opener = el.hasAttribute("aria-haspopup") || el.hasAttribute("aria-expanded") || el.getAttribute("role") === "tab" || el.tagName === "SUMMARY";
        const submits = el.tagName === "BUTTON" && (el.type === "submit") && !!el.form;
        const isMutating = kind === "switch" || mutating.test(name);
        // Test data only: the nearest record (row/card) must be an E2E one; with no record
        // around it, the page itself (heading/breadcrumb) must be.
        const record = el.closest("tr, li, [role=row], [role=listitem], article");
        const inScope = ownAccount || /E2E/.test(record ? record.innerText : pageContext);
        const crossRole = parallel && (!!el.closest("section[aria-label='Program team']") || (kind === "switch" && /^(Public|Private):/.test(name)));
        const safe = !!name && !submits && !never.test(name) && !crossRole && (opener || !isMutating || (openers && inScope));
        const sweepId = String(id++);
        el.setAttribute("data-sweep-id", sweepId);
        out.push({ id: sweepId, name, kind, safe, isMutating, outOfScope: openers && isMutating && !opener && !inScope && !submits });
      }
      return out;
    }, [MUTATING.source, NEVER.source, OPENERS, PARALLEL]);
    const targets = await mark();
    const names = [];
    for (const t of targets) {
      if (!t.safe) { skipped++; if (t.outOfScope) outOfScope++; continue; }
      if (!names.includes(t.name)) names.push(t.name); // same-name controls (row actions) sampled once
    }
    for (const name of names) {
      const t = (await mark()).find((c) => c.safe && c.name === name);
      if (!t) { vanished++; continue; }
      const control = page.locator(`[data-sweep-id="${t.id}"]`);
      if (!(await control.isVisible().catch(() => false))) { vanished++; continue; }
      const before = page.url();
      const linksBefore = new Set(await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href)));
      const checkedBefore = t.kind === "switch" ? await control.getAttribute("aria-checked") : null;
      let requests = 0;
      const calls = [];
      const onRequest = (r) => { requests++; if (r.method() !== "GET") calls.push(`${r.method()} ${r.url().replace(BASE, "")}${r.headers()["next-action"] ? " [server action]" : ""}`); };
      page.on("request", onRequest);
      await page.evaluate(() => { window.__sweepMutations = 0; window.__sweepObserver?.disconnect(); window.__sweepObserver = new MutationObserver((m) => { window.__sweepMutations += m.length; }); window.__sweepObserver.observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); });
      const popup = context.waitForEvent("page", { timeout: 1500 }).catch(() => null);
      let clickError = await control.click({ timeout: 15_000 }).then(() => null, (e) => e);
      if (clickError) {
        const again = (await mark()).find((c) => c.safe && c.name === name);
        clickError = again ? await page.locator(`[data-sweep-id="${again.id}"]`).click({ timeout: 15_000 }).then(() => null, (e) => e) : clickError;
      }
      if (clickError) {
        const reason = clickError.message.split("\n").filter((l) => /intercept|not stable|not enabled|detached|not visible/.test(l)).pop() ?? clickError.message.split("\n")[0];
        add(role, "P1", "unclickable", key, `"${name}": ${reason.trim()}`);
        page.off("request", onRequest);
        continue;
      }
      clicked++;
      await page.waitForTimeout(1200);
      const opened = await popup;
      if (opened) await opened.close();
      const mutations = await page.evaluate(() => window.__sweepMutations ?? 0).catch(() => 1);
      const effect = page.url() !== before || mutations > 0 || requests > 0 || opened;
      if (!effect) add(role, "P1", "dead-button", key, `"${name}" does nothing when clicked`);
      const dialog = page.getByRole("dialog").first();
      const dialogOpen = effect && (await dialog.isVisible().catch(() => false));
      // Links that only exist once something opened (menus, drawers, dialogs) get checked too.
      if (effect && page.url() === before) {
        for (const href of await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith(location.origin)))) {
          if (linksBefore.has(href) || /sign-out|\/api\//.test(new URL(href).pathname)) continue;
          const target = href.split("#")[0];
          if (!linkChecked.has(target)) {
            const r = await checkLink(context, target);
            linkChecked.set(target, r?.status() ?? 0);
            if (!r || r.status() >= 400) add(role, r && r.status() < 500 ? "P1" : "P0", "broken-link", key, `-> ${target.replace(BASE, "")} = ${r?.status() ?? "no response"} (inside what "${name}" opened)`);
          }
          if (!visited.has(keyOf(target))) queue.push(target);
        }
      }
      let switchState = null;
      const settled = async (from) => {
        const end = Date.now() + 8000;
        let value = from;
        while (Date.now() < end && value === from) { await page.waitForTimeout(200); value = await control.getAttribute("aria-checked").catch(() => null); }
        return value;
      };
      if (t.kind === "switch" && !dialogOpen && page.url() === before) {
        const after = await settled(checkedBefore);
        if (after === checkedBefore) add(role, "P1", "switch-no-change", key, `switch "${name}" stayed ${checkedBefore} for 8s after a click`);
        else {
          await control.click({ timeout: 15_000 }).catch(() => {});
          const restored = await settled(after);
          switchState = `${checkedBefore} -> ${after} -> ${restored}`;
          if (restored !== checkedBefore) add(role, "P1", "switch-not-restored", key, `switch "${name}" went ${switchState}`);
        }
      }
      page.off("request", onRequest);
      appendFileSync(CLICK_LOG, JSON.stringify({ role, page: key, name, kind: t.kind, mutating: t.isMutating, effect: page.url() !== before ? "navigated" : dialogOpen ? "dialog" : opened ? "popup" : requests ? "request" : mutations ? "dom" : "none", switchState, calls }) + "\n");
      if (dialogOpen) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        if (await dialog.isVisible().catch(() => false)) add(role, "P2", "dialog-no-escape", key, `dialog opened by "${name}" does not close on Escape`);
      }
      else await page.goto(url, { timeout: 90_000, waitUntil: "load" }).then(() => page.waitForTimeout(400)).catch(() => {});
    }
  }
  await context.close();
  return { pages, clicked, skipped, outOfScope, vanished, links: linkChecked.size };
}

const orgId = JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")).organizationId;
const browser = await chromium.launch();
const coverage = {};
for (const [role, spec] of Object.entries(ROLES)) {
  if (ONLY && !ONLY.includes(role)) continue;
  const t = Date.now();
  if (OPENERS && !PARALLEL) spawnSync("npm", ["run", "seed:e2e"], { env: { ...process.env, ALLOW_TEST_ACCOUNTS: "1" }, shell: true, stdio: "ignore" });
  try { coverage[role] = await sweepRole(browser, role, spec, orgId); }
  catch (e) { add(role, "P0", "sweep-crashed", "-", e.message.split("\n")[0]); }
  writeFileSync(OUT, JSON.stringify({ base: BASE, coverage, issues }, null, 2));
  console.log(`${role}: ${JSON.stringify(coverage[role])} in ${Math.round((Date.now() - t) / 1000)}s, issues so far ${issues.length}`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, coverage, issues }, null, 2));
const bySev = issues.reduce((a, i) => ((a[i.severity] = (a[i.severity] ?? 0) + 1), a), {});
console.log(`\n${issues.length} issues`, bySev, `-> ${OUT}`);

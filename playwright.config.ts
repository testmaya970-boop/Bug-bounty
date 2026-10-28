import { defineConfig, devices } from "@playwright/test";

// The release gate's own prod server: its own port and build folder (next.config.ts's
// distDir), so it never reuses or overwrites a `next dev` running on :3000.
// Specs derive CTF flags from CTF_FLAG_SECRET; CI writes the same .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {}
const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
// E2E_BASE_URL: point the browser at an HTTPS front (scripts/https-proxy.mjs) for the iPhone tests.
const E2E_SERVER_URL = `http://127.0.0.1:${E2E_PORT}`;
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? E2E_SERVER_URL;

// Turn 8 (phase/9-ia successor): the release gate this codebase's own AGENTS.md now
// requires ("E2E journey suite green against prod build with deterministic seed. No tag
// without it.") -- so this MUST run against a real `next build` + `next start`, never
// `next dev`. Dev mode's on-demand compilation, HMR, and dev-only warnings can mask (or
// fabricate) behavior a real deployment would never show; only a prod build is the thing
// actually being released. `npm run build` runs once, synchronously, before the server
// starts -- a stale .next from an earlier build would otherwise silently test old code.
//
// A second webServer entry starts the outbox worker alongside the app: several journey
// assertions (the notification bell showing a new notification) depend on a real
// notification row that only exists after the worker has actually processed the
// corresponding outbox event -- without it running, those events sit in `pending`
// forever and the assertions would hang or fail for a reason that has nothing to do with
// the feature under test.
export default defineConfig({
  testDir: "./e2e",
  // Capped: every browser hits one prod server, one worker and one DB on the same machine
  // (locally also the live next dev). At the default (7 here) sign-ins and page loads
  // timed out under contention; the same specs passed alone. Measured 2026-09-26.
  workers: process.env.CI ? 2 : 3,
  // org-journey.spec.ts's admin test drives a full real journey (program creation,
  // triage, bounty calculation/finalization) through many real server actions -- each a
  // genuine DB round trip, not a mock. 180s per test.
  timeout: 180_000,
  // Default per-assertion wait. Every one of this session's own DB checks confirms the
  // real mutation behind each assertion always lands correctly and promptly (e.g. a
  // report reaching "triaging" in the database while the UI still hadn't shown it 20s
  // later) -- so the slowness measured here is client-observable rendering delay under
  // this machine's own CPU contention (a single runaway, permission-protected leftover
  // process outside this session's ability to terminate -- confirmed via `Stop-Process`/
  // `taskkill` both returning Access is denied -- was consuming 1000+ CPU-seconds in the
  // background during these very runs), never an application defect. 45s gives real
  // margin against that specific, external constraint; a clean environment needs far less.
  expect: { timeout: 45_000 },
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure", ignoreHTTPSErrors: true },
  // e2e/mobile/ runs on phone emulation only (touch, small viewport, mobile UA): Android on
  // Chromium and iPhone on WebKit, Safari's engine (`npx playwright install webkit`).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\// },
    { name: "android", use: { ...devices["Pixel 7"] }, testMatch: /mobile\/.*\.spec\.ts/ },
    { name: "iphone", use: { ...devices["iPhone 14"] }, testMatch: /mobile\/.*\.spec\.ts/ },
  ],
  webServer: [
    // Measured live: a standalone `npm run build` alone takes ~135s on this machine; 180s
    // left no margin for `next start` to then boot within the same window. 300s -- then
    // measured 202s for the build alone with a `next dev` running alongside, which blew
    // past 300s once seeding and boot were added. 600s.
    { command: `npm run build && npm run start -- -p ${E2E_PORT}`, url: E2E_SERVER_URL, env: { NEXT_DIST_DIR: ".next-prod", LOCAL_PROD_TEST: "1", APP_ORIGIN: E2E_BASE_URL, CARD_PROVIDER_IN: "sandbox", CARD_PROVIDER_GLOBAL: "sandbox", CARD_PROVIDER_PAYPAL: "sandbox", PAYOUT_CONNECT_PAYPAL: "sandbox", PAYOUT_CONNECT_STRIPE: "sandbox", ALLOW_LOOPBACK_DELIVERY: "1" }, reuseExistingServer: !process.env.CI, timeout: 600_000 },
    { command: "npm run worker:outbox", reuseExistingServer: !process.env.CI, timeout: 30_000, env: { ALLOW_LOOPBACK_DELIVERY: "1", OUTBOX_POLL_INTERVAL_MS: "500" } },
  ],
});

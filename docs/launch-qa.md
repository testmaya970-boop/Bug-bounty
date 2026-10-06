# Launch QA checklist

Run against a real `next build` + `next start` (production mode, not `next dev`) with
the `npm run seed:launch` dataset loaded. Each line is one real click-through, executed
against the running app — not a code read. Pass/fail results from the Phase 7 Turn 4
run are recorded in the session summary, not duplicated here (this file is the
reusable checklist itself).

1. **Sign in** — go to `/sign-in`, enter `launch.admin@unpatched.demo` /
   `SentinelLaunch!2026`, submit. Expect: redirected to a real authenticated page (not
   bounced back to `/sign-in`).
2. **Org Home shows total paid** — navigate to the org's Home page. Expect: the
   Engagements summary strip shows `Total paid: $3,000` (the seed script's one
   finalized bounty), not hidden and not a placeholder.
3. **Findings filters** — open Findings. Expect: all 3 seeded reports appear (new /
   triaging / resolved). Filter by status = Resolved. Expect: only the SSRF report
   remains, with its real severity/asset-link shown.
4. **Inbox state transition** — open the program's Inbox, select the `triaging`
   report (IDOR). Trigger a real transition (e.g. Accept). Expect: the button set
   disables while pending, then the report's status updates to Accepted after the
   action resolves — no optimistic flip, a real server-confirmed state change.
5. **Researcher scope view** — sign out, sign in as
   `launch.researcher@unpatched.demo` / `SentinelLaunch!2026`. Open the program.
   Expect: the grouped, hacker-facing scope view shows the one in-scope domain with
   its instructions; the out-of-scope entry is not listed.
6. **Researcher sees finalized bounty** — open the resolved SSRF report as the
   researcher. Expect: the Bounty section shows the real finalized amount (`USD
   3000.00`) and the finalization note, with no admin-only controls (no
   Finalize/Adjust buttons).

## Latency budgets

Measured every release: 3 warm hits per route against the running `next build` +
`next start` server, `waitUntil: "load"` (not `"networkidle"` — that counts background
navigation prefetch as part of the measured load and inflates results; see
AGENTS.md's information-architecture rule on why prefetch is disabled on gated links in
the first place), median of the 3. A >20% regression on any row blocks merge.

Automated since 2026-09-25: `npx playwright test e2e/latency-budgets.spec.ts --workers=1`
(fails on any budget miss). Each row is the median hit, split from the browser's
Navigation Timing entry: **TTFB** (to first byte, ≈ server time on localhost), **transfer**
(streamed HTML incl. Suspense content), **client** (parse/scripts to `load`), **total**
(start → `load`, what the budget checks).

| Route | Budget | TTFB | Transfer | Client | Total | Pass/Fail |
|---|---|---|---|---|---|---|
| Org dashboard (Home) | ≤0.5s | 97ms | 4ms | 34ms | 135ms | PASS |
| Engagements | ≤0.6s | 63ms | 2ms | 38ms | 103ms | PASS |
| Findings | ≤0.6s | 61ms | 3ms | 48ms | 112ms | PASS |
| Program inbox | ≤0.6s | 77ms | 4ms | 48ms | 129ms | PASS |
| Researcher home | ≤0.8s | 109ms | 5ms | 31ms | 145ms | PASS |
| CTF | ≤1.0s | 66ms | 4ms | 65ms | 135ms | PASS |

**Disclosed regression (Phase 2, same day, pending sign-off):** after the strict nonce CSP
(proxy.ts) and the browser error listener (components/client-error-listener.tsx) landed,
totals rose to Home 151 / Engagements 132 / Findings 140 / Inbox 155 / Researcher home 153
/ CTF 131ms (median of 3 runs) -- all still ~3-7x under budget, but past the 20% rule on
the org routes. Server time (TTFB) is unchanged; the increase is client-side. Cause, from
an interleaved A/B against an otherwise identical build with only those two removed (6
samples each): +13-34% on org routes (Inbox the largest), +4-6% on researcher routes. The
security benefit was judged worth ~20-60ms; if not, measure the two separately next.

**2026-10-05 -- single-call session gate (audit PERF-2).** The proxy's session validation and
deactivation/MFA gate went from two transactions (~12 round trips) to one statement
(`get_session_gate`, migration 202610050004), and "last active" is written at most every 5
minutes instead of on every request. TTFB / total ms, prod build on :3100, `next dev`
running alongside on :3000:

| Route | Baseline (before) | After, quiet run 1 | After, quiet run 2 |
|---|---|---|---|
| Org dashboard (Home) | 134 / 223 | 85 / 163 | 102 / 185 |
| Engagements | 107 / 193 | 62 / 138 | 64 / 150 |
| Findings | 108 / 208 | 102 / 208 | 58 / 181 |
| Program inbox | 87 / 171 | 66 / 152 | 67 / 139 |
| Researcher home | 113 / 257 | 83 / 211 | 109 / 170 |
| CTF | 84 / 199 | 55 / 223 | 73 / 153 |

No route regressed past 20%. A first "after" run measured Home at +21% total, but a probe
was hitting the dev server during it; both quiet re-runs were faster than baseline. Baseline
is one run, so treat small differences as noise.

**Open, not caused by this change:** the client column (responseEnd -> load) is ~70-130ms on
every route in both baseline and after, versus 31-65ms in the 2026-09-25 table below, which
puts totals past the 20% rule against that table. Not yet isolated. Candidates: the Netras
rebrand's added Open Sans font, and the concurrent `next dev` on this machine.

Measured 2026-09-25 on Next.js 16.3.6 (Turbopack prod build), local `next build` + `next
start` (port 3100), `seed:launch` data. The same day on Next.js 15.5 the totals were
264 / 215 / 248 / 280 / 277 / 250ms: the upgrade roughly halved every route, mostly by
collapsing streamed transfer time (45-68ms -> 2-5ms) and client time. The earlier single-number results
(Home 148ms, Engagements 102ms, Findings 103ms, Inbox 179ms, Researcher home 136ms, CTF
197ms) recorded no breakdown or exact end point; they sit close to today's TTFB column, so
they most likely measured to first byte, not to `load`. Treat this table as the new
baseline for the 20% regression rule rather than comparing its Total column to them.

Throughput note (same day): one `next start` process renders pages CPU-bound on one
thread -- 20 simultaneous dashboard loads took ~4s each vs ~0.3s alone, unchanged by a
larger DB pool (5 → 20). Production needs several processes/instances, not a bigger pool.

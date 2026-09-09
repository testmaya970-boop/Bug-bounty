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

| Route | Budget | Result | Pass/Fail |
|---|---|---|---|
| Org dashboard (Home) | ≤0.5s | 148ms | PASS |
| Engagements | ≤0.6s | 102ms | PASS |
| Findings | ≤0.6s | 103ms | PASS |
| Program inbox | ≤0.6s | 179ms | PASS |
| Researcher home | ≤0.8s | 136ms | PASS |
| CTF | ≤1.0s | 197ms | PASS |

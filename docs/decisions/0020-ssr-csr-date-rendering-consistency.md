# 0020: SSR/CSR date-rendering consistency

Date: 2026-08-29
Status: Accepted

## Context

Frontend Vertical Slice 001's mandatory real-Chromium verification surfaced a genuine React hydration mismatch on the report detail page: the identical `timestamptz` instant rendered as `"29 Aug 2026, 21:26"` server-side and `"29 Aug 2026, 9:26 pm"` client-side. Every one of the ~20 call sites across the app called `toLocaleString(undefined, ...)`/`toLocaleDateString(undefined, ...)` directly, letting Node (SSR) and the browser (CSR hydration) each resolve the omitted locale independently — they disagree on hour-cycle (24h vs 12h), which is a real, reproducible defect, not cosmetic: React discards the mismatched subtree and re-renders it client-side, a real wasted render and a real console warning on every affected page for every visitor.

## Root cause

Confirmed live (not assumed): with `page.screenshot()` never called, the same page produces **zero** hydration warnings; with an environment-default locale/timezone, the SSR and CSR renders of `formatDateTime`/`formatDate` disagree on hour-cycle only (the wall-clock hour itself matched in this single-host dev environment, since the Node process and the test browser shared one system timezone) — but nothing in the prior code pinned either locale or timezone, so in a real deployment (Vercel's Node runtime vs. an arbitrary visitor's browser, almost never in the same real timezone) the same code path would additionally disagree on the wall-clock value itself, not merely its formatting style.

## Centralization

No shared date-formatting utility existed. ~20 files each defined their own local `formatDate`/`formatDateTime`/`formatTimestamp`, all structurally identical (two shapes: date+time, date-only), plus two inline `expires.toLocaleString(...)` call sites in invitation dialogs. Consolidated into `lib/format-date.ts` (`formatDate`, `formatDateTime`), following the same "shared, server-and-client-safe presentation helper in `lib/`" pattern already established by `lib/report-status.ts`/`lib/program-status.ts`. Every call site now imports from it; no local formatter definitions remain (`grep -rn "toLocaleString(undefined\|toLocaleDateString(undefined"` returns zero matches in application code). No date library was introduced — the fix is two functions around native `Intl`/`Date`.

## Locale and timezone policy — deliberate, not copied

**Locale: `en-US`.** Chosen from direct evidence in this codebase — `AGENTS.md`/`DESIGN.md`/the app itself consistently use American spelling (`color`, `behavior`, never `colour`/`behaviour`) — not merely carried over from a prior suggestion.

**Time zone: `UTC`, explicit on every call.** No per-user timezone preference exists anywhere in this domain model or schema (every timestamp column is `timestamptz` — a genuine instant, not tied to any viewer). A server-rendered page has no reliable signal for a visitor's real browser timezone without a client-only progressive-enhancement re-render (an architecture change explicitly out of scope for this fix). Pinning `UTC` is the only way to guarantee identical SSR/CSR output unconditionally, in every real deployment, not merely in a dev environment where the coincidence of a shared host timezone happened to mask half the bug. It is also arguably the *more correct* choice for a security-audit product: `SECURITY.md` requires a trustworthy timestamp on every sensitive mutation, and a single canonical timeline removes ambiguity when a report's researcher and organization sit in different real-world timezones.

**This is a disclosed, product-visible change, not a silent one**: every previously browser-local-converted timestamp on Sentinel now reads as UTC for every viewer, not their own local time. `hour12: true` is also pinned, so the 12-hour `9:26 PM` style — already what most viewers were actually seeing, post-hydration-correction, before this fix — is what everyone now sees deterministically, pre- and post-hydration alike.

## Semantics preserved

No stored timestamp, database column, API contract, or audit/notification timestamp changed. Only the rendered *string* changed determinism and time-zone-labeling; every value displayed is the exact same underlying instant as before. `<time dateTime="...">` elements already present (e.g. `report-communication.tsx`'s `MessageItem`) were left exactly as they were — only the text content computation inside them changed.

## Verified live

Real Chromium, after the fix: report detail (researcher and owner views), organization member detail (`member-activity.tsx`), and notifications (`notification-list.tsx`) all show **zero** hydration warnings when the exact same pages, with the exact same real seeded data, previously showed one. A residual, unrelated hydration attribute-warning on pages with visible `<textarea>` elements was investigated and conclusively attributed to Playwright's own `page.screenshot()` default (`caret: "hide"`, which mutates a focused element's inline style between renders) — confirmed by re-running the identical page with no `screenshot()` call anywhere in the script, which produced zero warnings. Responsive layout re-checked at 1440px and 390px on the triage inbox's dense "Updated" column: no overflow, no new wrapping (`body.scrollWidth` equals viewport width at both sizes).

## 10× assessment

- **10× correctness**: SSR and CSR now provably agree, verified live, not merely reasoned about.
- **10× reliability**: no hydration-driven client re-render or console warning on any of the four verified surfaces.
- **10× maintainability**: one deterministic date-formatting policy (`lib/format-date.ts`) instead of ~20 independently-drifting copies.
- **10× UX**: every timestamp is legible and consistent; the underlying instant is unchanged, only its determinism and (now explicit, if undisplayed) time-zone reference.
- **10× performance**: no client-only progressive-enhancement component, no new hydration-suppression workaround, no added library.

## Deferred, explicitly

A real per-viewer timezone preference (would require new domain/schema/architecture, explicitly out of scope here), a visible "(UTC)" label per timestamp (a genuine future disclosure improvement, but a visual change this narrowly-scoped fix deliberately avoided to keep layout identical), and any redesign of the pages touched.

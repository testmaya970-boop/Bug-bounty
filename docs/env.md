# Environment variables

Reconciled against actual usage (`lib/env.ts`'s zod schema plus every other
`process.env.*` reference in the codebase) as of the Phase 7 launch checklist. Two
independent processes read env vars: the Next.js app itself, and the standalone outbox
worker (`npm run worker:outbox`) — the worker's own vars never block the app's boot, and
vice versa.

## Required for boot (Next.js app)

The app throws at startup (`lib/env.ts`'s `getNativeEnv()`, a zod-validated schema — no
silent fallback for any of these) if any of the following is missing or malformed. Local
dev values come from `docker-compose.native.yml`'s own services.

| Var | Used by | Notes |
|---|---|---|
| `APP_ORIGIN` | `lib/env.ts`, `services/auth.ts`, `app/auth/confirm/route.ts` | The app's public origin (no path). Every emailed link and auth redirect is built from it, never from request `Host`/`X-Forwarded-*` headers. Must be `https://` in production (`lib/startup-check.ts`). |
| `DATABASE_URL` | `lib/db/pool.ts` | Standalone Postgres connection string. **Must** be a plain, non-superuser, non-BYPASSRLS role (`sentinel_app_runtime` locally) — a superuser connection silently bypasses RLS regardless of any `SET ROLE` the app performs. |
| `SESSION_COOKIE_SECRET` | `lib/auth/session.ts` | Signs/validates the opaque session cookie. Min 32 bytes. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `S3_ENDPOINT` | `lib/evidence-store.ts` | S3-compatible object storage endpoint for evidence file uploads. Local dev: MinIO (`docker-compose.native.yml`). |
| `S3_REGION` | `lib/evidence-store.ts` | |
| `S3_BUCKET` | `lib/evidence-store.ts` | |
| `S3_ACCESS_KEY_ID` | `lib/evidence-store.ts` | |
| `S3_SECRET_ACCESS_KEY` | `lib/evidence-store.ts` | |

### Database setting (not an env var)

`app.settings.kyc_encryption_key` encrypts KYC and bank-account fields
(`private.sensitive_field_encryption_key()`). It is set on the database, not in the app:
`alter database <db> set app.settings.kyc_encryption_key = '<secret>';` — take the value
from a secret manager. Encrypt/decrypt raises `ENCRYPTION_KEY_MISSING` when it is unset,
and production boot (`lib/startup-check.ts`) refuses to start when it is unset or still the
local-dev value that `db/init/01-app-role.sql` sets. Changing it on a database that already
holds encrypted rows makes those rows unreadable — re-encrypt first.

## Optional (Next.js app)

Boot succeeds without these; each has a real, documented fallback behavior — never a
silently-broken feature.

| Var | Used by | Default when unset | Notes |
|---|---|---|---|
| `S3_FORCE_PATH_STYLE` | `lib/evidence-store.ts` | `false` | Set to `true` for MinIO and most non-AWS S3-compatible endpoints. |
| `EMAIL_PROVIDER` | `lib/email-provider.ts` | `dev` (a simulated provider that logs instead of sending — never sends real email) | Set to `resend` only when `RESEND_API_KEY` and `EMAIL_FROM` below are both also set. See `docs/decisions/0022-real-email-provider-integration.md`. **Production refuses to boot on `dev`/unset** (`lib/startup-check.ts`); the local prod-build test sets `LOCAL_PROD_TEST=1` (playwright.config.ts) to allow it there. |
| `RESEND_API_KEY` | `lib/email-provider.ts` | — | Required only when `EMAIL_PROVIDER=resend`. |
| `EMAIL_FROM` | `lib/email-provider.ts` | — | Required only when `EMAIL_PROVIDER=resend`. |
| `CTF_FLAG_SECRET` | `lib/ctf-flags.ts` (build scripts and E2E only, never the app) | — | Derives every CTF flag. All environments must share the value the committed `public/ctf-artifacts/` and flag-hash migrations were generated with; CI reads it from the `CTF_FLAG_SECRET` repo secret. Rotating it means regenerating artifacts (`npm run ctf:artifacts:verify`) and a new flag-hash migration. |
| `ALIAS_EMAIL_DOMAIN` | `lib/alias-mail.ts` | — (feature off) | Researcher email aliases (`username@<this domain>`), e.g. `alias.netras.ai`. A domain on the Hostinger Email plan whose catch-all is `ALIAS_MAILBOX_USER`. The feature is off until this, `ALIAS_MAILBOX_USER` and `ALIAS_MAILBOX_PASSWORD` are all set. See docs/decisions/0086. |
| `ALIAS_MAILBOX_USER` | `lib/alias-mail.ts` | — | The catch-all mailbox login, e.g. `forwarder@alias.netras.ai`. `workers/alias-mail` reads it over IMAP and sends the forwarded copies from it over SMTP. |
| `ALIAS_MAILBOX_PASSWORD` | `lib/alias-mail.ts` | — | That mailbox password. Secret. |
| `ALIAS_IMAP_HOST` / `ALIAS_SMTP_HOST` | `lib/alias-mail.ts` | `imap.hostinger.com` / `smtp.hostinger.com` | Ports 993 and 465, TLS. |
| `ALIAS_POLL_INTERVAL_MS` | `workers/alias-mail/run.ts` | `30000` | How often the worker checks the mailbox. |
| `ALIAS_EMAIL_BRAND` | `lib/alias-mail.ts` | `Netras` | Shown in a forwarded email sender name ("noreply@shop.com via Netras"). |
| `PERF_TRACE` | `lib/perf-trace.ts` | disabled (no tracing) | Set to `1` to enable temporary server-side latency instrumentation (middleware → auth → DB → render). Diagnostic only, safe to leave unset. |
| `NODE_ENV` | `services/auth.ts`, `components/auth/confirm-email-pending.tsx` | set by the Next.js/Node toolchain itself, not user-configured | Gates `secure` cookie flag and a dev-only "confirm email" shortcut. Never set manually — `next build`/`next start` set this correctly. |

## Standalone outbox worker (`npm run worker:outbox`, `workers/outbox/run.ts`)

A separate process (never imported by `app/`, `actions/`, or `services/`) that polls the
database for outbox events. It also reads `DATABASE_URL` from `lib/env.ts`'s schema (its
own copy of the pool/env-loading logic — `workers/outbox/db-pool.ts` — see that file's
own comment on why it can't share the Next.js app's module). The four vars below are
worker-specific and have no effect on the main app.

| Var | Default when unset | Notes |
|---|---|---|
| `OUTBOX_WORKER_ID` | `worker-<pid>-<random 8 hex chars>` | Only affects log labeling — workers never need to coordinate their own identities (only the database's `locked_by` column does). |
| `OUTBOX_BATCH_SIZE` | `10` | Events claimed per poll cycle. |
| `OUTBOX_LEASE_SECONDS` | `60` | How long a claimed event is leased before another worker may reclaim it. |
| `OUTBOX_POLL_INTERVAL_MS` | `2000` | Delay between poll cycles when no events were claimed. |

## Test/tooling (not application config)

`NODE_ENV`, `CI` (`playwright.config.ts`), and `TZ` (read only inside
`tests/unit/format-date.test.ts`, to prove `formatDateTime`/`toDateOnlyString` are
timezone-independent) are standard Node/CI tooling variables, not something a deployment
needs to set deliberately.

## `.env.example`

Kept in sync with the "Required for boot" and "Optional" tables above — every var
either has a real placeholder value or is commented out with a note on when to
uncomment it. `seed:launch`/`seed:demo` and `worker:outbox` all load `.env.local` via
`--env-file`, not `.env.example` directly.

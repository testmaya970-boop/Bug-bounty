# Unpatched

A bug-bounty and vulnerability-disclosure platform: organizations run programs, researchers submit and get paid for findings, and every report moves through a real triage lifecycle from submission to resolution.

Built on Next.js 15 (App Router) and a standalone, self-hosted PostgreSQL instance — no managed backend-as-a-service. Authorization is enforced primarily at the database layer via Postgres row-level security, not just in application code.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | PostgreSQL 17, accessed via `pg` — no ORM |
| Auth | Opaque, database-backed sessions (HMAC-signed cookie); `argon2` password hashing |
| Authorization | Postgres RLS policies + `SECURITY DEFINER` functions, not client-side checks |
| File storage | S3-compatible object storage (MinIO locally) for evidence and access files |
| Styling | Tailwind CSS v4 |
| Testing | Vitest (unit), Playwright (E2E) |

## Prerequisites

- Node.js 22+
- Docker (for local Postgres + MinIO), or your own PostgreSQL 17 instance and S3-compatible bucket

## Local setup

```bash
# 1. Container secrets (gitignored .env, read by docker compose -- never committed)
printf 'POSTGRES_PASSWORD=%s\nMINIO_ROOT_USER=sentinel_minio\nMINIO_ROOT_PASSWORD=%s\n' \
  "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .env

# 2. Start Postgres and MinIO (both bound to 127.0.0.1 only)
docker compose -f docker-compose.native.yml up -d

# 3. Configure environment
cp .env.example .env.local
# Fill in APP_ORIGIN, DATABASE_URL, SESSION_COOKIE_SECRET, and the S3_* values. S3_* must be
# a scoped app key (not the MinIO root): set S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY, then run
#   bash scripts/storage-app-user.sh
# See docs/env.md for what each variable does and its production implications.

# 3. Install dependencies and apply the schema
npm install
npm run db:migrate   # applies pending db/migrations/ (needs MIGRATION_DATABASE_URL)

# 4. Seed and run
npm run seed:demo   # or seed:launch / seed:e2e — see below
npm run dev
```

For a fresh environment also run `npm run storage:init` with the MinIO root keys once
(creates the evidence bucket); the app's own scoped key cannot create buckets.
Releasing, rollback, backups/restore, and health checks: see [docs/operations.md](docs/operations.md).

### Seed scripts

| Script | Purpose |
|---|---|
| `npm run seed:demo` | General demo dataset for local exploration |
| `npm run seed:launch` | A curated launch-checklist scenario |
| `npm run seed:e2e` | Deterministic, idempotent fixture data the E2E suite depends on |

### Background worker

Outbox-pattern event delivery (notifications, emails) runs as a separate process:

```bash
npm run worker:outbox
```

## Verification

```bash
npm run lint
npm run typecheck
npm test          # unit tests (Vitest)
npm run build
npm run test:e2e  # Playwright, against a real prod build — see docs/launch-qa.md
```

`test:e2e` runs against `next build && next start`, never `next dev` — see `docs/launch-qa.md` for the full release-gate policy, including the deterministic seed reset required before every run.

## Security

- Never commit `.env.local` or any real credential. `.gitignore` already excludes it; `.env.example` is the only tracked template.
- The database connection **must** use a non-superuser, non-`BYPASSRLS` role (`sentinel_app_runtime`, provisioned by `db/init/01-app-role.sql`). A superuser connection silently bypasses every RLS policy regardless of application-level role switching, defeating the authorization model this app relies on.
- Authorization is decided server-side and re-verified at the database on every request. UI visibility is never treated as an authorization boundary.
- See `SECURITY.md` for the full policy and `docs/known-issues.md` for currently disclosed limitations.

## Repository map

```
app/            App Router pages and layouts
components/     UI components (components/ui/ is the shared primitive layer)
services/       Server-side domain logic and authorization rules
actions/        Server Actions — thin validation/error-mapping wrappers over services/
lib/            Cross-cutting utilities: db pool, env validation, auth, storage
db/migrations/  PostgreSQL schema migrations, applied in filename order
db/init/        One-time role/permission setup for a fresh instance
workers/        Standalone background processes (outbox event delivery)
scripts/        One-off and seed scripts, run via tsx/node
types/          Shared TypeScript types
tests/          Unit tests (Vitest)
e2e/            End-to-end tests (Playwright)
docs/           Architecture notes, environment reference, decision records, known issues
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system architecture
- [`docs/env.md`](docs/env.md) — every environment variable, what it does, and production implications
- [`docs/known-issues.md`](docs/known-issues.md) — disclosed limitations, not silently accepted ones
- [`docs/launch-qa.md`](docs/launch-qa.md) — performance budgets and the release gate
- [`docs/decisions/`](docs/decisions/) — architecture decision records
- `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN.md`, `SECURITY.md`, `DOMAIN.md` — standing operating guides for this repository

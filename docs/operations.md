# Operations runbook

Production currently runs on this machine: the native Postgres + MinIO containers
(`docker-compose.native.yml`), a production Next.js build served by `npm run start:prod`,
and the outbox worker (`npm run worker:outbox`). Everything below uses that setup.

## Release

```
npm run release        # 1 backup  2 migrate  3 ensure bucket  4 build into .releases/<id>, make it current
npm run start:prod     # serve the current release (PORT=3000 by default) -- restart it after a release
npm run worker:outbox  # restart the worker too: it runs from the working tree, not a release
npm run releases       # list releases (* = current). The newest 3 are kept.
```

Release ids are `<utc time>-<git commit>`; `-dirty` means there were uncommitted changes, so
that build cannot be reproduced from git alone. Commit first for a clean release.

Before releasing, CI must be green on the commit: `verify` (lint, typecheck, unit tests,
schema built from scratch, RPC-argument check, build) and `release-gate` (the full E2E suite
against a production build with fresh data). No tag or release without it (AGENTS.md).

## Roll back

```
npm run rollback       # point current at the previous release (instant, no rebuild)
npm run start:prod     # restart to serve it
```

Safe because migrations are additive: the previous build runs against the newer schema.
If a **migration** was the problem, restore the backup `npm run release` took just before
migrating (next section).

## Restore the database

```
npm run db:restore -- backups/<file>.dump sentinel_restored   # always a NEW database
```

Check it, then point `DATABASE_URL` / `MIGRATION_DATABASE_URL` at `sentinel_restored` and
restart `start:prod` and the worker. The script refuses to restore over an existing
database -- recovery never overwrites data in place.

## Backups (scheduled)

| Task (Windows Task Scheduler, `\Unpatched\`) | When | Does |
|---|---|---|
| Nightly DB backup | daily 02:00 | `npm run db:backup` -- keeps the newest 14 dumps in `backups/` |
| Weekly restore drill | Sunday 03:00 | `npm run db:backup:verify` -- restores into a scratch DB and compares every table's row count |

Both run `scripts/scheduled-backup.cmd`, allowed on battery and caught up after sleep, and log
every run with its exit code to `backups/backup.log`. Docker must be running. Check a
task: `Get-ScheduledTaskInfo -TaskPath "\Unpatched\" -TaskName "Nightly DB backup"`.
Remove both: `Unregister-ScheduledTask -TaskPath "\Unpatched\" -TaskName "*" -Confirm:$false`.

A failed or empty `pg_dump` is now deleted and exits 1 (it used to leave a 0-byte file that
retention counted as a backup). `npm run db:backup:check` exits 1 when the newest valid dump
is older than 48h (`BACKUP_MAX_AGE_HOURS`) -- run it from whatever alerts you (it does not
send anything itself).

`backups/` is on the same disk as the database -- copy it somewhere else (another drive or
cloud storage) for real disaster protection.

## Is it healthy?

- `GET /api/health` -- `ok` / `degraded` (storage unreachable, worker not draining, or events
  dead-lettered in the last 24h) / `down` (503, database unreachable). No login needed.
- `/platform/errors` -- every server and browser error, grouped (platform admins).
- `/platform/needs-recovery` -- dead-lettered outbox events, with replay (platform admins).

## Startup refuses bad configuration

`start:prod` exits with code 1 and names the problem if a required setting is missing or
invalid, or (in production) still holds a `.env.example` placeholder such as `your-password`.

## Test accounts never belong in production

`seed:e2e`, `seed:demo` and `seed:launch` create accounts whose passwords are in the
source code -- `seed:e2e` includes a **platform admin**. They refuse to run unless
`ALLOW_TEST_ACCOUNTS=1` is set, and should only ever target a test database (CI builds its
own). Run the E2E release gate against a separate database, never the production one.

## Not in place yet (belongs to the hosting decision)

HTTPS + HSTS (terminate TLS in front of the app), several app processes behind a load
balancer (one `next start` is CPU-bound under load -- see docs/launch-qa.md), uptime alerting
on `/api/health`, and off-machine backup copies.

# Unpatched Platform

An original vulnerability-disclosure and bug-bounty platform. This repository currently contains the Phase 1 foundation only; it does not yet implement program, report, payout, or dashboard workflows.

## Prerequisites

- Node.js 22 or newer
- A Supabase project (PostgreSQL + Auth)
- Supabase CLI, if applying migrations locally

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the three Supabase values.
2. Install dependencies with `npm install`.
3. Apply the migrations in `supabase/migrations/` in order (through the Supabase CLI or SQL editor). After applying a migration that adds or changes a Postgres function/table, reload PostgREST's schema cache (`select pg_notify('pgrst', 'reload schema');` on a self-hosted instance; hosted Supabase does this automatically).
4. Run `npm run dev`.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. E2E scaffolding exists through `npm run test:e2e`; it requires a running application and real test configuration before scenarios are added.

## Security notes

Do not commit `.env.local` or service-role credentials. The service-role key is server-only and bypasses RLS, so future code must minimize and isolate its use. All sensitive operations must authenticate and authorize on the server; UI visibility is not authorization.

## Repository map

- `app/` — App Router UI
- `lib/` — environment and integration utilities
- `services/` — server-side domain and authorization rules
- `supabase/migrations/` — PostgreSQL schema migrations
- `tests/` and `e2e/` — automated tests
- `docs/` — architectural decisions

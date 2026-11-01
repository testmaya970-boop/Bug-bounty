# Unpatched Architecture

## Architecture stance

Unpatched begins as a modular monolith: a Vercel-compatible Next.js application backed by PostgreSQL/Supabase. This minimizes operational burden while retaining clear boundaries that can later support workers or separate services where measured scale requires them. `docs/architecture.md` records the Phase 1 implementation details; this document is the governing architectural direction.

```text
Browser
  ↓
Next.js application (UI, route handlers, server actions)
  ↓
Application services → domain logic → data access
  ↓
PostgreSQL / Supabase
  ↓
Workers, queue, object storage, external services (when justified)
```

The UI is never an authorization source. Business rules live in reusable server-side application/domain services, not duplicated across pages.

## Stack and boundaries

- **UI:** Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui only where it helps maintain accessible primitives.
- **Data:** PostgreSQL-first design through Supabase; constraints and RLS express invariant/tenant rules.
- **Infrastructure:** Vercel-compatible deployment, Cloudflare-compatible edge/security controls, GitHub CI, private object storage, and a Redis/queue layer only for workloads that cannot safely complete in a request.
- **Observability:** structured logs without secrets, error monitoring, audit events, and privacy-conscious analytics.

Boundaries are: UI for presentation; application services for use cases and authorization orchestration; domain logic for rules/state machines; data access for persistence; infrastructure for Supabase, storage, queues, and external clients.

## Deployment and operations

Environment values are schema-validated and secrets remain server-only. Supabase Auth provides sessions and PostgreSQL data; object storage must use authorization checks before issuing constrained access. Background jobs, notification delivery, caching, and integrations are deferred until a concrete workload demonstrates their need. CI runs lint, type checks, tests, and production builds. Tests grow from units and authorization cases to integration and Playwright E2E coverage.

## Scaling and economic rule

Prefer managed, measurable, boring infrastructure; optimize queries and schema before adding caches; add a worker, queue, or service only with a documented reliability, performance, isolation, or cost reason. Each addition must state its operational owner, failure mode, observability, and financial justification.

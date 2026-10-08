# 0082 — Jira Cloud two-way integration (API token per organization)

Status: accepted, 2026-10-01. Supersedes the "Jira — P3, not now" deferral in 0025 / 0026 / 0074:
the user asked for it explicitly (AGENTS.md §2: current task requirements outrank an existing doc).

## Decision

- **Auth model:** HackerOne/Bugcrowd style. Each organization pastes its own Jira Cloud site URL,
  account email and API token into Organization Settings → Integrations. Unpatched calls Jira REST
  v3 with HTTP Basic `email:token`. No Atlassian Connect / OAuth 3LO app, no marketplace listing.
- **Outbound (Unpatched → Jira):** one new outbox consumer (`workers/outbox/handlers/jira/`) on the
  existing `report.*` events. New report → issue; final decisions (resolved / duplicate /
  informative / not applicable / rejected) → move the issue into the **Done status category**
  via whatever transition the workflow offers; every status event and every report message → a
  Jira comment. Non-final states never move the Jira status (engineering owns its workflow).
- **Inbound (Jira → Unpatched):** `POST /api/webhooks/jira/<organizationId>`, authenticated by
  Jira's `X-Hub-Signature: sha256=HMAC(secret, body)`, secret generated server-side and shown
  once. "Issue moved to Done" (with a fix-type resolution) on a linked **accepted** report calls
  the existing `resolve_report` RPC as the member who connected Jira. Nothing else maps inbound.
- **Secrets:** token and webhook secret are both encrypted with the existing
  `private.encrypt_sensitive_field` (pgcrypto, `app.settings.kyc_encryption_key`). Only the
  token's last 4 characters are ever shown back. Decryption happens only in the service-role-only
  `get_jira_credentials` RPC, at dispatch time; outbox payloads carry ids only.

## Why these shapes

Rationale, tradeoffs and residual gaps are in the migration header
(`db/migrations/202610010001_jira_integration.sql`), the consumer header
(`workers/outbox/handlers/jira/jira-sync-handler.ts`) and the route header
(`app/api/webhooks/jira/[organizationId]/route.ts`). In short: the site URL is pinned to
`*.atlassian.net` (SSRF), site changes need disconnect + reconnect (issue ids belong to a site),
the receipt is written after the Jira calls (no lost syncs), and the webhook path is excluded
from the session proxy by PATH, never by header (AGENTS.md security-gates rule).

## Not verified live

No real Jira Cloud site was available. Request/response shapes are unit-tested against
Atlassian's published OpenAPI examples; the settings UI, RPCs, encryption, webhook signature
check and the inbound resolve were tested live (e2e/jira-integration.spec.ts) with a signed
webhook the test produced itself. A first real connection should be smoke-tested by hand.

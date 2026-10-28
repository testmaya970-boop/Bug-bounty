# 0090: Organization integrations

Date: 2026-10-29. Migrations 202610290001 to 202610290007. Plan: docs/plans/organization-integrations.md.

## Built

| Module | What it does | Where |
|---|---|---|
| Outbound webhooks | Event subscriptions (15 event types), per-program filter, Standard Webhooks signatures, secret rotation with 24 h overlap, retries with backoff (1 m to 24 h, 8 attempts), delivery log, manual replay, test send, auto-disable after 5 failed deliveries or a 410 | Integrations, Webhooks |
| Slack / Teams | Alerts for new reports, critical findings, status changes and SLA breaches (new `report.sla_breached` events from a worker scan); Slack app install (OAuth, incoming-webhook) or a pasted Slack webhook; Teams Workflows URL | Integrations, Slack and Teams |
| Post-award bonuses | Proposed by finance staff; approved by a different owner or security admin, or by platform staff; approval creates split obligations (collaborators floored, remainder to the submitter) funded from the balance and budget, with the existing fee and payout-time withholding; idempotency key; at most the bounty, five per report; no reputation effect | Report page, Payments queue, researcher payouts labelled "Bonus" |
| GitHub / GitLab | GitHub App (installation verified with the installer's OAuth code) or GitLab token; private repository per program; "Create issue" for accepted reports (re-checks privacy first; GitLab issues confidential); closing the report closes the issue; closing the issue resolves an accepted report via `resolve_report`; a repository made public is unlinked | Integrations, GitHub and GitLab; report page |
| ServiceNow | Customer instance (`*.service-now.com`), integration user, `incident` or `sn_si_incident`; ticket for accepted reports; work note on close and incident resolution; Business Rule script for the reverse direction | Integrations, ServiceNow; report page |
| SAML SSO / SCIM | SP-initiated SAML on verified domains (signed assertions, audience, InResponseTo, replay cache), JIT accounts, group-to-role mapping (never owner), enforcement with owner break-glass, MFA still applies; SCIM 2.0 Users (list/filter, create, get, PUT, PATCH, DELETE); deprovision suspends membership and ends sessions | Integrations, Single sign-on; sign-in page "Sign in with SSO" |

## Security rules

- One outbound HTTP client (`lib/integrations/safe-fetch.ts`) for every customer-supplied URL. It allows https only on ports 443 and 8443, with no credentials in the URL.
- That client blocks private, loopback, link-local, CGNAT and metadata ranges, for IPv4 and IPv6 including mapped addresses.
- The client checks resolved addresses at connect time (defeating DNS rebinding) and follows no redirects. Chat URLs are additionally restricted to Slack or Microsoft hosts, and ServiceNow URLs to ServiceNow hosts.
- Secrets (signing secrets, chat URLs, GitLab tokens, ServiceNow passwords) are encrypted with the existing `encrypt_sensitive_field`. They are never selectable by `authenticated` and are shown once. SCIM tokens are stored as SHA-256 hashes.
- Payloads and alerts carry title, status, severity, program and a link, never the report body. Vulnerability details go only to private repositories and to the customer's own ServiceNow.
- Inbound webhooks (GitHub HMAC, GitLab token, ServiceNow token) are checked in constant time before anything is parsed.
- Researcher accounts can never join an organization through SSO or SCIM.

## Customer-owned configuration (no paid broker)

- **Slack**: optional platform Slack app (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`); otherwise each workspace's own incoming webhook.
- **Teams**: Microsoft 365 with Power Automate Workflows.
- **GitHub**: a platform GitHub App (see `.env.example`); customers install it.
- **GitLab**: gitlab.com or a self-managed instance reachable from Unpatched, with a project or group access token (api scope, Reporter or above).
- **ServiceNow**: the customer's own subscription. Security Incident Response is a separately licensed ServiceNow product. They also need an integration user, plus the system property and Business Rule for the reverse sync.
- **SSO**: any SAML 2.0 identity provider, plus a verified email domain. SCIM needs the IdP's SCIM 2.0 client.

## Limitations

- Single logout is not implemented.
- SCIM Groups are not supported; roles come from SAML attributes instead.
- Webhook delivery is at least once (receivers dedupe on `webhook-id`), with no ordering guarantee.
- If GitHub or GitLab created an issue but recording the link then failed, a retry can create a second issue. This is the same disclosed gap as Jira.

# Organization integrations: requirements and plan

Status: built 2026-10-29; see docs/decisions/0090-organization-integrations.md for what shipped and its limits.

Six modules close most of the remaining organization-side gap against HackerOne and Bugcrowd:

- SSO/SAML
- Slack and Microsoft Teams alerts
- GitHub and GitLab
- ServiceNow
- Outbound webhooks
- Post-award bonuses

Each section below covers the module's purpose, what it needs, the changes it makes across
the stack, its third-party requirements, and how to build and test it.

## What already exists and is reused

| Existing piece | Where | Reused by |
|---|---|---|
| Per-organization connection with an encrypted credential, a status panel and an inbound webhook | Jira (decision 0085): `services/jira.ts`, `workers/outbox/handlers/jira`, `/api/webhooks/jira/[organizationId]` | GitHub, GitLab, ServiceNow, Slack, Teams |
| Encryption of secrets at rest | `extensions.pgp_sym_encrypt` with `private.sensitive_field_encryption_key()` | Every module that stores a token or secret |
| Reliable background delivery with retries and dead letters | `outbox_events` and the outbox worker (`workers/outbox`) | Webhooks, Slack, Teams, GitHub, GitLab, ServiceNow |
| Integration call and webhook log | `integration_events`, `logIntegrationEvent()` | All |
| Health view for platform staff | Platform → Integrations (`services/integrations.ts`) | All |
| Verified email domains per organization | `organization_domains` (DNS TXT, 202610260008) | SSO (domain claim) |
| Sessions, MFA, rate limits | `lib/auth/session.ts`, `sessions`, TOTP and backup codes | SSO |
| Money: award, prepaid balance, fee, withholding, payout | `report_bounty_decisions`, `payment_obligations`, `create_payment_obligation`, providers | Bonuses |
| Roles | `has_org_role(owner, security_admin, ...)` | Every settings screen: owner and security admin only |

Every external module follows the established provider convention: chosen by env as
`none | sandbox | <provider>`. Sandbox works off production, and nothing reports "connected"
unless the provider actually confirmed it.

---

## 1. SSO / SAML

**Purpose.** Organizations sign their members in through their own identity provider (Okta,
Microsoft Entra ID, Google Workspace, OneLogin, JumpCloud) instead of Unpatched passwords. This
is the first thing enterprise security teams ask for.

**Key features**
- SAML 2.0 SP-initiated sign-in; IdP-initiated is optional and off by default.
- OIDC as a second protocol: simpler for Google Workspace and Entra ID.
- Domain claim: SSO applies to emails on the organization's verified domains (`organization_domains`).
- Enforcement modes: optional, or required for members of this organization. Passwords are then
  refused for those emails, with an owner break-glass account kept.
- Just-in-time provisioning: first SSO sign-in creates the account and membership with a default
  role. Optional group-to-role mapping from a SAML attribute.
- SCIM 2.0 provisioning is a later phase: automatic deprovisioning when someone leaves the company.

**Technical requirements and dependencies**
- `@node-saml/node-saml` (MIT) for SAML; `openid-client` (MIT) for OIDC. Both are maintained and need no license.
- An alternative is a hosted broker (WorkOS, Auth0 or Stytch). It is faster to ship, but it is a
  paid subscription, usually priced per connection.

**APIs, credentials, configuration**
- Per organization: IdP metadata XML or URL, entity ID, SSO URL, signing certificate (SAML); or
  issuer URL, client ID and secret (OIDC).
- Unpatched publishes, per connection:
  - ACS URL `/api/sso/saml/<connectionId>/acs`;
  - SP entity ID;
  - SP metadata `/api/sso/saml/<connectionId>/metadata`;
  - OIDC redirect URI.
- Env: `SSO_SP_SIGNING_KEY` and `SSO_SP_CERT` (to sign AuthnRequests), and `SSO_ENABLED`.

**Changes**
- Database:
  - `sso_connections` (org, protocol, encrypted config, status draft/active, enforcement, default role);
  - `sso_identities` (user ↔ IdP subject, unique per connection);
  - `sso_replay_cache` (assertion IDs, so one assertion can't be used twice);
  - RPCs for owner/security-admin management;
  - service-role-only RPCs to complete a login.
- Backend:
  - `lib/auth/sso.ts`: build the request, validate the response (signature, audience, recipient,
    NotBefore/NotOnOrAfter with clock skew, InResponseTo, replay);
  - create a session through the existing session code (`aal` decided by policy);
  - a sign-in page step that asks for the email and routes to SSO by domain.
- Frontend:
  - Organization Settings → Security → SSO: wizard (metadata upload, test connection, activate, enforce);
  - a "Continue with SSO" path on sign-in.
- Security:
  - reject unsigned assertions and accept only the configured certificate;
  - pin `Destination` and `Audience`;
  - claim only verified domains;
  - never auto-link to an existing password account without proof (require a password or email
    code once to link);
  - keep the platform admin MFA rule (SSO must not bypass it);
  - audit-log every configuration change.

**Third-party services and licensing.** None for the library route. Customers use their own IdP
subscription. Testing uses free developer tenants (Okta Developer, an Entra ID free tenant) and
a local mock IdP.

**Implementation steps**
1. Schema and RPCs.
2. SAML validation library wrapper with unit tests on real signed fixtures.
3. Login flow and session creation.
4. Settings wizard and test-connection button.
5. Enforcement and break-glass.
6. OIDC.
7. SCIM, as a later phase.

**Limitations**
- Single logout (SLO) is unreliable across IdPs. Scope it as "sign out of Unpatched" only.
- Researchers never use SSO; it is organization accounts only.

**Testing**
- Unit: signature wrapping attack fixtures, expired or replayed assertions, wrong audience.
- DB: role and RLS on the connections.
- E2E: a mock IdP (`saml-idp` npm package, run locally) for full sign-in, enforcement refusing a
  password, and break-glass.

**Complexity: high.** About 12–15 dev-days for SAML, OIDC and enforcement, plus 6–8 for SCIM.
**Prerequisites:** verified domains (done); a decision on whether to build with the library or
buy a broker.

---

## 2. Slack and Microsoft Teams alerts

**Purpose.** Report and payment events reach the security team where they already work.

**Key features**
- Per organization, connect a channel and choose events:
  - new report;
  - report needs a response;
  - severity critical or high;
  - SLA about to breach;
  - comment from the researcher;
  - bounty awarded;
  - payout failed.
- Per-program filters.
- Messages link back to the report and never contain report content beyond title, severity and status.
- "Send test message", plus the delivery log.

**Technical requirements and dependencies**
- **Slack:**
  - a Slack app using OAuth v2 with scope `chat:write`, plus optional `channels:read` for a
    channel picker;
  - messages via `chat.postMessage` with Block Kit;
  - a simpler v1 is the customer pasting an Incoming Webhook URL, which needs no app review.
- **Microsoft Teams:** Microsoft has retired the old Office 365 Connectors. Supported routes are:
  - a Workflows (Power Automate) webhook URL, where the customer creates it and pastes it (simplest);
  - a Teams bot via Azure Bot Service, which needs an Azure app registration and a Teams app
    manifest (heavier).

  Start with the Workflows webhook.
- No new npm dependency is needed; `fetch` is enough.

**APIs, credentials, configuration**
- Slack app (only if doing OAuth): client ID and secret, signing secret, redirect URL
  `/api/integrations/slack/callback`. Env: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
  `SLACK_SIGNING_SECRET`.
- Per organization: encrypted bot token or webhook URL, channel, chosen events.

**Changes**
- Database: `chat_connections` (org, provider slack/teams, encrypted target, channel name,
  events[], program filter, status) and `chat_deliveries` (event, outcome, error, attempt).
- Backend:
  - one outbox handler per provider (same pattern as Jira);
  - message builders per event type;
  - Slack's 429 `Retry-After` honoured by the worker's backoff;
  - Teams Adaptive Card payload.
- Frontend: Organization Settings → Integrations → Slack / Teams cards with connect, event
  checkboxes, test and log.
- Security:
  - webhook URLs are secrets (encrypted, shown masked);
  - only https to `hooks.slack.com` or Microsoft domains (allowlist, which also stops SSRF);
  - no report body or attachments in messages.

**Third-party services and licensing.** Slack app creation is free. A public Slack Marketplace
listing is optional and needs Slack's review. Teams Workflows is included with Microsoft 365.
The bot route needs an Azure subscription; its free tier is enough.

**Implementation steps**
1. Tables and settings UI with a pasted webhook URL for both providers.
2. Outbox handlers, message templates and test send.
3. Slack OAuth app (channel picker, no URL pasting).
4. Optional Teams bot.

**Limitations**
- Webhook URLs can be revoked by the customer silently. Detect 404 or 410 and mark the connection broken.
- Neither route can reach private channels unless invited.

**Testing**
- Unit: payload builders, redaction.
- Worker tests with a fake HTTP server: retry and backoff, 410 disables.
- E2E with the sandbox provider (records messages instead of sending).
- A manual check against a real test workspace and tenant.

**Complexity: medium.** About 5–7 dev-days for the webhook-URL version of both, plus 3 for Slack
OAuth and 5 for a Teams bot.
**Prerequisites:** none; it is the easiest start. Building outbound webhooks (module 5) first
lets these reuse its delivery engine.

---

## 3. GitHub and GitLab

**Purpose.** Turn a validated report into an issue in the organization's own repository, keep it
in step with the report, and link scope assets to repositories. This mirrors the existing Jira
two-way flow.

**Key features**
- Connect an organization or installation, then choose a default repository per program.
- "Create issue" from the report (or automatically on Accepted), using a private-repository
  check and a template with severity, CVSS, steps and a link back.
- Two-way sync:
  - the issue is closed by a merged PR or manually, so the report is offered for resolution;
  - report resolved, so a comment is posted on the issue.
- Repository links on `source_code` scope assets, plus a link list on the report.

**Technical requirements and dependencies**
- **GitHub:** a GitHub App (preferred over OAuth tokens). It gets short-lived installation tokens
  and fine-grained permissions:
  - Issues: read & write;
  - Metadata: read;
  - optionally Pull requests: read.

  Webhooks are signed with `X-Hub-Signature-256` (HMAC SHA-256). The libraries `@octokit/app` and
  `@octokit/webhooks` are optional; raw `fetch` with a JWT (RS256 with the app's private key) works.
- **GitLab:** gitlab.com and self-managed instances. Connect by OAuth application (scope `api`) or
  a project or group access token (role Reporter or above for issues). Webhooks carry the
  `X-Gitlab-Token` shared secret. A self-managed GitLab needs its base URL and must be reachable
  from Unpatched.

**APIs, credentials, configuration**
- GitHub app ID, private key (PEM), webhook secret and app slug. Env: `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`.
- GitLab application ID and secret (OAuth), or a per-organization token, plus the instance URL.
- Per-organization records: installation ID or GitLab URL and encrypted token, plus the program →
  repository mapping.

**Changes**
- Database:
  - `code_host_connections` (org, provider, installation or url, encrypted token, status);
  - `program_repositories` (program → repo);
  - `report_issue_links` (report ↔ issue URL, number, state);
  - the same RPC and RLS model as the Jira tables.
- Backend:
  - adapters per provider (create issue, comment, close);
  - outbox handlers;
  - inbound webhook routes `/api/webhooks/github` and `/api/webhooks/gitlab/[organizationId]`
    with signature checks and idempotency on delivery ID.
- Frontend:
  - Integrations cards (Install GitHub App, Connect GitLab);
  - a repository picker per program;
  - a "Create issue" control and issue state on the report.
- Security:
  - refuse creating an issue in a public repository (it would disclose an unfixed vulnerability);
  - least-privilege permissions;
  - verify every webhook;
  - tokens encrypted;
  - an installation can only touch the organization that installed it.

**Third-party services and licensing.** GitHub Apps and GitLab OAuth apps are free. GitHub
Marketplace listing is optional. Customers use their own GitHub or GitLab plans; self-managed
GitLab is the customer's license.

**Implementation steps**
1. GitHub App registration and installation callback.
2. Repository mapping.
3. Create issue.
4. Webhook sync.
5. GitLab adapter on the same interfaces.
6. Scope asset links.

**Limitations**
- A self-managed GitLab behind a firewall can't send webhooks to us, so polling becomes the fallback.
- Issue-to-report status mapping needs a per-organization choice of what "closed" means.

**Testing**
- Unit: signature verification and payload mapping on recorded webhook fixtures.
- Integration against a GitHub test organization and a gitlab.com test group.
- E2E with sandbox adapters.

**Complexity: medium.** About 8–10 dev-days for GitHub, then 4–5 for GitLab on the same interfaces.
**Prerequisites:** Jira patterns (done); a decision on whether issue creation is manual or automatic.

---

## 4. ServiceNow

**Purpose.** Organizations that run security work in ServiceNow get incidents (or Security
Incident Response / Vulnerability Response records) created and kept in sync from Unpatched reports.

**Key features**
- Connect an instance and choose the target table:
  - `incident` (any instance);
  - `sn_si_incident` (SecOps Security Incident Response);
  - `sn_vul_vulnerable_item` (Vulnerability Response).
- Field mapping (priority from severity, assignment group, category).
- Create a record on Accepted (or manually) and link it on the report.
- Two-way: record resolved or closed in ServiceNow means the report is offered for resolution;
  report updates add work notes.

**Technical requirements and dependencies**
- ServiceNow REST Table API (`/api/now/table/<table>`).
- Authentication by OAuth 2.0: an OAuth application registry entry in the customer's instance,
  with a client-credentials or password grant depending on instance version. Basic auth with a
  dedicated integration user is a fallback.
- Inbound updates need a Business Rule plus an Outbound REST Message in the customer's instance,
  posting to `/api/webhooks/servicenow/[organizationId]` with a shared secret. Polling is the
  fallback.
- An Update Set or scoped app is shipped for customers to import. A ServiceNow Store listing is
  optional and needs ServiceNow's certification.

**APIs, credentials, configuration**
- Per organization:
  - instance URL;
  - client ID and secret, or an integration user (roles: `itil` for incident, `sn_si.analyst`
    for SIR, `sn_vul.vulnerability_analyst` for VR);
  - target table, field mapping, webhook shared secret.

**Changes**
- Database: `servicenow_connections` (encrypted credentials, table, mapping) and
  `report_servicenow_links` (sys_id, number, state).
- Backend: adapter (OAuth token cache, create, update, add work note), outbox handler, inbound
  webhook route with a secret check and sys_id idempotency.
- Frontend: Integrations card with the instance URL, a credentials test, the table choice and a
  field-mapping form; the linked record on the report.
- Security:
  - instance URL restricted to `*.service-now.com` (or an explicit allowlist for custom domains)
    to stop SSRF;
  - credentials encrypted;
  - least-privilege roles documented.

**Third-party services and licensing.** The customer must own a ServiceNow subscription. SIR
and VR are separately licensed ServiceNow products. Unpatched development uses a free ServiceNow
Personal Developer Instance (PDI).

**Implementation steps**
1. Incident table with Basic or OAuth auth.
2. Field mapping.
3. Inbound Business Rule package (Update Set) and webhook.
4. SIR and VR tables.
5. Optional Store app.

**Limitations**
- Every instance is customized, so mapping must be configurable.
- Inbound updates need the customer's ServiceNow admin to import our Update Set.

**Testing**
- Unit: mapping and signature checks.
- Integration against a PDI (scripted reset).
- E2E with a sandbox adapter.

**Complexity: medium-high.** About 8–12 dev-days, more with SIR or VR.
**Prerequisites:** the outbox and Jira patterns (done); access to a PDI.

---

## 5. Outbound webhooks

**Purpose.** Any external system (SIEM, SOAR, internal tools) receives signed, reliable event
notifications. This is also the delivery engine modules 2–4 can share.

**Key features**
- Per organization: endpoints (URL, description, event types, program filter, active or paused).
- Event catalog with versioned payloads:
  - `report.created`, `report.status_changed`, `report.comment_added`, `report.severity_changed`;
  - `bounty.awarded`, `bounty.bonus_awarded`;
  - `payout.succeeded`, `payout.failed`;
  - `program.updated`, `scope.changed`.
- Signing by the Standard Webhooks spec (`webhook-id`, `webhook-timestamp` and
  `webhook-signature` HMAC-SHA256), with secret rotation (two valid secrets during overlap).
- Retries with exponential backoff (for example 8 attempts over about 24 hours), then disable
  and email the owner.
- A delivery log with request and response, plus manual redeliver.
- "Send test event".
- Payload privacy: IDs, titles, status and severity by default; report body only if the endpoint
  is explicitly granted it.

**Technical requirements and dependencies.** None external. It uses the existing outbox worker
(new handler `webhook-deliver`). The optional npm package `standardwebhooks` handles signing;
the same can be done with `node:crypto`.

**APIs, credentials, configuration**
- Per endpoint secret (`whsec_…`), stored encrypted and shown once on creation.
- Env: `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_TIMEOUT_MS`.
- The existing API tokens (`/api/v1`) are documented as the way receivers fetch full objects.

**Changes**
- Database:
  - `webhook_endpoints`;
  - `webhook_deliveries` (event, endpoint, attempt, status code, duration, next attempt);
  - triggers or outbox fan-out for each event type;
  - RLS limited to owner and security admin.
- Backend:
  - delivery handler with a 10-second timeout and response size limit;
  - signing;
  - backoff schedule;
  - auto-disable;
  - **SSRF protection**: https only, resolve DNS and refuse private, loopback, link-local and
    metadata ranges, re-check after redirects (or don't follow redirects), block non-standard ports.
- Frontend: Organization Settings → Webhooks (endpoints list, create with event checkboxes, a
  reveal-once secret, rotate, test, delivery log with redeliver); developer docs page with
  payload examples and verification code.
- Security: SSRF guard (critical); secrets encrypted; payload minimization; rate limits per
  endpoint; audit log of endpoint changes.

**Third-party services and licensing.** None.

**Implementation steps**
1. Tables and RPCs.
2. Event fan-out from the existing domain events.
3. Delivery worker with signing, retries and SSRF guard.
4. UI and log.
5. Docs.

**Limitations**
- At-least-once delivery, so receivers must dedupe on `webhook-id`. This is documented.
- Ordering is not guaranteed across events.

**Testing**
- Unit: signature generation against spec vectors; SSRF guard on IPv4/IPv6 and DNS rebinding cases.
- Worker tests with a local receiver: retries, disable, redeliver.
- DB: RLS and roles.
- E2E: create an endpoint, trigger a report event, see a signed delivery at a local test receiver.

**Complexity: medium.** About 6–8 dev-days.
**Prerequisites:** none. **Recommended first**, since 2–4 reuse it.

---

## 6. Post-award bonuses

**Purpose.** After a bounty is awarded, the organization can pay an extra amount: exceptional
report quality, a fast fix-verification, a retest, or a campaign multiplier. Today
`adjust_bounty` only changes the finalized amount before payout, so it is a correction, not a bonus.

**Key features**
- "Award bonus" on a report with a finalized bounty:
  - amount;
  - reason category (quality, retest, campaign, other);
  - note to the researcher (required).
- Optional program-level bonus rules, as a later phase (for example +10% for critical reports in
  a date range), always applied manually or confirmed by a person.
- Splits follow the report's accepted collaborators (same floor-and-remainder rule as the bounty).
- Researchers see each bonus separately in Bounties, receipts and tax documents.
- Each bonus gets its own payment obligation, prepaid-balance debit, platform fee and withholding,
  through exactly the existing payout pipeline.
- Limits: a cap per bonus (for example ≤ 100% of the bounty, or the program's policy maximum)
  unless an owner confirms; bonuses can't be edited once paid, only refunded through support.

**Technical requirements and dependencies.** None external. It uses the existing payout
providers (RazorpayX, PayPal) and the prepaid balance.

**APIs, credentials, configuration.** Org roles: owner and security admin award; billing admin
pays (existing split of duties). The env cap is optional, `BONUS_MAX_MULTIPLIER`.

**Changes**
- Database:
  - `report_bonuses` (report, decision, amount minor units, currency equal to the bounty's, reason,
    note, created_by, status awarded or cancelled);
  - `payment_obligations` gains `bonus_id` (nullable, unique), relaxing the
    one-obligation-per-decision-per-researcher rule for bonus rows only;
  - an `award_bonus` RPC that, in one transaction, checks the role, cap, balance and that the report
    is not suspended or fraudulent, inserts the bonus, fans out obligations to collaborators and
    debits the balance;
  - notification type `bounty_bonus_awarded`;
  - reputation fact optional (decide whether bonuses affect reputation).
- Backend: services and actions; receipts and annual and tax documents include bonus lines; TDS
  withholding applies at payout as today.
- Frontend:
  - Award bonus dialog on the report (organization);
  - bonus lines in Payments (organization) and Bounties (researcher);
  - the notification.
- Security and integrity:
  - minor-unit integer math only;
  - idempotency key per bonus;
  - one transaction for balance debit and obligation creation;
  - audit log;
  - billing admins can't award (only pay), keeping the existing segregation of duties.

**Third-party services and licensing.** None beyond the existing payout providers.

**Implementation steps**
1. Schema and the `award_bonus` RPC with DB tests (money paths first).
2. Obligation fan-out and balance.
3. UI.
4. Documents and receipts.
5. Notifications and webhooks event.
6. Optional rules.

**Limitations**
- Tax: a bonus is income like a bounty, so withholding and annual statements must include it. That
  is handled by the existing pipeline, but finance should confirm.
- Currency is the same as the original bounty.

**Testing**
- DB:
  - cap, balance, role checks;
  - collaborator split rounding (minor units, remainder to the submitter);
  - idempotency;
  - no change after payment.
- Unit: document line rendering.
- E2E: award a bonus, then pay it, then the researcher sees it and its receipt.

**Complexity: medium.** About 5–7 dev-days. It touches money, so it gets the deepest tests.
**Prerequisites:** a finance and tax sign-off on how bonuses appear on statements and whether
they count toward reputation.

---

## Summary

| Module | Complexity | Effort (dev-days) | External requirement | Prerequisites |
|---|---|---|---|---|
| Outbound webhooks | Medium | 6–8 | None | None |
| Slack / Teams alerts | Medium | 5–7 (+3–5 for OAuth or bot) | Slack app; Teams Workflows or Azure bot | Webhooks engine (recommended) |
| Post-award bonuses | Medium | 5–7 | None | Finance and tax sign-off |
| GitHub / GitLab | Medium | 12–15 | GitHub App; GitLab OAuth app | Jira pattern (done) |
| ServiceNow | Medium-high | 8–12 | Customer's ServiceNow; PDI for development | Jira and outbox pattern (done) |
| SSO / SAML (+ SCIM) | High | 12–15 (+6–8 for SCIM) | Customer's IdP; optional paid broker | Verified domains (done); build-or-buy decision |

Recommended order:

1. Webhooks, the shared delivery engine.
2. Slack and Teams.
3. Bonuses.
4. GitHub and GitLab.
5. ServiceNow.
6. SSO.

SSO moves first if an enterprise deal depends on it.

Decisions needed before starting:

1. SSO: build with open-source libraries, or buy a broker (WorkOS, Auth0 or Stytch)?
2. Teams: Workflows webhook URL only, or a full Teams bot?
3. GitHub, GitLab and ServiceNow: create issues or records manually per report, or automatically on Accepted?
4. Bonuses: cap rule, and do they count toward reputation?

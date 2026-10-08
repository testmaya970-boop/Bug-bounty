# 0086 — Researcher email aliases (Mailgun inbound, Hostinger DNS)

Status: accepted (2026-10-08) · Migrations: `202610080001_researcher_email_aliases.sql`,
`202610080002_email_alias_retries.sql`

## Decision

Every researcher can create one alias, `<username>@<ALIAS_EMAIL_DOMAIN>` (e.g.
`alice@alias.netras.ai`), like HackerOne's `@wearehackerone.com` and Bugcrowd's
`@bugcrowdninja.com`, for registering test accounts on program targets.

- **DNS stays at Hostinger.** Only the alias *subdomain*'s MX/TXT/CNAME records point at
  Mailgun, so the main domain's mail is untouched.
- **Inbound:** a Mailgun route (`match_recipient(".*@alias.netras.ai")` →
  `forward("https://<app>/api/inbound/email")` + `stop()`) POSTs each message. The route is
  session-less (excluded from `proxy.ts` by path) and gated by Mailgun's HMAC signature.
- **Forwarding:** sent through Mailgun's messages API from the alias domain (so SPF/DKIM/
  DMARC align), with the original sender in the display name and `Reply-To`. The
  researcher's real address is never shown to the sender.
- **Rules:** researcher accounts only; one stable alias per researcher (lower-cased
  username, numeric suffix on collision); `+tags` accepted and ignored; suspended or
  deactivated accounts stop forwarding; 200 forwards per alias per 24 h; mail from the
  alias domain itself is never forwarded (loop guard); attachments up to 20 MB.
- **Reliability:** every delivery is logged (`email_alias_forwards`, visible to the
  researcher). Mailgun's token is single-use (replay protection), but a delivery that
  failed temporarily is retried on Mailgun's retry with the same token rather than
  dropped (202610080002). The signature window is 24 h to fit Mailgun's retry schedule.
- **Status codes** follow Mailgun's contract: 200 handled, 406 refused for good (no
  retry), 401 bad signature, 503 retry later. The feature is off (404, "not available
  yet" in settings) until configured.

## Not done here

- Organizations can't yet see which of their users signed up with an alias.
- Researchers can't disable or rotate their alias themselves.
- Verified end to end against a local stand-in for Mailgun's send API
  (`scripts/probe-email-alias.mts`); the first real Mailgun delivery should be checked by hand.

0087 — Report submission, P0-P4 priority, attachments, and identity (Oct 26)

Status: accepted (2026-10-26) · Migrations: `202610260001` to `202610260007`

## Decisions

**Severity "None" reads "Info".** Label only (`lib/report-status.ts` `SEVERITY_LABEL`). The stored
enum value stays `none`, so no report, bounty table, API response value or Jira mapping moves.
API consumers keep receiving `"none"`.

**Priority (P0-P4) is separate from severity and drives payout** (owner's choice). Severity and
CVSS say how bad the vulnerability is; priority says how the program treats it.
`reports.priority` is set only by triagers (`set_report_priority`). When null it follows
confirmed severity (critical→P0 … none→P4). A policy's ranges stay keyed by tier and each tier
is exactly one priority, so every report without an explicit priority calculates exactly as
before. A finalized bounty locks priority along with severity and CVSS.

**Vulnerability category** is the UI name for `reports.weakness_type`; the column and values
are unchanged. Two values were added: `insecure_file_upload` and `api_security`. Both zod
schemas derive from `WEAKNESS_TYPE_ORDER`, so the copies can't drift.

**Target selection from scope.** The composer lists the program's in-scope entries. A wildcard
domain, an IP range or a URL prefix asks for the specific host, IP or URL. `submit_report`
requires its own most-specific match to be the chosen entry, so an out-of-scope exclusion
inside a wildcard still wins.

**Drafts.** Many per program (`report_drafts.id`). Saves carry a version, and a stale save gets
`DRAFT_CONFLICT`. Drafts are private (RLS) and never reach the program. The submit that consumes
a draft deletes it in the same transaction. My Drafts is `/reports/drafts`; Home only links to it.

**Idempotent submit.** `reports.submission_key` (unique per researcher). A retry with the same
key returns the existing report.

**Attachments.** The browser PUTs straight to object storage under a signed URL bound to the key,
the type from our table and the exact size (verified: a different size or type gets 403). The
server then checks the stored size, the file signature against the extension, and SHA-256 over
the stored bytes. Only then is the upload usable; anything else is deleted.
`insert_report_file_evidence` refuses any object that isn't a verified staged upload by the same
actor. The accepted types are in `lib/evidence-policy.ts`; archives, executables and HTML are not
accepted. The limit is set by `EVIDENCE_MAX_FILE_MB` (default 50) and `EVIDENCE_MAX_FILES`
(default 20), under a 1 GiB database ceiling. Downloads are unchanged: a 60-second presigned URL
forcing an `application/octet-stream` attachment.

**Researcher CVSS.** v4.0 by default, v3.1 accepted. The server action re-scores the vector
(`lib/cvss-vector.ts`, ae-cvss-calculator), and the database checks the vector shape and the range.
It is stored apart from the triager's CVSS, confirmed severity and priority.

**External profiles.** HackerOne joins the existing handles. Pasted URLs are reduced to the
handle, and other hosts or schemes are refused. The app and the RPC enforce the same patterns.
Showing them on the public profile is opt-in (`show_external_links`, default off).

**/profile and /settings are different pages.** `/profile` is the identity side (what others
see). `/settings` is an overview of the private account, with no second list of links beside the
settings nav.

**Aadhaar only through the provider** (owner's choice). DigiLocker via Cashfree. The database
refuses new Aadhaar numbers on `researcher_kyc` from any caller. Existing records and their
statuses are kept. Manual PAN, passport and phone entry stays as a fallback and shows "Requires
review" until a platform admin decides.

## Open

- **Malware scanning:** none. Uploads are type-checked and only ever served as opaque downloads.
  Add a scanner (e.g. ClamAV on upload completion, quarantining until clean) before accepting
  untrusted formats beyond today's list.
- **Orphaned uploads:** a `pending` upload whose browser never finished leaves a row and possibly
  bytes. Needs a periodic cleanup job.
- **Retention policy for identity records:** today they are kept while the account exists, and
  deactivation does not erase them. Needs a legal and product decision, then a job.
- **PAN-specific verification:** a successful DigiLocker session marks identity verified. The
  Cashfree flow requests Aadhaar and PAN, but whether a PAN document was actually returned is not
  read separately. Fetching it needs Cashfree's document API, which is untested without
  credentials.

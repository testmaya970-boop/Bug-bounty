# 0089: Researcher journey completion

Date: 2026-10-28. Migrations 202610280001, 202610280002.

## Problem

Researcher settings had placeholder pages for collaboration, swag, subscriptions, calendar and
digital agreements, and a "Coming Soon" nav item. CVE requests, Hall of Fame
acknowledgements, events and mentorship did not exist. Collaborators could be added to a report
without agreeing to it.

## Decisions

All of this is internal. Nothing calls an outside service, and no state claims an outcome an
outside party hasn't produced.

| Module | Rule |
|---|---|
| Collaboration | The submitter invites, and the invitee accepts or declines. Pending shares are reserved, so accepted plus pending must stay under 100%. Shares are at most two decimals. Invitations are accepted, declined or revoked only while the report is new or in triage; after that they show as expired. Accepting inserts a `report_collaborators` row, so the existing split trigger, read access and payout fan-out (each share floored to minor units, remainder to the submitter) are unchanged. The direct `add_report_collaborator` is no longer callable by users. |
| CVE requests | The submitter of a resolved report whose disclosure is published may request one. Only one pending, approved or assigned request is allowed per report. Platform staff approve or reject (a rejection needs a note). `assigned` requires a CVE identifier and an https link to its public record, recorded by staff after a CNA issues it. Filing with a CNA happens outside the app. |
| Hall of Fame | Organization staff propose credit on accepted or resolved reports. The researcher consents (published) or declines. Either side can revoke. The public list shows only published credit on public, live programs: name, program and date, never the finding. |
| Events | Platform staff create a draft, publish it or cancel it. Researchers register or cancel; capacity, the registration window and a reputation minimum are enforced under a row lock. |
| Mentorship | Researchers with 3 or more resolved reports opt in as mentors. Requests are limited to one open request per pair and 5 per day. The mentor accepts with a required note on how to meet (only the mentee sees it), up to their mentee limit. Meetings happen outside the app. |
| Swag | Staff enter items and real stock. A researcher requests an item (reputation minimum, one open request per item). Approval takes one unit of stock, and rejecting after approval returns it. Shipping and tracking are recorded by hand. Addresses are visible only to the requester and staff. |
| Subscriptions | Follow programs the caller can see (public and live, or ones they participate in). The page shows when the policy or scope last changed. |
| Agreements | Versioned platform agreements. Version 1 is the existing Code of Conduct text from /safe-harbor. Acceptance records the account, the version and the time; it is labelled an acknowledgement, not an e-signature. Program policies accepted at submission (`reports.policy_version_id`) are listed alongside. |
| Calendar | Registered events plus live and upcoming CTF events, with an .ics download. No calendar provider is involved. |
| Dashboard | One summary read (`get_my_researcher_actions`) feeds an "Also waiting on you" list. It includes identity verification from the same rule `submit_report` enforces. |

New pending items surface on the dashboard and their own pages, not as notifications. The
notification table is provenance-checked per type and would need its constraint and renderer
widened for each.

## Not built (external dependency)

- Filing CVEs with a CNA.
- Event streaming or ticketing.
- Mentor video or calendar scheduling.
- Swag commerce and shipping carriers.
- Legally verified e-signatures.
- Researcher-facing AI assistance (no external AI provider in scope).

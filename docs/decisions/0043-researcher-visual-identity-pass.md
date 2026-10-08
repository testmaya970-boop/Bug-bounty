# 0043 — Researcher experience visual overhaul (design-only)

Related: [[0035-unpatched-visual-identity-system]], [[0036-live-security-environment]],
[[0042-researcher-product-completion]].

Presentation and interaction design only. Every backend contract, RPC, migration, RLS
policy, service, action, and route from 0042 is byte-for-byte unchanged; this task changed
`.tsx`/`.css` files exclusively. No feature was added, no fabricated data appeared
anywhere -- every number, status, and fact shown is real, unchanged data rendered through
a stronger composition.

## A. Visual audit findings

Read directly before any change: `app/globals.css`'s existing token system (a real
light/dark surface hierarchy already existed -- canvas/surface/surface-muted/
surface-raised, semantic accent colors, no work needed there), `components/ui/*`
(Button/Badge/Card/Alert/RegistryList/SecurityPrimitives), and the eight target pages.
The finding matched the task's own diagnosis: every page opened with `AppShell`'s generic
`<h1>{title}</h1>` then fell straight into `Card`/`Card`/`Card` or `EmptyState`, with no
per-page-type composition distinction, a small text-link-styled primary action wherever
one existed, and status badges that were already well-designed (flat dot+label, never a
giant pill) but never assembled into a genuinely prominent decision surface.

## B. Competitor principles applied (not cloned)

Confidence and density over decoration (Linear/GitHub): a case file or registry earns its
weight from real information density and typographic hierarchy, not illustration.
Restrained, state-driven motion (Linear): an element enters because something the user
did just changed, never because a page merely finished loading. One dominant action per
screen (Stripe dashboards, Vercel): a single high-contrast panel, not a button competing
with five other links of equal visual weight. No color for its own sake (GitHub): the
existing dot-based status system was already correct and was left alone.

## C. Unpatched visual thesis

**Surface architecture**: canvas (page) -> chrome (nav, unchanged) -> primary surface
(mostly borderless, divider-driven) -> the one raised/dark panel per page reserved for the
single most important action or record on that screen. The dark panel is always built
from the `ink`/`canvas` token pair specifically -- the one pair this codebase's own
comments already document as "guaranteed to invert together" across light/dark themes --
never a semantic-colored `Badge` placed on it (see F for why that matters).

**One high-weight primary action per page**, never a small text link doing that job: the
new `PrimaryActionPanel` primitive (`components/ui/security-primitives.tsx`).

**Distinct composition per page type** (see D-K): a launchpad, a marketplace registry, a
research workspace, a document-style composer, a case file, an event stream, a verified
record -- never the same header+card+divider recipe repeated eight times.

## D. Researcher home changes

`app/page.tsx`'s `HomePage` (the public marketing `PublicHome` is untouched -- this task is
about the authenticated product). The primary action -- previously a small `bg-ink`
text link -- is now a `PrimaryActionPanel` carrying the identical, unchanged priority logic
(reports needing response > pending invitations > browse programs), with a title and
description generated from the same real counts. The three facts below are now a `dl`
with large `tabular-nums` numbers (matching the reputation page's own established idiom)
instead of a plain three-row list. Active programs render in a bordered registry with a
hover/focus transition. No new metric, no fabricated activity, no chart.

## E. Program registry changes

`components/programs/public-program-list.tsx`: each row now leads with the organization
name as a small mono eyebrow, the program name promoted to the primary line, description
below, status badge and a hover-shifting arrow at the trailing edge -- reads as a registry
entry, not a generic list item. New rows (via Load more) enter with the shared
`motion-safe:animate-enter-rise`. `app/programs/page.tsx`'s search form is now a filled,
bordered search bar (monospace input) inside a `surface-muted` well, with a solid `ink`
submit button, and every section on the authenticated page now carries a `SectionLabel`
eyebrow (Your registry / Marketplace) instead of a bare `<h2>`.

## F. Program detail changes

`app/organizations/[organizationId]/programs/[programId]/page.tsx`, all three
researcher-reachable branches (anonymous-public, authenticated-no-relationship-public, and
the main authorized view): a "Can I research this?" panel is now inserted immediately
after identity/status, before Scope -- never buried at the bottom near the report list as
it was before. For the main authorized view this panel only ever renders for
`!canManageProgram && isActiveResearcher`; a manager's view is untouched aside from
shared-primitive styling. The redundant second "Report a vulnerability" button that used
to sit next to the Reports section header was removed (the new panel is now the one, real
primary action) rather than left as a confusing duplicate.

**A real accessibility finding, caught and fixed during this pass, not before**: an early
draft of the report-detail case header inverted it to a solid `bg-ink` strip and left
`StatusBadge`/`SeverityBadge` inside it unchanged. Those badges' semantic colors
(`text-success`, `text-severity-critical`, etc.) are tuned for a light surface and lose
most of their contrast against a black background in light theme -- a real, avoidable
regression. Fixed by using a heavier `border-2 border-ink` treatment instead of a fill,
verified in both themes (see R).

## G. Report composer changes

`app/.../reports/new/page.tsx` gained a "Document a security finding" framing sentence
above the form. `components/reports/create-report-form.tsx`: staged evidence and file
rows now animate in on add; staged files show a real formatted size (`formatFileSize`,
presentation-only, `MAX_FILE_SIZE_BYTES` enforcement is completely unchanged) alongside
the filename, matching the task's "professional evidence collection" reference exactly.
The Review section is now a bordered, filled summary panel instead of a bare `dl`. Every
field, backend call, and the `beforeunload` guard from 0042 are unchanged.

## H. Report detail changes

The status bar is now a heavier-bordered "case header" (see F for why it is a border, not
a fill). The researcher's original submission ("Submitted by researcher") is now a
document-style block with a bottom rule instead of a boxed `Card`, reading as the case's
own header prose; Communication, Evidence, and Decision history remain real `Card`s
because they are genuinely distinct contained records, not converted into document prose.
The next-action `Alert` banner now enters with the shared rise animation. The decision
rail (Triage/Bounty/Payment) is unchanged in structure.

## I. Notifications changes

`components/notifications/notification-list.tsx`: rows are now an event-stream marker
(filled dot for unread, hollow for read) on a continuous vertical rule, rather than a flat
divided list -- new items fade in. `app/notifications/page.tsx` gained a real section
title ("What changed that needs your attention?") under an "Event stream" eyebrow.

## J. Reputation changes

`app/researchers/page.tsx` gained a real title ("A record of confirmed outcomes, not a
score") under a "Verified research record" eyebrow. `components/reputation/
reputation-ledger.tsx`: rows gained the standard `p-4` padding they were previously
missing entirely inside `RegistryList` (a real pre-existing gap, not introduced here),
mono timestamps, and the shared entrance animation.
`components/reputation/reputation-programs.tsx`: converted from a bare spaced list to a
bordered, divided registry with mono counts, matching the product's other lists. No
score, rank, or badge was added anywhere -- the existing big-number `dl` summary
(`reputation-summary.tsx`) was already correct and untouched.

## K. Navigation changes

None structurally. `AppShell` was audited and found to already implement the grouped
Research/Organization sidebar with a real brand-teal active-item rail, a skip link, and a
mobile drawer -- exactly the composition this task asked for. Left unchanged.

## L. Background/color changes

No new color was introduced. The one new pattern is the dark `ink`/`canvas` panel used for
every "one high-weight action" moment (PrimaryActionPanel, program detail's "Can I
research this?", the case header's *border* not fill) -- reusing the exact token pair the
public marketing page's own dark chapters already established, so the authenticated
product's one moment of visual weight reads as the same system, not a second palette.

## M. Typography changes

No new font, no new scale token. The fix was disciplined *use* of the existing scale: real
`<h2>` page titles instead of bare paragraph text (composer framing, notifications,
reputation headers), `tabular-nums`/`font-mono` for every real number and timestamp, and
`SectionLabel` eyebrows used consistently as the one structural device across every page
rather than ad hoc `<h2 className="text-base font-semibold">` strings.

## N. Motion system

Two keyframes added to `app/globals.css`, registered as `--animate-enter-rise` /
`--animate-enter-fade` (Tailwind v4 `@theme inline` animation tokens): a 220ms
opacity+4px-rise and a plain fade, both `motion-safe:`-gated at every call site (search
results, staged evidence/attachments, reputation-ledger rows, notification rows, the
next-action banner) -- never applied to a page that merely finished loading, matching the
task's own "motion should reinforce workflow feedback" instruction. `prefers-reduced-
motion` gets the final-state styles with no animation property at all, the same pattern
`Button`'s existing spinner already used.

## O. Responsive changes

Verified live at 1440/768/390 for all seven redesigned surfaces (14 anonymous+
authenticated screenshots) -- zero horizontal overflow anywhere. The home page's three-
stat `dl` wraps its labels to two lines at 390px in the narrowest case; left as-is (still
legible, not broken) rather than over-engineered for one cosmetic wrap.

## P. Accessibility

No heading structure, landmark, `aria-current`, label, or keyboard path was removed.
`Alert` gained an additive, optional `className` prop (used only for the entrance
animation) -- fully backward compatible. All new motion is `motion-safe:`-gated. The one
real accessibility finding from this pass (F's badge-contrast issue) was caught and fixed
before shipping, verified in both themes.

## Q. A real, pre-existing clarity bug found and fixed along the way

`components/programs/program-participation-card.tsx` renders a researcher's own access
status (`ResearcherStatusBadge`) directly beside the program's own lifecycle status
(`ProgramStatusBadge`) -- both frequently read "Active," rendered in the identical style,
with nothing distinguishing which fact is which. This is a genuine composition defect the
new registry styling made newly visible in live screenshots, not something this task
introduced. Fixed with two small "Your access" / "Program" eyebrow labels above each
badge column -- a presentation-only fix, no data or authorization change.

## R. Before/after screenshots reviewed

21 light-theme screenshots (7 surfaces x 3 breakpoints) plus 3 full-page dark-theme
screenshots (home, program detail, report detail) were captured against a live account
with real fixture data (a public active program, a report moved through
new -> needs_information -> triaging -> accepted -> resolved) and reviewed directly. The
dark-theme pass specifically re-verified F's badge-contrast fix and confirmed every new
`ink`/`canvas` panel inverts correctly with no manual dark-mode CSS required, using only
the existing token system.

## S. Browser verification

Real Chromium, a real signed-up researcher account, real RPC-driven state transitions
(program creation through activation/visibility, report submission through resolution) --
no mocking. Verified the notification produced by 0042's `report_needs_information` wiring
renders correctly inside the new event-stream row (a real end-to-end check of both this
task's presentation change and the previous task's backend fix, together).

## T. Tests

`npm run typecheck`, `npm run lint`, `npm test` (1007/1007, 62 files), `npm run build` all
pass -- run after every round of edits, not only at the end.

## U. Exact files changed

`app/globals.css`; `components/ui/security-primitives.tsx` (new `PrimaryActionPanel`);
`components/ui/feedback.tsx` (`Alert` gains optional `className`); `app/page.tsx`;
`components/programs/public-program-list.tsx`; `app/programs/page.tsx`;
`app/organizations/[organizationId]/programs/[programId]/page.tsx`;
`app/organizations/[organizationId]/programs/[programId]/reports/new/page.tsx`;
`components/reports/create-report-form.tsx`;
`app/organizations/[organizationId]/programs/[programId]/reports/[reportId]/page.tsx`;
`components/notifications/notification-list.tsx`; `app/notifications/page.tsx`;
`components/reputation/reputation-ledger.tsx`; `components/reputation/reputation-
programs.tsx`; `app/researchers/page.tsx`; `components/programs/program-participation-
card.tsx`. No migration, service, action, or route file was touched.

## V. Deliberately not changed

`AppShell`/navigation (already met the bar -- see K). The organization/manager-facing
sections of the program detail page (scope management, researcher roster, bounty policy
creation) received only incidental shared-primitive styling, never a composition
rewrite -- this task's scope was the researcher experience. No design-token additions
beyond the two motion keyframes -- the existing color/spacing system was judged sufficient
and was deliberately not expanded.

## W. Brutal before/after score

| Dimension | Before | After |
| --- | ---: | ---: |
| Visual identity | 5/10 | 7.5/10 |
| Typography | 6/10 | 8/10 |
| Composition | 4.5/10 (identical recipe everywhere) | 8/10 |
| Color/surface system | 6/10 | 8/10 |
| CTA hierarchy | 4/10 (small text links) | 8.5/10 |
| Researcher usability | 6.5/10 | 8/10 |
| Motion | 2/10 (none in the authenticated product) | 7/10 |
| Mobile | 7/10 (already solid) | 7.5/10 |
| Accessibility | 8/10 | 8/10 (one contrast regression caught and reverted before shipping) |
| **Overall** | **~5.4/10** | **~7.8/10** |

Not a 9. The composition, CTA hierarchy, and motion moved the most because those were the
task's real, well-diagnosed gaps. Mobile and accessibility moved the least because they
were already close to the bar before this pass -- the honest gain is real but not
uniform, and claiming otherwise would be exactly the overclaiming this project's own
convention refuses to do.

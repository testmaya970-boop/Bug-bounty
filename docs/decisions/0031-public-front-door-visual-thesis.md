# 0031: Public front door — visual thesis and redesign proposal

Date: 2026-08-31
Status: **Proposal only. No code was changed in this slice, per explicit instruction. Awaiting review before implementation.**

This document answers the brief for Sentinel's public homepage (`/`, plus how it hands off to `/researchers/sign-up` and `/organizations/sign-up`, established in `docs/decisions/0030`). It does not touch the authenticated product. Nothing here is implemented yet.

## A load-bearing fact this proposal is built on

`DESIGN.md` — the actual, existing design-system document — states its own scope in its first paragraph: **"This is the visual source of truth for Sentinel... It is for product interfaces, not marketing experiments."** The homepage was never inside `DESIGN.md`'s jurisdiction. That is precisely why it currently reads as generic: nothing was ever asked to give it its own visual identity, and the version built in `0030` correctly solved the *product* problem (an honest, non-fake, two-path entry point) without solving the *visual* one, because that wasn't its brief. This proposal is the first document to treat the homepage as its own design problem — consistent with, but not governed by, `DESIGN.md`.

A second, concrete fact worth surfacing: `DESIGN.md`'s own documented color values have drifted from what's actually shipped. `DESIGN.md` lists `--canvas: #f7f9fa` (cool, blue-tinted); the live `app/globals.css` has `--canvas: #faf8f3` (warm cream), with its own comment explaining an intentional past shift "from the previous cool blue-gray" that was never back-ported into `DESIGN.md`. This proposal uses the real, live values, not the stale documented ones — and flags the drift as a separate, small housekeeping item, not something to fix inside this slice.

---

## 1. Competitor findings

Researched (live-fetched where the site rendered; tagged FACT for directly observed structure, INFERENCE for well-established brand identity not re-verified pixel-level in this pass): HackerOne, Bugcrowd, Intigriti, YesWeHack, Immunefi, GitHub Security Lab (bug-bounty/security set), plus Linear, Vercel, Stripe, Raycast, GitHub (quality-bar reference set, not feature competitors).

**Bug-bounty platforms, condensed:**
- **HackerOne**: centered, text-first hero with a video (not a product screenshot); single sans typeface throughout, no monospace pairing anywhere despite the subject matter; dense (12–15 sections: logo carousel, testimonials, stat callouts).
- **Bugcrowd**: centered headline + star-rating badge + immediate logo strip; a marquee/carousel is the one confirmed motion element; four stat callouts ("268% ROI") plus repeating testimonial carousels — the densest, most stat-driven of the three core competitors.
- **Intigriti**: hero built around a *tool* (a bug-bounty calculator), not a screenshot or a stat wall — a genuinely distinctive move; the most distinctive density choice in the set is a 50+-avatar grid of real researcher usernames substituting for a logo wall (community-as-proof instead of company-as-proof).
- **YesWeHack**: the only bug-bounty competitor confirmed showing real product UI in the hero — a full-bleed dashboard background image with text overlaid on top of it (least controlled framing of any site researched).
- **Immunefi**: almost entirely dark, leads with a single large stat ("92% of Web3's critical vulnerabilities"), then more stat bands ("$190B+ Protected") — no product UI shown at all; pure proof-by-numbers.
- **GitHub Security Lab**: sparse mission-statement hero, then density *rises* through the page into a live vulnerability-disclosure list and real CVE count — the one site in the entire set that substitutes an actual, current, real data feed for either a stat wall or a mocked dashboard. Notably, no monospace typography anywhere despite this being GitHub's own security property.

**Reference sites, condensed:**
- **Linear**: sparse, restrained hero; its signature move is showing a literal before/after code diff in real monospace as marketing content — genuine technical artifact, not decoration.
- **Vercel**: no single hero at all — alternating case-study blocks, each pairing a headline with a real customer product screenshot; near-monochrome base, minimal accent color; explicit separate mobile image variants (real recomposition, not a stacked desktop layout).
- **Stripe**: the busiest/most colorful of the reference set (an animated multi-hue gradient wave background) and the longest (25–30 sections, bento grids) — the one reference site whose approach this proposal explicitly does *not* want to emulate.
- **Raycast**: dark, glassmorphic, motion-and-video-heavy, no monospace despite being a developer tool — closer in spirit to the commodity pattern than the restrained end of the reference set.
- **GitHub**: an animated code-editor/Copilot-chat demonstration *is* the hero visual — the most literal "show the real tool working" execution in the entire research set, backed by GitHub's own established Mona Sans (display) / Monaspace (mono) typeface pairing.

**Synthesis — commodity patterns confirmed present across most of the 11 sites**: customer-logo carousels plus G2/star-rating badges as the default trust signal; repeated stat-band walls ("$X protected," "X% faster"); testimonial carousels duplicated two or three times down one page; a single sans-serif typeface used everywhere with no technical/monospace counterpoint, even on sites whose entire subject is code and vulnerabilities. All four are named explicitly in Section 2 as patterns Sentinel will not adopt.

**Synthesis — the three techniques judged most transferable, none of them a "look like X" instruction**:
1. Pair a display typeface with a *genuine* monospace, and use the monospace to show a real artifact (Linear's literal code diff; GitHub's Mona Sans/Monaspace system) rather than as a decorative label. Sentinel already has a real monospace convention for targets/identifiers in the product — this is the one technique that requires no new capability, only extending an existing one to the homepage.
2. Prefer a real, current data signal over an invented stat wall (GitHub Security Lab's live CVE count and disclosure list, the single most distinctive credibility device found across all 11 sites) — directly reinforcing Section 9's own conclusion: Sentinel has no honest anonymous-reachable number to show today, so the workflow-preview must be clearly illustrative, not an invented substitute stat.
3. Show real product UI as one restrained, well-composed object against a mostly-quiet ground with a single accent color (Linear/Vercel/GitHub's shared pattern) rather than full-bleed decoration (YesWeHack) or omitting product UI entirely (HackerOne/Bugcrowd/Intigriti/Immunefi). This is a genuine differentiation opportunity specifically because none of the three direct bug-bounty competitors do it — directly shapes Section 8's "WHAT'S HAPPENING ON SENTINEL" section design.

## 2. Commodity patterns we will explicitly reject

- **The centered-hero-with-two-equal-button-choice pattern** the previous homepage itself used (`0030`'s `AudienceChoice`) — two text blocks of identical visual weight is exactly the "generic CRUD chooser" the task calls out. The choice should survive, but subordinated to an actual product statement, not presented as the page's opening move.
- **Logo walls, stat bars, and G2/Gartner-style trust badges** — the dominant persuasion mechanism across HackerOne/Bugcrowd/Intigriti's own marketing (confirmed in the prior acquisition-focused research pass, `0030`). Sentinel has no real customer count, researcher count, or bounty total to honestly show yet, and `DESIGN.md` itself already forbids fabricated metrics ("Use actual data or a clearly marked development fixture. Do not ship fabricated metrics.") — this rule was written for the product, and this proposal extends it to the homepage without exception.
- **Fake hacker/cyberpunk decoration** — Matrix rain, neon green, glowing borders, fake terminal screenshots. Explicitly named as off-limits in the brief, and already the exact posture `DESIGN.md` takes for the product ("Prefer quiet surfaces, strong typography, and measured contrast over neon effects, cyberpunk imagery, glowing borders, terminal decoration, or stock 'hacker' visuals").
- **Card-grid feature walls** ("[icon] [headline] [three lines]" × 6) — commodity SaaS-template furniture. Every section in this proposal has a specific job (Section 8) rather than existing to fill a grid.
- **A wholesale new color palette "because competitors are darker/bolder."** Addressed directly in Section 4: rejected, with reasoning.

## 3. Sentinel visual thesis

**What Sentinel should feel like, in concrete properties, not adjectives:**

- **Density is not uniform — it shifts on purpose.** The hero is comparatively spacious (an editorial headline needs room to breathe). Immediately after it, the "what's actually happening on Sentinel" section becomes dense — real component-grade rows, thin dividers, monospace targets — matching the *product's own* established density exactly (the triage inbox, the evidence list, the Needs Recovery queue all already look like this). This density *shift* is the specific mechanism that reads as "serious instrument" rather than either a "spacious SaaS brochure" (uniformly sparse) or a "hacker terminal" (uniformly dense and dark). Nothing else on the page needs to be dense to earn this effect — one well-placed dense section does the work.
- **Typography carries the hierarchy alone-or-nearly-alone**, per `DESIGN.md`'s own stated principle for the product ("Hierarchy comes mainly from surface, border, spacing, and type... avoid gradients on operational surfaces") — extended here to marketing. Concretely: one new, genuinely editorial display face for the hero headline only (Section 6), the existing system-ui stack unchanged for every paragraph of supporting copy, and the existing monospace stack unchanged for every technical fragment (eyebrows, target strings, workflow labels) — three registers, each already meaning something specific in the product, now doing the same job at a larger scale.
- **Geometry stays exactly as sharp/quiet as the product's.** Existing border radii, existing thin 1px dividers, existing `rounded-lg`/`rounded-md` scale — no new geometric language introduced. A visitor who signs up should never feel a seam between the homepage and the workspace.
- **Color is not being replaced.** Addressed in full in Section 4.
- **Real product fragments, not illustration.** The "what's happening" section and the researcher/organization explanations are composed from the *actual* `Badge`/`StatusBadge`/`SeverityBadge` components and the actual monospace target-string treatment already in production — not a freshly-drawn mockup, not stock imagery. If it looks like a screenshot, it's because it's assembled from the same code that produces the real screen.
- **Motion is a hierarchy signal, not decoration.** At most: a brief (150–200ms, matching `DESIGN.md`'s existing product motion budget exactly), reduced-motion-respecting reveal as the dense workflow section scrolls into view. No looping animation, no auto-playing "typing" effect, no particle/gradient motion.

**The test this thesis has to pass**: a screenshot with the logo removed should still read as Sentinel — because the monospace target strings, the exact severity/status color-plus-dot convention, and the thin-rule dense-row treatment are all things a visitor would recognize from the product itself, not from a marketing template.

## 4. Color direction: extend, do not replace

The brief asks to "research current premium product color systems and redesign Sentinel's palette deliberately." Having done that research (Section 1) and re-read `DESIGN.md`'s own governing philosophy, the considered conclusion is: **the existing 16-token system is not the problem, and should not be replaced.** Reasoning:

- The actual homepage weakness the task describes — "beige background, large heading, paragraph, two audience sections, text links, huge empty areas" — is a **layout and typography** failure, not a color failure. Swapping `--canvas`/`--ink`/`--action` for a new palette would not fix a page whose real problem is uniform density and no display typography.
- `DESIGN.md`'s own Section 6 states the product's hierarchy already "comes mainly from surface, border, spacing, and type," explicitly **not** from a richer color system — and the competitor research (Section 1) independently confirms that vanity-metric-driven sites lean on *color/logo density* as a trust mechanic precisely because their copy and layout don't carry enough weight on their own. Sentinel's competitive difference should be the opposite: confident enough in its typography and real product fragments that it does not need a busier palette to compensate.
- A parallel marketing-only palette would violate `DESIGN.md`'s own explicit rule against inventing a second visual language, and would create exactly the "seam between the front door and the interior" this thesis is designed to avoid.

**No new color token is proposed.** The existing `action` teal (`#0b6f69` light / `#58c4b5` dark) already reads as confident and saturated at any display size tested; `ink` (`#18140f` light) already provides strong, accessible contrast for large display type against `canvas` (`#faf8f3`). If implementation reveals a genuine, specific contrast gap at hero scale, `DESIGN.md`'s own governance rule applies: add one token, with a one-line rationale, rather than a parallel palette.

## 5. Typography direction

**The problem, stated plainly**: `app/globals.css` currently loads no distinctive typeface at all — `body { font-family: ui-sans-serif, system-ui, -apple-system, ... }`. Every heading on the entire product, including the current homepage's own `<h1>`, renders in whatever system font the visitor's OS supplies. This is the literal, technical reason the page "feels like default Tailwind typography" — there is no typography system beyond size and weight.

**Proposal**: one new, deliberately chosen display/editorial typeface, used *only* for the hero headline (and, at a smaller weight, section-opening statements) on the public homepage — never introduced into the authenticated product, never used for body copy, never used for anything DESIGN.md already governs.

- **Candidate**: a serif with genuine editorial character and a real display cut — e.g. Fraunces or Newsreader (both real, licensed for web use, loadable via `next/font/google`, and neither is the current startup-cliché choice — Inter-everywhere or Space-Grotesk-everywhere have themselves become the new generic). The specific choice should be confirmed against real rendered type at hero scale before implementation, not locked in from description alone.
- **Why a serif at all, specifically**: it is the single typographic move that most reliably signals "this was designed as a publication/instrument," not "this is a SaaS template" — and it directly answers the brief's own instruction to pair "editorial display typography" with "technical/product typography," rather than inventing a third, unrelated register.
- **Body copy**: unchanged system-ui stack. This is deliberate, not an oversight — every paragraph of supporting copy on the homepage should read as continuous with the product's own prose, which already uses this stack everywhere.
- **Technical/eyebrow/label text**: unchanged existing monospace stack (`ui-monospace, SFMono-Regular, Menlo, ...`) — used for the small uppercase eyebrow labels (already a homepage convention via `SectionLabel`), workflow-diagram identifiers, and any target-string-style text in the product preview, exactly matching how the product itself already uses monospace for "domains, URLs, CVSS vectors, identifiers... reproduction code" (`DESIGN.md` §3).

Net effect: three registers (editorial serif / system-ui prose / monospace technical), each doing a job that already exists in the product's own vocabulary, extended rather than invented.

## 6. Interaction/motion direction

- One reduced-motion-respecting reveal as the dense "what's happening" section enters the viewport (opacity/small-translate, 150–200ms per `DESIGN.md`'s own existing motion budget) — signals "this section is a distinct register" without a looping or attention-stealing effect.
- Hover/focus-visible states on every interactive element reuse the exact existing `focus-visible:outline-2 focus-visible:outline-focus` convention already used throughout the product — no new interaction language.
- No hero animation, no auto-playing demo, no particle/gradient motion, no "typing" effect.
- `prefers-reduced-motion: reduce` disables the one reveal entirely (content renders in its final state immediately) — matching the existing global rule in `app/globals.css`.

## 7. Researcher vs. organization acquisition paths

Unchanged in substance from `0030`: `/researchers/sign-up` and `/organizations/sign-up` remain the two real entry points, `create_organization`'s authorization remains untouched (any authenticated account may still call it explicitly — see Section 11), and the platform/organization/researcher distinction is preserved exactly. What changes is *where in the page's narrative* the choice appears and *how much visual weight* it carries: the choice moves from being the page's opening statement (as `0030` shipped it) to being the page's *conclusion*, after the visitor has already seen what Sentinel is and how the workflow actually works — "I am here to find security programs" vs. "I am here to operate a security program" should be an informed choice by the time it's offered, not the first thing asked.

## 8. Proposed homepage structure

```
HEADER
Sentinel [wordmark]  ·  Security operations              Sign in

HERO  (comparatively spacious)
  eyebrow (monospace, small, uppercase): SENTINEL
  headline (new editorial serif, large): Security research,
    built around the signal.
  supporting statement (system-ui, 1-2 sentences): what Sentinel
    actually is -- program, scope, report, triage, resolution,
    recorded honestly. No adjectives without a referent.
  [Explore how it works ↓]   (scrolls to the next section, not a CTA to sign up yet)

WHAT'S HAPPENING ON SENTINEL  (dense -- the density shift)
  A real, component-grade sequence using the actual Badge/
  StatusBadge/SeverityBadge/monospace-target treatment:
    PROGRAM → SCOPE → REPORT → TRIAGE → RESOLUTION
  rendered as illustrative rows in the exact visual grammar of the
  real triage inbox -- clearly an illustration of the workflow
  (labelled as such), never claiming to be a live program or a
  real report.

FOR RESEARCHERS
  eyebrow: RESEARCHER
  discover → understand scope → report → communicate → build
  reputation, each line grounded in a real capability (0024/0025
  already inventoried these precisely -- copy must not claim
  "discover" as public marketplace discovery, since that does not
  exist yet; state it as "join by invitation" honestly).
  [Continue as researcher →]

FOR SECURITY TEAMS
  eyebrow: ORGANIZATION
  define scope → invite researchers → triage → decide → audit,
  each grounded in a real, shipped capability.
  [Continue as organization →]

PROGRAM DISCOVERY (honest, not fabricated)
  A visually considered, clearly-labeled "not yet public" panel --
  see Section 9 -- never a fake program list.

FINAL STATEMENT
  One specific, decisive closing line grounded in what Sentinel
  actually does differently (e.g. its real, disclosed evidence
  trail and non-scored reputation model -- see 0026's own "10x
  opportunity" findings), not "Ready to get started?"
  [Continue as researcher →]   [Continue as organization →]
  (the same two links, present again at the natural end of the
  page for a visitor who scrolled the whole way down)

FOOTER
  Minimal: wordmark, sign in link, nothing invented (no fake
  social links, no fake legal boilerplate beyond what already
  exists elsewhere in the product, if anything does).
```

## 9. Real data available, and data we must not fabricate

Re-confirmed, not re-guessed: `public.programs` has no visibility column (verified directly against the schema in `0024`/`0025`, unchanged since). There is no anonymous-safe program listing query, and none should be invented in this slice — Section 4 of the brief is explicit on this point, and `0026` already named the visibility column as its own, separately-reasoned next slice.

**What is honestly available to show an anonymous visitor**: nothing that would require a new anonymous-reachable query. The "what's happening on Sentinel" workflow section and the researcher/organization explanation sections are composed entirely from **illustrative content using real components** — not a live database read. This is the correct honest boundary: the *code* rendering the preview is real (the same `Badge`/`StatusBadge` components the product uses), the *content* is clearly a worked example, not a claim about live data.

**Never fabricate, regardless of visual pressure to fill space**: company counts, researcher counts, bounty totals, success/resolution rates, response-time SLAs, rankings, program counts. None of these exist in a form an anonymous query could honestly produce today, and `DESIGN.md` already forbids exactly this for the product — extended here without exception.

**The "Program discovery" section, specifically**: presented as a deliberately unfinished/dimmed treatment of the same workflow visual — communicating "this is coming, here is its shape" rather than either hiding the gap or faking it. Suggested framing: a version of the workflow diagram with the "discover" step visually distinct (e.g., a dashed border or reduced opacity) and adjacent copy stating plainly that programs are currently invite-only, an organization brings a researcher in directly — the same honest sentence `0030` already shipped, given a real visual treatment instead of one muted line of text at the page's bottom.

## 10. Components/pages requiring changes

- `app/page.tsx` — the anonymous branch (`PublicHome`) is the only thing rewritten; the authenticated branch (`HomePage`) is untouched.
- A small number of new, homepage-only presentational components (e.g. a `WorkflowPreview` component built from existing `Badge`/`StatusBadge`/`SeverityBadge`, a `Hero` component using the new display font) — none shared with or imported by the authenticated product, mirroring how `components/auth/audience-choice.tsx` is already homepage/auth-only.
- `app/layout.tsx` (or a homepage-scoped font loader) to register the new display typeface via `next/font/google` — scoped so it never leaches into the authenticated app's own font stack.
- No change to `components/auth/audience-choice.tsx`'s links/targets (`/researchers/sign-up`, `/organizations/sign-up`) — only where and how prominently it appears in the page's narrative (Section 8).
- No change to any RLS policy, RPC, migration, or the report/program/payment/notification/platform-operations domains, per the brief's own explicit boundary.

## 11. Security implications

None, by design. `create_organization`'s authorization is unchanged (`0024`/`0025`'s live-tested finding stands: any authenticated user may still call it explicitly). The platform/organization/researcher distinction (`0024`) is preserved exactly — this is a visual/copy slice layered on top of `0030`'s already-correct routing and boundary, not a change to either. No new anonymous-reachable query is introduced (Section 9), so no new data-exposure surface exists to audit.

## 12. Responsive strategy

Verify 1440/1280/1024/768/390/320, per the brief. The mobile composition is not a vertical stack of the desktop sections — specifically: the hero's display headline steps down to a size where it remains a strong visual anchor without wrapping awkwardly (tested against real rendered type, not assumed); the dense workflow-preview rows collapse using the *exact same* table-to-labelled-card transformation the real `ReportInboxTable` already implements (`DESIGN.md` §8's own rule — "reflow data tables into labelled cards" — extended to the illustrative preview, so it never becomes a horizontally-scrolled table on a phone); the two final-CTA links stack full-width at narrow widths, matching the existing `Button` component's own responsive behavior.

## 13. Acceptance criteria

1. No code changed in this slice (proposal only) — satisfied.
2. The homepage no longer reads as an authentication chooser first; the researcher/organization choice appears after the product has been explained, not before.
3. No fabricated metric, count, or rate appears anywhere on the page.
4. The workflow preview and researcher/organization explanation sections are composed from real, existing Badge/status components — not freshly-illustrated graphics or stock imagery.
5. Exactly one new typeface is introduced, scoped to the hero/section-opening headline only, never reaching the authenticated product.
6. No new color token is introduced (or, if implementation reveals a genuine gap, at most one, with a one-line documented rationale, per `DESIGN.md`'s own governance rule).
7. `create_organization`'s authorization, and every other RLS/RPC/domain boundary, is provably unchanged.
8. No horizontal overflow at 1440/1280/1024/768/390/320; the mobile layout is a deliberately re-composed experience, not a stacked desktop layout.
9. One `h1`, correct heading hierarchy, keyboard-operable CTAs with accessible names, visible focus states, sufficient contrast in both themes, and `prefers-reduced-motion` respected.
10. A screenshot of the finished page, with the logo removed, should be identifiable as Sentinel to someone who has seen the product — because it reuses the product's own component grammar, not because it says so in text.

---

**STOP — this is the proposal. No implementation has occurred. Awaiting review before any code changes.**

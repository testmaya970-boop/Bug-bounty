# 0034 — Public front door: the product stage

Related: [[0031-public-front-door-visual-thesis]], [[0032-public-front-door-visual-execution]], [[0033-motion-first-front-door]].

Filed as 0034, not 0033 as the task text suggested: 0033 was already taken by the
motion-first rebuild this document supersedes.

## 1. Competitor research (live-fetched, not recalled from training)

Tagged FACT (directly observed in the fetched page), INFERENCE (my reasoning from it), or
GAP (Sentinel cannot use this).

**HackerOne** — FACT: hero headline "Not every vulnerability matters. Fix the ones that
do," with a Wistia **video embed directly in the hero** (not CSS animation), a customer
logo carousel (Anthropic, Coinbase, Uber...), and a statistics banner ($4M+ ROI/critical
finding, 600k+ bugs found, 1,300+ companies). INFERENCE: HackerOne's "feels alive"
comes substantially from **real video + real customer proof density**, not from a clever
CSS choreography. GAP: Sentinel has no video asset and no real customers to name.

**Bugcrowd** — FACT: hero "Join forces with hackers and reduce risk," a 4.9/5 rating
badge, named customer logos (Atlassian, Mastercard, NASA...), and an explicit two-path
navigation split (Security Buyers vs. Hackers) starting at the very top of the page.
INFERENCE: their "feels alive" is instant self-sorting (two big buttons for two
audiences, first thing you see) plus proof-by-logo. GAP: same as HackerOne — no real
logos or ratings exist for Sentinel.

**Intigriti** — FACT: headline built around "trusted by the world's leading
organizations," a "640+ bug bounty programs analyzed" bounty calculator, G2 trust badges,
and — notably — **individual researcher profile cards** (50+, real handles/avatars) as a
major homepage section, not prose. INFERENCE: showing real *people*, not just a product
diagram, is a distinct trust mechanism from HackerOne/Bugcrowd's logo walls. GAP: Sentinel
has no public researcher directory or reputation-leaderboard feature to show honestly.

**YesWeHack** — FACT: headline "Find what's exposed / Fix what's exploitable," clearly
separated Researchers vs. Organizations navigation paths, compliance-framework logos
(SOC2/ISO27001/DORA), integration logos (Jira/ServiceNow/GitHub). INFERENCE: leans on
enterprise-readiness signaling (compliance, integrations) more than motion.

**Immunefi** — FACT: the most numbers-dense hero of the five ("92% of Web3's critical
vulnerabilities are reported here," "$24.5M average exploit cost," a statistics banner:
$190B+ protected, 83,000+ researchers, 650+ protocols). INFERENCE: Immunefi substitutes
raw, aggressive quantification for any real product demonstration in the first viewport —
there is no visible product UI at all in what was fetched.

**The load-bearing finding**: none of the five make their homepage "feel alive" primarily
through abstract CSS motion. They do it with **real video, real logos, real ratings, real
individual people, or real aggregate numbers** — categories Sentinel is correctly
forbidden from fabricating (section 10 of the brief, and every prior slice in this
project). This means directly imitating "why HackerOne feels alive" is not available to
us. What *is* available, and what none of the five foreground as their primary
mechanism, is: **making the actual product interface the hero**, moving in a way that
demonstrates a real causal sequence. That has to be Sentinel's entire answer, because it
is the only lever left once fabricated trust signals are correctly ruled out.

Motion/interaction principles for high-quality product companies (Linear, Vercel, Stripe,
Raycast) were already researched in depth in 0031 and are not re-derived here: restrained
150–300ms transitions, motion that reveals state rather than decorates, real product
artifacts over illustration.

## 2. Brutal audit of the current (0033) homepage

Scored 1–10, not inflated. Based on the actual shipped code and the screenshots taken
during 0033's live verification.

| Dimension | Score | Why |
|---|---|---|
| Brand (wordmark removed, still recognizable?) | 4/10 | The badge/mono/ghost-number system is real and distinct once you study it, but the *first viewport* is a light-beige page with a serif headline — the dominant first impression is generic-editorial, not Sentinel-specific. |
| Product communication | 5/10 | The hero artifact does show real product concepts, but it sits beside the headline as a supporting card, not as the headline's equal — a skimming visitor can miss that it's the product, not an illustration. |
| Motion | 5/10 | Genuinely real, semantic, causal motion exists (a real achievement over 0032) — but it lives inside two components, not across the page, and the first viewport doesn't read as different from a static page until a visitor waits and watches. |
| Visual impact (first viewport) | 3/10 | Still light/beige/headline-left-card-right — a familiar SaaS shape, nowhere near HackerOne's video hero or Immunefi's stat wall for sheer immediate impact. |
| Trust | 3/10 | Correctly has zero fabricated logos/ratings/testimonials, which is right — but that also means it currently has almost no trust mechanism at all beyond "the product looks considered." |
| Differentiation | 4/10 | Real distinct visual grammar exists, but the overall page shape (hero → feature sections → two-column audience split → CTA) is still a common structure. |
| Researcher conversion | 5/10 | Clear, honest, functioning path. Not bad, not remarkable. |
| Organization conversion | 5/10 | Same. |
| **Overall** | **4/10** | Real technical and ethical craftsmanship (honest data, working motion, accessible), but not yet an experience that makes a visitor believe "there is a serious platform here" in the first five seconds. |

Answering the four direct questions:
- **Wordmark removed, still unmistakably Sentinel?** No. The visual system is real but not yet dominant enough to survive that test.
- **Copy removed, understand the product?** Partially — the hero artifact alone, watched through a full cycle, communicates the report lifecycle. But most visitors won't wait for a cycle on first glance.
- **First viewport demonstrates or merely describes?** Mostly describes. The artifact is present but visually subordinate to the headline.
- **Does the color system create energy?** No — it creates calm. That was 0032's explicit goal at the time; it is no longer the right goal.

## 3. New visual thesis

**Sentinel turns security noise into a recorded signal.** This is the visual system, not
a tagline: PROGRAM → SCOPE → FINDING → EVIDENCE → TRIAGE → RESEARCHER RESPONSE → DECISION
→ AUDIT RECORD is the one shape the whole page teaches, repeatedly, in different forms
(the hero's live choreography, the two-sided relationship diagram, the "why it matters"
section) — never as a paragraph, always as something the visitor watches happen.

## 4. Hero composition

The hero becomes the page's dark **product stage** (see §6 for why dark, specifically for
this section) — not a light section with a card floating in it. Full-bleed dark surface,
headline in a bold sans-serif register (see §7), and the live signal artifact given equal
or greater visual weight than the headline, not a supporting card beside it.

## 5. Hero animation choreography

Eight phases, ~1.6s apart (~13s full construction), each a real, labelled state change —
not a fade slideshow:

1. **PROGRAM** — `CLOUDVAULT` / Active
2. **SCOPE** — `*.cloudvault.example` resolves in
3. **FINDING** — "Authentication bypass" / Critical
4. **EVIDENCE** — `03 ARTIFACTS` attach
5. **TRIAGE** — status moves to Triaging
6. **RESEARCHER RESPONSE** — "Information requested" → beat → "Information received" (the
   one genuinely new causal beat versus 0033: a back-and-forth, not a one-way list)
7. **DECISION** — Accepted
8. **AUDIT** — "Decision recorded" with an illustrative date/time stamp

On the timestamp specifically: 0033 deliberately avoided one, reasoning that a specific
time could read as fabricated live activity. This slice includes one, because the entire
panel is already labelled "Simulated for demonstration" in real visible text (unchanged
from 0033) — a timestamp *inside* an artifact already disclosed as illustrative is no
more a fabrication than the invented program name "CloudVault" is. It is not claimed as
real activity anywhere on the page.

Hold at phase 8, fade, restart — same reset primitive as 0033, just retimed for the
longer 8-phase sequence.

## 6. Color and environment strategy

No new tokens, no repaint of the shared palette. What changes is *which* existing tokens
compose the hero: the hero band uses `bg-ink`/`text-canvas` (the same always-opposite
pair 0032 introduced for the philosophy/final-CTA bands) as its **primary** surface
instead of `bg-canvas`. This makes the hero itself one of the page's dark chapters
instead of the page's one light constant. Teal (`action`) is reserved exclusively for
"active/confirmed" state inside the live artifacts and stepper — never decorative.

Chapter rhythm (dark/light alternation), replacing 0033's canvas-canvas-ink-canvas-ink
pattern:

1. HERO — dark (product stage)
2. PRODUCT PROMISE — light
3. SIGNAL IN MOTION (lifecycle stepper) — dark
4. TWO SIDES (researcher ↔ organization) — light
5. REAL PRODUCT (interface fragments) — dark
6. WHY THE RECORD MATTERS (philosophy) — light
7. PUBLIC DISCOVERY — light (visually subordinate, stays quiet, no chapter break needed for one line)
8. FINAL CTA — dark

## 7. Typography decision

Fraunces is demoted, not removed. The audit's own finding was specific: a Fraunces-led
*headline*, at large scale, reads as editorial/magazine. The fix: the hero headline moves
to a bold system-sans register at very large scale (matching the weight or the "product
register" the brief asks for in §14) for the words that need to hit hard ("Find what
matters. Prove it. Resolve it."); Fraunces is kept only as a smaller, deliberate accent
— e.g. the section eyebrow/kicker on the light "chapter" sections — so it now reads as
one contrasting typographic choice rather than the page's dominant voice.

## 8. Section architecture

01 Hero (dark, live signal) · 02 Product promise (light) · 03 Signal in motion — the
existing `LifecycleStepper`, retained (dark) · 04 Two sides — a new interactive
researcher↔organization relationship sequence, replacing the previous two-column prose
block (light) · 05 Real product — real interface fragments, framed with a minimal mono
route label rather than a generic browser-chrome mockup (dark) · 06 Why the record
matters — the existing philosophy `WorkflowDiagram` (light) · 07 Public discovery —
one line, unchanged from 0033 (light) · 08 Final CTA (dark).

## 9. Real product primitives reused / what's illustrative

Reused unchanged: `MetadataPair`, `SectionLabel`, `StatusBadge`, `SeverityBadge`,
`ScopeStateBadge`, `ProgramStatusBadge`, `LifecycleStepper`, `WorkflowDiagram`. New in
this slice: a real-fragment presentation for section 05 built from the same badge/pair
components arranged to resemble an actual report workspace row (not a new invented
dashboard) with a mono route label (`sentinel.app/organizations/.../reports/...`)
instead of a generic device-frame mockup.

Everything shown remains illustrative and is labelled so in real visible text
("Simulated for demonstration" / route label makes clear it's illustrative navigation,
not a live link). No researcher counts, logos, ratings, or testimonials are added —
those remain the one category this project has ruled out since 0031, for the reason
restated in §1: they cannot be fabricated honestly, and competitors' use of them is
exactly the mechanism we cannot borrow.

## 10. Accessibility / motion strategy

Unchanged from 0033's proven approach: `usePrefersReducedMotion` defaults to the safe
(reduced) baseline until confirmed otherwise; every animated artifact's complete state is
always present in the DOM; autoplay pauses on hover/focus; every stage remains a real,
independently clickable/keyboard-operable button. The new researcher↔organization
sequence (§8, section 04) reuses `LifecycleStepper` rather than inventing new interaction
semantics.

## 11. Performance strategy

Unchanged: CSS `opacity`/`transform` only, plain `setTimeout`/`setInterval`, no animation
library, no video, no canvas.

## 12. Non-goals (explicit)

Not doing: a real screenshot/image asset of the authenticated app (fragile, would drift
from the real UI, and still requires illustrative data underneath it — a live-rendered
fragment of real components is more honest and more maintainable); a generic
browser-chrome/device-frame mockup anywhere on the page; any fabricated statistic, logo,
rating, or testimonial; scroll-jacking; a public program marketplace UI; any change to
RLS/RPCs/schema/auth/report or program lifecycle/the authenticated `HomePage`.

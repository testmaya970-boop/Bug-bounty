# 0077 — Unpatched visual identity: reference principles + three directions

Status: proposal, pre-implementation. No homepage code changes yet — this is the
strategy pass the user explicitly asked for before any further redesign.

## Why the last two passes plateaued (4/10 → 5/10 → 5.5/10)

Both prior passes changed styling (colors, cards, gradients, section backgrounds)
without changing the underlying visual *system*. A generic SaaS template with a dark
hero is still a generic SaaS template. The fix isn't another styling pass — it's
picking one governing visual idea and deriving everything (color, type, motion,
composition) from it, the way every brand below does.

## Reference principles (not styles to copy — the underlying idea each brand commits to)

| Brand | The one idea | Why it works |
|---|---|---|
| **Vercel** | Discipline expressed as near-total color absence. Color only ever labels a pipeline *state* (Ship Red, Preview Pink, Develop Blue), never decorates. | Restraint itself becomes the signature — there's nothing to imitate because there's nothing extra. |
| **Stripe** | One recurring atmospheric object (the gradient mesh) as the brand's signature, everywhere else stays quiet type and navy-not-black ink. | A single unmistakable visual device does more identity work than a whole palette. |
| **Linear** | Darkness as the native medium products live in, with exactly one accent color reserved only for interactive/focus states, and only real product screenshots as imagery — never illustration. | The absence of decoration + the presence of real UI *is* the aesthetic. Nothing is invented to look nice. |
| **Cohere** | One mathematical structure (Voronoi cells) drawn from the brand's own conceptual metaphor, expressed identically across logo, typeface, product, and marketing. | The graphic language isn't decoration bolted onto a SaaS template — it's the same idea, reused everywhere, so it reads as one brand no matter where you see it. |
| **TwelveLabs** | A single historical/conceptual reference (Muybridge's motion studies) made literal as the core symbol, tied directly to what the product actually does (video as data volume). | The signature object *is* an explanation of the product, not an illustration next to one. |
| **Pentagram (method)** | Translate the company's own underlying metaphor into ONE systemic visual device, then apply it with total consistency — never decorate; make the metaphor do all the work. | This is the actual master principle behind every brand above. |
| **Bugcrowd** (confirmed gap) | No distinctive documented visual system was found — navy/cyan B2B SaaS conventions, a hexagon logomark, nothing else recognizable without the logo. | This is a real, citable competitive opening: the market leader's aesthetic is generic. Unpatched doesn't need to out-produce Bugcrowd, just out-*think* it. |

**The master pattern, extracted**: every genuinely distinctive brand above picked
ONE governing idea tied to what the product actually *is* — not a mood board —
and let that idea generate the graphic language, not the other way around.
Unpatched's own idea is already sitting in the product itself and was named
directly in this brief: **security work becomes a permanent record.** Every
direction below treats that sentence as the thing to visualize, not as a tagline
to put over a hero image.

---

## Direction A — "The Ledger" (evidentiary, forensic, typographic)

**Visual concept.** The homepage reads like an actual audit ledger, not a marketing
page describing one. Every section is laid out as a real record entry: a
timestamp, an actor, a monospace identifier, a state, a decision. The page's
structure IS the record structure — SIGNAL → EVIDENCE → FINDING → TRIAGE →
DECISION → FIX → VERIFICATION → RECORD literally becomes the page's eight
vertical sections, each one a real ledger entry growing more resolved as you
scroll, culminating in a final, locked, timestamped, unforgeable-looking record
stamp.

**Signature object — "The Provenance Line."** A single vertical rule runs the
entire height of the page (like a court reporter's transcript margin or a git
blame gutter), with real timestamped, monospace-labeled tick marks at each of the
eight stage transitions. Every section anchors visually to this one line — it is
the spine of the whole page, not a decorative divider. In the product itself this
same line becomes the report timeline gutter already used in the report detail
view — literally the same component, not a marketing-only invention.

**Graphic language.** Nothing illustrated. Everything is typographic/structural:
monospace timestamps, a visible incrementing record ID (`REC-0000842`), redaction-
bar-style reveal animations (a black bar sliding away to reveal text, evoking a
declassified document), thin hairline connective rules between metadata fields,
real diff-style before/after states for the FIX stage (strikethrough old status →
new status, exactly like a real changelog).

**Color system.**
- Primary: true black (`#000000`) ink on warm paper-white (`#faf9f6`, not pure
  `#ffffff` — a "printed record" warmth, not a screen-white).
- The record spine itself is always black, regardless of section.
- Semantic accents appear ONLY as a single tick-mark color on the provenance line
  and its corresponding stage's one accent word — never as a section background:
  Signal = slate blue, Evidence = same slate blue (discovery phase, one color),
  Triage = amber, Decision = amber, Fix = amber (attention phase, one color),
  Verification = green, Record = black (resolved phase).
- Red exists nowhere on the marketing page at all — reserved entirely for the real
  product's active-critical-severity state. This is a deliberate, load-bearing
  restraint: red never appears as marketing decoration, so when it appears in the
  real product it still means something.
- Rule: color marks a WORD or a TICK, never a background. No section ever changes
  its canvas color. This is the opposite bet from the color-chapter redesign just
  reviewed — hierarchy comes from typographic weight and the provenance line's
  position, not from background color changing under the reader.

**Typography.** A serif or slab-serif display face (something with the gravity of
a legal record — e.g., a face in the family of Tiempos/Canela/GT Sectra) paired
with a monospace face (JetBrains Mono, already in the codebase) for every
timestamp/ID/status field, and a plain, quiet sans (Inter, already in the
codebase) for body copy only. The serif is the one deliberate, unusual choice —
most SaaS sites default to sans-only; a serif display face signals "record/
document" the way a monospace signals "code," reinforcing the ledger concept
before a single word is read.

**Composition patterns (4).**
1. **Ledger entry** — timestamp + actor + monospace ID left-aligned to the
   provenance line, content right of it. Used for all 8 stage sections.
2. **Redaction reveal** — a full-bleed black bar that slides away on scroll to
   reveal the section's one key sentence, used exactly twice (SIGNAL open,
   RECORD close) so it stays a rare, earned moment, not a tic.
3. **Diff block** — old-state/new-state shown side by side with a strikethrough
   and an arrow, used only at FIX/DECISION.
4. **The stamp** — a bordered, monospace, timestamp-bearing rectangle (the same
   visual grammar as `LiveWorkflowArtifact`'s existing "audit record" panel) used
   exactly once, at the very end, as the page's final, unmoving image.

**Motion concept.** The provenance line itself "draws" downward as you scroll
(a stroke-dasharray reveal, GPU-cheap, respects `prefers-reduced-motion` by
rendering fully drawn with no animation). Each stage's tick mark lights up
(color fades in) only when its section is in view — motion literally performs
the sentence "security work becomes a permanent record": nothing is skippable,
nothing reverses, the line only ever grows.

**Example hero.** Paper-white canvas. A single thin black vertical line begins
at the very top of the viewport. Next to its first tick: `SIGNAL · 00:00:01`.
Large serif headline: "Every finding becomes a record. No signal, ever
forgotten." Monospace subhead: `8 stages. 1 record. 0 silent edits.` No hero
image, no product screenshot, no gradient — the empty paper-white canvas with
one black line IS the hero.

**Example mid-page section (FIX/DECISION, diff block).** Left: `STATUS:
needs_information` struck through. Right, amber: `STATUS: accepted`. Below,
monospace: `actor: org_admin · 2026-09-16T14:28:03Z`. No card border, no
background tint — just black text, one amber word, on paper.

**Example CTA.** Black canvas (the one moment the whole page goes dark — the
record's final "sealed" state). The provenance line terminates in a closed,
locked-icon-free stamp: a plain rectangle reading `RECORD CLOSED ·
VERIFIED`. Two plain text links below, not pill buttons: "Continue as
researcher" / "Continue as organization," underlined, no fill.

---

## Direction B — "The State Machine" (systemic, diagrammatic, engineering-native)

**Visual concept.** The homepage looks like it was generated by the same state
machine that governs report status in the real product — because it is. Instead
of narrative copy sections, the whole page is one long, literal flowchart/graph:
nodes and edges, exactly like a rendered Mermaid/DOT state diagram, styled with
real production polish. This is the most "diagrammatic" of the three directions —
closest in spirit to Vercel's engineering-discipline-as-brand, but built around
Unpatched's own actual state machine rather than borrowed minimalism.

**Signature object — "The Live Node."** A single circular/hexagonal node (not a
security hexagon — a graph-theory node, deliberately drawn as a plain circle
with a thin ring, like a commit graph or CI pipeline visualization) that
represents one report as it moves through the 8 stages. This node is REUSED
literally throughout: it's the bullet point, it's the status indicator, it's the
hero's single moving element, it's the loading state. One shape, one meaning,
everywhere.

**Graphic language.** Real directed-graph edges (thin bezier connector lines
with a small arrowhead, exactly like a dependency graph or CI pipeline view) —
never decorative squiggles. Nodes connect only in the directions the real state
machine actually allows (this matters: a report can go `triaging → needs_info →
triaging` but never `resolved → new`, so the graphic language should visually
enforce that some edges are forward-only and some are bidirectional loops,
because that's a real constraint of the product, not artistic license). Grid-
paper faint background (very low opacity, like circuit-board grid paper) signals
"engineering," never "hacker."

**Color system.**
- Primary: near-black ink (`#111214`) on a cool near-white (`#f7f8fa`) — Vercel/
  Linear-adjacent restraint, not warm paper like Direction A.
- Node/edge default color: neutral gray. Color activates ONLY on the node/edge
  currently "live" in whatever animation or scroll-state is active — an inactive
  node is always gray, never colored decoratively.
- Semantic state colors (used only inside a node, never as a page background):
  Signal/Evidence = blue, Triage = amber, active Critical = red (the ONE place
  red is allowed, and only ever inside a node representing a real critical
  state), Verified/Record = green.
- Background always stays near-white or near-black (two states only, like
  Linear) — never a mid-tone colored section background. All hierarchy comes
  from which nodes are colored vs. gray at any given moment.
- Contrast rule: a colored node's fill is never used for its own label text —
  labels stay ink-on-canvas; color marks state, never carries text legibility
  risk.

**Typography.** Monospace-forward: a monospace face (JetBrains Mono) for ALL
node labels, edge labels, and section eyebrows — treated as the PRIMARY display
voice, not a secondary technical accent. A geometric sans (Space Grotesk,
already in the codebase) for headlines only, set large and tight. No serif
anywhere. This is the opposite typographic bet from Direction A: here, the
"technical record" feeling comes from monospace as hero type, not from serif
gravity.

**Composition patterns (4).**
1. **The graph** — the full state-machine diagram as a scroll-driven, full-bleed
   canvas, used as the page's spine (analogous to Direction A's provenance line
   but literally a 2D graph, not a 1D line).
2. **Node zoom** — scrolling into a stage "zooms" the graph so one node fills the
   frame and becomes a real annotated artifact (metadata pairs, real badges) —
   this is where `LiveWorkflowArtifact`-style real UI actually appears, docked
   inside a node rather than floating in a generic card.
3. **Edge annotation** — a label directly on a connector line explaining a real
   constraint ("only an org admin can traverse this edge"), used sparingly, 2-3
   times, to teach the product's real rules through the diagram itself.
4. **Split canvas** — background switches from white to black exactly once (at
   the "verification" stage) so the one color inversion in the whole page
   carries real weight, unlike Direction A which never inverts and the rejected
   color-chapter pass which inverted constantly.

**Motion concept.** As you scroll, the SAME literal graph animates: a traveling
dot moves node-to-node along the real edges (a `stroke-dashoffset` path
animation, GPU-cheap), lighting each node in its semantic color only as the dot
arrives and dimming the previous one back to gray — motion demonstrates the
state machine executing, not decorating a story about it.

**Example hero.** Cool white canvas, faint grid-paper texture. Center: one gray
circular node, unlit. Headline in Space Grotesk: "Every report is a state
machine. Every transition, provable." As the page loads, the node pulses blue
once (Signal), then fades to steady gray, waiting for scroll — establishing
immediately that this page IS the diagram, not a page describing one.

**Example mid-page section (Triage node zoom).** The single amber node expands
to fill 60% of the viewport width; inside it, real product chrome:
`STATUS: needs_information`, a monospace timestamp, an edge label reading
"← can return to Triage; cannot skip to Decision." Plain, ungridded, a real
diagram fragment, not a card.

**Example CTA.** Background flips to black (the one inversion). The graph
terminates in a green, filled (not just outlined) terminal node labeled
`RECORD`. Below it, two monospace text buttons in bracket notation: `[
continue as researcher ]` / `[ continue as organization ]` — bracket styling
carries the "this is a real system prompt, not a marketing button" idea through
to the CTA itself.

---

## Direction C — "The Chain of Custody" (editorial, physical, evidentiary-object)

**Visual concept.** Borrows Cohere's move (one real conceptual metaphor drawn
from the physical, non-digital world) rather than Vercel/Linear's engineering-
minimalism move. The controlling metaphor: a physical evidence chain-of-custody
folder — the literal paper trail a real investigator hands from person to
person, each transfer signed, dated, sealed. Warmer, more editorial, more
"human institution" than Directions A or B, closer in spirit to how a courtroom
or an insurance claim actually looks, not how a SaaS dashboard looks.

**Signature object — "The Seal."** A single circular wax-seal-inspired mark —
but rendered completely abstractly (no wax texture, no heraldry, no skeuomorphic
gloss: just a plain ring with a solid-fill center and one thin radial tick, like
a caseworker's rubber stamp reduced to pure geometry) that appears exactly once
per record stage, gaining one more concentric ring each time the record advances
(Signal = 1 ring, Evidence = 2 rings, ... Record = 8 concentric rings, fully
"sealed"). This is the one object in all three directions that's allowed to be
slightly more "designed object" than pure UI chrome — but it's still built from
flat geometry, never an illustration or icon-pack shield.

**Graphic language.** Real torn-edge/perforation motifs used exactly once (the
page's opening "intake" moment, like tearing a claim form off a pad) — sparingly,
never repeated, so it reads as a considered editorial device, not a texture
pack. Annotation marginalia: small, real, monospace side-notes in the margin
next to each section (like a case file's handwritten margin notes, but
typeset, never handwriting-font gimmicks). A subtle paper-grain background
texture at extremely low opacity (2-3%), used ONLY on the lightest sections, to
reinforce "physical document," never applied to the dark sections.

**Color system.**
- Primary: warm off-white "folder" tone (`#f5f1e8` — genuinely warmer than
  Direction A's paper-white) with deep brown-black ink (`#241f1a`, not pure
  black — a "aged ink," not a screen black).
- The Seal is always the same deep brown-black regardless of stage; only its
  ring-count changes, never its color — resolution is shown through ACCUMULATION
  (more rings), not through color-coding, which is the direction's one genuinely
  novel idea versus A and B.
- Semantic accents (used only as a single marginalia-note color, never
  background): discovery/evidence = ink blue, triage/attention = ink amber,
  verified/resolved = ink green — all deliberately desaturated, "aged-document"
  versions of the hues, not bright screen colors.
- Red is reserved, again, entirely for the real product's active-critical state
  — never appears on the marketing page.
- One deliberate full-color-inversion "vault" section exists (deep brown-black
  background, warm folder-tone ink) used exactly once, framed explicitly as "the
  record, once sealed, is kept somewhere the light doesn't reach" — the closing
  chapter, not a recurring device.

**Typography.** A humanist serif for display type (something with real warmth —
in the family of Tiempos or Untitled Serif) paired with a "typewriter" monospace
(a slightly rougher mono than JetBrains — or JetBrains Mono itself set with
looser tracking to read less "IDE," more "case file") for every timestamp/
annotation, and Inter for body copy. Warmer and more editorial than Direction A's
colder legal-serif; the closest of the three to a genuine "print magazine"
feeling.

**Composition patterns (5).**
1. **The intake tear** — the hero's one torn-edge moment, introducing the record
   as a physical object being opened.
2. **Marginalia block** — body copy with a real annotation in the left margin
   (not a card, not a callout box — literally styled like a case-file margin
   note), used throughout for the 8-stage narrative.
3. **The accumulating seal** — the signature object, shown growing more rings at
   each stage transition, functioning as the page's own progress indicator
   instead of a generic scroll progress bar.
4. **Full-bleed vault** — the one color-inverted closing section.
5. **Artifact insert** — real product UI (the existing `LiveWorkflowArtifact`/
   `RealProductFragment`) presented as a literally "inserted" object — drawn with
   a thin drop shadow and a slight rotation (1-2°), like a photograph paper-
   clipped into a case file, rather than floating in a generic centered card.

**Motion concept.** The Seal's rings draw in one at a time as each stage scrolls
into view (same stroke-drawing technique as Direction A/B, applied to
concentric circles instead of a line or graph) — by the final section, all 8
rings are drawn and the seal audibly (visually) "closes." This is the most
overtly emotional/satisfying motion payoff of the three, at the cost of being
the most produced/least minimal.

**Example hero.** Warm folder-tone canvas, faint paper grain, a torn top edge
graphic (thin, abstract, not literally torn-paper-texture-stock-photo). Serif
headline: "Open a case. Close it with proof." The Seal appears at 1 ring,
bottom-right, small. No product screenshot in the hero at all — establishing
tone before showing product.

**Example mid-page section (Triage, marginalia block).** Body copy runs
centered, editorial-width (65ch). To its left, in the margin, small monospace
annotation: `Δ triage · needs_information · by org_admin`. The amber ink-tone
appears only in that one margin note's leading dot, nowhere else on the section.

**Example CTA.** The Vault — background inverts to deep brown-black, folder-tone
ink. The Seal, now fully 8-ringed, centers the section, large. Below: "Every
case closes with a record. Start yours." Two text links, understated, echoing
Direction A's restraint rather than pill buttons.

---

## Brand test — how each direction holds up

| Test | A: The Ledger | B: The State Machine | C: Chain of Custody |
|---|---|---|---|
| Remove the logo — still recognizable? | Yes — the provenance line + serif/mono pairing is distinctive without any wordmark. | Yes — the literal state-graph is unmistakable and unlike any competitor. | Yes — the Seal + warm folder tone is distinctive, though closer to "editorial legal-tech" as a category than fully novel. |
| Remove all copy — still feels like the brand? | Yes — the ledger structure carries entirely in layout/line/type. | Yes — arguably the strongest here; the diagram IS the composition. | Yes, but slightly more copy-dependent than A/B since marginalia is textual by nature. |
| Swap the product screenshot for a generic dashboard — does it collapse into generic SaaS? | No — the page barely uses screenshots at all; the stamp/diff-block devices don't depend on any screenshot. | No — screenshots are subordinate to the graph; even without one, the diagram carries the whole page. | Partial risk — the "artifact insert" device is more central here; a generic dashboard photo would weaken it, though the Seal and marginalia would still carry identity. |
| Convert to grayscale — does type/composition still read as distinctive? | Yes, strongly — this direction was built color-restrained already, so grayscale changes almost nothing. | Yes — restraint was already the default state; only the "lit node" animation loses meaning, structure doesn't. | Mostly — texture/grain and the ink-warmth read even in grayscale, though some of "aged document" feeling depends on the warm tone specifically. |
| One screenshot only — does surrounding language still say Unpatched? | Yes. | Yes, most strongly (the graph doesn't need the screenshot to make sense). | Yes, though this direction leans on the screenshot more than A/B to feel "real" rather than purely conceptual. |

## Recommendation

**Direction B — "The State Machine" — best expresses "security work should leave
a record," and should be pursued.**

Reasoning: Direction A ("The Ledger") is the most elegant and the closest in
spirit to Stripe's restraint-plus-one-signature-device move, but it visualizes
the record as a *linear* thing (a line, a ledger), when the actual product
truth — and the actual competitive differentiator described in this session's
own earlier code (`submit_report`'s real state machine, the `program → scope →
report → triage → decision → audit` structure already built into
`LifecycleStepper`/`WorkflowDiagram`) — is that a report's path is a **directed
graph with real constraints**, not a straight line. Direction B is the only one
of the three that visualizes the thing Unpatched actually built (a real, non-
linear, constrained state machine with legitimate branches like
`triaging ⇄ needs_information`) rather than a simplified narrative version of
it. It also passes the brand test most cleanly across every row, requires the
least reliance on screenshots to read as "Unpatched" (important, since this
session has repeatedly confirmed there's no customer-logo/testimonial inventory
to lean on), and it's the direction most directly reusable inside the real
product UI later — the same literal graph component could plausibly become a
real report-detail visualization, not just a marketing device, which is exactly
the kind of one-idea-everywhere consistency Cohere and Linear both demonstrate.

Direction C is the most emotionally warm and the most "not generic SaaS," but it
leans furthest from what this app already is technically, and Direction A,
though very clean, still visualizes a resolved-after-the-fact record rather than
the live, branching decision process that's the actual core product truth.

**Recommended next step**: build Direction B's hero + one mid-page "node zoom"
section as a real, scoped prototype (not the whole page) so it can be judged
live before committing to a full rebuild — matching the discipline this session
has followed throughout (verify live before claiming done), rather than jumping
straight to another full-page implementation pass.

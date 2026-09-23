# BRIEF — Unpatched homepage (scroll-craft)

Interviewed in-session; some topics delegated ("keep hold the sentence work on
other" — the existing hero headline stays as-is; the user opted not to specify
a new core-belief sentence and asked to proceed on everything else).

## 1. Vibe

**In the user's words:** "premium, trusted... more editorial rather than a
bunch of different AI generated assets and not like a world that we'd be
flying through... more premium."

No named references were supplied. Read as: restraint over spectacle, printed/
documentary authority over consumer-product gloss, substance the visitor reads
rather than a scene they're carried through.

## 2. The scroll journey (user's own sequence, from prior work this session)

The existing homepage already states a real sequence in its own copy and
component order: signal → evidence → finding → triage → decision → fix →
verification → record. This is not an invented journey — it's the actual
Unpatched report lifecycle, already validated through multiple redesign passes
earlier in this session, and it is what the new build organizes as chapters.

## 3. Energy curve

Even and measured throughout — an editorial grammar reads at one register, not
a rollercoaster. The one deliberate rise is the close (the colophon/audit
stamp), which resolves rather than climaxes.

## 4. Feeling curve (see §6 below — written before acts, per feel.md §1)

## 5. Signature move

**The case-file margin rail.** A persistent thin column fixed at the page
edge, present the whole scroll. Each chapter, on entry, stamps one real dated/
attributed entry into it (actor, timestamp, the chapter's real decision — e.g.
"researcher · evidence attached · 00:01" through "org_admin · verified ·
00:07"). Nothing in the rail is invented copy — every line is the chapter's
own real content, restated as a record entry. By the close, the rail is a
complete, literal audit trail **of the visit itself** — the reader has just
lived the exact thing Unpatched promises to do for a real vulnerability
report. This is not the "line drawing that builds itself" example from
uniqueness.md §3 (no stroke-dashoffset object here) — it's closer to the
"running receipt" pattern but built from real chapter content rather than
tallied numbers, and it doubles as a navigation trace.

## 6. Aesthetic range

**Editorial** (uniqueness.md §5): paper, folios, measure, restraint. Matches
"premium, trusted" directly. Rules out premium-minimal's dark-with-one-accent
default (already used and rejected in this session's earlier "generic dark
gradient hero" attempts) and rules out brutalist (already built and shelved
as a separate prototype earlier this session — not this task).

## 7. World: distinct chapters, not one continuous world

Confirmed explicitly: "not like a world that we'd be flying through." This
is the **Chaptered editorial** grammar (uniqueness.md §2.2), not Continuous
world (§2.4) or Filmic one-shot (§2.1).

## 8. Assets

Confirmed explicitly: line art + typography only, no photography, no AI-
generated stills or video. The build uses:
- The existing hand-drawn SVG line art already built this session
  (`components/marketing/hero-art/bug-specimen.tsx`, `audit-seal.tsx`) —
  a specimen-plate beetle and a notary audit seal, stroke-only, museum-label
  register. These already fit the chaptered-editorial world better than they
  fit the single-column marketing hero they were built for, since a specimen
  plate and a notary seal are literally editorial/documentary objects.
  No new imagery is generated.
- Real product UI fragments where the chapter needs to show, not tell (the
  report inbox table, badges) — reused from existing components, never a
  fake screenshot.
- Strong editorial typography as the primary visual instrument, per the
  grammar's own definition.

---

## The core belief

**Held as-is per explicit instruction** ("keep hold the sentence work on
other"): the existing hero headline, "Every finding becomes a record no one
can quietly change," continues to be the page's stated thesis. Not replaced,
not reworded.

## The one action

**Dual CTA, confirmed:** "Continue as researcher" / "Continue as
organization" — the real two-sided product, kept exactly as it already
exists on the page.

---

## 6. Feeling curve (feel.md §1 — written before acts)

```
1  Recognition   the title page: the real headline, on paper, no media above
                 the fold — the specimen plate's edge just visible, cropped
2  Curiosity     chapter one (Signal → Evidence): the beetle specimen plate,
                 full, with its real callout labels (Unvalidated input,
                 Broken access control...) read as case annotations, not art
3  Tension       chapter two (Finding → Triage): the real severity/state-
                 machine facts, set as museum labels, hard-cut ground change
4  Confidence    chapter three (Decision → Fix → Verification): the real
                 product UI fragment (the actual report inbox), captioned,
                 in its own column — "this is not a mockup" made literal
5  Resolve       chapter four (Record): the audit seal, full, its ring text
                 (RECEIVED / TRIAGED / DECIDED / RECORDED) now read as the
                 chapter's own thesis restated. The margin rail's last
                 stamp lands here.
6  Quiet resolve close: colophon plate. Small type. The dual CTA as a line
                 of running text, not a button island. The rail's full
                 trail is visible one last time, complete.
```

## The peak

> **it's the site where scrolling stamps your own visit into a real audit
> trail in the margin, and by the end it's the exact record the page has
> been describing the whole time.**

Lives in chapter four → close (Record chapter, where the rail's stamps
resolve into a visibly complete trail). Gets the largest span, the quiet
chapter-three ground-change as its silence-before, and the full rail-reveal
as its asset.

## Tell-someone sentence

**"It's the site where your own scroll becomes the audit trail it's showing
you."**

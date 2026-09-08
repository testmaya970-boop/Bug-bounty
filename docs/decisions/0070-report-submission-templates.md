# 0070 — Report submission templates per weakness type

## Status

Accepted. Closes the "one generic form for every report type" gap from the feature-parity
review — Bugcrowd ships 50+ pre-built templates by VRT category, HackerOne relies on
written guidance rather than in-form templates. This document takes the Bugcrowd-shaped
approach (in-form, structural), scoped to this codebase's existing, smaller, fixed
`ReportWeaknessType` taxonomy (16 categories, `lib/report-weakness-labels.ts`) rather than
Bugcrowd's much larger VRT tree — one real, well-considered template per existing weakness
type, not fifty thin ones.

## Design

A new pure-presentation module, `lib/report-templates.ts`, following the exact pattern
`lib/report-weakness-labels.ts` already establishes (a `Record<ReportWeaknessType, T>` map
plus an accessor function, deliberately not server-only since this is display/prefill
logic only).

Each template supplies:
- `descriptionScaffold`: a structured, fill-in-the-blank starting point for the
  Description field — section headers the researcher replaces with their own real
  content (e.g. for XSS: "Vulnerable parameter:\n\nPayload used:\n\nSteps to
  reproduce:\n1. \n2. \n3. \n\nObserved behavior:"), not prose the researcher is meant to
  submit unedited.
- `impactPrompt`: one weakness-type-specific question to prime the Impact field (e.g. for
  IDOR: "What data or actions belonging to another user were you able to
  access?"), shown as helper text, not prefilled into the textarea itself — impact is a
  one- or two-sentence answer, not a scaffold worth pre-filling with headers.

## Why prefill Description but only prompt Impact

A reproduction section genuinely benefits from structure (numbered steps, a labeled
payload) that most researchers would otherwise reinvent inconsistently every time — this
is exactly the value Bugcrowd's own templates provide. An impact statement is short and
personal to the specific finding; pre-filling it with headers would produce more
boilerplate to delete than value gained. This mirrors `create-report-form.tsx`'s own
existing severity-field precedent: "Not set" is a first-class choice, not a hidden
default, and the impact field's existing helper text is already exactly this kind of
one-line prompt — the template only makes that same prompt weakness-specific instead of
generic.

## UI integration

`create-report-form.tsx`'s weakness-type `<Select>` gains an `onChange` side effect: when
a template exists for the newly selected type AND the description field is still empty
(never overwrite real, already-typed content — a researcher who started typing before
picking a category, or who changes category mid-draft after already writing something,
keeps every word they wrote), the scaffold is inserted into `description` and the
weakness-specific impact prompt replaces the Impact field's static helper text. Switching
weakness type after the description is non-empty only ever changes the impact prompt
text, never touches the description — silently overwriting typed content when a dropdown
changes is exactly the kind of surprising behavior this form's own `hasUnsavedContent`/
`beforeunload` guard exists to protect against.

## What this does not do

- Does not add a "reset to template" button, does not add a template preview/picker UI
  separate from the weakness-type select that already exists — one dropdown drives both
  the category and its template, matching how the form already treats weakness type as
  the one field that determines report shape.
- Does not change `submit_report`'s validation, `SubmitFailure`, or any server-side
  behavior — a template-filled description is validated as ordinary description text,
  identically to a hand-written one; there is no "this came from a template" flag anywhere
  in the data model.
- Does not template the Title or Target fields — both are inherently specific to the
  individual finding and have no meaningful generic scaffold.

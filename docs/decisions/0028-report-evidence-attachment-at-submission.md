# 0028: Report evidence attachment at submission — a UI orchestration, not a backend change

Date: 2026-08-31
Status: Accepted

## Context

`docs/decisions/0011-binary-evidence-storage.md` built a complete, proven binary-evidence backend (private storage, opaque object keys, server-derived SHA-256, forced-attachment downloads, RLS visibility, audit events). `docs/decisions/0010` built the equivalent for text/code/url/log evidence. Both are only reachable **after** a report row already exists — `submit_report` has no evidence parameter, by design (0010: evidence is its own domain concept, added via its own RPCs, never folded into report creation). The product gap was never the evidence backend — it was that `CreateReportForm` offered no evidence workflow at all, so a researcher's only path to attaching anything was to submit a bare report first, then discover the evidence composers (already fully built) buried further down the report detail page on a second visit.

## What was audited before writing any code

`CreateReportForm` (target/title/description only, no evidence of any kind), `ResearcherEvidenceComposer`/`ResearcherFileEvidenceComposer` (already fully built and already wired into the report detail page, at `components/reports/report-evidence.tsx`), `services/report-file-evidence.ts` and `actions/report-file-evidence.ts` (both already correct and complete per 0011), and the report detail page's existing layout (evidence composers already rendered in an "Evidence" card, below the evidence list). This confirmed precisely where the real gap was: the submission form, not the evidence backend, and not the detail page.

## Design: stage locally, submit sequentially, never fake atomicity

Evidence and files are staged in `CreateReportForm`'s own local React state (`stagedEvidence`/`stagedFiles`) — nothing is sent to the server until the researcher clicks "Submit report." On submit: `submitReportAction` runs first (unchanged); only once it succeeds does the form loop over the staged items, calling the exact same `addResearcherEvidenceAction`/`uploadResearcherFileEvidenceAction` the report detail page already uses, with the newly-created report's real id. Only after every staged item has been attempted does the researcher navigate to the report detail page — where, in the normal case, every staged item is already visible, because it already is attached.

This is **not** presented as one atomic operation, because it structurally is not one — two separate network round trips (report creation, then evidence attachment) can fail independently. If report creation itself fails (a bad target, a closed program), staged evidence and files are preserved untouched in local state — the researcher never has to redo them just to fix a title or wait out a rate limit. If report creation succeeds but one or more staged items fail to attach afterward (a transient failure between two real calls), the failure count travels with the redirect as a query parameter and the report detail page shows one honest, one-time banner ("One item you added didn't attach. Add it again below, in Evidence.") pointing at the composers that were already there — never a silent drop, never a fabricated "your evidence was saved" claim.

## What was deliberately not touched

`submit_report`, `add_researcher_file_evidence`, `add_organization_file_evidence`, `add_researcher_evidence`, every RLS policy, the 10 MiB limit, the rate limiter, the signed-download-URL flow, the report detail page's own evidence composers (still the retry path for the rare partial-failure case) — none of this was modified. `report-evidence.tsx` gained four `export` keywords (`EVIDENCE_TYPE_LABELS`, `MAX_FILE_SIZE_BYTES`, `TextualEvidenceType`, `EVIDENCE_TYPES`, `FileField`) and zero logic changes, specifically so the submission form's staged composer reuses the identical file-input UI and type list rather than a second, drifting copy.

## Live verification (real Chromium, real backend)

A real researcher account, on a real program with real scope, filled target/title/description, staged one text evidence entry (visible in a removable list before submit) and one real file attachment (same), removed a staged entry to confirm "Remove" only deletes the targeted item, then submitted once. Result: the report was created, and both the staged text evidence and the staged file were already present on the report detail page on first load — no `evidenceIssues` banner, no manual re-attachment step. One `h1`, no horizontal overflow at 1440/1024/768/390/320.

## What remains genuinely unverified

The partial-failure banner path (one or more staged items failing to attach after a successful report submission) was reasoned through and code-reviewed rather than live-forced — reliably inducing a failure between two already-proven, already-tested RPC calls without corrupting other test state was not attempted this slice. The counting/query-param logic itself is a straightforward loop with no new authorization or state-machine surface, and both underlying actions it calls are independently covered by this codebase's existing test suite.

## Tests

Two new structural tests in `tests/unit/reports-ui.test.tsx` (the form offers both composers before submission; no staged rows exist by default). No new interactive/orchestration test was added, per this codebase's own established convention — real submit-then-attach sequencing is exactly the kind of stateful, multi-step behavior this codebase defers to real Chromium, not `renderToStaticMarkup`.

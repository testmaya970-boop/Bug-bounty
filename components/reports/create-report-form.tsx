"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Card, Alert } from "../ui/feedback";
import { Button } from "../ui/button";
import { Checkbox, Input, Select, Textarea } from "../ui/form";
import { ProgramPolicySummary } from "../programs/program-policy";
import type { ProgramPolicy } from "../../types/program-policy";
import { MarkdownTextarea } from "../ui/markdown-textarea";
import { SectionLabel } from "../ui/security-primitives";
import { submitReportAction, addResearcherEvidenceAction } from "../../actions/reports";
import { uploadResearcherFileEvidenceAction } from "../../actions/report-file-evidence";
import { EVIDENCE_TYPE_LABELS, EVIDENCE_TYPES, FileField, MAX_FILE_SIZE_BYTES, type TextualEvidenceType } from "./report-evidence";
import { assetTypeLabel } from "../../lib/scope-labels";
import { WEAKNESS_TYPE_ORDER, weaknessTypeLabel } from "../../lib/report-weakness-labels";
import { getReportTemplate } from "../../lib/report-templates";
import type { ProgramAssetType } from "../../types/scope";
import type { ReportSeverity, ReportWeaknessType } from "../../types/report";
import { LocalTime } from "../ui/local-time";

const ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];

const TARGET_PLACEHOLDER: Record<ProgramAssetType, string> = {
  domain: "api.example.com",
  url: "https://api.example.com/admin",
  ip_cidr: "203.0.113.5",
  ios_app: "https://apps.apple.com/app/id123456789",
  android_app: "https://play.google.com/store/apps/details?id=com.example.app",
  source_code: "https://github.com/example/repo",
  hardware: "Model XR-200 router",
  ai_model: "gpt-example-v2",
};

// A persistent reminder of the real format each asset type's canonicalization enforces
// (private.canonicalize_scope_target, 202609030005_richer_scope_asset_types_logic.sql) --
// the placeholder text above already shows a correct example, but it disappears the
// instant a researcher starts typing, leaving no visible reminder of the one rule most
// likely to trip a real submission (a URL's own query string/fragment, confirmed live as
// a real first-attempt rejection). Phrased as guidance, not the error message itself --
// the server's INVALID_TARGET message is still the one source of truth actually enforced.
const TARGET_HELPER_TEXT: Record<ProgramAssetType, string> = {
  domain: "A bare hostname -- not a URL, port, or path.",
  url: "No query string or fragment -- put reproduction details in Description below.",
  ip_cidr: "A single IP address or a CIDR range, e.g. 203.0.113.0/24.",
  ios_app: "The app's App Store URL.",
  android_app: "The app's Google Play URL.",
  source_code: "A repository URL.",
  hardware: "The device model or identifier.",
  ai_model: "The model name or identifier.",
};

// "Not set" (an empty string in the <select>) is a real, first-class choice, not a
// missing one -- researcher_severity is nullable and optional at the database level
// (see docs/decisions/0047). Ordered least-to-most severe, matching the researcher's own
// mental model of "how bad is this" as an escalating scale, not the neutral/no-implied-
// order convention docs/decisions/0016 uses for reputation fact types.
const RESEARCHER_SEVERITY_OPTIONS: { value: ReportSeverity | ""; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

/**
 * Every code submit_report can actually raise (see supabase/migrations' submit_report
 * and docs/decisions/0018's added RATE_LIMITED), mapped to a calm, specific, safe
 * sentence -- never the server's own message verbatim for the cases the researcher can
 * personally act on differently (title/description go to field-level errors instead of
 * a form-level banner; a stale field value from an unrelated failure is never blamed on
 * the wrong field). Never a raw SQLSTATE/Postgres detail reaches this component --
 * services/rpc-error.ts's mapRpcError already guarantees that upstream.
 */
export type SubmitFailure = { banner?: string; titleError?: string; descriptionError?: string; targetError?: string; weaknessTypeError?: string; impactError?: string };

export function classifyFailure(code: string, message: string): SubmitFailure {
  switch (code) {
    case "AUTH_REQUIRED":
      return { banner: "Your session has expired. Sign in again to continue." };
    case "RATE_LIMITED":
      return { banner: "Too many requests. Try again shortly." };
    case "FORBIDDEN":
      return { banner: "You are not currently an authorized, active researcher for this program." };
    case "PROGRAM_NOT_FOUND":
    case "SUBMISSIONS_CLOSED":
      return { banner: "This program is not currently accepting reports." };
    case "KYC_REQUIRED":
      // submit_report's own message is already specific and correct -- surfaced verbatim,
      // the same convention INVALID_TITLE/INVALID_DESCRIPTION/INVALID_IMPACT already use
      // for a real, server-computed, safe-to-show sentence. Previously fell to the
      // generic default banner ("The request could not be completed...") -- confirmed
      // live as a real gap: this is the one code submit_report can raise that this
      // switch never had a case for.
      return { banner: message };
    case "TARGET_NOT_ELIGIBLE":
      return { targetError: "This target is not currently inside the program's scope." };
    case "INVALID_TARGET":
      // canonicalize_scope_target's own message is already specific and safe to show
      // verbatim (the same real-format-rule guidance TARGET_HELPER_TEXT above warns about
      // preventively) -- confirmed live as a real gap: a malformed target (e.g. a URL's
      // own query string on a domain-type entry) fell to the generic default banner
      // instead of this field-level, already-correct message.
      return { targetError: message };
    case "INVALID_TITLE":
      return { titleError: message };
    case "INVALID_DESCRIPTION":
      return { descriptionError: message };
    case "INVALID_WEAKNESS_TYPE":
      return { weaknessTypeError: "Select the type of weakness you found." };
    case "INVALID_IMPACT":
      return { impactError: message };
    default:
      return { banner: "The request could not be completed. Try again in a moment." };
  }
}

type StagedEvidence = { localId: string; evidenceType: TextualEvidenceType; content: string };
type StagedFile = { localId: string; file: File };

/** A per-program draft, persisted to localStorage -- real, on top of (not replacing) the
 * existing beforeunload loss-prevention prompt below. Only serializable fields are saved:
 * stagedFiles holds raw browser File objects, which cannot round-trip through JSON/
 * localStorage, so attached files are never part of a restored draft (the researcher
 * re-attaches them, same as they would after any other kind of page reload). Keyed per
 * program (`sentinel-report-draft-${programId}`) so drafts for two different programs
 * never collide or overwrite each other. Standard localStorage pattern (read once on
 * mount inside useEffect, write on change) with try/catch discipline -- localStorage can throw in a private-browsing context or when
 * site data is blocked, and a draft failing to save/load must never break the form itself. */
type DraftFields = {
  assetType: ProgramAssetType;
  target: string;
  title: string;
  weaknessType: ReportWeaknessType | "";
  description: string;
  impact: string;
  researcherSeverity: ReportSeverity | "";
  stagedEvidence: StagedEvidence[];
  savedAt: string;
};

function draftStorageKey(programId: string): string {
  return `sentinel-report-draft-${programId}`;
}

function readDraft(programId: string): DraftFields | null {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(programId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftFields;
  } catch {
    return null;
  }
}

function writeDraft(programId: string, draft: DraftFields): void {
  try {
    window.localStorage.setItem(draftStorageKey(programId), JSON.stringify(draft));
  } catch {
    /* Best-effort only -- a draft that can't be saved (private browsing, blocked site
       data, storage quota) must never break the form the researcher is actively filling
       in. */
  }
}

function clearDraft(programId: string): void {
  try {
    window.localStorage.removeItem(draftStorageKey(programId));
  } catch {
    /* Same best-effort reasoning as writeDraft. */
  }
}

/** Presentation only -- a professional evidence collection shows a size, not just a
 * filename (see docs/decisions/0043, section 9). `MAX_FILE_SIZE_BYTES` stays the real,
 * unchanged enforcement boundary; this never affects it. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Evidence cannot actually be attached to a report until the report row exists --
 * submit_report has no evidence parameter, by design (see docs/decisions/0010): evidence
 * is its own domain concept, added via its own RPCs, never folded into report creation.
 * So "attach evidence during submission" is a UI orchestration, not a new backend
 * capability: evidence and files are staged here, in local state only, and only sent --
 * via the exact same addResearcherEvidenceAction/uploadResearcherFileEvidenceAction the
 * report detail page already uses -- immediately after the real report row is created,
 * before the researcher ever leaves this page. If a staged item fails to attach (a rare
 * case: a network drop between the two calls, a transient rate limit), the report itself
 * already exists for real -- the researcher lands on it with an honest count of what
 * didn't attach and can add it again using the identical composer already there. Nothing
 * here pretends this is one atomic operation; it deliberately is not one.
 */
export function CreateReportForm({
  organizationId,
  programId,
  programName,
  inScopeTargets = [],
  policy = null,
}: {
  organizationId: string;
  programId: string;
  programName: string;
  inScopeTargets?: { assetType: ProgramAssetType; displayTarget: string }[];
  /** The program's effective policy; when set, the researcher must accept this exact version. */
  policy?: ProgramPolicy | null;
}) {
  const router = useRouter();
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [assetType, setAssetType] = useState<ProgramAssetType>("domain");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [weaknessType, setWeaknessType] = useState<ReportWeaknessType | "">("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");
  // docs/decisions/0070: the weakness-specific impact prompt replaces this field's static
  // helper text once a category is picked; the description scaffold is only ever
  // inserted while description is still empty (see handleWeaknessTypeChange), so a
  // researcher's own already-typed content is never silently overwritten by a later
  // category change.
  const [impactPrompt, setImpactPrompt] = useState<string | null>(null);
  const [researcherSeverity, setResearcherSeverity] = useState<ReportSeverity | "">("");
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [pending, startTransition] = useTransition();

  // Real published in-scope targets for the currently-selected asset type, offered as
  // autocomplete suggestions (a native <datalist>, not a hard-enforced picker) -- a
  // researcher can still type a target that isn't listed yet; the server RPC makes the
  // final scope decision regardless, same as before. Matches the target-suggestion pattern
  // HackerOne/Bugcrowd's own report forms use.
  const matchingScopeTargets = inScopeTargets.filter((entry) => entry.assetType === assetType).map((entry) => entry.displayTarget);

  const [stagedEvidence, setStagedEvidence] = useState<StagedEvidence[]>([]);
  const [draftEvidenceType, setDraftEvidenceType] = useState<TextualEvidenceType>("text");
  const [draftEvidenceContent, setDraftEvidenceContent] = useState("");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const hasRestoredDraft = useRef(false);

  // Restore once on mount only -- never re-runs on programId change since this component
  // is remounted (not re-parameterized) per program page. Runs after the initial render so
  // it never disagrees with server-rendered markup (localStorage is unavailable during SSR).
  useEffect(() => {
    if (hasRestoredDraft.current) return;
    hasRestoredDraft.current = true;
    const draft = readDraft(programId);
    if (!draft) return;
    setAssetType(draft.assetType);
    setTarget(draft.target);
    setTitle(draft.title);
    setWeaknessType(draft.weaknessType);
    setDescription(draft.description);
    setImpact(draft.impact);
    setResearcherSeverity(draft.researcherSeverity);
    setStagedEvidence(draft.stagedEvidence);
    setDraftRestoredAt(draft.savedAt);
  }, []);

  // Debounced write, not one per keystroke -- mirrors the file-evidence/text-evidence
  // composers' own "don't fire a real action on every keystroke" convention, just for
  // localStorage instead of a server action. Never saves while pending (matches
  // hasUnsavedContent below): a draft mid-submit would just be immediately cleared anyway.
  useEffect(() => {
    if (!hasRestoredDraft.current || pending) return;
    const hasContent = target.trim() || title.trim() || description.trim() || impact.trim() || stagedEvidence.length > 0;
    if (!hasContent) {
      clearDraft(programId);
      return;
    }
    const timeout = setTimeout(() => {
      writeDraft(programId, { assetType, target, title, weaknessType, description, impact, researcherSeverity, stagedEvidence, savedAt: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(timeout);
  }, [programId, assetType, target, title, weaknessType, description, impact, researcherSeverity, stagedEvidence, pending]);

  // Lightweight loss prevention, not an autosave backend (see docs/decisions/0042): a
  // researcher who has started a real finding (target, title, or description) and tries
  // to navigate away gets the browser's own confirmation prompt. Never armed during an
  // actual submit -- `pending` already means the entered content is on its way to being
  // saved for real.
  const hasUnsavedContent = target.trim().length > 0 || title.trim().length > 0 || description.trim().length > 0 || impact.trim().length > 0;
  useEffect(() => {
    if (!hasUnsavedContent || pending) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedContent, pending]);

  function addStagedEvidence() {
    if (draftEvidenceContent.trim().length === 0) {
      setEvidenceError("Enter evidence content before adding it.");
      return;
    }
    setStagedEvidence((current) => [...current, { localId: crypto.randomUUID(), evidenceType: draftEvidenceType, content: draftEvidenceContent.trim() }]);
    setDraftEvidenceContent("");
    setEvidenceError(null);
  }

  function removeStagedEvidence(localId: string) {
    setStagedEvidence((current) => current.filter((item) => item.localId !== localId));
  }

  function clearSelectedFile() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFileName(null);
  }

  function addStagedFile() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFileError("Choose a file to add.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File must be 10 MB or smaller.");
      return;
    }
    setStagedFiles((current) => [...current, { localId: crypto.randomUUID(), file }]);
    clearSelectedFile();
    setFileError(null);
  }

  function removeStagedFile(localId: string) {
    setStagedFiles((current) => current.filter((item) => item.localId !== localId));
  }

  function handleDiscardDraft() {
    clearDraft(programId);
    setAssetType("domain");
    setTarget("");
    setTitle("");
    setWeaknessType("");
    setDescription("");
    setImpact("");
    setImpactPrompt(null);
    setResearcherSeverity("");
    setStagedEvidence([]);
    setDraftRestoredAt(null);
  }

  function handleWeaknessTypeChange(nextType: ReportWeaknessType) {
    setWeaknessType(nextType);
    const template = getReportTemplate(nextType);
    setImpactPrompt(template.impactPrompt);
    // Only ever fills an EMPTY description -- a researcher who already typed real
    // content (before picking a category, or after changing it mid-draft) keeps every
    // word they wrote. See docs/decisions/0070.
    if (description.trim().length === 0) setDescription(template.descriptionScaffold);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    startTransition(async () => {
      const result = await submitReportAction({
        organizationId,
        programId,
        assetType,
        targetInput: target,
        title,
        description,
        // Cast, not coerce: an unselected "" is a real, invalid value the server-side
        // zod schema (which has no "" member) correctly rejects as INVALID_INPUT --
        // the same "let the server be the final check" pattern this form already
        // relies on for an empty title.
        weaknessType: weaknessType as ReportWeaknessType,
        impact,
        researcherSeverity: researcherSeverity || undefined,
        acknowledgedPolicyVersion: policy && policyAccepted ? policy.versionNumber : null,
      });
      if (!result.ok) {
        // Entered content is deliberately never cleared on failure -- the researcher
        // should never have to retype a long description, or re-attach staged evidence,
        // because of a transient error.
        setFailure(classifyFailure(result.code, result.message));
        return;
      }

      clearDraft(programId);
      const reportId = result.data.id;
      // Each staged item is an independent attach-to-already-created-report mutation --
      // none depends on another's outcome, so they all go out together instead of one
      // round trip at a time.
      const attachResults = await Promise.all([
        ...stagedEvidence.map((item) => addResearcherEvidenceAction({ organizationId, programId, reportId, evidenceType: item.evidenceType, content: item.content })),
        ...stagedFiles.map((item) => uploadResearcherFileEvidenceAction({ organizationId, programId, reportId, file: item.file })),
      ]);
      const unattached = attachResults.filter((attachResult) => !attachResult.ok).length;

      // Only navigate once the database has actually committed -- result.ok means the
      // RPC returned successfully, not merely that the request was sent. An honest,
      // one-time signal travels with the redirect when something staged didn't attach,
      // rather than silently dropping it.
      const query = unattached > 0 ? `?evidenceIssues=${unattached}` : "";
      router.push(`/organizations/${organizationId}/programs/${programId}/reports/${reportId}${query}` as Route);
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <p className="text-sm text-ink-muted">
          Reporting to <span className="font-medium text-ink">{programName}</span>. Your target must be inside this program&apos;s current scope. The server makes the final
          scope decision, not this form.
        </p>

        {draftRestoredAt && !draftDismissed && (
          <Alert tone="info" title="Restored your draft.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Last saved <LocalTime value={draftRestoredAt} />. Attached files were not saved and need to be re-added.</span>
              <Button
                type="button"
                variant="quiet"
                onClick={() => {
                  handleDiscardDraft();
                  setDraftDismissed(true);
                }}
              >
                Discard draft
              </Button>
            </div>
          </Alert>
        )}

        <div>
          <SectionLabel>Target</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Where does the issue exist? The server makes the final scope decision, not this form.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Select
              label="Target type"
              value={assetType}
              onChange={(event) => {
                setAssetType(event.target.value as ProgramAssetType);
                setTarget("");
              }}
            >
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {assetTypeLabel(type)}
                </option>
              ))}
            </Select>
            <Input
              label="Target"
              required
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={TARGET_PLACEHOLDER[assetType]}
              helperText={TARGET_HELPER_TEXT[assetType]}
              className="[&_input]:font-mono"
              maxLength={2048}
              error={failure?.targetError}
              list={matchingScopeTargets.length > 0 ? "in-scope-targets" : undefined}
            />
            {matchingScopeTargets.length > 0 && (
              <datalist id="in-scope-targets">
                {matchingScopeTargets.map((displayTarget) => (
                  <option key={displayTarget} value={displayTarget} />
                ))}
              </datalist>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Finding</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">What did you discover?</p>
          <div className="mt-3 space-y-4">
            <Input
              label="Title"
              required
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Short, specific summary of the vulnerability"
              error={failure?.titleError}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Weakness type"
                required
                value={weaknessType}
                onChange={(event) => handleWeaknessTypeChange(event.target.value as ReportWeaknessType)}
                error={failure?.weaknessTypeError}
              >
                <option value="" disabled>
                  Select…
                </option>
                {WEAKNESS_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {weaknessTypeLabel(type)}
                  </option>
                ))}
              </Select>
              <Select
                label="Your severity assessment"
                helperText="Optional. The organization sets the confirmed severity during triage."
                value={researcherSeverity}
                onChange={(event) => setResearcherSeverity(event.target.value as ReportSeverity | "")}
              >
                {RESEARCHER_SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Reproduction</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">How can the organization reproduce it?</p>
          <div className="mt-3">
            <MarkdownTextarea
              label="Description"
              required
              helperText="Step-by-step reproduction. Selecting a weakness type above fills in a starting structure you can edit or replace."
              value={description}
              onChange={setDescription}
              maxLength={20000}
              rows={12}
              error={failure?.descriptionError}
            />
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Impact</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Why does this matter? What can an attacker actually achieve?</p>
          <div className="mt-3">
            <MarkdownTextarea
              label="Impact"
              required
              helperText={impactPrompt ?? "Business or technical consequence: data exposed, actions an attacker could take, users affected."}
              value={impact}
              onChange={setImpact}
              maxLength={20000}
              rows={8}
              error={failure?.impactError}
            />
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Evidence</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Optional. Provide material that helps reproduce or verify the issue: reproduction commands, request/response logs, or a proof-of-concept.</p>

          {stagedEvidence.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
              {stagedEvidence.map((item) => (
                <li key={item.localId} className="flex items-start justify-between gap-3 p-3 motion-safe:animate-enter-rise">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{EVIDENCE_TYPE_LABELS[item.evidenceType]}</p>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink">{item.content}</pre>
                  </div>
                  <Button type="button" variant="quiet" onClick={() => removeStagedEvidence(item.localId)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border-strong p-3">
            <Select label="Type" value={draftEvidenceType} onChange={(event) => setDraftEvidenceType(event.target.value as TextualEvidenceType)} className="max-w-xs">
              {EVIDENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EVIDENCE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
            <Textarea
              label="Content"
              value={draftEvidenceContent}
              onChange={(event) => setDraftEvidenceContent(event.target.value)}
              maxLength={20000}
              className="[&_textarea]:font-mono"
              error={evidenceError ?? undefined}
            />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={addStagedEvidence}>
                Add evidence
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Attachments</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Optional supporting files: screenshots, logs, or a proof-of-concept script.</p>

          {stagedFiles.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
              {stagedFiles.map((item) => (
                <li key={item.localId} className="flex items-center justify-between gap-3 p-3 motion-safe:animate-enter-rise">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <span className="block font-mono text-xs text-ink-muted">{formatFileSize(item.file.size)}</span>
                  </span>
                  <Button type="button" variant="quiet" onClick={() => removeStagedFile(item.localId)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border-strong p-3">
            <FileField inputRef={fileInputRef} error={fileError ?? undefined} selectedName={selectedFileName} onClear={clearSelectedFile} onFileChange={(name) => setSelectedFileName(name)} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={addStagedFile}>
                Add attachment
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Review</SectionLabel>
          <dl className="mt-3 grid gap-4 rounded-lg border border-border bg-surface-muted p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Target</dt>
              <dd className="mt-0.5 break-all font-mono text-ink">{target || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Title</dt>
              <dd className="mt-0.5 text-ink">{title || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Weakness type</dt>
              <dd className="mt-0.5 text-ink">{weaknessType ? weaknessTypeLabel(weaknessType) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Your severity assessment</dt>
              <dd className="mt-0.5 text-ink">{researcherSeverity ? researcherSeverity[0].toUpperCase() + researcherSeverity.slice(1) : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Evidence staged</dt>
              <dd className="mt-0.5 font-mono text-ink">{stagedEvidence.length + stagedFiles.length === 0 ? "None" : `${stagedEvidence.length + stagedFiles.length} item(s)`}</dd>
            </div>
          </dl>
        </div>

        {policy && (
          <div className="space-y-3 rounded-md border border-border p-4">
            <SectionLabel>Program policy</SectionLabel>
            <ProgramPolicySummary policy={policy} />
            <Checkbox
              label={`I have read and will follow ${programName}'s policy (v${policy.versionNumber})`}
              required
              checked={policyAccepted}
              onChange={(event) => setPolicyAccepted(event.target.checked)}
            />
          </div>
        )}

        {failure?.banner && <Alert tone="danger" title={failure.banner} />}

        <div className="flex justify-end gap-2">
          <Button type="submit" pending={pending}>
            {pending ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

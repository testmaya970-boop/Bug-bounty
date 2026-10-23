"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Card, Alert } from "../ui/feedback";
import { Button, IconButton } from "../ui/button";
import { Checkbox, Input, Select, Textarea } from "../ui/form";
import { ProgramPolicySummary } from "../programs/program-policy";
import type { ProgramPolicy } from "../../types/program-policy";
import { MarkdownTextarea } from "../ui/markdown-textarea";
import { SectionLabel } from "../ui/security-primitives";
import { submitReportAction, addResearcherEvidenceAction, deleteReportDraftAction, saveReportDraftAction } from "../../actions/reports";
import { uploadResearcherFileEvidenceAction } from "../../actions/report-file-evidence";
import { EVIDENCE_TYPE_LABELS, EVIDENCE_TYPES, FileField, fileProblem, type TextualEvidenceType } from "./report-evidence";
import { assetTypeLabel } from "../../lib/scope-labels";
import { WEAKNESS_TYPE_ORDER, weaknessTypeLabel } from "../../lib/report-weakness-labels";
import { getReportTemplate } from "../../lib/report-templates";
import { upsertMyReportTemplateAction } from "../../actions/report-templates";
import type { ReportTemplate } from "../../services/report-templates";
import type { ProgramAssetType } from "../../types/scope";
import type { ReportSeverity, ReportWeaknessType } from "../../types/report";
import { LocalTime } from "../ui/local-time";
import { Trash } from "@phosphor-icons/react";
import { CaptchaField, type CaptchaClientConfig } from "../auth/captcha-field";

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
export type SubmitFailure = { banner?: string; titleError?: string; descriptionError?: string; targetError?: string; weaknessTypeError?: string; impactError?: string; policyError?: string; evidenceError?: string; attachmentError?: string };

type FieldErrors = Omit<SubmitFailure, "banner">;

const FIELD_NAMES: Record<keyof FieldErrors, string> = {
  targetError: "Target",
  titleError: "Title",
  weaknessTypeError: "Weakness type",
  descriptionError: "Description",
  impactError: "Impact",
  policyError: "Program policy",
  evidenceError: "Evidence",
  attachmentError: "Attachments",
};

/** Every required field checked at once, before anything is sent -- the same rules the
 * server enforces (actions/reports.ts's submitSchema), so a researcher sees every gap in
 * one pass instead of fixing them one server round trip at a time. */
export function validateReport(fields: { target: string; title: string; weaknessType: string; description: string; impact: string; policyRequired: boolean; policyAccepted: boolean; unaddedEvidence?: string; unaddedFileName?: string | null }): FieldErrors {
  const errors: FieldErrors = {};
  if (!fields.target.trim()) errors.targetError = "Enter the target where you found the issue.";
  if (!fields.title.trim()) errors.titleError = "Enter a short title for the report.";
  if (!fields.weaknessType) errors.weaknessTypeError = "Select the type of weakness you found.";
  if (!fields.description.trim()) errors.descriptionError = "Describe how to reproduce the issue.";
  if (!fields.impact.trim()) errors.impactError = "Explain the impact: what an attacker could achieve.";
  if (fields.policyRequired && !fields.policyAccepted) errors.policyError = "Read and accept the program policy before submitting.";
  // Picked but never added: submitting would silently leave it out of the report.
  if (fields.unaddedEvidence?.trim()) errors.evidenceError = "You typed evidence but didn't add it. Press Add evidence, or clear the box to submit without it.";
  if (fields.unaddedFileName) errors.attachmentError = `You chose "${fields.unaddedFileName}" but didn't add it. Press Add attachment, or Clear to submit without it.`;
  return errors;
}

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
    case "POLICY_NOT_ACKNOWLEDGED":
      return { policyError: "The program policy changed. Read and accept the current version before submitting." };
    case "CAPTCHA_REQUIRED":
    case "SUBMISSIONS_PAUSED":
    case "DAILY_LIMIT":
    case "NEAR_DUPLICATE":
    case "NEAR_DUPLICATE_BLAST":
      // Anti-abuse rules (202610210001): the database message says exactly why and what to do
      // (when submissions resume, how the limit grows, which earlier report to add to).
      return { banner: message };
    case "INVALID_INPUT":
      // The server's own validation message (actions/reports.ts) -- specific and safe.
      return { banner: message };
    default:
      return { banner: "The request could not be completed. Try again in a moment." };
  }
}

type StagedEvidence = { localId: string; evidenceType: TextualEvidenceType; content: string };
type StagedFile = { localId: string; file: File };

/** A per-program draft saved on the server (report_drafts, 202610060014), so it survives
 * another browser or device. Only typed fields are kept: stagedFiles holds raw browser File
 * objects, which never leave the browser until submission, so a restored draft never has
 * attachments. Saving is best-effort: a draft that fails to save must never break the form. */
export type DraftFields = {
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

function writeDraft(programId: string, draft: DraftFields): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- savedAt is the server's own updated_at
  const { savedAt, ...fields } = draft;
  void saveReportDraftAction({ programId, draft: fields }).catch(() => {});
}

function clearDraft(programId: string): void {
  void deleteReportDraftAction({ programId }).catch(() => {});
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
  initialDraft = null,
  savedTemplates: initialSavedTemplates = [],
  captcha = { provider: "none" },
}: {
  organizationId: string;
  programId: string;
  programName: string;
  inScopeTargets?: { assetType: ProgramAssetType; displayTarget: string }[];
  /** The program's effective policy; when set, the researcher must accept this exact version. */
  policy?: ProgramPolicy | null;
  /** The researcher's saved draft for this program, loaded by the page. */
  initialDraft?: DraftFields | null;
  /** The researcher's own templates from Settings > Report Templates. */
  savedTemplates?: ReportTemplate[];
  /** Human check for new and limited-tier researchers (the page decides; the action re-checks). */
  captcha?: CaptchaClientConfig;
}) {
  const router = useRouter();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
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
  // After the first submit attempt, required-field errors are recomputed on every render,
  // so each message disappears the moment its field is fixed.
  const [validationAttempted, setValidationAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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

  const [savedTemplates, setSavedTemplates] = useState(initialSavedTemplates);
  const [templateNameOpen, setTemplateNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateNotice, setTemplateNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [savingTemplate, startSavingTemplate] = useTransition();

  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const hasRestoredDraft = useRef(false);

  // Restore once on mount only -- never re-runs on programId change since this component
  // is remounted (not re-parameterized) per program page. Runs after the initial render so
  // it never disagrees with server-rendered markup (localStorage is unavailable during SSR).
  useEffect(() => {
    if (hasRestoredDraft.current) return;
    hasRestoredDraft.current = true;
    const draft = initialDraft;
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
    const problem = fileProblem(file);
    if (problem) {
      setFileError(problem);
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

  /** Unlike the built-in weakness scaffold (which only fills an empty description), picking
   * one of your own templates is an explicit request, so it may replace typed content, but
   * only after a confirm. */
  function applySavedTemplate(templateId: string) {
    const template = savedTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const overwrites = (template.descriptionTemplate && description.trim()) || (template.impactTemplate && impact.trim());
    if (overwrites && !window.confirm(`Replace your description and impact with "${template.name}"?`)) return;
    if (template.weaknessType) {
      setWeaknessType(template.weaknessType);
      setImpactPrompt(getReportTemplate(template.weaknessType).impactPrompt);
    }
    if (template.descriptionTemplate) setDescription(template.descriptionTemplate);
    if (template.impactTemplate) setImpact(template.impactTemplate);
  }

  function saveAsTemplate() {
    setTemplateNotice(null);
    startSavingTemplate(async () => {
      const result = await upsertMyReportTemplateAction({
        name: templateName,
        weaknessType: weaknessType || undefined,
        descriptionTemplate: description || undefined,
        impactTemplate: impact || undefined,
      });
      if (!result.ok) {
        setTemplateNotice({ tone: "danger", text: result.message });
        return;
      }
      setSavedTemplates((current) => [result.data, ...current]);
      setTemplateNotice({ tone: "success", text: `Saved "${result.data.name}" to your templates.` });
      setTemplateNameOpen(false);
      setTemplateName("");
    });
  }

  function fieldErrorsNow(): FieldErrors {
    return validateReport({ target, title, weaknessType, description, impact, policyRequired: Boolean(policy), policyAccepted, unaddedEvidence: draftEvidenceContent, unaddedFileName: selectedFileName });
  }
  const clientErrors = validationAttempted ? fieldErrorsNow() : {};
  // A client-side gap wins over a stale server message for the same field.
  const errors: FieldErrors = { ...failure, ...clientErrors };
  const missing = (Object.keys(clientErrors) as (keyof FieldErrors)[]).map((key) => FIELD_NAMES[key]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    setValidationAttempted(true);
    if (Object.keys(fieldErrorsNow()).length > 0) {
      // Jump to the first problem; the messages stay live and clear as each is fixed.
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        first?.focus({ preventScroll: true });
      });
      return;
    }
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
        captchaToken: captchaToken ?? undefined,
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
      // One automatic retry each: a dropped upload on a flaky (phone) connection shouldn't
      // leave the report without its evidence when a second try would have worked.
      const withRetry = async <T extends { ok: boolean }>(attempt: () => Promise<T>) => {
        const first = await attempt().catch(() => ({ ok: false }) as T);
        return first.ok ? first : attempt().catch(() => ({ ok: false }) as T);
      };
      const attachResults = await Promise.all([
        ...stagedEvidence.map((item) => withRetry(() => addResearcherEvidenceAction({ organizationId, programId, reportId, evidenceType: item.evidenceType, content: item.content }))),
        ...stagedFiles.map((item) => withRetry(() => uploadResearcherFileEvidenceAction({ organizationId, programId, reportId, file: item.file }))),
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
      <form ref={formRef} className="space-y-5" onSubmit={handleSubmit} noValidate>
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
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
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
              error={errors.targetError}
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
            {savedTemplates.length > 0 && (
              <Select
                label="Use one of your templates"
                helperText="Fills weakness type, description and impact from a template saved in Settings."
                value=""
                onChange={(event) => applySavedTemplate(event.target.value)}
              >
                <option value="" disabled>
                  Choose a template…
                </option>
                {savedTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            )}
            <Input
              label="Title"
              required
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Short, specific summary of the vulnerability"
              error={errors.titleError}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Weakness type"
                required
                value={weaknessType}
                onChange={(event) => handleWeaknessTypeChange(event.target.value as ReportWeaknessType)}
                error={errors.weaknessTypeError}
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
              error={errors.descriptionError}
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
              error={errors.impactError}
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
                    <p className="text-xs font-semibold text-ink-muted">{EVIDENCE_TYPE_LABELS[item.evidenceType]}</p>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink">{item.content}</pre>
                  </div>
                  <IconButton label="Remove" type="button" variant="quiet" className="text-danger" onClick={() => removeStagedEvidence(item.localId)}>
                    <Trash aria-hidden="true" className="size-[18px]" />
                  </IconButton>
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
              error={errors.evidenceError ?? evidenceError ?? undefined}
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
                  <IconButton label={`Remove ${item.file.name}`} type="button" variant="quiet" className="text-danger" onClick={() => removeStagedFile(item.localId)}>
                    <Trash aria-hidden="true" className="size-[18px]" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border-strong p-3">
            <FileField required={false} inputRef={fileInputRef} error={errors.attachmentError ?? fileError ?? undefined} selectedName={selectedFileName} onClear={clearSelectedFile} onFileChange={(name) => setSelectedFileName(name)} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={addStagedFile}>
                Add attachment
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Review</SectionLabel>
          <dl className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface-muted p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Target</dt>
              <dd className="mt-0.5 break-all font-mono text-ink">{target || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Title</dt>
              <dd className="mt-0.5 text-ink">{title || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Weakness type</dt>
              <dd className="mt-0.5 text-ink">{weaknessType ? weaknessTypeLabel(weaknessType) : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Your severity assessment</dt>
              <dd className="mt-0.5 text-ink">{researcherSeverity ? researcherSeverity[0].toUpperCase() + researcherSeverity.slice(1) : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Evidence staged</dt>
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
              aria-invalid={Boolean(errors.policyError)}
              aria-describedby={errors.policyError ? "policy-error" : undefined}
            />
            {errors.policyError && (
              <p id="policy-error" role="alert" className="text-sm font-medium text-danger">
                {errors.policyError}
              </p>
            )}
          </div>
        )}

        {missing.length > 0 && (
          <Alert tone="danger" title={`Complete ${missing.length === 1 ? "1 required field" : `${missing.length} required fields`} before submitting`}>
            {missing.join(", ")}.
          </Alert>
        )}
        {missing.length === 0 && failure?.banner && <Alert tone="danger" title={failure.banner} />}

        {templateNotice && <Alert tone={templateNotice.tone} title={templateNotice.text} />}
        {templateNameOpen && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
            <Input
              label="Template name"
              className="min-w-0 flex-1"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              maxLength={100}
              helperText="Saves the weakness type, description and impact for your next report."
            />
            <div className="flex gap-2">
              <Button type="button" variant="quiet" onClick={() => setTemplateNameOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" pending={savingTemplate} onClick={saveAsTemplate}>
                Save template
              </Button>
            </div>
          </div>
        )}

        {captcha.provider !== "none" && (
          <div className="flex justify-end">
            <CaptchaField config={captcha} onToken={setCaptchaToken} />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {!templateNameOpen && (
            <Button
              type="button"
              variant="quiet"
              disabled={!description.trim() && !impact.trim()}
              onClick={() => {
                setTemplateNotice(null);
                setTemplateNameOpen(true);
              }}
            >
              Save as template
            </Button>
          )}
          <Button type="submit" pending={pending}>
            {pending ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

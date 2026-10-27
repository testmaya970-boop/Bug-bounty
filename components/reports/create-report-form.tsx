"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
import { removeEvidenceUploadAction } from "../../actions/evidence-uploads";
import { EVIDENCE_TYPE_LABELS, EVIDENCE_TYPES, type TextualEvidenceType } from "./report-evidence";
import { UploadList, uploadEvidenceFile, type UploadItem } from "./evidence-upload";
import { CvssField } from "./cvss-field";
import { ScopeTargetPicker, entryNeedsSpecificTarget, type PickableScopeEntry } from "./scope-target-picker";
import { WEAKNESS_TYPE_ORDER, weaknessTypeLabel } from "../../lib/report-weakness-labels";
import { getReportTemplate } from "../../lib/report-templates";
import { upsertMyReportTemplateAction } from "../../actions/report-templates";
import { EVIDENCE_ACCEPT, describeEvidenceLimits, evidenceFileProblem, type EvidenceLimits } from "../../lib/evidence-policy";
import { scoreCvssVector } from "../../lib/cvss-vector";
import type { ReportTemplate } from "../../services/report-templates";
import type { StagedUpload } from "../../services/evidence-uploads";
import type { ProgramAssetType } from "../../types/scope";
import type { ReportSeverity, ReportWeaknessType } from "../../types/report";
import { LocalTime } from "../ui/local-time";
import { Trash, Paperclip } from "@phosphor-icons/react";
import { CaptchaField, type CaptchaClientConfig } from "../auth/captcha-field";
import { severityLabel } from "../../lib/report-status";

// "Not set" (an empty string in the <select>) is a real, first-class choice, not a
// missing one -- researcher_severity is nullable and optional at the database level
// (see docs/decisions/0047). Ordered least-to-most severe.
const RESEARCHER_SEVERITY_OPTIONS: { value: ReportSeverity | ""; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "none", label: "Info" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

/**
 * Every code submit_report can actually raise, mapped to a calm, specific, safe sentence --
 * field-level where the researcher can fix one field, a banner otherwise. Never a raw
 * SQLSTATE/Postgres detail: services/rpc-error.ts's mapRpcError guarantees that upstream.
 */
export type SubmitFailure = {
  banner?: string;
  titleError?: string;
  descriptionError?: string;
  targetError?: string;
  weaknessTypeError?: string;
  impactError?: string;
  policyError?: string;
  evidenceError?: string;
  attachmentError?: string;
  cvssError?: string;
};

type FieldErrors = Omit<SubmitFailure, "banner">;

const FIELD_NAMES: Record<keyof FieldErrors, string> = {
  targetError: "Target",
  titleError: "Title",
  weaknessTypeError: "Vulnerability category",
  descriptionError: "Description",
  impactError: "Impact",
  policyError: "Program policy",
  evidenceError: "Evidence",
  attachmentError: "Attachments",
  cvssError: "CVSS score",
};

/** Every required field checked at once, before anything is sent -- the same rules the
 * server enforces, so a researcher sees every gap in one pass. */
export function validateReport(fields: {
  scopeEntryId: string;
  target: string;
  needsSpecificTarget: boolean;
  title: string;
  weaknessType: string;
  description: string;
  impact: string;
  cvssVector?: string;
  policyRequired: boolean;
  policyAccepted: boolean;
  unaddedEvidence?: string;
  uploadsInFlight?: number;
  uploadsFailed?: number;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!fields.scopeEntryId) errors.targetError = "Choose the in-scope asset where you found the issue.";
  else if (fields.needsSpecificTarget && !fields.target.trim()) errors.targetError = "Enter the exact target you tested inside this asset.";
  if (!fields.title.trim()) errors.titleError = "Enter a short title for the report.";
  if (!fields.weaknessType) errors.weaknessTypeError = "Select a vulnerability category.";
  if (!fields.description.trim()) errors.descriptionError = "Describe how to reproduce the issue.";
  if (!fields.impact.trim()) errors.impactError = "Explain the impact: what an attacker could achieve.";
  if (fields.cvssVector) {
    const scored = scoreCvssVector(fields.cvssVector);
    if (!scored.ok) errors.cvssError = scored.message;
  }
  if (fields.policyRequired && !fields.policyAccepted) errors.policyError = "Read and accept the program policy before submitting.";
  // Picked but never added: submitting would silently leave it out of the report.
  if (fields.unaddedEvidence?.trim()) errors.evidenceError = "You typed evidence but didn't add it. Press Add evidence, or clear the box to submit without it.";
  if (fields.uploadsInFlight) errors.attachmentError = "Wait for your attachments to finish uploading.";
  else if (fields.uploadsFailed) errors.attachmentError = "Remove or retry the attachments that failed before submitting.";
  return errors;
}

export function classifyFailure(code: string, message: string): SubmitFailure {
  switch (code) {
    case "AUTH_REQUIRED":
      return { banner: "Your session has expired. Sign in again to continue; your draft is saved." };
    case "RATE_LIMITED":
      return { banner: "Too many requests. Try again shortly." };
    case "FORBIDDEN":
      return { banner: "You are not currently an authorized, active researcher for this program." };
    case "PROGRAM_NOT_FOUND":
    case "SUBMISSIONS_CLOSED":
      return { banner: "This program is not currently accepting reports." };
    case "KYC_REQUIRED":
      return { banner: message };
    case "TARGET_NOT_ELIGIBLE":
    case "INVALID_TARGET":
      // Both messages are specific and safe (the server's own scope decision).
      return { targetError: message };
    case "INVALID_TITLE":
      return { titleError: message };
    case "INVALID_DESCRIPTION":
      return { descriptionError: message };
    case "INVALID_WEAKNESS_TYPE":
      return { weaknessTypeError: "Select a vulnerability category." };
    case "INVALID_IMPACT":
      return { impactError: message };
    case "INVALID_CVSS":
      return { cvssError: message };
    case "UPLOAD_NOT_READY":
      return { attachmentError: message };
    case "POLICY_NOT_ACKNOWLEDGED":
      return { policyError: "The program policy changed. Read and accept the current version before submitting." };
    case "CAPTCHA_REQUIRED":
    case "SUBMISSIONS_PAUSED":
    case "DAILY_LIMIT":
    case "NEAR_DUPLICATE":
    case "NEAR_DUPLICATE_BLAST":
    case "INVALID_INPUT":
      return { banner: message };
    default:
      return { banner: "The request could not be completed. Try again in a moment." };
  }
}

type StagedEvidence = { localId: string; evidenceType: TextualEvidenceType; content: string };

/** The typed fields a draft keeps (report_drafts.draft). Files live in evidence_uploads,
 * linked to the draft, so they survive too. */
export type DraftFields = {
  scopeEntryId: string;
  assetType: ProgramAssetType;
  target: string;
  title: string;
  weaknessType: ReportWeaknessType | "";
  description: string;
  impact: string;
  researcherSeverity: ReportSeverity | "";
  cvssVector: string;
  stagedEvidence: StagedEvidence[];
};

export type InitialDraft = { id: string; version: number; savedAt: string; fields: Partial<DraftFields>; uploads: StagedUpload[] };

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string } | { kind: "conflict" } | { kind: "signed_out" };

/**
 * The report composer. Nothing here reaches the program until Submit: drafts are private to the
 * researcher (report_drafts RLS), and files staged on a draft are only attached by the submit
 * that consumes it.
 *
 * Drafts: autosaved (debounced) after the first edit, and on "Save as draft". Each save carries
 * the version it was based on, so a second tab or device can't silently overwrite newer content
 * (DRAFT_CONFLICT -> reload). A failed save leaves the content here and says so; nothing typed is
 * ever cleared by an error.
 *
 * Submit is one transaction (submit_report): the report, its verified files, and deleting the
 * draft. The submission key is fixed for this composer, so retrying after a network drop returns
 * the report already created instead of a duplicate. Typed text evidence is attached right after,
 * through the same action the report page uses.
 */
export function CreateReportForm({
  organizationId,
  programId,
  programName,
  scopeEntries = [],
  policy = null,
  initialDraft = null,
  savedTemplates: initialSavedTemplates = [],
  captcha = { provider: "none" },
  limits,
}: {
  organizationId: string;
  programId: string;
  programName: string;
  scopeEntries?: PickableScopeEntry[];
  policy?: ProgramPolicy | null;
  initialDraft?: InitialDraft | null;
  savedTemplates?: ReportTemplate[];
  captcha?: CaptchaClientConfig;
  limits: EvidenceLimits;
}) {
  const router = useRouter();
  const init = initialDraft?.fields ?? {};
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [scopeEntryId, setScopeEntryId] = useState(init.scopeEntryId && scopeEntries.some((e) => e.id === init.scopeEntryId) ? init.scopeEntryId : "");
  const [assetType, setAssetType] = useState<ProgramAssetType>(init.assetType ?? "domain");
  const [target, setTarget] = useState(init.target ?? "");
  const [title, setTitle] = useState(init.title ?? "");
  const [weaknessType, setWeaknessType] = useState<ReportWeaknessType | "">(init.weaknessType ?? "");
  const [description, setDescription] = useState(init.description ?? "");
  const [impact, setImpact] = useState(init.impact ?? "");
  const [impactPrompt, setImpactPrompt] = useState<string | null>(init.weaknessType ? getReportTemplate(init.weaknessType).impactPrompt : null);
  const [researcherSeverity, setResearcherSeverity] = useState<ReportSeverity | "">(init.researcherSeverity ?? "");
  const [cvssVector, setCvssVector] = useState(init.cvssVector ?? "");
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const [stagedEvidence, setStagedEvidence] = useState<StagedEvidence[]>(init.stagedEvidence ?? []);
  const [draftEvidenceType, setDraftEvidenceType] = useState<TextualEvidenceType>("text");
  const [draftEvidenceContent, setDraftEvidenceContent] = useState("");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [uploads, setUploads] = useState<UploadItem[]>(() =>
    (initialDraft?.uploads ?? []).map((u) => ({ key: u.id, uploadId: u.id, name: u.filename, size: u.sizeBytes, progress: 1, state: "ready" as const })),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesByKey = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, AbortController>());
  // Files removed before their upload could even start (the draft was still being created).
  const removedKeys = useRef(new Set<string>());
  const [fileError, setFileError] = useState<string | null>(null);

  const [savedTemplates, setSavedTemplates] = useState(initialSavedTemplates);
  const [templateNameOpen, setTemplateNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateNotice, setTemplateNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [savingTemplate, startSavingTemplate] = useTransition();

  // Draft identity and save status. Refs mirror state so the async save path always reads the
  // latest id/version, even from a save started before the previous one returned.
  const draftId = useRef<string | null>(initialDraft?.id ?? null);
  const draftVersion = useRef<number | null>(initialDraft?.version ?? null);
  const savingNow = useRef<Promise<string | null> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(initialDraft ? { kind: "saved", at: initialDraft.savedAt } : { kind: "idle" });
  const [dirty, setDirty] = useState(false);
  const submissionKey = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`);
  const skipFirstAutosave = useRef(true);

  const selectedEntry = scopeEntries.find((e) => e.id === scopeEntryId) ?? null;
  const needsSpecificTarget = selectedEntry ? entryNeedsSpecificTarget(selectedEntry) : false;

  function fields(): DraftFields {
    return { scopeEntryId, assetType, target, title, weaknessType, description, impact, researcherSeverity, cvssVector, stagedEvidence };
  }
  const hasContent = Boolean(scopeEntryId || title.trim() || description.trim() || impact.trim() || stagedEvidence.length > 0 || cvssVector || uploads.length > 0);

  /** Saves now; resolves to the draft id (creating the draft if needed), or null on failure. */
  function saveDraft(): Promise<string | null> {
    if (savingNow.current) return savingNow.current.then(() => saveDraft());
    setSaveState({ kind: "saving" });
    const run = (async () => {
      const result = await saveReportDraftAction({ draftId: draftId.current, programId, expectedVersion: draftVersion.current, draft: fields() }).catch(() => null);
      if (!result) {
        setSaveState({ kind: "error", message: "Couldn't save: check your connection. Your changes are still here." });
        return null;
      }
      if (!result.ok) {
        if (result.code === "DRAFT_CONFLICT") setSaveState({ kind: "conflict" });
        else if (result.code === "AUTH_REQUIRED") setSaveState({ kind: "signed_out" });
        else setSaveState({ kind: "error", message: result.message });
        return null;
      }
      const isNew = draftId.current === null;
      draftId.current = result.data.id;
      draftVersion.current = result.data.version;
      setSaveState({ kind: "saved", at: result.data.updatedAt });
      setDirty(false);
      // Keep the URL pointing at this draft so a reload (or a link) resumes it.
      if (isNew) window.history.replaceState(null, "", `?draft=${result.data.id}`);
      return result.data.id;
    })();
    savingNow.current = run;
    void run.finally(() => {
      if (savingNow.current === run) savingNow.current = null;
    });
    return run;
  }

  // Autosave: 1.5s after the last edit, once there is something worth keeping. Never while
  // submitting, never after a conflict or sign-out (that needs the researcher's decision).
  useEffect(() => {
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
    setDirty(true);
    if (pending || !hasContent || saveState.kind === "conflict" || saveState.kind === "signed_out") return;
    const timeout = setTimeout(() => void saveDraft(), 1500);
    return () => clearTimeout(timeout);
  }, [scopeEntryId, target, title, weaknessType, description, impact, researcherSeverity, cvssVector, stagedEvidence]);

  // Leave-page guard while anything is unsaved or still uploading.
  const uploading = uploads.some((u) => u.state === "uploading" || u.state === "verifying");
  useEffect(() => {
    if ((!dirty && !uploading) || pending) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, uploading, pending]);

  function addStagedEvidence() {
    if (draftEvidenceContent.trim().length === 0) {
      setEvidenceError("Enter evidence content before adding it.");
      return;
    }
    setStagedEvidence((current) => [...current, { localId: crypto.randomUUID(), evidenceType: draftEvidenceType, content: draftEvidenceContent.trim() }]);
    setDraftEvidenceContent("");
    setEvidenceError(null);
  }

  function patchUpload(key: string, patch: Partial<UploadItem>) {
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  async function startUpload(key: string, file: File) {
    patchUpload(key, { state: "uploading", progress: 0, error: undefined, uploadId: undefined });
    const id = draftId.current ?? (await saveDraft());
    if (removedKeys.current.has(key)) return;
    if (!id) {
      patchUpload(key, { state: "error", error: "Couldn't save the draft this file belongs to. Retry." });
      return;
    }
    const controller = new AbortController();
    aborts.current.set(key, controller);
    const outcome = await uploadEvidenceFile(
      file,
      { kind: "draft", draftId: id },
      (fraction) => patchUpload(key, fraction >= 1 ? { state: "verifying", progress: null } : { progress: fraction }),
      controller.signal,
    );
    aborts.current.delete(key);
    if (controller.signal.aborted) {
      if (outcome.ok || outcome.uploadId) void removeEvidenceUploadAction({ uploadId: outcome.ok ? outcome.upload.id : outcome.uploadId! });
      return;
    }
    if (outcome.ok) patchUpload(key, { state: "ready", uploadId: outcome.upload.id, progress: 1 });
    else {
      if (outcome.uploadId) void removeEvidenceUploadAction({ uploadId: outcome.uploadId });
      patchUpload(key, { state: "error", error: outcome.message });
    }
  }

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileError(null);
    const room = limits.maxFiles - uploads.length;
    if (picked.length > room) setFileError(`You can attach up to ${limits.maxFiles} files. ${room <= 0 ? "Remove one to add another." : `Only the first ${room} were added.`}`);
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const problem = evidenceFileProblem(file, limits);
      if (problem) {
        setFileError(problem);
        continue;
      }
      const key = crypto.randomUUID();
      filesByKey.current.set(key, file);
      setUploads((current) => [...current, { key, name: file.name, size: file.size, progress: 0, state: "uploading" }]);
      void startUpload(key, file);
    }
  }

  function removeUpload(key: string) {
    const item = uploads.find((u) => u.key === key);
    aborts.current.get(key)?.abort();
    removedKeys.current.add(key);
    setUploads((current) => current.filter((u) => u.key !== key));
    filesByKey.current.delete(key);
    if (item?.uploadId) void removeEvidenceUploadAction({ uploadId: item.uploadId });
  }

  function retryUpload(key: string) {
    removedKeys.current.delete(key);
    const file = filesByKey.current.get(key);
    if (file) void startUpload(key, file);
  }

  async function handleDiscardDraft() {
    if (!window.confirm("Delete this draft and its attachments? This can't be undone.")) return;
    for (const c of aborts.current.values()) c.abort();
    if (draftId.current) await deleteReportDraftAction({ draftId: draftId.current }).catch(() => null);
    // A full load: the form isn't keyed by draft (so refreshes never wipe it), so a fresh
    // composer needs a fresh page.
    window.location.assign(`/organizations/${organizationId}/programs/${programId}/reports/new`);
  }

  function handleWeaknessTypeChange(nextType: ReportWeaknessType) {
    setWeaknessType(nextType);
    const template = getReportTemplate(nextType);
    setImpactPrompt(template.impactPrompt);
    // Only ever fills an EMPTY description (docs/decisions/0070).
    if (description.trim().length === 0) setDescription(template.descriptionScaffold);
  }

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
    return validateReport({
      scopeEntryId,
      target,
      needsSpecificTarget,
      title,
      weaknessType,
      description,
      impact,
      cvssVector,
      policyRequired: Boolean(policy),
      policyAccepted,
      unaddedEvidence: draftEvidenceContent,
      uploadsInFlight: uploads.filter((u) => u.state === "uploading" || u.state === "verifying").length,
      uploadsFailed: uploads.filter((u) => u.state === "error").length,
    });
  }
  const clientErrors = validationAttempted ? fieldErrorsNow() : {};
  const errors: FieldErrors = { ...failure, ...clientErrors };
  const missing = (Object.keys(clientErrors) as (keyof FieldErrors)[]).map((key) => FIELD_NAMES[key]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    setValidationAttempted(true);
    if (Object.keys(fieldErrorsNow()).length > 0) {
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        first?.focus({ preventScroll: true });
      });
      return;
    }
    startTransition(async () => {
      // Make sure the draft holds the final content first (a no-op network-wise if unchanged).
      if (dirty || savingNow.current) await saveDraft();
      const result = await submitReportAction({
        organizationId,
        programId,
        scopeEntryId,
        assetType,
        targetInput: target,
        title,
        description,
        weaknessType: weaknessType as ReportWeaknessType,
        impact,
        researcherSeverity: researcherSeverity || undefined,
        cvssVector: cvssVector || undefined,
        acknowledgedPolicyVersion: policy && policyAccepted ? policy.versionNumber : null,
        captchaToken: captchaToken ?? undefined,
        draftId: draftId.current,
        uploadIds: uploads.filter((u) => u.state === "ready" && u.uploadId).map((u) => u.uploadId!),
        submissionKey: submissionKey.current,
      }).catch(() => null);
      if (!result) {
        // The request may or may not have reached the server; the same submission key makes a
        // retry safe either way.
        setFailure({ banner: "Couldn't reach the server. Check your connection and press Submit again: it won't create a second report." });
        return;
      }
      if (!result.ok) {
        setFailure(classifyFailure(result.code, result.message));
        return;
      }

      setDirty(false);
      const reportId = result.data.id;
      const withRetry = async <T extends { ok: boolean }>(attempt: () => Promise<T>) => {
        const first = await attempt().catch(() => ({ ok: false }) as T);
        return first.ok ? first : attempt().catch(() => ({ ok: false }) as T);
      };
      const attachResults = await Promise.all(stagedEvidence.map((item) => withRetry(() => addResearcherEvidenceAction({ organizationId, programId, reportId, evidenceType: item.evidenceType, content: item.content }))));
      const unattached = attachResults.filter((attachResult) => !attachResult.ok).length;
      const query = unattached > 0 ? `?evidenceIssues=${unattached}` : "";
      router.push(`/organizations/${organizationId}/programs/${programId}/reports/${reportId}${query}` as Route);
    });
  }

  const noTargets = scopeEntries.length === 0;

  return (
    <Card className="p-5 sm:p-6">
      <form ref={formRef} className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            Reporting to <span className="font-medium text-ink">{programName}</span>. Drafts are private to you: nothing is sent to the program until you submit.
          </p>
          <DraftStatus state={saveState} />
        </div>

        {saveState.kind === "conflict" && (
          <Alert tone="warning" title="This draft was changed somewhere else">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Another tab or device saved a newer version. Reload to continue from it; copy anything from here you want to keep first.</span>
              <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
                Reload draft
              </Button>
            </div>
          </Alert>
        )}
        {saveState.kind === "signed_out" && (
          <Alert tone="warning" title="You've been signed out">
            Sign in again in another tab, then press Save as draft here. Everything on this page is still here until you close it.
          </Alert>
        )}

        <div>
          <SectionLabel>Target</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Where does the issue exist? The server confirms the target is in scope when you submit.</p>
          <div className="mt-3">
            <ScopeTargetPicker
              entries={scopeEntries}
              scopeEntryId={scopeEntryId}
              target={target}
              error={errors.targetError}
              onChange={(next) => {
                setScopeEntryId(next.scopeEntryId);
                setAssetType(next.assetType);
                setTarget(next.target);
              }}
            />
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Finding</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">What did you discover?</p>
          <div className="mt-3 space-y-4">
            {savedTemplates.length > 0 && (
              <Select label="Use one of your templates" helperText="Fills vulnerability category, description and impact from a template saved in Settings." value="" onChange={(event) => applySavedTemplate(event.target.value)}>
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
            <Input label="Title" required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="Short, specific summary of the vulnerability" error={errors.titleError} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Vulnerability category" required value={weaknessType} onChange={(event) => handleWeaknessTypeChange(event.target.value as ReportWeaknessType)} error={errors.weaknessTypeError}>
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
            <div className="rounded-lg border border-border p-4">
              <CvssField value={cvssVector} onChange={setCvssVector} error={errors.cvssError} />
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
              helperText="Step-by-step reproduction. Selecting a vulnerability category above fills in a starting structure you can edit or replace."
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
          <p className="mt-1 text-sm text-ink-muted">Optional. Reproduction commands, request/response logs, or a proof of concept as text.</p>
          {stagedEvidence.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
              {stagedEvidence.map((item) => (
                <li key={item.localId} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink-muted">{EVIDENCE_TYPE_LABELS[item.evidenceType]}</p>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink">{item.content}</pre>
                  </div>
                  <IconButton label="Remove" type="button" variant="quiet" className="text-danger" onClick={() => setStagedEvidence((current) => current.filter((e) => e.localId !== item.localId))}>
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
            <Textarea label="Content" value={draftEvidenceContent} onChange={(event) => setDraftEvidenceContent(event.target.value)} maxLength={20000} className="[&_textarea]:font-mono" error={errors.evidenceError ?? evidenceError ?? undefined} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={addStagedEvidence}>
                Add evidence
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Attachments</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Optional: screenshots, a screen recording, logs or a PDF. Files upload now and are saved with your draft.</p>
          <p id="attachment-rules" className="mt-1 text-xs text-ink-muted">
            {describeEvidenceLimits(limits)} Programs download them as files; they are never opened in the browser.
          </p>
          <UploadList items={uploads} onRemove={removeUpload} onRetry={retryUpload} />
          <div className="mt-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus motion-reduce:transition-none">
              <Paperclip aria-hidden="true" className="size-4" />
              Add files
              <input ref={fileInputRef} type="file" multiple accept={EVIDENCE_ACCEPT} aria-describedby="attachment-rules" className="sr-only" onChange={(event) => addFiles(event.target.files)} disabled={uploads.length >= limits.maxFiles} />
            </label>
            {(fileError || errors.attachmentError) && (
              <p role="alert" className="mt-2 text-sm font-medium text-danger">
                {errors.attachmentError ?? fileError}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <SectionLabel>Review</SectionLabel>
          <dl className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface-muted p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Target</dt>
              <dd className="mt-0.5 break-all font-mono text-ink">{target || selectedEntry?.displayTarget || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Title</dt>
              <dd className="mt-0.5 text-ink">{title || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Vulnerability category</dt>
              <dd className="mt-0.5 text-ink">{weaknessType ? weaknessTypeLabel(weaknessType) : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Your severity assessment</dt>
              <dd className="mt-0.5 text-ink">{researcherSeverity ? severityLabel(researcherSeverity) : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">CVSS</dt>
              <dd className="mt-0.5 text-ink">{(() => {
                const scored = cvssVector ? scoreCvssVector(cvssVector) : null;
                return scored?.ok ? `${scored.score.toFixed(1)} ${severityLabel(scored.severity)} (v${scored.version})` : "Not scored";
              })()}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Evidence and files</dt>
              <dd className="mt-0.5 font-mono text-ink">{stagedEvidence.length + uploads.length === 0 ? "None" : `${stagedEvidence.length + uploads.length} item(s)`}</dd>
            </div>
          </dl>
        </div>

        {policy && (
          <div className="space-y-3 rounded-md border border-border p-4">
            <SectionLabel>Program policy</SectionLabel>
            <ProgramPolicySummary policy={policy} />
            <Checkbox
              label={`I have read and will follow ${programName}'s policy`}
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
            <Input label="Template name" className="min-w-0 flex-1" value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={100} helperText="Saves the vulnerability category, description and impact for your next report." />
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {draftId.current && (
              <Button type="button" variant="quiet" className="text-danger" onClick={() => void handleDiscardDraft()}>
                Delete draft
              </Button>
            )}
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!hasContent || pending || saveState.kind === "saving" || saveState.kind === "conflict"} onClick={() => void saveDraft()}>
              Save as draft
            </Button>
            <Button type="submit" pending={pending} disabled={noTargets}>
              {pending ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        </div>
        <p className="text-right text-xs text-ink-muted">
          <Link prefetch={false} href={"/reports/drafts" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            My drafts
          </Link>
        </p>
      </form>
    </Card>
  );
}

/** "Saved 2:14 PM" / "Saving…" / "Not saved" -- announced politely, never stealing focus. */
function DraftStatus({ state }: { state: SaveState }) {
  return (
    <p className="shrink-0 text-xs text-ink-muted" role="status" aria-live="polite">
      {state.kind === "saving" && "Saving draft…"}
      {state.kind === "saved" && (
        <>
          Draft saved <LocalTime value={state.at} />
        </>
      )}
      {state.kind === "error" && <span className="font-medium text-danger">{state.message}</span>}
      {state.kind === "conflict" && <span className="font-medium text-warning">Not saved: changed elsewhere</span>}
      {state.kind === "signed_out" && <span className="font-medium text-warning">Not saved: signed out</span>}
    </p>
  );
}

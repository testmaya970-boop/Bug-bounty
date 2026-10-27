"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "../ui/navigation";
import { Button } from "../ui/button";
import { Input, Select, Textarea } from "../ui/form";
import { MarkdownTextarea } from "../ui/markdown-textarea";
import { cn } from "../../lib/cn";
import {
  acceptReportAction,
  markDuplicateAction,
  markInformativeAction,
  markNotApplicableAction,
  rejectReportAction,
  requestInformationAction,
  resolveReportAction,
  setReportSeverityAction,
  startTriageAction,
} from "../../actions/reports";
import { reportStatusLabel } from "../../lib/report-status";
import { useTriageStatus } from "./triage-status-rail";
import type { CvssMetrics, ReportSeverity, ReportStatus } from "../../types/report";
import { SEVERITY_LABEL, cvssSeverityMismatch } from "../../lib/cvss";
import { suggestDuplicateReportsAction } from "../../actions/program-access";

type ReportRef = { organizationId: string; programId: string; reportId: string };

function ConfirmActionDialog({
  triggerLabel,
  triggerVariant = "secondary",
  title,
  description,
  confirmLabel,
  optimisticStatus,
  onConfirm,
}: {
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "quiet" | "destructive";
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  optimisticStatus: ReportStatus;
  onConfirm: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const { setOptimistic, rollback } = useTriageStatus();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    setOpen(false);
    const previous = setOptimistic({ status: optimisticStatus });
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        rollback(previous);
        setOpen(true);
        setError(result.message ?? "This action could not be completed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} title={title} onClose={close}>
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-ink-muted">{description}</div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant={triggerVariant === "destructive" ? "destructive" : "primary"} pending={pending} onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function StartTriageButton({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const { setOptimistic, rollback } = useTriageStatus();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        pending={pending}
        onClick={() => {
          setError(null);
          const previous = setOptimistic({ status: "triaging" });
          startTransition(async () => {
            const result = await startTriageAction({ organizationId, programId, reportId });
            if (!result.ok) {
              rollback(previous);
              setError(result.message);
              return;
            }
            router.refresh();
          });
        }}
      >
        Start triage
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function AcceptReportButton({ organizationId, programId, reportId }: ReportRef) {
  return (
    <ConfirmActionDialog
      triggerLabel="Accept"
      title="Accept this report?"
      description={<p>The program confirms this is a valid finding. The report moves to Accepted, and can then be resolved or sent back for more information.</p>}
      confirmLabel="Accept report"
      optimisticStatus="accepted"
      onConfirm={() => acceptReportAction({ organizationId, programId, reportId })}
    />
  );
}

export function MarkInformativeButton({ organizationId, programId, reportId }: ReportRef) {
  return (
    <ConfirmActionDialog
      triggerLabel="Mark informative"
      title="Mark this report informative?"
      description={<p>The report did not describe an actionable finding. This is a terminal state. It cannot be moved to another status afterward.</p>}
      confirmLabel="Mark informative"
      optimisticStatus="informative"
      onConfirm={() => markInformativeAction({ organizationId, programId, reportId })}
    />
  );
}

export function MarkNotApplicableButton({ organizationId, programId, reportId }: ReportRef) {
  return (
    <ConfirmActionDialog
      triggerLabel="Mark not applicable"
      title="Mark this report not applicable?"
      description={<p>The report does not apply to an in-scope target or condition. This is a terminal state. It cannot be moved to another status afterward.</p>}
      confirmLabel="Mark not applicable"
      optimisticStatus="not_applicable"
      onConfirm={() => markNotApplicableAction({ organizationId, programId, reportId })}
    />
  );
}

export function RejectReportButton({ organizationId, programId, reportId }: ReportRef) {
  return (
    <ConfirmActionDialog
      triggerLabel="Reject"
      triggerVariant="destructive"
      title="Reject this report?"
      description={<p>The program declines this report. This is a terminal state. It cannot be moved to another status afterward.</p>}
      confirmLabel="Reject report"
      optimisticStatus="rejected"
      onConfirm={() => rejectReportAction({ organizationId, programId, reportId })}
    />
  );
}

export function RequestInformationDialog({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const { setOptimistic, rollback } = useTriageStatus();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setReason("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const previous = setOptimistic({ status: "needs_information" });
    setOpen(false);
    startTransition(async () => {
      const result = await requestInformationAction({ organizationId, programId, reportId, reason });
      if (!result.ok) {
        rollback(previous);
        setOpen(true);
        setError(result.message);
        return;
      }
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Request information
      </Button>
      <Dialog open={open} title="Request more information" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Textarea label="What do you need from the researcher?" required autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} error={error ?? undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Send request
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ResolveReportDialog({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const { setOptimistic, rollback } = useTriageStatus();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setSummary("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const previous = setOptimistic({ status: "resolved" });
    setOpen(false);
    startTransition(async () => {
      const result = await resolveReportAction({ organizationId, programId, reportId, resolutionSummary: summary });
      if (!result.ok) {
        rollback(previous);
        setOpen(true);
        setError(result.message);
        return;
      }
      setSummary("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Resolve</Button>
      <Dialog open={open} title="Resolve this report" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">This is a terminal state. It cannot be moved to another status afterward.</p>
          <MarkdownTextarea label="How was this resolved?" required autoFocus value={summary} onChange={setSummary} maxLength={5000} rows={5} error={error ?? undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Resolve report
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** The target report picker for "Mark as a duplicate" -- a real `<select>` of this
 * program's other reports (title + target), not a raw UUID text field a triager had to
 * already know or separately look up. Fetched lazily on the dialog's first open (the same
 * "pay only if you actually use it" convention NotificationBellDropdown already
 * established), via the same authorized listReportsForProgramPageAction the triage
 * inbox itself uses -- no new query shape, no new authorization path. The current report
 * is excluded (a report cannot be a duplicate of itself); a manual "Other report ID"
 * fallback stays available for the rare case where the real original hasn't loaded into
 * this first page (e.g. more reports exist than the page size, or it's genuinely from
 * another page) -- the picker replaces the DEFAULT path, not the only path. */
type DuplicateCandidate = { id: string; title: string; displayTarget: string };

/** A report can never be a duplicate of itself -- the current report is always excluded
 * from its own candidate list. Pulled out as a pure function so this real exclusion rule
 * is directly testable without mounting the async-fetching component around it. */
export function deriveDuplicateCandidates(reports: { id: string; title: string; displayTarget: string }[], currentReportId: string): DuplicateCandidate[] {
  return reports.filter((report) => report.id !== currentReportId).map((report) => ({ id: report.id, title: report.title, displayTarget: report.displayTarget }));
}

function DuplicateTargetPicker({ reportId, value, onChange }: { reportId: string; value: string; onChange: (value: string) => void }) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [useManualEntry, setUseManualEntry] = useState(false);

  useEffectOnce(() => {
    let cancelled = false;
    (async () => {
      // Ranked by likeness across the whole program (suggest_duplicate_reports, 202610220002),
      // same target first -- not just the first page of reports.
      const result = await suggestDuplicateReportsAction({ reportId });
      if (cancelled) return;
      if (result.ok) {
        setCandidates(deriveDuplicateCandidates(result.data.map((s) => ({ id: s.id, title: `${s.title} · ${Math.round(s.similarity * 100)}% alike${s.sameTarget ? ", same target" : ""}`, displayTarget: s.displayTarget })), reportId));
      } else {
        setCandidates([]);
        setUseManualEntry(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  });

  if (loading) return <p className="text-sm text-ink-muted">Looking for similar earlier reports…</p>;

  if (useManualEntry || !candidates || candidates.length === 0) {
    return (
      <div className="space-y-2">
        {candidates?.length === 0 && !useManualEntry && <p className="text-sm text-ink-muted">No earlier report in this program looks like this one.</p>}
        <Input label="Original report ID" required autoFocus value={value} onChange={(event) => onChange(event.target.value)} className="[&_input]:font-mono" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select label="Original report" required autoFocus value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select the report this duplicates…</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.title} ({candidate.displayTarget})
          </option>
        ))}
      </Select>
      <button type="button" onClick={() => setUseManualEntry(true)} className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
        The report isn't listed? Enter its ID directly
      </button>
    </div>
  );
}

/** A run-once-per-mount effect (unlike a plain useEffect([]) call inlined at the call
 * site, this makes the "runs exactly once, cleanup on unmount" intent explicit at the
 * name rather than relying on the reader to notice an empty dependency array). */
function useEffectOnce(effect: () => void | (() => void)) {
  React.useEffect(effect, []);
}

export function MarkDuplicateDialog({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const { setOptimistic, rollback } = useTriageStatus();
  const [open, setOpen] = useState(false);
  const [duplicateOfReportId, setDuplicateOfReportId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setDuplicateOfReportId("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const previous = setOptimistic({ status: "duplicate" });
    setOpen(false);
    startTransition(async () => {
      const result = await markDuplicateAction({ organizationId, programId, reportId, duplicateOfReportId });
      if (!result.ok) {
        rollback(previous);
        setOpen(true);
        setError(result.message);
        return;
      }
      setDuplicateOfReportId("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Mark duplicate
      </Button>
      <Dialog open={open} title="Mark as a duplicate" onClose={close}>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <p className="text-sm text-ink-muted">Pick the original report in this same program. This is a terminal state. It cannot be moved to another status afterward.</p>
          {open && <DuplicateTargetPicker reportId={reportId} value={duplicateOfReportId} onChange={setDuplicateOfReportId} />}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending} disabled={!duplicateOfReportId}>
              Mark duplicate
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

const SEVERITIES: ReportSeverity[] = ["none", "low", "medium", "high", "critical"];

const CVSS_DEFAULTS: CvssMetrics = {
  attackVector: "network",
  attackComplexity: "low",
  privilegesRequired: "none",
  userInteraction: "none",
  scope: "unchanged",
  confidentialityImpact: "none",
  integrityImpact: "none",
  availabilityImpact: "none",
};

const CVSS_FIELDS: { key: keyof CvssMetrics; label: string; options: { value: string; label: string }[] }[] = [
  { key: "attackVector", label: "Attack vector", options: [{ value: "network", label: "Network" }, { value: "adjacent", label: "Adjacent" }, { value: "local", label: "Local" }, { value: "physical", label: "Physical" }] },
  { key: "attackComplexity", label: "Attack complexity", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }] },
  { key: "privilegesRequired", label: "Privileges required", options: [{ value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "high", label: "High" }] },
  { key: "userInteraction", label: "User interaction", options: [{ value: "none", label: "None" }, { value: "required", label: "Required" }] },
  { key: "scope", label: "Scope", options: [{ value: "unchanged", label: "Unchanged" }, { value: "changed", label: "Changed" }] },
  { key: "confidentialityImpact", label: "Confidentiality impact", options: [{ value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "high", label: "High" }] },
  { key: "integrityImpact", label: "Integrity impact", options: [{ value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "high", label: "High" }] },
  { key: "availabilityImpact", label: "Availability impact", options: [{ value: "none", label: "None" }, { value: "low", label: "Low" }, { value: "high", label: "High" }] },
];

/** The eight CVSS v3.1 base metrics, as eight small selects -- a real, standardized
 * justification for the chosen severity, computed server-side, never a client-supplied
 * score. See supabase/migrations/202609030006_cvss_severity_scoring.sql. Collapsed by
 * default: CVSS is optional metadata, not a required step in setting severity. */
function CvssMetricsForm({ metrics, onChange }: { metrics: CvssMetrics; onChange: (next: CvssMetrics) => void }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-muted p-3">
      {CVSS_FIELDS.map((field) => (
        <label key={field.key} className="text-xs">
          <span className="block font-medium text-ink-muted">{field.label}</span>
          <select
            value={metrics[field.key]}
            onChange={(event) => onChange({ ...metrics, [field.key]: event.target.value })}
            className="mt-0.5 min-h-8 w-full rounded border border-border bg-surface px-1.5 text-xs text-ink outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** `locked` mirrors the database's own rule (docs/decisions/0012): once a report reaches
 * a terminal state, confirmed_severity can never change again, so an editable control
 * that would only ever be rejected is replaced with a plain read-only value instead. */
export function SeverityControl({ organizationId, programId, reportId, currentSeverity, currentCvssBaseScore, locked, lockReason = "decision" }: ReportRef & { currentSeverity: ReportSeverity | null; currentCvssBaseScore?: number | null; locked: boolean; lockReason?: "decision" | "bounty" }) {
  const router = useRouter();
  const { setOptimistic, rollback } = useTriageStatus();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCvss, setShowCvss] = useState(false);
  const [cvss, setCvss] = useState<CvssMetrics>(CVSS_DEFAULTS);

  function handleChange(severity: ReportSeverity) {
    setError(null);
    const previous = setOptimistic({ confirmedSeverity: severity });
    startTransition(async () => {
      const result = await setReportSeverityAction({ organizationId, programId, reportId, severity, cvss: showCvss ? cvss : undefined });
      if (!result.ok) {
        rollback(previous);
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  const mismatch = cvssSeverityMismatch(currentSeverity, currentCvssBaseScore);
  const mismatchNote = mismatch && currentSeverity && (
    <p role="status" className="mt-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-ink">
      CVSS {currentCvssBaseScore?.toFixed(1)} rates this {SEVERITY_LABEL[mismatch]}, not {SEVERITY_LABEL[currentSeverity]}. If that&apos;s deliberate, tell the researcher why in a message.
    </p>
  );

  if (locked) {
    const label = currentSeverity ? currentSeverity[0].toUpperCase() + currentSeverity.slice(1) : "Not set";
    return (
      <div className="max-w-xs">
        <p className="text-sm font-medium text-ink">Confirmed severity</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {label}: {lockReason === "bounty" ? "fixed because the bounty is finalized." : "fixed now that a final decision has been made."}
          {typeof currentCvssBaseScore === "number" && ` CVSS base score ${currentCvssBaseScore.toFixed(1)}.`}
        </p>
        {mismatchNote}
      </div>
    );
  }

  return (
    <div className="max-w-xs">
      <Select label="Confirmed severity" helperText="The organization's assessment. Visible to the researcher." value={currentSeverity ?? ""} disabled={pending} onChange={(event) => handleChange(event.target.value as ReportSeverity)}>
        <option value="" disabled>
          Not set
        </option>
        {SEVERITIES.map((severity) => (
          <option key={severity} value={severity}>
            {SEVERITY_LABEL[severity]}
          </option>
        ))}
      </Select>
      {mismatchNote}

      <button type="button" onClick={() => setShowCvss((current) => !current)} className="mt-2 text-xs font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {showCvss ? "Hide CVSS scoring" : "Attach a CVSS score"}
      </button>
      {showCvss && (
        <>
          <CvssMetricsForm metrics={cvss} onChange={setCvss} />
          <p className="mt-1.5 text-xs text-ink-muted">Applied the next time you set the severity above.</p>
        </>
      )}

      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Which action buttons a manager sees, driven by the same transition table DOMAIN.md
 * specifies -- a UI hint only; the server independently re-validates every action
 * regardless. See lib/report-status.ts.
 *
 * `needs_information` gets a visually quieter treatment (reduced opacity on the whole row,
 * the same reduced-but-real-state language button.tsx's own `disabled:opacity-55` and
 * tabs.tsx's pending-transition dimming already establish elsewhere in this codebase) --
 * never disabled, never hidden, every legally-available transition (start triage, accept,
 * mark duplicate/informative/not applicable, reject) stays exactly as clickable as before.
 * This exists because the rail's own "Next action" label already says "Awaiting
 * researcher" for this status (lib/report-status.ts's reportNextActionLabel) -- rendering
 * a full-strength action row directly under that copy contradicted it, visually implying
 * "your turn" the moment after the text said the opposite. No new status, no new
 * ownership prop, no new color: derived directly from the `status` this component already
 * receives. */
export function TriageActionPanel({ organizationId, programId, reportId, status, allowedNext }: ReportRef & { status: ReportStatus; allowedNext: ReportStatus[] }) {
  if (allowedNext.length === 0) {
    return <p className="text-sm text-ink-muted">{reportStatusLabel(status)} is a terminal state. No further triage actions are available.</p>;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", status === "needs_information" && "opacity-60")}>
      {allowedNext.includes("triaging") && <StartTriageButton organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("needs_information") && <RequestInformationDialog organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("accepted") && <AcceptReportButton organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("resolved") && <ResolveReportDialog organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("duplicate") && <MarkDuplicateDialog organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("informative") && <MarkInformativeButton organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("not_applicable") && <MarkNotApplicableButton organizationId={organizationId} programId={programId} reportId={reportId} />}
      {allowedNext.includes("rejected") && <RejectReportButton organizationId={organizationId} programId={programId} reportId={reportId} />}
    </div>
  );
}


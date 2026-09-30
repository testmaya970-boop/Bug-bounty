"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select, Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import { addOrganizationEvidenceAction, addResearcherEvidenceAction } from "../../actions/reports";
import { getEvidenceDownloadUrlAction, uploadOrganizationFileEvidenceAction, uploadResearcherFileEvidenceAction } from "../../actions/report-file-evidence";
import type { ReportEvidence, ReportEvidenceType, ReportVisibility } from "../../types/report";
import { LocalTime } from "../ui/local-time";

type ReportRef = { organizationId: string; programId: string; reportId: string };

export const EVIDENCE_TYPE_LABELS: Record<ReportEvidenceType, string> = { text: "Text", code: "Code", url: "URL", log: "Log", file: "File" };
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadFileEvidenceButton({ organizationId, programId, reportId, evidenceId }: ReportRef & { evidenceId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await getEvidenceDownloadUrlAction({ organizationId, programId, reportId, evidenceId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div>
      <Button variant="secondary" onClick={handleDownload} pending={pending}>
        Download
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** One evidence record per row -- TYPE, author/context, and age on the eyebrow line,
 * content or file metadata below. A divided list, not a card per item: evidence reads as
 * one register of supporting material, not a scattered collection of boxes. */
function EvidenceItem({ evidence, organizationId, programId, reportId }: { evidence: ReportEvidence } & ReportRef) {
  const isFile = evidence.evidenceType === "file";
  return (
    <li className="py-3 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {EVIDENCE_TYPE_LABELS[evidence.evidenceType]} · {evidence.authorName} · {evidence.authorContext === "researcher" ? "Researcher" : "Organization"}
        </p>
        <time className="text-xs text-ink-muted"><LocalTime value={evidence.createdAt} /></time>
      </div>
      {isFile ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded bg-surface-muted p-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink" title={evidence.originalFilename ?? undefined}>
              {evidence.originalFilename}
            </p>
            <p className="text-xs text-ink-muted">
              {evidence.contentType} · {evidence.sizeBytes !== null ? formatBytes(evidence.sizeBytes) : ""}
            </p>
          </div>
          <DownloadFileEvidenceButton organizationId={organizationId} programId={programId} reportId={reportId} evidenceId={evidence.id} />
        </div>
      ) : (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-muted p-2 font-mono text-xs text-ink">{evidence.content}</pre>
      )}
    </li>
  );
}

function EvidenceList({ items, emptyText, organizationId, programId, reportId }: { items: ReportEvidence[]; emptyText: string } & ReportRef) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <EvidenceItem key={item.id} evidence={item} organizationId={organizationId} programId={programId} reportId={reportId} />
      ))}
    </ul>
  );
}

/** Same researcher-visible/internal separation as ReportCommunication -- evidence can be
 * more sensitive than the report itself, so the split is structural, not a badge on one
 * mixed list. See docs/decisions/0010-report-evidence-and-communication.md. */
export function ReportEvidenceSection({ evidence, showInternal, organizationId, programId, reportId }: { evidence: ReportEvidence[]; showInternal: boolean } & ReportRef) {
  const visible = evidence.filter((item) => item.visibility === "researcher_visible");
  const internal = evidence.filter((item) => item.visibility === "internal");

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Visible to researcher</SectionLabel>
        <div className="mt-2">
          <EvidenceList items={visible} emptyText="No evidence yet." organizationId={organizationId} programId={programId} reportId={reportId} />
        </div>
      </div>
      {showInternal && (
        <div className="border-l-2 border-warning bg-surface-muted p-3">
          <SectionLabel>Internal only: not visible to the researcher</SectionLabel>
          <div className="mt-2">
            <EvidenceList items={internal} emptyText="No internal evidence yet." organizationId={organizationId} programId={programId} reportId={reportId} />
          </div>
        </div>
      )}
    </div>
  );
}

// Textual evidence types only -- file evidence has its own dedicated composer below,
// since a file input and a text-content field are different UX flows, not one form with
// a type switch.
export type TextualEvidenceType = Exclude<ReportEvidenceType, "file">;
export const EVIDENCE_TYPES: TextualEvidenceType[] = ["text", "code", "url", "log"];

export function ResearcherEvidenceComposer({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const [evidenceType, setEvidenceType] = useState<TextualEvidenceType>("text");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await addResearcherEvidenceAction({ organizationId, programId, reportId, evidenceType, content });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <Select label="Type" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as TextualEvidenceType)} className="max-w-xs">
        {EVIDENCE_TYPES.map((type) => (
          <option key={type} value={type}>
            {EVIDENCE_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>
      <Textarea label="Content" required value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} className="[&_textarea]:font-mono" error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Add evidence
        </Button>
      </div>
    </form>
  );
}

export function OrganizationEvidenceComposer({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const [evidenceType, setEvidenceType] = useState<TextualEvidenceType>("text");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<ReportVisibility>("researcher_visible");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await addOrganizationEvidenceAction({ organizationId, programId, reportId, evidenceType, content, visibility });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap gap-3">
        <Select label="Type" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as TextualEvidenceType)} className="max-w-xs">
          {EVIDENCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVIDENCE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Select label="Visible to" value={visibility} onChange={(event) => setVisibility(event.target.value as ReportVisibility)} className="max-w-xs">
          <option value="researcher_visible">Researcher and organization</option>
          <option value="internal">Internal only</option>
        </Select>
      </div>
      <Textarea label="Content" required value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} className="[&_textarea]:font-mono" error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Add evidence
        </Button>
      </div>
    </form>
  );
}

/** A native `<input type="file">` has no built-in way to clear a chosen file short of
 * picking a different one -- confirmed live as a real gap: choosing the wrong file, then
 * wanting to deselect it before staging it, had no control to do that with. `selectedName`
 * is lifted into the parent (rather than read imperatively off the ref on click) so this
 * component can render its own "Clear" action and re-render the moment a file is chosen,
 * without either composer needing its own copy of this same file-cleared-vs-chosen state. */
export function FileField({
  inputRef,
  error,
  selectedName,
  onClear,
  onFileChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  error?: string;
  selectedName?: string | null;
  onClear?: () => void;
  onFileChange?: (name: string | null) => void;
}) {
  const id = "file-evidence-input";
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        File <span aria-hidden="true"> *</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          required
          onChange={(event) => onFileChange?.(event.target.files?.[0]?.name ?? null)}
          className="block min-w-0 flex-1 text-sm text-ink file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-muted"
        />
        {selectedName && onClear && (
          <Button type="button" variant="quiet" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-muted">Up to 10 MB. Downloaded as a file, never previewed or executed.</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ResearcherFileEvidenceComposer({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clearFile() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedName(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File must be 10 MB or smaller.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await uploadResearcherFileEvidenceAction({ organizationId, programId, reportId, file });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      clearFile();
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <FileField inputRef={fileInputRef} error={error ?? undefined} selectedName={selectedName} onClear={clearFile} onFileChange={(name) => setSelectedName(name)} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Upload file
        </Button>
      </div>
    </form>
  );
}

export function OrganizationFileEvidenceComposer({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ReportVisibility>("researcher_visible");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clearFile() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedName(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File must be 10 MB or smaller.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await uploadOrganizationFileEvidenceAction({ organizationId, programId, reportId, file, visibility });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      clearFile();
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <Select label="Visible to" value={visibility} onChange={(event) => setVisibility(event.target.value as ReportVisibility)} className="max-w-xs">
        <option value="researcher_visible">Researcher and organization</option>
        <option value="internal">Internal only</option>
      </Select>
      <FileField inputRef={fileInputRef} error={error ?? undefined} selectedName={selectedName} onClear={clearFile} onFileChange={(name) => setSelectedName(name)} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Upload file
        </Button>
      </div>
    </form>
  );
}

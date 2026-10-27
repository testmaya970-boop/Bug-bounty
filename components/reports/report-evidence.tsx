"use client";

import React, { useState, useTransition } from "react";
import { IconButton } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";
import { getEvidenceDownloadUrlAction } from "../../actions/report-file-evidence";
import type { ReportEvidence, ReportEvidenceType } from "../../types/report";
import { LocalTime } from "../ui/local-time";
import { DownloadSimple } from "@phosphor-icons/react";

type ReportRef = { organizationId: string; programId: string; reportId: string };

export const EVIDENCE_TYPE_LABELS: Record<ReportEvidenceType, string> = { text: "Text", code: "Code", url: "URL", log: "Log", file: "File" };
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
      <IconButton label="Download" variant="secondary" onClick={handleDownload} pending={pending}>
        {!pending && <DownloadSimple aria-hidden="true" className="size-[18px]" />}
      </IconButton>
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
        <p className="text-xs font-semibold text-ink-muted">
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


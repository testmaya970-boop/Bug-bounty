"use client";

import React from "react";
import { Trash, ArrowClockwise, CheckCircle, WarningCircle, Paperclip } from "@phosphor-icons/react";
import { IconButton } from "../ui/button";
import { completeEvidenceUploadAction, startEvidenceUploadAction } from "../../actions/evidence-uploads";
import { formatBytes } from "../../lib/evidence-policy";
import type { StagedUpload } from "../../services/evidence-uploads";

type Target = Parameters<typeof startEvidenceUploadAction>[0]["target"];
export type UploadOutcome = { ok: true; upload: StagedUpload; evidenceId: string | null } | { ok: false; message: string; uploadId?: string };

/**
 * One file, start to finish: the server authorizes and signs (startEvidenceUploadAction), the
 * browser PUTs the bytes straight to storage with real progress events, then the server
 * verifies what arrived (completeEvidenceUploadAction). XHR rather than fetch because only XHR
 * reports upload progress. `signal` aborts the transfer (the row is then removed by the caller).
 */
export async function uploadEvidenceFile(file: File, target: Target, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<UploadOutcome> {
  const started = await startEvidenceUploadAction({ target, filename: file.name, sizeBytes: file.size }).catch(() => null);
  if (!started) return { ok: false, message: `${file.name}: couldn't reach the server. Check your connection and try again.` };
  if (!started.ok) return { ok: false, message: started.message };

  const sent = await new Promise<"ok" | "network" | "aborted" | "rejected">((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", started.data.url);
    xhr.setRequestHeader("Content-Type", started.data.contentType);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? "ok" : "rejected");
    xhr.onerror = () => resolve("network");
    xhr.onabort = () => resolve("aborted");
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
  const uploadId = started.data.upload.id;
  if (sent === "aborted") return { ok: false, message: "Upload cancelled.", uploadId };
  if (sent !== "ok") return { ok: false, message: `${file.name}: the upload was interrupted. Try again.`, uploadId };

  onProgress(1);
  const report = target.kind === "report" ? { organizationId: target.organizationId, programId: target.programId, reportId: target.reportId } : undefined;
  const completed = await completeEvidenceUploadAction({ uploadId, report }).catch(() => null);
  if (!completed) return { ok: false, message: `${file.name}: couldn't confirm the upload. Try again.`, uploadId };
  if (!completed.ok) return { ok: false, message: completed.message, uploadId };
  return { ok: true, upload: completed.data.upload, evidenceId: completed.data.evidenceId };
}

export type UploadItem = {
  key: string;
  name: string;
  size: number;
  /** 0..1 while sending; null once verifying. */
  progress: number | null;
  /** queued: chosen, sent when the surrounding form is submitted (the report thread composer). */
  state: "queued" | "uploading" | "verifying" | "ready" | "error";
  error?: string;
  uploadId?: string;
};

function statusText(item: UploadItem): string {
  if (item.state === "queued") return "Sent with your comment";
  if (item.state === "uploading") return `Uploading ${Math.round((item.progress ?? 0) * 100)}%`;
  if (item.state === "verifying") return "Checking file…";
  if (item.state === "ready") return "Attached";
  return item.error ?? "Upload failed";
}

/** The list of files with their own progress and status, and per-file remove / retry. */
export function UploadList({ items, onRemove, onRetry, label = "Attachments" }: { items: UploadItem[]; onRemove: (key: string) => void; onRetry?: (key: string) => void; label?: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 p-3">
          <span aria-hidden="true" className="shrink-0">
            {item.state === "queued" ? (
              <Paperclip className="size-4 text-ink-muted" />
            ) : item.state === "ready" ? (
              <CheckCircle weight="fill" className="size-4 text-success" />
            ) : item.state === "error" ? (
              <WarningCircle weight="fill" className="size-4 text-danger" />
            ) : (
              <span className="block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent text-ink-muted motion-reduce:animate-none" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink" title={item.name}>
              {item.name}
            </span>
            <span className={`block text-xs ${item.state === "error" ? "font-medium text-danger" : "text-ink-muted"}`} role={item.state === "error" ? "alert" : undefined}>
              <span className="font-mono">{formatBytes(item.size)}</span> · {statusText(item)}
            </span>
            {item.state === "uploading" && (
              <span role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((item.progress ?? 0) * 100)} className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-muted">
                <span className="block h-full origin-left bg-action transition-transform duration-150 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${item.progress ?? 0})` }} />
              </span>
            )}
          </span>
          {item.state === "error" && onRetry && (
            <IconButton label={`Retry ${item.name}`} type="button" variant="quiet" onClick={() => onRetry(item.key)}>
              <ArrowClockwise aria-hidden="true" className="size-[18px]" />
            </IconButton>
          )}
          <IconButton label={item.state === "uploading" ? `Cancel ${item.name}` : `Remove ${item.name}`} type="button" variant="quiet" className="text-danger" onClick={() => onRemove(item.key)}>
            <Trash aria-hidden="true" className="size-[18px]" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

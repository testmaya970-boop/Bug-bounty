"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton } from "../ui/button";
import { Panel } from "../ui/feedback";
import {
  getProgramAccessFileDownloadUrlAction,
  removeProgramAccessFileAction,
  uploadProgramAccessFileAction,
} from "../../actions/program-access-file";
import type { ProgramAccessFile } from "../../services/program-access-file";
import { LocalTime } from "../ui/local-time";
import { DownloadSimple, Trash } from "@phosphor-icons/react";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Manager-side upload for a single program access file (a VPN config, a setup PDF) --
 * alongside the plain-text ProgramAccessInstructionsEditor, for orgs that want to hand a
 * researcher an actual credential file rather than just written steps. The org was told
 * explicitly (this conversation, not a doc) that a single shared file cannot be revoked
 * per-researcher once downloaded -- the warning below is that disclosure made permanent
 * in the product, not buried in a decision doc only this session's transcript has. See
 * db/migrations/202609240002_program_access_file.sql for the full reasoning.
 */
export function ProgramAccessFileEditor({ organizationId, programId, file }: { organizationId: string; programId: string; file: ProgramAccessFile | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadPending, startUploadTransition] = useTransition();
  const [downloadPending, startDownloadTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const selected = inputRef.current?.files?.[0];
    if (!selected) {
      setError("Choose a file to upload.");
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setError("File must be 10 MB or smaller.");
      return;
    }
    startUploadTransition(async () => {
      const result = await uploadProgramAccessFileAction({ organizationId, programId, file: selected });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  function handleDownload() {
    setError(null);
    startDownloadTransition(async () => {
      const result = await getProgramAccessFileDownloadUrlAction({ organizationId, programId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function handleRemove() {
    setError(null);
    startRemoveTransition(async () => {
      const result = await removeProgramAccessFileAction({ organizationId, programId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Panel className="space-y-4 p-5">
      <p className="text-sm text-ink-muted">
        Optional: upload one file (a VPN config, a setup PDF) instead of or alongside written instructions. Downloadable by any currently active researcher on this program.
      </p>
      <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-ink-muted">
        <span className="font-semibold text-ink">A single shared file cannot be revoked per-researcher.</span> Once someone downloads it, removing their access here does not invalidate the
        copy they already have. If that matters for this file&rsquo;s contents, rotate the underlying credential (e.g. the VPN server&rsquo;s shared key) whenever you revoke a researcher.
      </p>

      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{file.originalFilename}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {formatBytes(file.sizeBytes)} · Uploaded <LocalTime value={file.createdAt} />
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <IconButton label="Download" variant="secondary" onClick={handleDownload} pending={downloadPending}>
              {!downloadPending && <DownloadSimple aria-hidden="true" className="size-[18px]" />}
            </IconButton>
            <IconButton label="Remove" variant="quiet" className="text-danger" onClick={handleRemove} pending={removePending}>
              {!removePending && <Trash aria-hidden="true" className="size-[18px]" />}
            </IconButton>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No file uploaded yet.</p>
      )}

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleUpload}>
        <input
          ref={inputRef}
          type="file"
          aria-label="Access file"
          className="block min-w-0 flex-1 text-sm text-ink file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-muted"
        />
        <Button type="submit" variant="secondary" pending={uploadPending}>
          {file ? "Replace file" : "Upload file"}
        </Button>
      </form>
      <p className="text-xs text-ink-muted">Up to 10 MB. Downloaded as a file, never previewed or executed.</p>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}

/** The researcher-facing read: download only, no upload/remove controls, and rendered
 * nothing at all when the org hasn't uploaded anything -- matching
 * ProgramAccessInstructionsNotice's identical "nothing to show" stance. */
export function ProgramAccessFileNotice({ organizationId, programId, file }: { organizationId: string; programId: string; file: ProgramAccessFile | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!file) return null;

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await getProgramAccessFileDownloadUrlAction({ organizationId, programId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <Panel className="space-y-3 p-5">
      <h2 className="text-base font-semibold text-ink">Access file</h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{file.originalFilename}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatBytes(file.sizeBytes)}</p>
        </div>
        <IconButton label="Download" variant="secondary" onClick={handleDownload} pending={pending}>
          {!pending && <DownloadSimple aria-hidden="true" className="size-[18px]" />}
        </IconButton>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}

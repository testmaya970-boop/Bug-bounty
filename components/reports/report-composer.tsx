"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { MarkdownTextarea } from "../ui/markdown-textarea";
import { postOrganizationMessageAction, postResearcherMessageAction } from "../../actions/reports";
import { uploadOrganizationFileEvidenceAction, uploadResearcherFileEvidenceAction } from "../../actions/report-file-evidence";
import { fileProblem } from "./report-evidence";
import type { ReportVisibility } from "../../types/report";

type ReportRef = { organizationId: string; programId: string; reportId: string };

/**
 * One place to add to a report (Oct 23): a comment, files attached to it, and -- for the
 * organization -- one "Visible to" choice that applies to both. Replaces the separate message,
 * text-evidence and file-upload forms, which asked the same visibility question three times.
 * Text is posted as a message; each file is stored as file evidence with the same visibility.
 */
export function ReportComposer({ organizationId, programId, reportId, side }: ReportRef & { side: "researcher" | "organization" }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState<ReportVisibility>("researcher_visible");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = { organizationId, programId, reportId };

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const bad = picked.map(fileProblem).find(Boolean);
    if (bad) setError(bad);
    else setError(null);
    setFiles((was) => [...was, ...picked.filter((f) => !fileProblem(f))].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!body.trim() && files.length === 0) return setError("Write a comment or attach a file.");
    setError(null);
    startTransition(async () => {
      if (body.trim()) {
        const posted = side === "organization" ? await postOrganizationMessageAction({ ...ref, body, visibility }) : await postResearcherMessageAction({ ...ref, body });
        if (!posted.ok) return setError(posted.message);
        setBody("");
      }
      for (const file of files) {
        const uploaded = side === "organization" ? await uploadOrganizationFileEvidenceAction({ ...ref, file, visibility }) : await uploadResearcherFileEvidenceAction({ ...ref, file });
        if (!uploaded.ok) {
          setError(`${file.name}: ${uploaded.message}`);
          router.refresh();
          return;
        }
        setFiles((was) => was.filter((f) => f !== file));
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="p-3">
        <MarkdownTextarea
          label={side === "organization" ? "Add a comment" : "Add a comment for the organization"}
          value={body}
          onChange={setBody}
          maxLength={5000}
          rows={4}
          error={error ?? undefined}
        />
        {files.length > 0 && (
          <ul aria-label="Attached files" className="mt-2 flex flex-wrap gap-2">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2 py-1 text-xs text-ink">
                <Paperclip aria-hidden="true" className="size-3.5" />
                {f.name}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((was) => was.filter((x) => x !== f))} className="text-ink-muted hover:text-ink">
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-hover px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
          <Paperclip aria-hidden="true" className="size-4" />
          Attach files
          <input ref={fileRef} type="file" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
        </label>
        <span className="text-xs text-ink-muted">Up to 10 MB each, downloaded as files, never opened.</span>
        <div className="ml-auto flex items-center gap-2">
          {side === "organization" && (
            <select
              aria-label="Visible to"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as ReportVisibility)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-ink"
            >
              <option value="researcher_visible">Visible to the researcher</option>
              <option value="internal">Internal note (team only)</option>
            </select>
          )}
          <Button type="submit" pending={pending}>
            Comment
          </Button>
        </div>
      </div>
    </form>
  );
}

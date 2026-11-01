"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { MarkdownTextarea } from "../ui/markdown-textarea";
import { postOrganizationMessageAction, postResearcherMessageAction } from "../../actions/reports";
import { EVIDENCE_ACCEPT, describeEvidenceLimits, evidenceFileProblem, type EvidenceLimits } from "../../lib/evidence-policy";
import { UploadList, uploadEvidenceFile, type UploadItem } from "./evidence-upload";
import type { ReportVisibility } from "../../types/report";

type ReportRef = { organizationId: string; programId: string; reportId: string };

/**
 * One place to add to a report (Oct 23): a comment, files attached to it, and -- for the
 * organization -- one "Visible to" choice that applies to both. Text is posted as a message;
 * each file goes through the verified upload pipeline (components/reports/evidence-upload.tsx)
 * and is attached as file evidence with the same visibility, showing its own progress.
 */
export function ReportComposer({ organizationId, programId, reportId, side, limits }: ReportRef & { side: "researcher" | "organization"; limits: EvidenceLimits }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const files = useRef(new Map<string, File>());
  const [body, setBody] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [visibility, setVisibility] = useState<ReportVisibility>("researcher_visible");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = { organizationId, programId, reportId };
  const queued = items.filter((i) => i.state !== "ready");

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    const room = limits.maxFiles - queued.length;
    let problem: string | null = picked.length > room ? `You can add up to ${limits.maxFiles} files at a time.` : null;
    const accepted: UploadItem[] = [];
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const bad = evidenceFileProblem(file, limits);
      if (bad) {
        problem = bad;
        continue;
      }
      const key = crypto.randomUUID();
      files.current.set(key, file);
      accepted.push({ key, name: file.name, size: file.size, progress: 0, state: "queued" });
    }
    setError(problem);
    setItems((was) => [...was.filter((i) => i.state !== "ready"), ...accepted]);
  }

  function patch(key: string, next: Partial<UploadItem>) {
    setItems((was) => was.map((i) => (i.key === key ? { ...i, ...next } : i)));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!body.trim() && queued.length === 0) return setError("Write a comment or attach a file.");
    setError(null);
    startTransition(async () => {
      if (body.trim()) {
        const posted = side === "organization" ? await postOrganizationMessageAction({ ...ref, body, visibility }) : await postResearcherMessageAction({ ...ref, body });
        if (!posted.ok) return setError(posted.message);
        setBody("");
      }
      let failed = 0;
      for (const item of queued) {
        const file = files.current.get(item.key);
        if (!file) continue;
        patch(item.key, { state: "uploading", progress: 0, error: undefined });
        const outcome = await uploadEvidenceFile(file, { kind: "report", ...ref, visibility: side === "organization" ? visibility : null }, (fraction) =>
          patch(item.key, fraction >= 1 ? { state: "verifying", progress: null } : { progress: fraction }),
        );
        if (outcome.ok) {
          patch(item.key, { state: "ready", progress: 1 });
          files.current.delete(item.key);
        } else {
          failed += 1;
          patch(item.key, { state: "error", error: outcome.message });
        }
      }
      if (failed === 0) setItems([]);
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
        <UploadList
          label="Files to attach"
          items={items}
          onRemove={(key) => {
            files.current.delete(key);
            setItems((was) => was.filter((i) => i.key !== key));
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-hover px-3 py-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          <Paperclip aria-hidden="true" className="size-4" />
          Attach files
          <input ref={fileRef} type="file" multiple accept={EVIDENCE_ACCEPT} className="sr-only" onChange={(event) => addFiles(event.target.files)} />
        </label>
        <span className="text-xs text-ink-muted">{describeEvidenceLimits(limits)} Downloaded as files, never opened.</span>
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

"use client";

import React, { useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import {
  approveReportDisclosureAction,
  declineReportDisclosureAction,
  requestReportDisclosureAction,
  unpublishReportDisclosureAction,
  updateReportDisclosureDraftAction,
} from "../../actions/report-disclosures";
import type { ReportDisclosure } from "../../types/report";
import { LocalTime } from "../ui/local-time";

type Result = { ok: true; data: ReportDisclosure } | { ok: false; message: string };

function isPublic(disclosure: ReportDisclosure): boolean {
  return disclosure.status === "approved" && Boolean(disclosure.publishedAt) && new Date(disclosure.publishedAt!).getTime() <= Date.now();
}

function StatusLine({ disclosure }: { disclosure: ReportDisclosure }) {
  if (disclosure.status === "requested") return <p className="mt-2 text-sm font-semibold text-warning">Pending review · requested <LocalTime value={disclosure.requestedAt} /></p>;
  if (disclosure.status === "declined")
    return (
      <p className="mt-2 text-sm text-ink-muted">
        <span className="font-semibold text-danger">Declined.</span> {disclosure.declineReason ? `Reason: ${disclosure.declineReason}` : ""}
      </p>
    );
  if (disclosure.status === "unpublished")
    return (
      <p className="mt-2 text-sm text-ink-muted">
        <span className="font-semibold text-danger">Unpublished</span> {disclosure.unpublishedAt && <LocalTime value={disclosure.unpublishedAt} />}. {disclosure.unpublishReason ? `Reason: ${disclosure.unpublishReason}` : ""}
      </p>
    );
  if (isPublic(disclosure))
    return (
      <p className="mt-2 text-sm text-ink-muted">
        <span className="font-semibold text-success">Published</span> <LocalTime value={disclosure.publishedAt!} />.{" "}
        <a href={`/disclosures/${disclosure.reportId}`} className="font-medium text-action hover:underline">
          View public page
        </a>
      </p>
    );
  return (
    <p className="mt-2 text-sm text-ink-muted">
      <span className="font-semibold text-success">Approved.</span> Goes public <LocalTime value={disclosure.publishedAt!} /> under the program&apos;s coordinated-disclosure policy.
    </p>
  );
}

/** The public write-up: a title and summary, edited (redacted) before anything is published. */
function DraftEditor({ initialTitle, initialSummary, submitLabel, onSubmit, pending }: { initialTitle: string; initialSummary: string; submitLabel: string; onSubmit: (title: string, summary: string) => void; pending: boolean }) {
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(title, summary);
      }}
    >
      <Input label="Public title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
      <Textarea
        label="Public write-up"
        rows={6}
        maxLength={20000}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        helperText="Only this text is published -- never the original report, evidence or messages. Remove secrets, internal hosts and customer data."
      />
      <Button type="submit" variant="secondary" pending={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

function useRun(setDisclosure: (d: ReportDisclosure) => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDisclosure(result.data);
    });
  };
  return { error, pending, run };
}

/** Researcher-facing, on a resolved report: propose a public write-up and follow the decision. */
export function ResearcherDisclosurePanel({ reportId, reportTitle, initialDisclosure }: { reportId: string; reportTitle: string; initialDisclosure: ReportDisclosure | null }) {
  const [disclosure, setDisclosure] = useState(initialDisclosure);
  const { error, pending, run } = useRun(setDisclosure);
  const canRequest = !disclosure || disclosure.status === "declined" || disclosure.status === "unpublished";

  return (
    <div>
      <SectionLabel>Public disclosure</SectionLabel>
      {disclosure && <StatusLine disclosure={disclosure} />}
      {canRequest && (
        <>
          <p className="mt-2 text-sm text-ink-muted">
            Propose what should be published. The organization may redact it, and nothing is public until they approve -- timing follows the program&apos;s disclosure policy.
          </p>
          <DraftEditor
            initialTitle={disclosure?.draftTitle ?? reportTitle}
            initialSummary={disclosure?.draftSummary ?? ""}
            submitLabel={disclosure ? "Request again" : "Request disclosure"}
            pending={pending}
            onSubmit={(title, summary) => run(() => requestReportDisclosureAction({ reportId, title, summary }))}
          />
        </>
      )}
      {disclosure?.status === "requested" && (
        <DraftEditor
          initialTitle={disclosure.draftTitle ?? reportTitle}
          initialSummary={disclosure.draftSummary ?? ""}
          submitLabel="Save write-up"
          pending={pending}
          onSubmit={(title, summary) => run(() => updateReportDisclosureDraftAction({ reportId, title, summary }))}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Organization-facing: the triage team redacts the write-up; owners, security admins and the
 * program manager approve, decline or unpublish (the RPCs enforce the same split). */
export function OrganizationDisclosureDecisionPanel({ reportId, disclosure, canDecide }: { reportId: string; disclosure: ReportDisclosure; canDecide: boolean }) {
  const [current, setCurrent] = useState(disclosure);
  const [mode, setMode] = useState<"idle" | "declining" | "unpublishing">("idle");
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun((d) => {
    setCurrent(d);
    setMode("idle");
    setReason("");
  });

  return (
    <div>
      <SectionLabel>{current.status === "requested" ? "Public disclosure requested" : "Public disclosure"}</SectionLabel>
      <StatusLine disclosure={current} />

      {current.status === "requested" && (
        <>
          <p className="mt-2 text-sm text-ink-muted">Review and redact the write-up below. Approving publishes exactly this text and the confirmed severity -- nothing else from the report.</p>
          <DraftEditor
            initialTitle={current.draftTitle ?? ""}
            initialSummary={current.draftSummary ?? ""}
            submitLabel="Save redactions"
            pending={pending}
            onSubmit={(title, summary) => run(() => updateReportDisclosureDraftAction({ reportId, title, summary }))}
          />
          {canDecide && mode === "idle" && (
            <div className="mt-3 flex gap-2">
              <Button pending={pending} onClick={() => run(() => approveReportDisclosureAction({ reportId }))}>
                Approve
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setMode("declining")}>
                Decline
              </Button>
            </div>
          )}
        </>
      )}

      {canDecide && current.status === "approved" && mode === "idle" && (
        <Button variant="destructive" className="mt-3" onClick={() => setMode("unpublishing")}>
          Unpublish
        </Button>
      )}

      {mode !== "idle" && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => (mode === "declining" ? declineReportDisclosureAction({ reportId, reason: reason || undefined }) : unpublishReportDisclosureAction({ reportId, reason })));
          }}
        >
          <Textarea
            label={mode === "declining" ? "Reason (shown to the researcher, optional)" : "Why is this being taken down? (shown to the researcher)"}
            required={mode === "unpublishing"}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" pending={pending}>
              {mode === "declining" ? "Confirm decline" : "Confirm unpublish"}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

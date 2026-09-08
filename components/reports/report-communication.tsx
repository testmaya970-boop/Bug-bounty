"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Select, Textarea } from "../ui/form";
import { SectionLabel } from "../ui/security-primitives";
import { postOrganizationMessageAction, postResearcherMessageAction } from "../../actions/reports";
import { formatDateTime } from "../../lib/format-date";
import type { ReportMessage, ReportVisibility } from "../../types/report";

type ReportRef = { organizationId: string; programId: string; reportId: string };

/** Professional security correspondence -- author, context, and timestamp on one line,
 * body below. No avatar, no chat bubble, no rounded-card-per-message: each entry is a
 * divided row in one record, not N distinct boxes. */
function MessageItem({ message }: { message: ReportMessage }) {
  return (
    <li className="py-3 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {message.authorName} · {message.authorContext === "researcher" ? "Researcher" : "Organization"} · <time>{formatDateTime(message.createdAt)}</time>
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink">{message.body}</p>
    </li>
  );
}

function MessageList({ messages, emptyText }: { messages: ReportMessage[]; emptyText: string }) {
  if (messages.length === 0) return <p className="text-sm text-ink-muted">{emptyText}</p>;
  return <ul className="divide-y divide-border">{messages.map((message) => <MessageItem key={message.id} message={message} />)}</ul>;
}

/** Researcher-visible communication, always shown. Internal notes render in their own,
 * structurally separated group -- never intermixed with what the researcher can see, and
 * researchers never receive this component's internal group at all (the server never
 * sends them internal rows in the first place). See
 * docs/decisions/0010-report-evidence-and-communication.md. */
export function ReportCommunication({ messages, showInternal }: { messages: ReportMessage[]; showInternal: boolean }) {
  const visible = messages.filter((message) => message.visibility === "researcher_visible");
  const internal = messages.filter((message) => message.visibility === "internal");

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Visible to researcher</SectionLabel>
        <div className="mt-2">
          <MessageList messages={visible} emptyText="No communication yet." />
        </div>
      </div>
      {showInternal && (
        <div className="border-l-2 border-warning bg-surface-muted p-3">
          <SectionLabel>Internal only: not visible to the researcher</SectionLabel>
          <div className="mt-2">
            <MessageList messages={internal} emptyText="No internal notes yet." />
          </div>
        </div>
      )}
    </div>
  );
}

export function ResearcherMessageComposer({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await postResearcherMessageAction({ organizationId, programId, reportId, body });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <Textarea label="Message to the organization" required value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} error={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Send message
        </Button>
      </div>
    </form>
  );
}

export function OrganizationMessageComposer({ organizationId, programId, reportId }: ReportRef) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ReportVisibility>("researcher_visible");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await postOrganizationMessageAction({ organizationId, programId, reportId, body, visibility });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <Textarea label="Message" required value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} error={error ?? undefined} />
      <Select label="Visible to" value={visibility} onChange={(event) => setVisibility(event.target.value as ReportVisibility)} className="max-w-xs">
        <option value="researcher_visible">Researcher and organization</option>
        <option value="internal">Internal only</option>
      </Select>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          Send message
        </Button>
      </div>
    </form>
  );
}


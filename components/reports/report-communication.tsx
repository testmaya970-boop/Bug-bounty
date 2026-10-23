"use client";

import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import { Markdown } from "../ui/markdown";
import type { ReportMessage } from "../../types/report";
import { LocalTime } from "../ui/local-time";

/** One message as a conversation comment (GitHub-style, Oct 22): a header bar with the
 * author, their side and when, the body below. Internal notes get a warning-tinted bar so
 * they can never be mistaken for something the researcher sees. */
function MessageItem({ message, internal }: { message: ReportMessage; internal?: boolean }) {
  const researcher = message.authorContext === "researcher";
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2 text-[13px] ${internal ? "border-warning/30 bg-warning/10" : "border-border bg-surface-hover"}`}>
        <span aria-hidden="true" className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${researcher ? "bg-ink text-canvas" : "bg-action text-on-action"}`}>
          {message.authorName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="font-semibold text-ink">{message.authorName}</span>
        <span className="text-ink-muted">
          commented <time><LocalTime value={message.createdAt} /></time>
        </span>
        <span className="ml-auto rounded-full border border-border px-2 py-px text-[11px] font-medium text-ink-muted">{internal ? "Internal note" : researcher ? "Researcher" : "Organization"}</span>
      </div>
      <Markdown content={message.body} className="px-4 py-3" />
    </li>
  );
}

function MessageList({ messages, emptyText, internal }: { messages: ReportMessage[]; emptyText: string; internal?: boolean }) {
  if (messages.length === 0) return <p className="text-sm text-ink-muted">{emptyText}</p>;
  return <ul className="space-y-3">{messages.map((message) => <MessageItem key={message.id} message={message} internal={internal} />)}</ul>;
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
        <div>
          <SectionLabel>Internal only: not visible to the researcher</SectionLabel>
          <div className="mt-2">
            <MessageList messages={internal} emptyText="No internal notes yet." internal />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useTransition } from "react";
import { describeOrganizationActivity } from "../../lib/organization-activity-labels";
import { formatDateTime } from "../../lib/format-date";
import { EmptyState, ErrorState } from "../ui/feedback";
import { Markdown } from "../ui/markdown";
import { Button } from "../ui/button";
import { loadEarlierReportTimelineAction } from "../../actions/reports";
import type { TimelineEntry } from "../../services/timeline";

/**
 * The inbox's merged chronological timeline: a report's original submission is rendered
 * separately, above this (see InboxMiddlePane) -- this component renders everything that
 * happened AFTER submission, one continuous ordered list of TimelineEntry (see
 * services/timeline.ts), with three visually distinct kinds so a triager can tell at a
 * glance who said what:
 *   - Hacker comment: researcher-authored, researcher_visible message.
 *   - Internal team comment: organization-authored, internal-only message -- never shown
 *     to a researcher viewer at all (this component is only ever rendered for a manager;
 *     see the page's own canTriage gate), so the internal styling is a triager-only cue,
 *     not a leak risk.
 *   - System state change: an audit_logs row (report.accepted, report.resolved, ...),
 *     reusing describeOrganizationActivity verbatim -- the exact same label the org
 *     Home/Analytics activity feeds already use for the identical action strings, so a
 *     state change reads identically everywhere in this app.
 * An organization-authored, researcher-visible message (the common "reply to the hacker"
 * case) gets its own fourth, distinct treatment -- visually closer to the internal note
 * (same author context) but explicitly labeled "Visible to researcher" so a triager is
 * never unsure whether their own past reply was actually seen by the hacker.
 */
function timelineEntryActorName(entry: TimelineEntry, actorNames: Record<string, string>): string {
  if (entry.kind === "message") return entry.message.authorName;
  return (entry.event.actorId && actorNames[entry.event.actorId]) || "A team member";
}

function StateChangeRow({ entry, actorNames }: { entry: Extract<TimelineEntry, { kind: "state_change" }>; actorNames: Record<string, string> }) {
  const actorName = timelineEntryActorName(entry, actorNames);
  const { title, detail } = describeOrganizationActivity(entry.event, actorName);
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-surface bg-ink-muted/20 text-ink-muted">
        <span className="size-1.5 rounded-full bg-ink-muted" />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-sm font-medium text-ink-muted">
          {title}
          {detail && <span className="text-ink-muted/70"> · {detail}</span>}
        </p>
        <time className="text-xs text-ink-muted/70">{formatDateTime(entry.createdAt)}</time>
      </div>
    </li>
  );
}

function CommentRow({ entry }: { entry: Extract<TimelineEntry, { kind: "message" }> }) {
  const message = entry.message;
  const isHacker = message.authorContext === "researcher";
  const isInternal = message.visibility === "internal";

  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={
          isHacker
            ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-action/15 text-xs font-semibold text-action"
            : isInternal
              ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-warning bg-warning/10 text-xs font-semibold text-warning"
              : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-ink"
        }
      >
        {message.authorName.slice(0, 1).toUpperCase()}
      </span>
      <div className={isInternal ? "min-w-0 flex-1 rounded-md border-l-2 border-warning bg-surface-muted p-3" : "min-w-0 flex-1"}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {message.authorName} · {isHacker ? "Hacker" : isInternal ? "Internal note" : "Reply to hacker"} · <time>{formatDateTime(entry.createdAt)}</time>
        </p>
        <Markdown content={message.body} className="mt-1" />
      </div>
    </li>
  );
}

/**
 * A "load earlier" client component -- the merged timeline is capped server-side (see
 * services/timeline.ts's own TIMELINE_ENTRY_CAP comment: a real cap on what actually
 * renders, not a cosmetic one), so a report with genuinely deep history needs a real way
 * to reach it. Accumulates fetched pages in local state (older entries are PREPENDED, the
 * timeline stays chronological); each "Load earlier" click calls
 * loadEarlierReportTimelineAction with the CURRENT oldest entry's createdAt as the
 * cursor -- a real cursor over the same already-merged set, not a fabricated one. When
 * the initial page is already fully capped, the "Showing the most recent N of TOTAL"
 * disclosure renders immediately (never hidden until the button is clicked), so a triager
 * always knows history was cut before they go looking for it.
 */
export function InboxTimeline({
  organizationId,
  programId,
  reportId,
  initialEntries,
  initialHasEarlier,
  totalCount,
  actorNames,
}: {
  organizationId: string;
  programId: string;
  reportId: string;
  initialEntries: TimelineEntry[];
  initialHasEarlier: boolean;
  totalCount: number;
  actorNames: Record<string, string>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [hasEarlier, setHasEarlier] = useState(initialHasEarlier);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLoadEarlier() {
    if (entries.length === 0) return;
    setError(null);
    const oldestCreatedAt = entries[0].createdAt;
    startTransition(async () => {
      const result = await loadEarlierReportTimelineAction({ organizationId, programId, reportId, beforeCreatedAt: oldestCreatedAt });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEntries((current) => [...result.data.entries, ...current]);
      setHasEarlier(result.data.hasEarlier);
    });
  }

  if (entries.length === 0 && !hasEarlier) {
    return <EmptyState title="No activity yet">State changes and comments will appear here as this report moves through triage.</EmptyState>;
  }

  return (
    <div>
      {(hasEarlier || entries.length < totalCount) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Showing the most recent {entries.length} of {totalCount} events.
          </p>
          {hasEarlier && (
            <Button variant="quiet" pending={pending} onClick={handleLoadEarlier}>
              Load earlier
            </Button>
          )}
        </div>
      )}
      {error && (
        <div className="mb-3">
          <ErrorState>{error}</ErrorState>
        </div>
      )}
      <ol className="space-y-4">
        {entries.map((entry) =>
          entry.kind === "state_change" ? <StateChangeRow key={entry.id} entry={entry} actorNames={actorNames} /> : <CommentRow key={entry.id} entry={entry} />,
        )}
      </ol>
    </div>
  );
}

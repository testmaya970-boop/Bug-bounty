"use client";

import React, { useMemo, useState, useTransition } from "react";
import { EmptyState, ErrorState } from "../ui/feedback";
import { Button } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";
import { listOrganizationActivityPageAction } from "../../actions/organization-activity";
import { describeOrganizationActivity } from "../../lib/organization-activity-labels";
import { formatDateTime } from "../../lib/format-date";
import type { OrganizationAuditEventRecord } from "../../types/organization";

type ActivityEvent = OrganizationAuditEventRecord & { actorName: string };

function EventRow({ event }: { event: ActivityEvent }) {
  const { title, detail } = describeOrganizationActivity(event, event.actorName);
  return (
    <li className="flex gap-3 py-3">
      <div className="flex w-3 shrink-0 flex-col items-center pt-1.5">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border border-border-strong bg-transparent" />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">
          {event.entityType.replaceAll("_", " ")} · {formatDateTime(event.createdAt)}
        </p>
        {detail && <p className="mt-0.5 text-sm text-ink-muted">{detail}</p>}
      </div>
    </li>
  );
}

/**
 * The org's full audit event feed, chronological with a type filter -- Home's "Recent
 * activity" links here for anything beyond its own last-5 preview, rather than growing
 * Home into a second copy of this list (see CLAUDE.md's IA rule). Reads the identical
 * getOrganizationAuditActivity RLS-scoped query Home already used, just paginated to the
 * end instead of capped at 5. `entityType` (already on every real audit_logs row) is the
 * filter's real vocabulary -- never an invented category.
 */
export function OrganizationActivityFeed({
  organizationId,
  initialEvents,
  initialNextCursor,
  actorNames,
}: {
  organizationId: string;
  initialEvents: OrganizationAuditEventRecord[];
  initialNextCursor: string | null;
  actorNames: Record<string, string>;
}) {
  const [events, setEvents] = useState<OrganizationAuditEventRecord[]>(initialEvents);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const entityTypes = useMemo(() => Array.from(new Set(events.map((event) => event.entityType))).sort(), [events]);
  const filteredEvents = typeFilter === "all" ? events : events.filter((event) => event.entityType === typeFilter);

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listOrganizationActivityPageAction({ organizationId, cursor: nextCursor });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setEvents((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  if (events.length === 0 && !nextCursor) {
    return <EmptyState title="No activity yet">Actions taken in this organization will appear here.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      {entityTypes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="shrink-0">Filter</SectionLabel>
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${typeFilter === "all" ? "border-ink bg-surface-muted text-ink" : "border-border text-ink-muted hover:text-ink"}`}
          >
            All
          </button>
          {entityTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors duration-150 ${typeFilter === type ? "border-ink bg-surface-muted text-ink" : "border-border text-ink-muted hover:text-ink"}`}
            >
              {type.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      )}

      {filteredEvents.length === 0 ? (
        <p className="text-sm text-ink-muted">No activity matches this filter.</p>
      ) : (
        <ul className="ml-1.5 divide-y divide-border border-l border-border pl-2">
          {filteredEvents.map((event) => (
            <EventRow key={event.id} event={{ ...event, actorName: (event.actorId && actorNames[event.actorId]) || "A member" }} />
          ))}
        </ul>
      )}

      {loadError && <ErrorState>{loadError}</ErrorState>}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" pending={pending} onClick={handleLoadMore}>
            Load more
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-ink-muted">End of results.</p>
      )}
    </div>
  );
}

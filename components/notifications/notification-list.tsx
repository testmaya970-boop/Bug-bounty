"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { EmptyState, ErrorState } from "../ui/feedback";
import { Button } from "../ui/button";
import { SectionLabel } from "../ui/security-primitives";
import { cn } from "../../lib/cn";
import { markNotificationReadAction, markNotificationsReadAction, listNotificationsPageAction } from "../../actions/notifications";
import { notificationLink } from "../../lib/notification-links";
import { emitNotificationRead } from "../../lib/notification-events";
import type { Notification } from "../../types/notifications";
import { LocalTime } from "../ui/local-time";
import { NOTIFICATION_LABELS } from "../../lib/notification-labels";


function NotificationRow({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  const isRead = notification.readAt !== null;
  const link = notificationLink(notification);

  function handleMarkRead() {
    startTransition(async () => {
      const result = await markNotificationReadAction(notification.id);
      if (result.ok) onRead(notification.id);
    });
  }

  return (
    <li className="flex gap-3 py-3 motion-safe:animate-enter-fade">
      {/* An event-stream marker, not a card — a filled dot for an unread event, a
          hollow one once read, on a continuous vertical rule shared by every row in
          the list (see docs/decisions/0043). */}
      <div className="flex w-3 shrink-0 flex-col items-center pt-1.5">
        <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", isRead ? "border border-border-strong bg-transparent" : "bg-action")} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <span className="sr-only">{isRead ? "Read: " : "Unread: "}</span>
        <p className={cn("break-words text-sm", isRead ? "font-normal text-ink-muted" : "font-semibold text-ink")}>{NOTIFICATION_LABELS[notification.notificationType]}</p>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">
          {notification.programName && <>{notification.programName} · </>}
          <LocalTime value={notification.createdAt} />
        </p>
        <div className="mt-1.5 flex items-center gap-3">
          <Link prefetch={false} href={link.href} onClick={() => { if (!isRead) handleMarkRead(); }} className="text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {link.label} →
          </Link>
          {!isRead && (
            <Button variant="quiet" pending={pending} onClick={handleMarkRead} className="px-2 text-xs">
              Mark read
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Notifications, freshly bucketed into Unread / Read on every render -- a pure re-split
 * of whatever is currently loaded (never a second query), the same "one fetch, present it
 * in the shape that answers the user's actual question" pattern the organization
 * operations overview already established for its own Needs attention / Waiting on
 * researchers split. */
export function NotificationListSection({ initialNotifications, initialNextCursor }: { initialNotifications: Notification[]; initialNextCursor: string | null }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [markingAll, startMarkAll] = useTransition();

  // Every unread notification loaded on this page, at most a few pages of ids.
  function handleMarkAllRead() {
    const ids = notifications.filter((n) => n.readAt === null).map((n) => n.id).slice(0, 200);
    if (ids.length === 0) return;
    startMarkAll(async () => {
      const result = await markNotificationsReadAction(ids);
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      for (const id of ids) handleRead(id);
    });
  }

  function handleRead(id: string) {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    // Tell the header bell's own independent unread count about this mutation -- it has
    // no other way to learn about a mark-read that happened on this page rather than in
    // the dropdown itself. See lib/notification-events.ts.
    emitNotificationRead(id);
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadError(null);
    startTransition(async () => {
      const result = await listNotificationsPageAction({ cursor: nextCursor });
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setNotifications((current) => [...current, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
    });
  }

  if (notifications.length === 0 && !nextCursor) {
    return <EmptyState title="No notifications">Notifications about report and bounty activity will appear here.</EmptyState>;
  }

  const unread = notifications.filter((n) => n.readAt === null);
  const read = notifications.filter((n) => n.readAt !== null);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Unread</SectionLabel>
          {unread.length > 0 && (
            <Button type="button" variant="secondary" pending={markingAll} onClick={handleMarkAllRead} className="min-h-9 px-3 text-xs">
              Mark all read
            </Button>
          )}
        </div>
        {unread.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">All caught up. There are no unread notifications.</p>
        ) : (
          <ul className="mt-2 ml-1.5 divide-y divide-border border-l border-border pl-2">
            {unread.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onRead={handleRead} />
            ))}
          </ul>
        )}
      </div>

      {read.length > 0 && (
        <div>
          <SectionLabel>Read</SectionLabel>
          <ul className="mt-2 ml-1.5 divide-y divide-border border-l border-border pl-2">
            {read.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onRead={handleRead} />
            ))}
          </ul>
        </div>
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

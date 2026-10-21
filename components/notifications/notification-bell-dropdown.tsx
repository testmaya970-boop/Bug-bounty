"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bell } from "@phosphor-icons/react";
import { cn } from "../../lib/cn";
import { listNotificationPreviewAction, markNotificationReadAction, markNotificationsReadAction } from "../../actions/notifications";
import { notificationLink } from "../../lib/notification-links";
import { emitNotificationRead, onNotificationRead } from "../../lib/notification-events";
import type { Notification } from "../../types/notifications";
import { LocalTime } from "../ui/local-time";
import { NOTIFICATION_LABELS } from "../../lib/notification-labels";
import { popoverMotion } from "../ui/popover-motion";

// The shell remounts on every page, so a pulse-on-mount fired on every navigation. Pulse only
// when the count has gone up since this tab last showed it.
const SEEN_KEY = "unpatched_unread_seen";


// The 10 most recent only; the full history is in /notifications ("View all").
const PREVIEW_COUNT = 10;

/**
 * A real dropdown over the header bell -- opens the signed-in user's own most recent
 * notifications (getMyNotifications, RLS-scoped, same data the /notifications page
 * shows), not a decorative icon. Fetches on first open (not on every render/mount) so a
 * visitor who never opens it never pays for the query. Marking one read updates local
 * state immediately, the same optimistic pattern used throughout this settings/dashboard
 * work this session (docs/decisions/0055.1) -- never a full page reload to reflect the
 * user's own click.
 */
export function NotificationBellDropdown({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const [markingAll, startMarkAll] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Notification ids this bell itself just marked read and already applied to its own
  // state -- checked (and cleared) by the listener below so its own emitted event never
  // double-decrements unreadCount. A plain ref, not state: purely a same-tick echo guard,
  // never rendered.
  const selfMarkedIds = useRef<Set<string>>(new Set());
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    try {
      const seen = Number(sessionStorage.getItem(SEEN_KEY) ?? "0");
      if (unreadCount > seen) setPulse(true);
      sessionStorage.setItem(SEEN_KEY, String(unreadCount));
    } catch {
      // Storage blocked: no pulse, the count itself is still shown.
    }
  }, [unreadCount]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Same Escape-to-close + return-focus contract as Dialog/DropdownMenu in
  // components/ui/navigation.tsx -- this dropdown previously only closed on outside click.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // The /notifications page (a separate, independently-mounted component tree) maintains
  // its own local read state -- marking a notification read there previously had no way
  // to tell this bell's own unreadCount about it, so the badge only corrected itself on
  // the next full page navigation. This listens for that mutation wherever it happens.
  useEffect(() => {
    return onNotificationRead((notificationId) => {
      if (selfMarkedIds.current.delete(notificationId)) return; // this bell already applied it locally in handleMarkRead
      setNotifications((current) => current.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnreadCount((current) => Math.max(0, current - 1));
    });
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      try {
        const result = await listNotificationPreviewAction();
        if (result.ok) setNotifications(result.data.items);
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    }
  }

  function handleMarkRead(id: string) {
    startTransition(async () => {
      const result = await markNotificationReadAction(id);
      if (!result.ok) return;
      setNotifications((current) => current.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnreadCount((current) => Math.max(0, current - 1));
      selfMarkedIds.current.add(id);
      emitNotificationRead(id);
    });
  }

  const unreadIds = notifications.slice(0, PREVIEW_COUNT).filter((n) => n.readAt === null).map((n) => n.id);

  function handleMarkAllRead() {
    const ids = unreadIds;
    if (ids.length === 0) return;
    startMarkAll(async () => {
      const result = await markNotificationsReadAction(ids);
      if (!result.ok) return;
      const now = new Date().toISOString();
      setNotifications((current) => current.map((n) => (ids.includes(n.id) ? { ...n, readAt: now } : n)));
      setUnreadCount((current) => Math.max(0, current - ids.length));
      for (const id of ids) {
        selfMarkedIds.current.add(id);
        emitNotificationRead(id);
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls="recent-notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        title="Notifications"
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-hover [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Bell aria-hidden="true" className="size-5" />
        {unreadCount > 0 && (
          // docs/decisions/0057: a bounded, 2-iteration glow-pulse on the unread count
          // itself -- the badge's real number is the signal; the pulse only draws a first
          // glance to it, it never substitutes for the count text.
          <span aria-hidden="true" className={cn("absolute right-1.5 top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-action font-mono text-[9px] font-bold text-canvas", pulse && "motion-safe:animate-glow-pulse")}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Always mounted so it can animate out; closed it is invisible and out of the tab order. */}
      {(
        // A named group, not role="menu": it holds links and a button, not menuitems.
        // Phones: a fixed sheet pinned under the 4rem top bar, inset from both edges, so it
        // can never hang off the left edge the way a right-anchored w-80 did at 320/375px.
        <div id="recent-notifications" role="group" aria-label="Recent notifications" aria-hidden={!open} className={cn("fixed inset-x-2 top-16 z-30 rounded-md border border-border bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-80", popoverMotion(open, "top-right"))}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadIds.length > 0 && (
              <button type="button" onClick={handleMarkAllRead} disabled={markingAll} className="ml-auto text-xs font-medium text-action hover:text-action-hover disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {markingAll ? "Marking…" : "Mark all read"}
              </button>
            )}
            <Link prefetch={false} href={"/notifications" as Route} onClick={() => setOpen(false)} className="text-xs font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              View all
            </Link>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-center text-sm text-ink-muted">Loading…</p>
            ) : notifications.length === 0 ? (
              // Only once opened: the panel stays mounted (to animate out), and an empty-state line in
              // the closed panel would duplicate the notification center's own text.
              loaded ? <p className="p-4 text-center text-sm text-ink-muted">No notifications yet.</p> : null
            ) : (
              <ul className="divide-y divide-border">
                {notifications.slice(0, PREVIEW_COUNT).map((notification) => {
                  const isRead = notification.readAt !== null;
                  const link = notificationLink(notification);
                  return (
                    <li key={notification.id} className={cn("px-3 py-2.5", !isRead && "bg-action/5")}>
                      <Link prefetch={false}
                        href={link.href}
                        onClick={() => {
                          setOpen(false);
                          if (!isRead) handleMarkRead(notification.id);
                        }}
                        className="block rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <div className="flex items-start gap-2">
                          <span aria-hidden="true" className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", isRead ? "bg-transparent" : "bg-action")} />
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-sm leading-snug", isRead ? "text-ink-muted" : "font-medium text-ink")}>{NOTIFICATION_LABELS[notification.notificationType]}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                              {notification.programName && <>{notification.programName} · </>}
                              <LocalTime value={notification.createdAt} />
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

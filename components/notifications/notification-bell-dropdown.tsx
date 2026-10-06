"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bell } from "lucide-react";
import { cn } from "../../lib/cn";
import { listNotificationPreviewAction, markNotificationReadAction } from "../../actions/notifications";
import { notificationLink } from "../../lib/notification-links";
import { emitNotificationRead, onNotificationRead } from "../../lib/notification-events";
import type { Notification, NotificationType } from "../../types/notifications";
import { LocalTime } from "../ui/local-time";

/** Same honest, content-free labels as components/notifications/notification-list.tsx's
 * own NOTIFICATION_TYPE_LABELS -- duplicated rather than imported since that file is a
 * page-level list (Unread/Read sections, load-more), and this is a lightweight header
 * preview of the same real data; both must show identical wording for the same
 * notification, so this is kept as a literal copy of that map, not a divergent one. */
const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  report_created: "A new report was submitted",
  report_needs_information: "The organization requested more information",
  report_resolved: "A report was resolved",
  report_duplicate: "A report was marked as a duplicate",
  report_informative: "A report was marked informative",
  report_not_applicable: "A report was marked not applicable",
  report_rejected: "A report was rejected",
  bounty_finalized: "A bounty was finalized",
  report_triage_started: "A report entered triage",
  report_accepted: "A report was accepted",
  report_message_posted: "A new message was posted on a report",
  program_suspended: "A program was suspended by the platform",
  program_reinstated: "A program was reinstated by the platform",
  organization_suspended: "Your organization was suspended by the platform",
  organization_reinstated: "Your organization was reinstated by the platform",
  bounty_adjusted: "The bounty for your report was adjusted",
  payment_scheduled: "A bounty payment to you was scheduled",
  payment_succeeded: "A bounty payment to you was sent",
  payment_failed: "A bounty payment to you could not be completed",
  payment_cancelled: "A bounty payment to you was cancelled",
  report_mediation_opened: "A researcher requested mediation on a report",
  report_assigned: "A report was assigned to you",
  report_retest_requested: "A researcher asked for a retest",
  report_retest_decided: "Your retest request was decided",
  report_mediation_resolved: "Your mediation request was answered",
  report_reopened: "Your resolved report was reopened",
  report_disclosure_requested: "A researcher asked to publish a report",
  report_disclosure_approved: "Your report was approved for public disclosure",
  report_disclosure_declined: "Your disclosure request was declined",
  report_disclosure_unpublished: "Your disclosed report was unpublished",
};

const PREVIEW_COUNT = 6;

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
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Notification ids this bell itself just marked read and already applied to its own
  // state -- checked (and cleared) by the listener below so its own emitted event never
  // double-decrements unreadCount. A plain ref, not state: purely a same-tick echo guard,
  // never rendered.
  const selfMarkedIds = useRef<Set<string>>(new Set());

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
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Bell aria-hidden="true" className="size-5" />
        {unreadCount > 0 && (
          // docs/decisions/0057: a bounded, 2-iteration glow-pulse on the unread count
          // itself -- the badge's real number is the signal; the pulse only draws a first
          // glance to it, it never substitutes for the count text.
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-action font-mono text-[9px] font-bold text-canvas motion-safe:animate-glow-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // A named group, not role="menu": it holds links and a button, not menuitems.
        <div id="recent-notifications" role="group" aria-label="Recent notifications" className="motion-safe:animate-enter-rise absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <Link prefetch={false} href={"/notifications" as Route} onClick={() => setOpen(false)} className="text-xs font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              View all
            </Link>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-center text-sm text-ink-muted">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-muted">No notifications yet.</p>
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
                            <p className={cn("text-sm leading-snug", isRead ? "text-ink-muted" : "font-medium text-ink")}>{NOTIFICATION_TYPE_LABELS[notification.notificationType]}</p>
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

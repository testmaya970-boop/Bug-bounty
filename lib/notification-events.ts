"use client";

/**
 * A minimal, dependency-free way for two independent client component trees --
 * NotificationBellDropdown (the header) and NotificationListSection (/notifications) --
 * to agree on "a notification was just marked read," without a shared state/Context
 * provider restructuring. Both already call the identical markNotificationReadAction
 * server action and already maintain their own local optimistic state (real, working,
 * per docs/decisions/0055.1) -- they were just never told about each other's mutation.
 * `window` is the smallest real shared channel that already exists between two sibling
 * client components rendered under the same AppShell, with zero new global state.
 */
const NOTIFICATION_READ_EVENT = "unpatched:notification-read";

export function emitNotificationRead(notificationId: string): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail: { notificationId } }));
}

export function onNotificationRead(handler: (notificationId: string) => void): () => void {
  function listener(event: Event) {
    const detail = (event as CustomEvent<{ notificationId: string }>).detail;
    if (detail?.notificationId) handler(detail.notificationId);
  }
  window.addEventListener(NOTIFICATION_READ_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATION_READ_EVENT, listener);
}

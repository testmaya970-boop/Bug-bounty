// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emitNotificationRead, onNotificationRead } from "../../lib/notification-events";

describe("notification-events: the shared channel that keeps the header bell's unread count and /notifications page's own read state in sync", () => {
  it("a listener receives the exact notification id that was emitted", () => {
    const handler = vi.fn();
    const unsubscribe = onNotificationRead(handler);

    emitNotificationRead("notif-1");

    expect(handler).toHaveBeenCalledWith("notif-1");
    unsubscribe();
  });

  it("multiple independent listeners (the bell AND the /notifications page, if both mounted) all receive the same event", () => {
    const bellHandler = vi.fn();
    const pageHandler = vi.fn();
    const unsubscribeBell = onNotificationRead(bellHandler);
    const unsubscribePage = onNotificationRead(pageHandler);

    emitNotificationRead("notif-2");

    expect(bellHandler).toHaveBeenCalledWith("notif-2");
    expect(pageHandler).toHaveBeenCalledWith("notif-2");
    unsubscribeBell();
    unsubscribePage();
  });

  it("unsubscribing actually stops future events from reaching that listener", () => {
    const handler = vi.fn();
    const unsubscribe = onNotificationRead(handler);
    unsubscribe();

    emitNotificationRead("notif-3");

    expect(handler).not.toHaveBeenCalled();
  });

  it("a listener registered after an emission never sees the earlier event (no replay/queueing)", () => {
    emitNotificationRead("notif-4");
    const handler = vi.fn();
    const unsubscribe = onNotificationRead(handler);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});

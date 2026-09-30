import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotificationListSection } from "../../components/notifications/notification-list";
import { NotificationPreferencesSection } from "../../components/notifications/notification-preferences";
import type { Notification, NotificationPreference } from "../../types/notifications";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const BASE_NOTIFICATION: Notification = {
  id: "n1",
  category: "report_activity",
  notificationType: "report_resolved",
  reportId: "report-1",
  programId: "program-1",
  organizationId: "org-1",
  occurredAt: "2026-08-29T00:00:00Z",
  createdAt: "2026-08-29T00:00:00Z",
  readAt: null,
  programName: "CloudVault",
};

function render(notifications: Notification[], nextCursor: string | null = null) {
  return renderToStaticMarkup(<NotificationListSection initialNotifications={notifications} initialNextCursor={nextCursor} />);
}

describe("NotificationListSection: honest empty state, content-free rows", () => {
  it("shows an honest empty state when there are no notifications at all", () => {
    const html = render([]);
    expect(html).toContain("No notifications");
    expect(html).not.toContain("Nothing here yet");
  });

  it("renders an unread notification with an unread indicator, program name, and a Mark read control", () => {
    const html = render([BASE_NOTIFICATION]);
    expect(html).toContain("A report was resolved");
    expect(html).toContain("CloudVault");
    expect(html).toContain("Mark read");
  });

  it("a read notification has no Mark read control and recedes from an unread one -- never color alone", () => {
    const readHtml = render([{ ...BASE_NOTIFICATION, readAt: "2026-08-29T01:00:00Z" }]);
    expect(readHtml).not.toContain("Mark read");
    expect(readHtml).toContain("sr-only");
    expect(readHtml).toContain("font-normal");
  });

  it("shows 'All caught up' when every loaded notification is already read", () => {
    const html = render([{ ...BASE_NOTIFICATION, readAt: "2026-08-29T01:00:00Z" }]);
    expect(html).toContain("All caught up");
  });

  it("separates Unread and Read into their own sections, not one mixed list", () => {
    const html = render([BASE_NOTIFICATION, { ...BASE_NOTIFICATION, id: "n2", readAt: "2026-08-29T01:00:00Z" }]);
    expect(html).toContain("Unread");
    expect(html).toContain("Read");
  });

  it("degrades gracefully when the program name is unavailable (e.g. a since-revoked researcher's older notification)", () => {
    const html = render([{ ...BASE_NOTIFICATION, programName: null }]);
    expect(html).toContain("A report was resolved");
    expect(html).not.toContain("null");
  });

  it("links to the underlying report using all three ids, never a bare report id alone", () => {
    const html = render([BASE_NOTIFICATION]);
    expect(html).toContain("/organizations/org-1/programs/program-1/reports/report-1");
  });

  it("never renders a report title, description, or bounty amount -- the row is content-free by design", () => {
    const html = render([BASE_NOTIFICATION]);
    expect(html).not.toMatch(/\$|minor_units|description/i);
  });

  it("distinguishes notification types with distinct, honest labels drawn only from real backend types", () => {
    const html = render([
      { ...BASE_NOTIFICATION, id: "n2", notificationType: "report_created" },
      { ...BASE_NOTIFICATION, id: "n3", notificationType: "bounty_finalized", category: "bounty_activity" },
    ]);
    expect(html).toContain("A new report was submitted");
    expect(html).toContain("A bounty was finalized");
  });

  it("shows 'Load more' when a next cursor is present, 'End of results.' otherwise", () => {
    const withCursor = render([BASE_NOTIFICATION], "cursor-1");
    expect(withCursor).toContain("Load more");
    expect(withCursor).not.toContain("End of results.");

    const withoutCursor = render([BASE_NOTIFICATION], null);
    expect(withoutCursor).not.toContain("Load more");
    expect(withoutCursor).toContain("End of results.");
  });
});

describe("NotificationPreferencesSection: mandatory categories cannot be toggled", () => {
  const PREFERENCES: NotificationPreference[] = [
    { category: "report_activity", emailEnabled: true, isMandatory: false },
    { category: "bounty_activity", emailEnabled: true, isMandatory: true },
  ];

  it("renders a toggle switch for the optional category", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesSection preferences={PREFERENCES} accountType="researcher" />);
    expect(html).toContain("Report activity");
    expect(html).toContain('role="switch"');
  });

  it("renders 'Always on' with no switch for the mandatory category", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesSection preferences={PREFERENCES} accountType="researcher" />);
    expect(html).toContain("Bounty finalized");
    expect(html).toContain("Always on");
  });

  it("exactly one switch exists -- only the optional category is interactive", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesSection preferences={PREFERENCES} accountType="researcher" />);
    expect(html.match(/role="switch"/g)).toHaveLength(1);
  });
});

describe("NotificationPreferencesSection: each account type sees only what reaches it", () => {
  const ALL: NotificationPreference[] = [
    { category: "report_activity", emailEnabled: true, isMandatory: false },
    { category: "bounty_activity", emailEnabled: true, isMandatory: true },
    { category: "platform_activity", emailEnabled: true, isMandatory: true },
  ];

  it("an organization account gets report activity for its programs and platform decisions, never bounty receipts", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesSection preferences={ALL} accountType="organization" />);
    expect(html).toContain("New reports and researcher messages on the programs you work on.");
    expect(html).toContain("Platform decisions");
    expect(html).not.toContain("Bounty finalized");
  });

  it("a researcher gets report activity for their own reports and bounty receipts, never platform decisions", () => {
    const html = renderToStaticMarkup(<NotificationPreferencesSection preferences={ALL} accountType="researcher" />);
    expect(html).toContain("Status changes and new messages on reports you submitted.");
    expect(html).toContain("Bounty finalized");
    expect(html).not.toContain("Platform decisions");
  });
});

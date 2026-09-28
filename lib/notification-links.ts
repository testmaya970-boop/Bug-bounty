import type { Route } from "next";
import type { Notification } from "@/types/notifications";

/** Where a notification row links to, and what the link says. Report and bounty notices
 * open their report; platform notices (202609250007) have no report -- a program notice
 * opens the program, an organization notice opens the organization. Client-safe: used by
 * both the /notifications list and the header bell. */
export function notificationLink(n: Pick<Notification, "organizationId" | "programId" | "reportId">): { href: Route; label: string } {
  if (n.reportId && n.programId) {
    return { href: `/organizations/${n.organizationId}/programs/${n.programId}/reports/${n.reportId}` as Route, label: "Open report" };
  }
  if (n.programId) return { href: `/organizations/${n.organizationId}/programs/${n.programId}` as Route, label: "Open program" };
  return { href: `/organizations/${n.organizationId}` as Route, label: "Open organization" };
}

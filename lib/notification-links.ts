import type { Route } from "next";
import type { Notification } from "@/types/notifications";

/** Where a notification row links to, and what the link says. Report and bounty notices
 * open their report; platform notices (202609250007) have no report -- a program notice
 * opens the program, an organization notice opens the organization. Client-safe: used by
 * both the /notifications list and the header bell. */
export function notificationLink(n: Pick<Notification, "organizationId" | "programId" | "reportId" | "notificationType">): { href: Route; label: string } {
  // Billing notices (202610150002): a reported deposit is for platform admins to confirm.
  if (n.notificationType === "deposit_reported") return { href: "/platform/payouts" as Route, label: "Review deposit" };
  if (["deposit_confirmed", "deposit_rejected", "balance_low", "invoice_issued"].includes(n.notificationType)) {
    return { href: `/organizations/${n.organizationId}/payments` as Route, label: "Open payments" };
  }
  if (n.reportId && n.programId) {
    return { href: `/organizations/${n.organizationId}/programs/${n.programId}/reports/${n.reportId}` as Route, label: "Open report" };
  }
  if (n.programId) return { href: `/organizations/${n.organizationId}/programs/${n.programId}` as Route, label: "Open program" };
  return { href: `/organizations/${n.organizationId}` as Route, label: "Open organization" };
}

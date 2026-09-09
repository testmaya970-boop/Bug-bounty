// No `import "server-only"` -- see lib/email-provider.ts for why: this module is
// reachable from the standalone outbox worker process, not just Next.js Server
// Components/Actions, and the guard throws unconditionally outside webpack/Turbopack.
import type { NotificationType } from "@/types/notifications";

/**
 * Plain text only -- deliberately, not a shortcut. Report titles, program names, and
 * organization names are researcher/organization-supplied, untrusted strings; a
 * plain-text body has no HTML/script injection surface at all, which is a stronger
 * guarantee than "escaped HTML" for a foundation slice that does not need rich
 * formatting. If a future HTML template is added, every interpolated value MUST be
 * escaped the same way this file already sanitizes header values -- see
 * docs/decisions/0017-notification-routing-and-delivery-foundation.md.
 *
 * CR/LF are stripped from every value used in the subject line specifically to prevent
 * header injection (a title containing a newline could otherwise inject extra headers
 * into a real provider's request) -- a concrete, real risk even for a plain-text body.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

const LABELS: Record<NotificationType, string> = {
  report_created: "A new report was submitted",
  report_needs_information: "The organization requested more information",
  report_resolved: "Your report was resolved",
  report_duplicate: "Your report was marked as a duplicate",
  report_informative: "Your report was marked informative",
  report_not_applicable: "Your report was marked not applicable",
  report_rejected: "Your report was rejected",
  bounty_finalized: "A bounty was finalized for your report",
  report_triage_started: "Your report has entered triage",
  report_accepted: "Your report was accepted",
  report_message_posted: "There's a new message on a report",
};

export type NotificationEmailInput = {
  notificationType: NotificationType;
  reportTitle: string;
  programName: string;
  organizationName: string;
  recipientDisplayName: string;
  occurredAt: string;
};

export type RenderedEmail = { subject: string; text: string };

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const label = LABELS[input.notificationType];
  const title = sanitizeHeaderValue(input.reportTitle);
  const program = sanitizeHeaderValue(input.programName);
  const organization = sanitizeHeaderValue(input.organizationName);
  const recipientName = sanitizeHeaderValue(input.recipientDisplayName);

  const subject = sanitizeHeaderValue(`Unpatched: ${label} — ${title}`);
  const text = [`Hello ${recipientName},`, "", `${label}.`, "", `Report: ${title}`, `Program: ${program}`, `Organization: ${organization}`, `When: ${input.occurredAt}`, "", "Sign in to Unpatched to view the full details."].join("\n");

  return { subject, text };
}

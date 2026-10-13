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

const PLATFORM_TYPES = new Set<NotificationType>(["program_suspended", "program_reinstated", "organization_suspended", "organization_reinstated"]);

export type NotificationEmailInput = {
  notificationType: NotificationType;
  reportTitle: string;
  programName: string;
  organizationName: string;
  recipientDisplayName: string;
  occurredAt: string;
  /** Platform notices only: the platform admin's stated reason (audit_logs metadata). */
  reason?: string | null;
};

export type RenderedEmail = { subject: string; text: string };

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const label = LABELS[input.notificationType];
  const title = sanitizeHeaderValue(input.reportTitle);
  const program = sanitizeHeaderValue(input.programName);
  const organization = sanitizeHeaderValue(input.organizationName);
  const recipientName = sanitizeHeaderValue(input.recipientDisplayName);

  if (PLATFORM_TYPES.has(input.notificationType)) {
    // No report: name the program (program notices) or the organization instead. The reason
    // is platform-admin-written text, kept out of the subject and plain in the body.
    const subjectOf = program || organization;
    const lines = [`Hello ${recipientName},`, "", `${label}.`, ""];
    if (program) lines.push(`Program: ${program}`);
    lines.push(`Organization: ${organization}`, `When: ${input.occurredAt}`);
    if (input.reason) lines.push("", `Reason given: ${input.reason}`);
    lines.push("", "Sign in to Unpatched for details. Contact platform support if you believe this is in error.");
    return { subject: sanitizeHeaderValue(`Unpatched: ${label}: ${subjectOf}`), text: lines.join("\n") };
  }

  const subject = sanitizeHeaderValue(`Unpatched: ${label}: ${title}`);
  const text = [`Hello ${recipientName},`, "", `${label}.`, "", `Report: ${title}`, `Program: ${program}`, `Organization: ${organization}`, `When: ${input.occurredAt}`, "", "Sign in to Unpatched to view the full details."].join("\n");

  return { subject, text };
}

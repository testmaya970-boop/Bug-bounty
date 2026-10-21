// No `import "server-only"` -- see lib/email-provider.ts for why: this module is
// reachable from the standalone outbox worker process, not just Next.js Server
// Components/Actions, and the guard throws unconditionally outside webpack/Turbopack.
import type { NotificationType } from "@/types/notifications";
import { NOTIFICATION_LABELS } from "@/lib/notification-labels";

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

const LABELS = NOTIFICATION_LABELS;

const BILLING_TYPES = new Set<NotificationType>(["deposit_reported", "deposit_confirmed", "deposit_rejected", "balance_low", "invoice_issued"]);
const PLATFORM_TYPES = new Set<NotificationType>(["program_suspended", "program_reinstated", "organization_suspended", "organization_reinstated", "program_launch_approved", "program_launch_rejected"]);
const PROGRAM_TYPES = new Set<NotificationType>(["program_paused", "program_resumed", "program_closed", "program_scope_changed"]);

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

  if (BILLING_TYPES.has(input.notificationType)) {
    // No report or program: the organization, and the database-written summary (amounts only).
    const lines = [`Hello ${recipientName},`, "", `${label}.`, "", `Organization: ${organization}`, `When: ${input.occurredAt}`];
    if (input.reason) lines.push("", input.reason);
    lines.push("", "Sign in to Unpatched to see the details on the Payments page.");
    return { subject: sanitizeHeaderValue(`Unpatched: ${label}: ${organization}`), text: lines.join("\n") };
  }

  if (input.notificationType === "program_recommended") {
    // Re-engagement (202610210005): only to researchers who haven't been around for a while,
    // only for programs matching interests they set themselves, at most weekly. Every one says
    // why it was sent and how to stop them.
    const lines = [
      `Hello ${recipientName},`,
      "",
      `${organization} just opened a public program that matches the areas you said you like to hunt:`,
      "",
      `Program: ${program}`,
      `Organization: ${organization}`,
      "",
      "Sign in to Unpatched to read its scope and rules, then join from the program page.",
      "",
      "You're getting this because you haven't visited in a while and this program matches your interests in Settings > Skills.",
      "To stop these emails, turn off \"New programs for you\" in Settings > Notifications.",
    ];
    return { subject: sanitizeHeaderValue(`Unpatched: new program for you: ${program}`), text: lines.join("\n") };
  }

  if (PROGRAM_TYPES.has(input.notificationType)) {
    // No report: the program and what changed (a scope summary written by the database).
    const lines = [`Hello ${recipientName},`, "", `${label}.`, "", `Program: ${program}`, `Organization: ${organization}`, `When: ${input.occurredAt}`];
    if (input.reason) lines.push("", input.reason);
    lines.push("", "Check the program's scope and status before you keep testing.");
    return { subject: sanitizeHeaderValue(`Unpatched: ${label}: ${program}`), text: lines.join("\n") };
  }

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

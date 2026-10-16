import { withServiceRoleTransaction, callRpc } from "../../db-pool";
import { PermanentHandlerError, RetryableHandlerError } from "../../registry";
import { activeEmailProvider } from "@/lib/email-provider";
import { renderNotificationEmail } from "@/lib/email-render";
import type { OutboxEvent } from "@/types/outbox";
import type { NotificationType } from "@/types/notifications";

/**
 * One shared factory for all seven notification-producing event types -- recipient
 * resolution, preference checks, and provenance re-verification all happen inside
 * route_and_create_notifications itself (the migration), so this handler does not need
 * a report-outcome-vs-bounty split the way the reputation handlers (0016) did. Registered
 * once per event type, on the SAME event_type:schema_version keys the reputation
 * consumer already occupies -- see workers/outbox/registry.ts's multi-consumer support,
 * added in this slice specifically because this handler needs to coexist with 0016's.
 *
 * Retries are driven entirely by the existing outbox_events retry/backoff loop: this
 * handler does not schedule anything of its own. If any delivery for this event is still
 * retryable when the function returns, it throws RetryableHandlerError so the WHOLE
 * event is retried later -- on that retry, route_and_create_notifications is idempotent
 * (on conflict do nothing) and ensure_email_delivery/prepare_notification_email skip any
 * delivery already in a terminal state, so only the genuinely-still-pending work repeats.
 */
function hasReportId(payload: Record<string, unknown>): payload is { report_id: string; actor_id?: string } {
  return typeof payload.report_id === "string";
}

type NotificationRow = { id: string };
type EmailDeliveryRow = { id: string; state: string };
type PreparedEmailRow = {
  deliverable: boolean;
  reason: string | null;
  recipient_email: string | null;
  recipient_display_name: string | null;
  report_title: string | null;
  program_name: string | null;
  organization_name: string | null;
  notification_type: string;
  occurred_at: string | null;
};

export function createNotificationHandler(notificationType: NotificationType) {
  return async function handleNotification(event: OutboxEvent): Promise<void> {
    if (!hasReportId(event.payload)) {
      throw new PermanentHandlerError(`${event.eventType} v${event.schemaVersion} payload does not match the documented shape -- this will never succeed on retry.`);
    }

    let notifications: NotificationRow[];
    try {
      // p_actor_id is only meaningful for report_message_posted (see
      // route_and_create_notifications's own routing) -- undefined for every other
      // notificationType, which resolves to SQL's own `default null` and is ignored there.
      notifications = await withServiceRoleTransaction((client) =>
        callRpc<NotificationRow>(client, "public.route_and_create_notifications", [
          event.id,
          notificationType,
          event.payload.report_id,
          event.occurredAt,
          event.payload.actor_id ?? null,
        ]),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("PROVENANCE_MISMATCH") || message.startsWith("REPORT_NOT_FOUND") || message.startsWith("INVALID_NOTIFICATION_TYPE")) {
        throw new PermanentHandlerError(message);
      }
      throw new RetryableHandlerError(message);
    }

    await deliverNotificationEmails(event, notifications ?? []);
  };
}

/** Shared by the report and platform handlers: create/prepare/send/record one email per
 * notification. Throws RetryableHandlerError if any delivery is still retryable, so the
 * whole event is retried (every step below is idempotent -- see this file's header). */
export async function deliverNotificationEmails(event: OutboxEvent, notifications: NotificationRow[], reason?: string | null): Promise<void> {
  let anyRetryable = false;

  for (const notification of notifications) {
    let delivery: EmailDeliveryRow | undefined;
    try {
      const rows = await withServiceRoleTransaction((client) => callRpc<EmailDeliveryRow>(client, "public.ensure_email_delivery", [notification.id]));
      delivery = rows[0];
    } catch (error) {
      throw new RetryableHandlerError(error instanceof Error ? error.message : String(error));
    }
    if (!delivery || delivery.state === "delivered" || delivery.state === "permanent_failure") continue;

    let prepared: PreparedEmailRow | null;
    try {
      const rows = await withServiceRoleTransaction((client) => callRpc<PreparedEmailRow>(client, "public.prepare_notification_email", [delivery!.id]));
      prepared = rows[0] ?? null;
    } catch {
      anyRetryable = true;
      continue;
    }
    // Another worker is sending this one right now (202610130002): check again on the retry.
    if (prepared?.reason === "IN_PROGRESS") {
      anyRetryable = true;
      continue;
    }
    if (!prepared || !prepared.deliverable) continue; // Already terminal, or no longer authorized -- prepare_notification_email already recorded why.

    const rendered = renderNotificationEmail({
      notificationType: prepared.notification_type as NotificationType,
      reportTitle: prepared.report_title ?? "",
      programName: prepared.program_name ?? "",
      organizationName: prepared.organization_name ?? "",
      recipientDisplayName: prepared.recipient_display_name ?? "",
      occurredAt: prepared.occurred_at ?? event.occurredAt,
      reason,
    });

    const result = await activeEmailProvider.send({
      to: prepared.recipient_email ?? "",
      subject: rendered.subject,
      text: rendered.text,
      idempotencyKey: delivery.id,
    });

    try {
      await withServiceRoleTransaction((client) =>
        callRpc(client, "public.record_email_delivery_result", [
          delivery!.id,
          result.success,
          result.success ? false : result.permanent,
          result.success ? result.providerReference : null,
          result.success ? null : result.error,
        ]),
      );
    } catch (error) {
      throw new RetryableHandlerError(error instanceof Error ? error.message : String(error));
    }

    if (!result.success && !result.permanent) anyRetryable = true;
  }

  if (anyRetryable) {
    throw new RetryableHandlerError(`one or more email deliveries for ${event.eventType} are still retryable`);
  }
}

/** Platform decisions (202609250007): the audit_logs trigger enqueues program.suspended /
 * program.reinstated / organization.suspended / organization.reinstated; this routes each
 * to the org's active owners and security admins, then emails them with the reason. */
export function createPlatformNotificationHandler(notificationType: NotificationType) {
  return createEventRoutedHandler("public.route_platform_notifications", notificationType);
}

/** Payment/bounty-change and mediation notices (202610060008): routed from the event's own
 * audit row to the obligation's recipient, or the organization for a mediation request. */
export function createPaymentNotificationHandler(notificationType: NotificationType) {
  return createEventRoutedHandler("public.route_payment_notifications", notificationType);
}

/** Billing notices (202610150002): a reported deposit to platform admins; confirmations,
 * low balance and invoices to the organization's finance roles. */
export function createBillingNotificationHandler(notificationType: NotificationType) {
  return createEventRoutedHandler("public.route_billing_notifications", notificationType);
}

/** Program lifecycle, scope and launch-decision notices (202610160005). */
export function createProgramNotificationHandler(notificationType: NotificationType) {
  return createEventRoutedHandler("public.route_program_notifications", notificationType);
}

/** Routers that take (event id, notification type) and re-verify provenance themselves. */
function createEventRoutedHandler(routerRpc: string, notificationType: NotificationType) {
  return async function handleEventRoutedNotification(event: OutboxEvent): Promise<void> {
    let notifications: NotificationRow[];
    try {
      notifications = await withServiceRoleTransaction((client) => callRpc<NotificationRow>(client, routerRpc, [event.id, notificationType]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (["PROVENANCE_MISMATCH", "EVENT_NOT_FOUND", "REPORT_NOT_FOUND", "INVALID_NOTIFICATION_TYPE"].some((code) => message.startsWith(code))) {
        throw new PermanentHandlerError(message);
      }
      throw new RetryableHandlerError(message);
    }
    const reason = typeof event.payload.reason === "string" ? event.payload.reason : null;
    await deliverNotificationEmails(event, notifications ?? [], reason);
  };
}

import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import type { Notification, NotificationCategory, NotificationPreference, NotificationType } from "@/types/notifications";
import type { Page } from "@/types/pagination";

export { OrganizationServiceError };

type NotificationRow = {
  id: string;
  category: string;
  notification_type: string;
  report_id: string | null;
  program_id: string | null;
  organization_id: string;
  occurred_at: string;
  created_at: string;
  read_at: string | null;
};

function mapNotificationRow(row: NotificationRow, programNamesById: Map<string, string>): Notification {
  return {
    id: row.id,
    category: row.category as NotificationCategory,
    notificationType: row.notification_type as NotificationType,
    reportId: row.report_id,
    programId: row.program_id,
    organizationId: row.organization_id,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    readAt: row.read_at,
    programName: row.program_id ? (programNamesById.get(row.program_id) ?? null) : null,
  };
}

/** The recipient's own notifications, newest first -- RLS (`recipient_id = auth.uid()`)
 * is the only authorization boundary; no aggregation, no cross-recipient data, since each
 * row already belongs to exactly one recipient. `notifications.program_id` has no direct
 * foreign key to `programs.id` (only a composite FK to `reports`), so a single SQL join
 * can't resolve it -- program names are fetched with a second, RLS-scoped `programs`
 * query keyed by the distinct program ids on this page and merged in memory. This is
 * enrichment only (not the notification's own content): a program id the recipient can no
 * longer read (e.g. a since-suspended researcher's older notification) simply has no
 * entry in the map and degrades to `programName: null`, the same "historical access,
 * reduced detail" pattern used throughout the researcher program workspace -- it just
 * can't be expressed as a single query against this particular schema. Keyset-paginated
 * on `created_at` (the existing notifications_recipient_id_created_at_idx already
 * supports this); see services/reports.ts's listReportsForProgram for the identical
 * single-column-cursor tradeoff reasoning. */
export async function getMyNotifications(cursor?: string, limit?: number): Promise<Page<Notification>> {
  const actor = await getCurrentUser();
  const pageSize = clampPageSize(limit ?? 50);
  const decoded = cursor ? decodeCursor(cursor) : null;

  let rows: NotificationRow[];
  let programNamesById = new Map<string, string>();
  try {
    ({ rows, programNamesById } = await withActorTransaction(actor?.id ?? null, async (client) => {
      const { rows } = await client.query<NotificationRow>(
        decoded
          ? "select id, category, notification_type, report_id, program_id, organization_id, occurred_at, created_at, read_at from public.notifications where created_at < $1 order by created_at desc limit $2"
          : "select id, category, notification_type, report_id, program_id, organization_id, occurred_at, created_at, read_at from public.notifications order by created_at desc limit $1",
        decoded ? [decoded.sortValue, pageSize] : [pageSize],
      );

      // Organization-level platform notices have no program.
      const programIds = [...new Set(rows.flatMap((row) => (row.program_id ? [row.program_id] : [])))];
      const programNamesById = new Map<string, string>();
      if (programIds.length > 0) {
        const { rows: programRows } = await client.query<{ id: string; name: string }>("select id, name from public.programs where id = any($1)", [programIds]);
        for (const program of programRows) programNamesById.set(program.id, program.name);
      }
      return { rows, programNamesById };
    }));
  } catch (error) {
    mapError(error as { message: string });
  }

  const items = rows.map((row) => mapNotificationRow(row, programNamesById));
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.mark_notification_read", [notificationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** "Mark all read" over the notifications the caller currently has loaded. Each id still
 * goes through mark_notification_read, which only touches the caller's own rows, so a
 * forged id gets no further than the per-item RPC would. One transaction so the batch
 * lands or fails together. */
// ponytail: loops the per-item RPC (no mark_all RPC exists); add a set-based
// mark_all_notifications_read RPC if the batch ever grows past a few pages.
export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, async (client) => {
      for (const id of notificationIds) await callRpc(client, "public.mark_notification_read", [id]);
    });
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** The header bell's real unread badge count -- same RLS-scoped pattern
 * services/reports.ts's countMyReportsNeedingResponse already uses, not a new RPC just
 * to answer one number. No notification is ever fabricated to fill this badge: 0 unread
 * renders no badge at all (see the dropdown component). The explicit recipient_id filter
 * (not just RLS alone) is preserved as defense-in-depth exactly as the original did. */
export async function countMyUnreadNotifications(userId: string): Promise<number> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client.query<{ count: string }>("select count(*) from public.notifications where recipient_id = $1 and read_at is null", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return Number(rows[0]?.count ?? 0);
}

export async function getMyNotificationPreferences(): Promise<NotificationPreference[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ category: string; email_enabled: boolean; is_mandatory: boolean }>(client, "public.get_my_notification_preferences"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ category: row.category as NotificationCategory, emailEnabled: row.email_enabled, isMandatory: row.is_mandatory }));
}

export async function setNotificationPreference(category: NotificationCategory, emailEnabled: boolean): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.set_notification_preference", [category, emailEnabled]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

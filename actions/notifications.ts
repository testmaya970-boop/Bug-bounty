"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError, getMyNotificationPreferences, getMyNotifications, markNotificationRead, markNotificationsRead, setNotificationPreference } from "@/services/notifications";
import type { Notification } from "@/types/notifications";
import type { Page } from "@/types/pagination";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const uuidSchema = z.string().uuid();
// The categories a user can switch off (set_notification_preference, 202610210005); the rest are mandatory.
const categorySchema = z.enum(["report_activity", "program_recommendations"]);

export async function markNotificationReadAction(notificationId: string) {
  const parsed = uuidSchema.safeParse(notificationId);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "This request could not be understood." };
  const result = await toResult(markNotificationRead(parsed.data));
  if (result.ok) revalidatePath("/notifications");
  return result;
}

// The client only ever sends ids it has on screen (a few loaded pages at most).
const notificationIdsSchema = z.array(uuidSchema).min(1).max(200);

export async function markNotificationsReadAction(notificationIds: string[]) {
  const parsed = notificationIdsSchema.safeParse(notificationIds);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "This request could not be understood." };
  const result = await toResult(markNotificationsRead(parsed.data));
  if (result.ok) revalidatePath("/notifications");
  return result;
}

export async function setNotificationPreferenceAction(category: string, emailEnabled: boolean) {
  const parsed = categorySchema.safeParse(category);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "This request could not be understood." };
  const result = await toResult(setNotificationPreference(parsed.data, emailEnabled));
  if (result.ok) revalidatePath("/notifications");
  return result;
}

export async function getMyNotificationPreferencesAction() {
  return toResult(getMyNotificationPreferences());
}

const listNotificationsSchema = z.object({ cursor: z.string().optional() });

export async function listNotificationsPageAction(input: { cursor?: string }): Promise<ActionResult<Page<Notification>>> {
  const parsed = listNotificationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: "Check the form and try again." };
  return toResult(getMyNotifications(parsed.data.cursor));
}

/** The header bell dropdown's own data source -- a small, fixed-size page (never
 * paginated further; "View all" in the dropdown links to the real /notifications page for
 * that). Reuses getMyNotifications exactly as the notifications page itself does, just
 * capped smaller, so the dropdown never becomes a second, divergent notifications
 * implementation. */
export async function listNotificationPreviewAction(): Promise<ActionResult<Page<Notification>>> {
  // The bell shows the 10 most recent; everything older lives in the notification center.
  return toResult(getMyNotifications(undefined, 10));
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateEngagementEmailSettings } from "@/services/engagement-emails";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getCurrentUser } from "@/lib/auth/current-user";

// Authorization is in the database (update_engagement_email_settings checks is_platform_admin).
const schema = z.object({
  enabled: z.boolean(),
  inactiveAfterDays: z.coerce.number().int().min(1, "Choose between 1 and 365 days.").max(365, "Choose between 1 and 365 days."),
  minDaysBetween: z.coerce.number().int().min(1, "Choose between 1 and 90 days.").max(90, "Choose between 1 and 90 days."),
});

export async function updateEngagementEmailSettingsAction(input: { enabled: boolean; inactiveAfterDays: number; minDaysBetween: number }): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  if (!(await getCurrentUser())) return { ok: false, message: "Your session has expired. Sign in again to continue." };
  try {
    await updateEngagementEmailSettings(parsed.data.enabled, parsed.data.inactiveAfterDays, parsed.data.minDaysBetween);
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/platform/engagement");
  return { ok: true };
}

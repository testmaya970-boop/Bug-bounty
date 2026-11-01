import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getCurrentUser } from "./current-user";
import { PLATFORM_ADMIN_NEEDS_MFA_HEADER } from "@/lib/session/middleware";
import { isPlatformAdmin } from "@/services/platform-operations";

/** Whose settings these are. A platform admin is platform staff, not a researcher: no
 * public profile, payouts, skills, reputation or report templates. (An admin still setting
 * up MFA counts too -- their only page is /settings/security.) */
export type SettingsAudience = "researcher" | "organization" | "platform_admin";

export async function getSettingsAudience(): Promise<SettingsAudience> {
  const user = await getCurrentUser();
  if (user?.accountType === "organization") return "organization";
  if ((await headers()).get(PLATFORM_ADMIN_NEEDS_MFA_HEADER) === "1" || (await isPlatformAdmin())) return "platform_admin";
  return "researcher";
}

/** Researcher-only settings (skills, payouts, reputation, report templates...): an
 * organization account or a platform admin has none of these, so a direct visit lands on
 * their own settings instead of a form that cannot apply to them. The nav already hides
 * them (SettingsNav). */
export async function requireResearcherSettings(): Promise<void> {
  if ((await getSettingsAudience()) !== "researcher") redirect("/settings/profile" as Route);
}

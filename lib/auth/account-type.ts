import "server-only";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getCurrentUser } from "./current-user";

/** Researcher-only settings (skills, payouts, reputation, report templates...): an
 * organization account has none of these, so a direct visit lands on its own settings
 * instead of a form that cannot apply to it. The nav already hides them (SettingsNav). */
export async function requireResearcherSettings(): Promise<void> {
  const user = await getCurrentUser();
  if (user?.accountType === "organization") redirect("/settings/profile" as Route);
}

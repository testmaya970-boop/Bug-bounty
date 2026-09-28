import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireResearcherSettings } from "../../../lib/auth/account-type";

/** Reputation already has a real, complete page at /researchers (the fact-based ledger,
 * 0016) -- this route exists so it's discoverable from the settings nav, per
 * docs/decisions/0055, without duplicating that page's logic. */
export default async function ReputationSettingsPage() {
  await requireResearcherSettings();
  redirect("/researchers" as Route);
}

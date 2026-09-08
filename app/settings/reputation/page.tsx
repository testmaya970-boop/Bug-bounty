import { redirect } from "next/navigation";
import type { Route } from "next";

/** Reputation already has a real, complete page at /researchers (the fact-based ledger,
 * 0016) -- this route exists so it's discoverable from the settings nav, per
 * docs/decisions/0055, without duplicating that page's logic. */
export default function ReputationSettingsPage() {
  redirect("/researchers" as Route);
}

import { redirect } from "next/navigation";
import type { Route } from "next";

/** Retired: the features it promised now have their own pages (Events, Mentorship, Recognition,
 * Hall of Fame, swag and the rest under Settings). Old links land on the dashboard. */
export default function ComingSoonPage() {
  redirect("/" as Route);
}

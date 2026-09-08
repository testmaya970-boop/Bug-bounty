import { redirect } from "next/navigation";
import type { Route } from "next";

export default function SettingsIndexPage() {
  redirect("/settings/profile" as Route);
}

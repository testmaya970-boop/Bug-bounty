import { redirect } from "next/navigation";
import type { Route } from "next";

// One destination per page: the leaderboard lives at /researchers.
export default function LeaderboardPage() {
  redirect("/researchers" as Route);
}

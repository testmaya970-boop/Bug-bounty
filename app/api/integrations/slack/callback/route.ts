import { NextResponse } from "next/server";
import { completeSlackInstall } from "@/services/org-integrations";

// Where Slack sends the installer back after "Add to Slack". The one-time state must be one this
// signed-in user started for that organization in the last hour.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  const { organizationId, error } = await completeSlackInstall(url.searchParams);
  const back = new URL(organizationId ? `/organizations/${organizationId}/integrations/chat` : "/organizations", origin);
  back.searchParams.set(error ? "slack_error" : "slack", error ?? "connected");
  return NextResponse.redirect(back);
}

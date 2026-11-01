import { NextResponse } from "next/server";
import { completeGithubInstall } from "@/services/code-hosts";

// The GitHub App's Setup URL. Valid only with a one-time state this signed-in user started, and an
// OAuth code proving the installer can access the installation they came back with.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  const { organizationId, error } = await completeGithubInstall(url.searchParams);
  const back = new URL(organizationId ? `/organizations/${organizationId}/integrations/code` : "/organizations", origin);
  back.searchParams.set(error ? "github_error" : "github", error ?? "connected");
  return NextResponse.redirect(back);
}

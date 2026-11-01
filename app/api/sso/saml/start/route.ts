import { NextResponse } from "next/server";
import { ssoRedirectForEmail } from "@/services/sso";

// "Sign in with SSO": find the organization through the verified domain of the email and send
// the person to its identity provider. Same answer shape whether or not a connection exists.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const back = new URL("/sign-in/sso", origin);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    back.searchParams.set("sso_error", "Enter your work email.");
    return NextResponse.redirect(back);
  }
  const target = await ssoRedirectForEmail(email).catch(() => null);
  if (!target) {
    back.searchParams.set("sso_error", "Single sign-on isn't set up for that email's domain. Sign in with your password.");
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(target);
}

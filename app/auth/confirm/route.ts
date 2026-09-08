import { NextResponse, type NextRequest } from "next/server";
import { peekPasswordResetToken } from "@/services/auth";

// Verifies an app-owned password-reset token (lib/auth/tokens.ts), replacing Supabase
// Auth's own token_hash-based verifyOtp for that one remaining link-based flow.
//
// Signup confirmation is NOT handled here anymore -- it moved to a typed 6-digit code
// (actions/auth.ts's verifySignupCodeAction, components/auth/confirm-email-pending.tsx),
// per explicit product direction, so `type=signup` is no longer a reachable value; only
// `type=recovery` remains. A password-reset token establishes NO session here (see
// app/reset-password/page.tsx's own comment on why) -- it only redirects to the
// reset-password page with the token still attached; confirmPasswordReset (called from
// that page) is what actually verifies/consumes it.
export async function GET(request: NextRequest) {
  const requestOrigin = `${request.headers.get("x-forwarded-proto") ?? "http"}://${request.headers.get("host")}`;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const type = searchParams.get("type");

  if (token && type === "recovery") {
    const valid = await peekPasswordResetToken(token);
    if (valid) {
      const resetUrl = new URL("/reset-password", requestOrigin);
      resetUrl.searchParams.set("token", token);
      return NextResponse.redirect(resetUrl);
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=confirmation_failed", requestOrigin));
}

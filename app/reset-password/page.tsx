import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AuthLayout } from "../../components/auth/auth-layout";
import { ResetPasswordForm } from "../../components/auth/reset-password-form";
import { peekPasswordResetToken } from "../../services/auth";

/**
 * Reachable via the token embedded in the emailed reset link (/auth/confirm redirects
 * here with `?token=...` after confirming the token itself is well-formed) -- no session
 * is established for a password-reset link, deliberately: unlike the old Supabase-backed
 * recovery-session model, a reset link authorizes exactly one action (choosing a new
 * password), never a full sign-in. peekPasswordResetToken only checks the token exists,
 * is unconsumed, and is unexpired -- it does not consume it; resetPasswordAction
 * re-verifies and consumes atomically once the new password is actually submitted, so
 * merely loading this page never burns the link. A missing/invalid/expired/already-used
 * token shows an honest, actionable state instead of a broken form or a raw error.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekPasswordResetToken(token) : null;

  if (!valid || !token) {
    return (
      <AuthLayout eyebrow="Unpatched" title="This link has expired" description="Password reset links are single-use and expire after a short time.">
        <Link prefetch={false}
          href={"/forgot-password" as Route}
          className="inline-flex min-h-11 items-center rounded-md bg-ink px-4 text-sm font-semibold text-canvas hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Request a new link →
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Unpatched" title="Choose a new password" description="Set a new password for your Unpatched account.">
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
}

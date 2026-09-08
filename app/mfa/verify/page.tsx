import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AuthLayout } from "../../../components/auth/auth-layout";
import { MfaVerifyForm } from "../../../components/auth/mfa-verify-form";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { getMyMfaStatus, listMyMfaFactors, requestMfaVerificationCode } from "../../../services/mfa";
import { isSafeRedirect } from "../../../lib/auth/safe-redirect";

/**
 * The one route middleware.ts's MFA gate always allows through. If there's nothing to
 * verify (no enrolled factor, or this session already cleared it), there is no reason to
 * be here -- redirect straight to the real destination rather than showing a pointless
 * form. See docs/decisions/0052.
 */
export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}` as Route);

  const status = await getMyMfaStatus();
  if (!status.totpEnrolled || status.sessionVerified) {
    redirect((isSafeRedirect(redirectTo) ? redirectTo : "/") as Route);
  }

  const factors = await listMyMfaFactors();
  const verifiedFactor = factors.find((factor) => factor.status === "verified");
  if (!verifiedFactor) redirect((isSafeRedirect(redirectTo) ? redirectTo : "/") as Route);

  // No more GoTrue-issued TOTP factor to check a code against locally -- landing on this
  // page is itself the trigger to email a fresh 'verify' challenge (create_mfa_challenge
  // invalidates any still-live challenge before issuing a new one, so re-rendering this
  // page on a redirect loop can never leave two valid codes outstanding at once).
  await requestMfaVerificationCode();

  return (
    <AuthLayout eyebrow="Two-factor authentication" title="Verify it's you" description="This account has two-factor authentication enabled." variant="default">
      <MfaVerifyForm factorId={verifiedFactor.id} redirectTo={isSafeRedirect(redirectTo) ? redirectTo : undefined} />
    </AuthLayout>
  );
}
